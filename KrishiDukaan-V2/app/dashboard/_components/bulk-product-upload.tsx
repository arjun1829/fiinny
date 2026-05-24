"use client";

import { useRef, useState } from "react";
import {
  CheckCircle2, ChevronDown, ChevronUp,
  FileDown, Loader2, Upload, X,
} from "lucide-react";
import Link from "next/link";
import { createManufacturerProduct } from "../_lib/manufacturer-products-firestore";
import { createProductAndInventory } from "../_lib/inventory-firestore";
import type { SeatStats } from "../_types/subscriptions";

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  "Seeds", "Fertilizers", "Pesticides", "Herbicides", "Fungicides",
  "Tools", "Irrigation", "Soil Nutrients", "Growth Promoters",
  "Equipment", "Animal Feed", "Organic Products", "Bio Pesticides",
  "Micro Nutrients", "Others",
] as const;

const CATEGORY_LOWER_MAP = new Map(
  (CATEGORIES as readonly string[]).map((c) => [c.toLowerCase(), c]),
);

const MFG_TEMPLATE =
  "name,category,unit,price,description\n" +
  "Wheat Seeds,Seeds,1kg,250,Premium quality wheat seeds\n" +
  "NPK Fertilizer,Fertilizers,50kg,850,Balanced NPK blend\n";

const RETAILER_TEMPLATE =
  "name,category,unit,price,stock,description\n" +
  "Wheat Seeds,Seeds,1kg,280,50,Premium quality wheat seeds\n" +
  "NPK Fertilizer,Fertilizers,50kg,900,20,Balanced NPK blend\n";

// ─── CSV parser (no external libs) ───────────────────────────────────────────

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let cell = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (inQuote) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cell += '"'; i++; }
          else inQuote = false;
        } else {
          cell += ch;
        }
      } else {
        if (ch === '"') inQuote = true;
        else if (ch === ',') { cells.push(cell.trim()); cell = ""; }
        else cell += ch;
      }
    }
    cells.push(cell.trim());
    rows.push(cells);
  }
  return rows;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ParsedRow = {
  rowNum: number;
  name: string;
  category: string;
  unit: string;
  price: number;
  stock: number;
  description: string;
  errors: string[];
  isDuplicate: boolean;
};

type RowStatus = "pending" | "uploading" | "done" | "error" | "skipped";

type UploadRow = ParsedRow & { status: RowStatus; statusMsg: string };

// ─── CSV parsing ──────────────────────────────────────────────────────────────

