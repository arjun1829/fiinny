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
import { useI18n } from "../../i18n/I18nContext";
import { HelperIcon } from "../../../components/helpers";

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
  const { t } = useI18n();
  // Translate a parser-produced English error string at render time (parsing logic
  // stays untouched). Unknown/dynamic strings fall through unchanged.
  const tErr = (msg: string): string => {
    if (msg === "Name required") return t("csvProductErrName");
    if (msg === "Unit required") return t("csvProductErrUnit");
    if (msg === "Price must be > 0") return t("csvProductErrPrice");
    const unknownCat = msg.match(/^Unknown category "(.*)"$/);
    if (unknownCat) return t("csvProductErrUnknownCategory", { category: unknownCat[1] ?? "" });
    return msg;
  };
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
        ? t("csvProductDupSkipped")
        : r.errors.length
          ? r.errors.map(tErr).join("; ")
          : "",
    }));
    setUploadRows(rows);
    setUploading(true);

    for (let i = 0; i < rows.length; i++) {
      if (rows[i]!.status !== "pending") continue;

      setUploadRows((prev) => {
        if (!prev) return prev;
        const next = [...prev];
        next[i] = { ...next[i]!, status: "uploading", statusMsg: t("csvProductUploading") };
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
          next[i] = { ...next[i]!, status: "done", statusMsg: t("csvStatusAdded") };
          return next;
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : t("csvProductFailedMsg");
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
            {t("csvProductTitle")}
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              seatStats.available > 0
                ? "bg-primary/10 text-primary"
                : "bg-red-100 text-red-600"
            }`}
          >
            {seatStats.available !== 1
              ? t("csvSeatsAvailable", { count: seatStats.available })
              : t("csvSeatAvailable", { count: seatStats.available })}
          </span>
        </div>
        {open
          ? <ChevronUp className="h-4 w-4 text-on-surface-variant shrink-0" />
          : <ChevronDown className="h-4 w-4 text-on-surface-variant shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-outline-variant/20 px-5 pb-5 pt-4 flex flex-col gap-4">

          {/* Section guidance — purpose of bulk upload + seat usage */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-semibold">
            <span className="inline-flex items-center gap-1.5 text-primary">
              <HelperIcon size="xs" variant="ghost" side="right" textKey="csvProductSection" ariaLabel={`${t("csvProductTitle")} help`} />
              {t("csvProductTitle")}
            </span>
            <span className="inline-flex items-center gap-1.5 text-on-surface-variant">
              <HelperIcon size="xs" variant="ghost" side="right" textKey="csvSeatBadge" ariaLabel="Available seats help" />
              {seatStats.available !== 1
                ? t("csvSeatsAvailable", { count: seatStats.available })
                : t("csvSeatAvailable", { count: seatStats.available })}
            </span>
          </div>

          {/* No subscription banner */}
          {noSubscription && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {t("csvNoActiveSub")}{" "}
              <Link href="/dashboard/upgrade" className="font-semibold underline">
                {t("csvPurchasePlan")}
              </Link>{" "}
              {t("csvProductToStart")}
            </div>
          )}

          {/* Template download + format hint */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={downloadTemplate}
              className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-white px-3 py-1.5 text-xs font-medium text-on-surface hover:bg-surface-container transition-colors"
            >
              <FileDown className="h-3.5 w-3.5" /> {t("csvDownloadTemplate")}
            </button>
            <HelperIcon size="xs" variant="ghost" side="right" textKey="csvProductTemplate" ariaLabel={`${t("csvDownloadTemplate")} help`} />
            <span className="text-xs text-on-surface-variant">
              {t("csvColumnsLabel")} <code className="font-mono">name, category, unit, price{role === "retailer" ? ", stock" : ""}, description</code>
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
              <div className="relative">
                <div className="absolute right-2 top-2 z-10">
                  <HelperIcon size="xs" variant="ghost" side="left" textKey="csvProductUploadZone" ariaLabel={`${t("csvSelectFile")} help`} />
                </div>
                <button
                  type="button"
                  disabled={noSubscription || seatStats.available === 0}
                  onClick={() => fileRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-outline-variant/40 bg-surface-container-low/50 py-8 text-sm text-on-surface-variant hover:border-primary hover:text-primary disabled:opacity-50 transition-colors"
                >
                  <Upload className="h-5 w-5" />
                  {t("csvSelectFile")}
                </button>
              </div>
            </>
          )}

          {/* Preview table (after CSV parsed, before upload) */}
          {parsedRows.length > 0 && !uploadRows && (
            <div className="flex flex-col gap-3">
              {/* Row summary chips */}
              <div className="flex flex-wrap gap-2 text-xs font-medium">
                <span className="rounded-full bg-primary/10 text-primary px-2.5 py-1">
                  {t("csvRowsFound", { count: parsedRows.length })}
                </span>
                <span className="rounded-full bg-green-100 text-green-700 px-2.5 py-1">
                  {t("csvValidCount", { count: validRows.length })}
                </span>
                {invalidCount > 0 && (
                  <span className="rounded-full bg-red-100 text-red-600 px-2.5 py-1">
                    {t("csvInvalidCount", { count: invalidCount })}
                  </span>
                )}
                {dupCount > 0 && (
                  <span className="rounded-full bg-amber-100 text-amber-700 px-2.5 py-1">
                    {dupCount !== 1
                      ? t("csvProductDupsInCsv", { count: dupCount })
                      : t("csvProductDupInCsv", { count: dupCount })}
                  </span>
                )}
              </div>

              {/* Seat check warning */}
              {validRows.length > 0 && seatStats.available < validRows.length && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {t("csvProductNotEnoughSeats", { need: validRows.length, have: seatStats.available })}{" "}
                  <Link href="/dashboard/upgrade" className="font-semibold underline">
                    {t("csvBuyMoreSeats")}
                  </Link>
                </div>
              )}

              {/* Preview table */}
              <div className="overflow-x-auto rounded-xl border border-outline-variant/30">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-outline-variant/20 bg-surface-container-low text-on-surface-variant">
                      <th className="px-3 py-2 text-left font-semibold">#</th>
                      <th className="px-3 py-2 text-left font-semibold">{t("csvColName")}</th>
                      <th className="px-3 py-2 text-left font-semibold">{t("csvColCategory")}</th>
                      <th className="px-3 py-2 text-left font-semibold">{t("csvColUnit")}</th>
                      <th className="px-3 py-2 text-left font-semibold">{t("csvColPrice")}</th>
                      {role === "retailer" && (
                        <th className="px-3 py-2 text-left font-semibold">{t("csvColStock")}</th>
                      )}
                      <th className="px-3 py-2 text-left font-semibold">{t("csvColStatus")}</th>
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
                            <span className="text-amber-600 font-medium">{t("csvProductDupRow")}</span>
                          ) : row.errors.length ? (
                            <span className="text-red-600">{tErr(row.errors[0]!)}</span>
                          ) : (
                            <span className="text-green-600 font-medium">{t("csvStatusReady")}</span>
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
                  {validRows.length !== 1
                    ? t("csvProductUploadBtnPlural", { count: validRows.length })
                    : t("csvProductUploadBtn", { count: validRows.length })}
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/40 px-4 py-2.5 text-sm font-medium text-on-surface hover:bg-surface-container transition-colors"
                >
                  <X className="h-4 w-4" /> {t("csvClear")}
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
                    <Loader2 className="h-3 w-3 animate-spin" /> {t("csvProductUploading")}
                  </span>
                )}
                {done && (
                  <>
                    <span className="rounded-full bg-green-100 text-green-700 px-2.5 py-1">
                      {t("csvProductUploaded", { count: uploadRows.filter((r) => r.status === "done").length })}
                    </span>
                    {uploadRows.filter((r) => r.status === "error").length > 0 && (
                      <span className="rounded-full bg-red-100 text-red-600 px-2.5 py-1">
                        {t("csvProductFailed", { count: uploadRows.filter((r) => r.status === "error").length })}
                      </span>
                    )}
                    {uploadRows.filter((r) => r.status === "skipped").length > 0 && (
                      <span className="rounded-full bg-surface-container-low text-on-surface-variant px-2.5 py-1">
                        {t("csvProductSkipped", { count: uploadRows.filter((r) => r.status === "skipped").length })}
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
                      <th className="px-3 py-2 text-left font-semibold">{t("csvColName")}</th>
                      <th className="px-3 py-2 text-left font-semibold">{t("csvColUnit")}</th>
                      <th className="px-3 py-2 text-left font-semibold">{t("csvColPrice")}</th>
                      <th className="px-3 py-2 text-left font-semibold">{t("csvColResult")}</th>
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
                              <Loader2 className="h-3 w-3 animate-spin" /> {t("csvProductUploading")}
                            </span>
                          )}
                          {row.status === "done" && (
                            <span className="flex items-center gap-1 text-green-600 font-medium">
                              <CheckCircle2 className="h-3 w-3" /> {t("csvStatusAdded")}
                            </span>
                          )}
                          {row.status === "error" && (
                            <span className="text-red-600">{row.statusMsg}</span>
                          )}
                          {row.status === "skipped" && (
                            <span className="text-on-surface-variant">{row.statusMsg}</span>
                          )}
                          {row.status === "pending" && (
                            <span className="text-on-surface-variant">{t("csvWaiting")}</span>
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
                  {t("csvUploadAnother")}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