function parseProductCSV(text: string): ParsedRow[] {
  const rawRows = parseCSV(text);
  if (!rawRows.length) return [];

  const firstCell = (rawRows[0]?.[0] ?? "").toLowerCase();
  const isHeader = firstCell === "name" || firstCell.includes("name");
  const dataRows = isHeader ? rawRows.slice(1) : rawRows;

  const seen = new Set<string>();

  return dataRows.map((cells, i) => {
    const rowNum = isHeader ? i + 2 : i + 1;
    const name = (cells[0] ?? "").trim();
    const categoryRaw = (cells[1] ?? "").trim();
    const category = CATEGORY_LOWER_MAP.get(categoryRaw.toLowerCase()) ?? categoryRaw;
    const unit = (cells[2] ?? "").trim();
    const price = parseFloat(cells[3] ?? "");
    const stockRaw = (cells[4] ?? "").trim();
    const stock = stockRaw ? parseFloat(stockRaw) || 0 : 0;
    const description = (cells[5] ?? "").trim();

    const errors: string[] = [];
    if (!name) errors.push("Name required");
    if (!unit) errors.push("Unit required");
    if (!CATEGORY_LOWER_MAP.has(categoryRaw.toLowerCase())) {
      errors.push(`Unknown category "${categoryRaw || "(empty)"}"`);
    }
    if (!Number.isFinite(price) || price <= 0) errors.push("Price must be > 0");

    const dupKey = `${name.toLowerCase()}|${unit.toLowerCase()}`;
    const isDuplicate = seen.has(dupKey);
    if (!isDuplicate && name && unit) seen.add(dupKey);

    return {
      rowNum, name, category, unit,
      price: Number.isFinite(price) ? price : 0,
      stock, description, errors, isDuplicate,
    };
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  userId: string;
  role: "manufacturer" | "retailer";
  seatStats: SeatStats;
  onDone: () => Promise<void>;
  storeName?: string;
};

export function BulkProductUpload({ userId, role, seatStats, onDone, storeName }: Props) {
  const [open, setOpen] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [uploadRows, setUploadRows] = useState<UploadRow[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isManufacturer = role === "manufacturer";
  const noSubscription = seatStats.totalPurchased === 0;

  const validRows = parsedRows.filter((r) => !r.errors.length && !r.isDuplicate);
  const hasEnoughSeats = seatStats.available >= validRows.length && validRows.length > 0;

  // ── File handling ──────────────────────────────────────────────────────────

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const rows = parseProductCSV(e.target?.result as string);
      setParsedRows(rows);
      setUploadRows(null);
      setDone(false);
    };
    reader.readAsText(file);
  };

  // ── Upload ─────────────────────────────────────────────────────────────────

  const handleStart = async () => {
    if (!validRows.length || uploading) return;

    const rows: UploadRow[] = parsedRows.map((r) => ({
      ...r,
      status: (r.isDuplicate || r.errors.length ? "skipped" : "pending") as RowStatus,
      statusMsg: r.isDuplicate
        ? "Duplicate — skipped"
        : r.errors.length
          ? r.errors.join("; ")
          : "",
    }));
    setUploadRows(rows);
    setUploading(true);

    for (let i = 0; i < rows.length; i++) {
      if (rows[i]!.status !== "pending") continue;

      setUploadRows((prev) => {
        if (!prev) return prev;
        const next = [...prev];
        next[i] = { ...next[i]!, status: "uploading", statusMsg: "Uploading…" };
        return next;
      });

      try {
        if (isManufacturer) {
          await createManufacturerProduct(userId, {
            name: rows[i]!.name,
            category: rows[i]!.category,
            unit: rows[i]!.unit,
            price: rows[i]!.price,
            variants: [{ unit: rows[i]!.unit, price: rows[i]!.price }],
            stockQuantity: rows[i]!.stock,
            description: rows[i]!.description,
          });
        } else {
          await createProductAndInventory(userId, {
            name: rows[i]!.name,
            category: rows[i]!.category,
            unit: rows[i]!.unit,
            stockQuantity: rows[i]!.stock,
            sellingPrice: rows[i]!.price,
            reorderThreshold: 0,
            description: rows[i]!.description,
            storeName: storeName || "My Store",
            sellMode: "offline_store_only",
          });
        }

        setUploadRows((prev) => {
          if (!prev) return prev;
          const next = [...prev];
          next[i] = { ...next[i]!, status: "done", statusMsg: "Added" };
          return next;
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed";
        setUploadRows((prev) => {
          if (!prev) return prev;
          const next = [...prev];
          next[i] = { ...next[i]!, status: "error", statusMsg: msg };
          return next;
        });
        // Stop if no seats remain
        if (msg.includes("No seats")) break;
      }
    }

    setUploading(false);
    setDone(true);
    await onDone();
  };

  // ── Reset ──────────────────────────────────────────────────────────────────

  const reset = () => {
    setParsedRows([]);
    setUploadRows(null);
    setDone(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  // ── Template download ──────────────────────────────────────────────────────

  const downloadTemplate = () => {
    const content = isManufacturer ? MFG_TEMPLATE : RETAILER_TEMPLATE;
    const blob = new Blob([content], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = isManufacturer ? "products-manufacturer.csv" : "products-retailer.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const invalidCount = parsedRows.filter((r) => r.errors.length > 0).length;
  const dupCount = parsedRows.filter((r) => r.isDuplicate).length;

  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-ambient">
      {/* Toggle header */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2.5 flex-wrap">
          <Upload className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-semibold text-on-surface">
            Bulk Upload Products (CSV)
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              seatStats.available > 0
                ? "bg-primary/10 text-primary"
                : "bg-red-100 text-red-600"
            }`}
          >
            {seatStats.available} seat{seatStats.available !== 1 ? "s" : ""} available
          </span>
        </div>
        {open
          ? <ChevronUp className="h-4 w-4 text-on-surface-variant shrink-0" />
          : <ChevronDown className="h-4 w-4 text-on-surface-variant shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-outline-variant/20 px-5 pb-5 pt-4 flex flex-col gap-4">

          {/* No subscription banner */}
          {noSubscription && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              No active subscription.{" "}
              <Link href="/dashboard/upgrade" className="font-semibold underline">
                Purchase a plan
              </Link>{" "}
              to start uploading products.
            </div>
          )}

          {/* Template download + format hint */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={downloadTemplate}
              className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-white px-3 py-1.5 text-xs font-medium text-on-surface hover:bg-surface-container transition-colors"
            >
              <FileDown className="h-3.5 w-3.5" /> Download CSV Template
            </button>
            <span className="text-xs text-on-surface-variant">
              Columns: <code className="font-mono">name, category, unit, price{role === "retailer" ? ", stock" : ""}, description</code>
            </span>
          </div>

          {/* File picker — shown only before upload starts */}
          {!uploadRows && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              <button
                type="button"
                disabled={noSubscription || seatStats.available === 0}
                onClick={() => fileRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-outline-variant/40 bg-surface-container-low/50 py-8 text-sm text-on-surface-variant hover:border-primary hover:text-primary disabled:opacity-50 transition-colors"
              >
                <Upload className="h-5 w-5" />
                Click to select a CSV file
              </button>
            </>
          )}

          {/* Preview table (after CSV parsed, before upload) */}
          {parsedRows.length > 0 && !uploadRows && (
            <div className="flex flex-col gap-3">
              {/* Row summary chips */}
              <div className="flex flex-wrap gap-2 text-xs font-medium">
                <span className="rounded-full bg-primary/10 text-primary px-2.5 py-1">
                  {parsedRows.length} rows found
                </span>
                <span className="rounded-full bg-green-100 text-green-700 px-2.5 py-1">
                  {validRows.length} valid
                </span>
                {invalidCount > 0 && (
                  <span className="rounded-full bg-red-100 text-red-600 px-2.5 py-1">
                    {invalidCount} invalid
                  </span>
                )}
                {dupCount > 0 && (
                  <span className="rounded-full bg-amber-100 text-amber-700 px-2.5 py-1">
                    {dupCount} duplicate{dupCount !== 1 ? "s" : ""} in CSV
                  </span>
                )}
              </div>

              {/* Seat check warning */}
              {validRows.length > 0 && seatStats.available < validRows.length && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  Not enough seats: need {validRows.length} but only {seatStats.available} available.{" "}
                  <Link href="/dashboard/upgrade" className="font-semibold underline">
                    Buy more seats
                  </Link>
                </div>
              )}

              {/* Preview table */}
              <div className="overflow-x-auto rounded-xl border border-outline-variant/30">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-outline-variant/20 bg-surface-container-low text-on-surface-variant">
                      <th className="px-3 py-2 text-left font-semibold">#</th>
                      <th className="px-3 py-2 text-left font-semibold">Name</th>
                      <th className="px-3 py-2 text-left font-semibold">Category</th>
                      <th className="px-3 py-2 text-left font-semibold">Unit</th>
                      <th className="px-3 py-2 text-left font-semibold">Price</th>
                      {role === "retailer" && (
                        <th className="px-3 py-2 text-left font-semibold">Stock</th>
                      )}
                      <th className="px-3 py-2 text-left font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map((row) => (
                      <tr
                        key={row.rowNum}
                        className={`border-b border-outline-variant/10 ${
                          row.isDuplicate
                            ? "bg-amber-50"
                            : row.errors.length
                              ? "bg-red-50"
                              : ""
                        }`}
                      >
                        <td className="px-3 py-2 text-on-surface-variant">{row.rowNum}</td>
                        <td className="px-3 py-2 font-medium text-on-surface">{row.name || "—"}</td>
                        <td className="px-3 py-2 text-on-surface-variant">{row.category || "—"}</td>
                        <td className="px-3 py-2 text-on-surface-variant">{row.unit || "—"}</td>
                        <td className="px-3 py-2 text-on-surface-variant">
                          {row.price > 0 ? `₹${row.price}` : "—"}
                        </td>
                        {role === "retailer" && (
                          <td className="px-3 py-2 text-on-surface-variant">{row.stock}</td>
                        )}
                        <td className="px-3 py-2">
                          {row.isDuplicate ? (
                            <span className="text-amber-600 font-medium">Duplicate in CSV</span>
                          ) : row.errors.length ? (
                            <span className="text-red-600">{row.errors[0]}</span>
                          ) : (
                            <span className="text-green-600 font-medium">Ready</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={!hasEnoughSeats || uploading}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-50 transition-all"
                >
                  {uploading
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Upload className="h-4 w-4" />}
                  Upload {validRows.length} Product{validRows.length !== 1 ? "s" : ""}
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/40 px-4 py-2.5 text-sm font-medium text-on-surface hover:bg-surface-container transition-colors"
                >
                  <X className="h-4 w-4" /> Clear
                </button>
              </div>
            </div>
          )}

          {/* Upload progress / results */}
          {uploadRows && (
            <div className="flex flex-col gap-3">
              {/* Summary chips */}
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                {uploading && (
                  <span className="flex items-center gap-1 text-primary">
                    <Loader2 className="h-3 w-3 animate-spin" /> Uploading…
                  </span>
                )}
                {done && (
                  <>
                    <span className="rounded-full bg-green-100 text-green-700 px-2.5 py-1">
                      {uploadRows.filter((r) => r.status === "done").length} uploaded
                    </span>
                    {uploadRows.filter((r) => r.status === "error").length > 0 && (
                      <span className="rounded-full bg-red-100 text-red-600 px-2.5 py-1">
                        {uploadRows.filter((r) => r.status === "error").length} failed
                      </span>
                    )}
                    {uploadRows.filter((r) => r.status === "skipped").length > 0 && (
                      <span className="rounded-full bg-surface-container-low text-on-surface-variant px-2.5 py-1">
                        {uploadRows.filter((r) => r.status === "skipped").length} skipped
                      </span>
                    )}
                  </>
                )}
              </div>

              {/* Results table */}
              <div className="overflow-x-auto rounded-xl border border-outline-variant/30">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-outline-variant/20 bg-surface-container-low text-on-surface-variant">
                      <th className="px-3 py-2 text-left font-semibold">#</th>
                      <th className="px-3 py-2 text-left font-semibold">Name</th>
                      <th className="px-3 py-2 text-left font-semibold">Unit</th>
                      <th className="px-3 py-2 text-left font-semibold">Price</th>
                      <th className="px-3 py-2 text-left font-semibold">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploadRows.map((row) => (
                      <tr key={row.rowNum} className="border-b border-outline-variant/10">
                        <td className="px-3 py-2 text-on-surface-variant">{row.rowNum}</td>
                        <td className="px-3 py-2 font-medium text-on-surface">{row.name}</td>
                        <td className="px-3 py-2 text-on-surface-variant">{row.unit}</td>
                        <td className="px-3 py-2 text-on-surface-variant">₹{row.price}</td>
                        <td className="px-3 py-2">
                          {row.status === "uploading" && (
                            <span className="flex items-center gap-1 text-primary">
                              <Loader2 className="h-3 w-3 animate-spin" /> Uploading…
                            </span>
                          )}
                          {row.status === "done" && (
                            <span className="flex items-center gap-1 text-green-600 font-medium">
                              <CheckCircle2 className="h-3 w-3" /> Added
                            </span>
                          )}
                          {row.status === "error" && (
                            <span className="text-red-600">{row.statusMsg}</span>
                          )}
                          {row.status === "skipped" && (
                            <span className="text-on-surface-variant">{row.statusMsg}</span>
                          )}
                          {row.status === "pending" && (
                            <span className="text-on-surface-variant">Waiting…</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {done && (
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex w-fit items-center gap-2 rounded-xl border border-outline-variant/40 px-4 py-2.5 text-sm font-medium text-on-surface hover:bg-surface-container transition-colors"
                >
                  Upload Another File
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
