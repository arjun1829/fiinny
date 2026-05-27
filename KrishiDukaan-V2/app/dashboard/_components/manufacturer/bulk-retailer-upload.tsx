"use client";

import { useRef, useState } from "react";
import {
  CheckCircle2, ChevronDown, ChevronUp,
  FileDown, Loader2, Upload, UserPlus, X,
} from "lucide-react";
import Link from "next/link";
import { createNetworkRetailer } from "../../_lib/manufacturer-retailers-firestore";
import { useI18n } from "../../../i18n/I18nContext";
import { HelperIcon } from "../../../../components/helpers";

// ─── Phone normalization (mirrors server-side toE164India) ────────────────────

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  return raw.trim();
}

// ─── CSV parser ───────────────────────────────────────────────────────────────

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

type ParsedRetailerRow = {
  rowNum: number;
  shopName: string;
  ownerName: string;
  phone: string;
  normalizedPhone: string;
  email: string;
  city: string;
  state: string;
  pincode: string;
  errors: string[];
  isDuplicate: boolean; // duplicate within the CSV
  isExisting: boolean;  // already in manufacturer's network
};

type RowStatus = "pending" | "uploading" | "done" | "error" | "skipped";

type UploadRow = ParsedRetailerRow & { status: RowStatus; statusMsg: string };

const CSV_TEMPLATE =
  "shopName,ownerName,phone,email,city,state,pincode\n" +
  "Ramesh Agro Store,Ramesh Kumar,9876543210,ramesh@example.com,Pune,Maharashtra,411001\n" +
  "Suresh Seeds,Suresh Patel,9123456789,,Nashik,Maharashtra,422001\n";

// ─── Parser ───────────────────────────────────────────────────────────────────

function parseRetailerCSV(
  text: string,
  existingPhones: Set<string>,
): ParsedRetailerRow[] {
  const rawRows = parseCSV(text);
  if (!rawRows.length) return [];

  const firstCell = (rawRows[0]?.[0] ?? "").toLowerCase();
  const isHeader = firstCell === "shopname" || firstCell.includes("shop");
  const dataRows = isHeader ? rawRows.slice(1) : rawRows;

  const seen = new Set<string>();

  return dataRows.map((cells, i) => {
    const rowNum = isHeader ? i + 2 : i + 1;
    const shopName = (cells[0] ?? "").trim();
    const ownerName = (cells[1] ?? "").trim();
    const phoneRaw = (cells[2] ?? "").trim();
    const email = (cells[3] ?? "").trim().toLowerCase();
    const city = (cells[4] ?? "").trim();
    const state = (cells[5] ?? "").trim();
    const pincode = (cells[6] ?? "").trim();

    const normalizedPhone = phoneRaw ? normalizePhone(phoneRaw) : "";

    const errors: string[] = [];
    if (!shopName) errors.push("Shop name required");
    if (!ownerName) errors.push("Owner name required");
    if (!phoneRaw) errors.push("Phone required");
    else if (normalizedPhone === phoneRaw && !/^\+\d{10,15}$/.test(phoneRaw)) {
      errors.push("Invalid phone number");
    }
    if (!city) errors.push("City required");
    if (!state) errors.push("State required");

    const dupKey = normalizedPhone || phoneRaw;
    const isDuplicate = !!dupKey && seen.has(dupKey);
    if (!isDuplicate && dupKey) seen.add(dupKey);

    const isExisting = !!normalizedPhone && existingPhones.has(normalizedPhone);

    return {
      rowNum, shopName, ownerName, phone: phoneRaw, normalizedPhone,
      email, city, state, pincode, errors, isDuplicate, isExisting,
    };
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  manufacturerId: string;
  manufacturerName: string;
  /** Available seats = totalPurchased - activeUsed. -1 means no subscription. */
  seatsRemaining: number;
  /** Normalized E164 phones already in this manufacturer's network (for dedup). */
  existingPhones: Set<string>;
  onDone: () => Promise<void>;
};

export function BulkRetailerUpload({
  manufacturerId,
  manufacturerName,
  seatsRemaining,
  existingPhones,
  onDone,
}: Props) {
  const { t } = useI18n();
  // Translate parser-produced English error strings at render time (parsing logic
  // stays untouched). Unknown/dynamic strings fall through unchanged.
  const tErr = (msg: string): string => {
    switch (msg) {
      case "Shop name required": return t("csvRetailerErrShopName");
      case "Owner name required": return t("csvRetailerErrOwnerName");
      case "Phone required": return t("csvRetailerErrPhone");
      case "Invalid phone number": return t("csvRetailerErrInvalidPhone");
      case "City required": return t("csvRetailerErrCity");
      case "State required": return t("csvRetailerErrState");
      default: return msg;
    }
  };
  const [open, setOpen] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedRetailerRow[]>([]);
  const [uploadRows, setUploadRows] = useState<UploadRow[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const noSubscription = seatsRemaining < 0;

  const validRows = parsedRows.filter(
    (r) => !r.errors.length && !r.isDuplicate && !r.isExisting,
  );
  const hasEnoughSeats = seatsRemaining >= validRows.length && validRows.length > 0;

  // ── File handling ──────────────────────────────────────────────────────────

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const rows = parseRetailerCSV(e.target?.result as string, existingPhones);
      setParsedRows(rows);
      setUploadRows(null);
      setDone(false);
    };
    reader.readAsText(file);
  };

  // ── Upload ─────────────────────────────────────────────────────────────────

  const handleStart = async () => {
    if (!validRows.length || uploading) return;

    const rows: UploadRow[] = parsedRows.map((r) => {
      let statusMsg = "";
      let status: RowStatus = "pending";
      if (r.errors.length) { status = "skipped"; statusMsg = r.errors.map(tErr).join("; "); }
      else if (r.isDuplicate) { status = "skipped"; statusMsg = t("csvRetailerDupSkipped"); }
      else if (r.isExisting) { status = "skipped"; statusMsg = t("csvRetailerExistingSkipped"); }
      return { ...r, status, statusMsg };
    });

    setUploadRows(rows);
    setUploading(true);

    for (let i = 0; i < rows.length; i++) {
      if (rows[i]!.status !== "pending") continue;

      setUploadRows((prev) => {
        if (!prev) return prev;
        const next = [...prev];
        next[i] = { ...next[i]!, status: "uploading", statusMsg: t("csvRetailerAdding") };
        return next;
      });

      try {
        await createNetworkRetailer({
          manufacturerId,
          shopName: rows[i]!.shopName,
          ownerName: rows[i]!.ownerName,
          phone: rows[i]!.phone,
          email: rows[i]!.email,
          address: {
            line1: [rows[i]!.city, rows[i]!.state].filter(Boolean).join(", "),
            city: rows[i]!.city,
            state: rows[i]!.state,
            pincode: rows[i]!.pincode,
          },
          geo: null,
        });

        setUploadRows((prev) => {
          if (!prev) return prev;
          const next = [...prev];
          next[i] = { ...next[i]!, status: "done", statusMsg: t("csvStatusAdded") };
          return next;
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : t("csvRetailerFailedMsg");
        setUploadRows((prev) => {
          if (!prev) return prev;
          const next = [...prev];
          next[i] = { ...next[i]!, status: "error", statusMsg: msg };
          return next;
        });
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
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "retailers-bulk.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const invalidCount = parsedRows.filter((r) => r.errors.length > 0).length;
  const dupCount = parsedRows.filter((r) => r.isDuplicate).length;
  const existingCount = parsedRows.filter((r) => r.isExisting && !r.isDuplicate).length;

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
            {t("csvRetailerTitle")}
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              seatsRemaining > 0
                ? "bg-primary/10 text-primary"
                : "bg-red-100 text-red-600"
            }`}
          >
            {seatsRemaining < 0
              ? t("csvNoSubscriptionBadge")
              : seatsRemaining !== 1
                ? t("csvSeatsAvailable", { count: seatsRemaining })
                : t("csvSeatAvailable", { count: seatsRemaining })}
          </span>
        </div>
        {open
          ? <ChevronUp className="h-4 w-4 text-on-surface-variant shrink-0" />
          : <ChevronDown className="h-4 w-4 text-on-surface-variant shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-outline-variant/20 px-5 pb-5 pt-4 flex flex-col gap-4">

          {/* Section guidance — purpose of bulk retailer add + seat usage */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-semibold">
            <span className="inline-flex items-center gap-1.5 text-primary">
              <HelperIcon size="xs" variant="ghost" side="right" textKey="csvRetailerSection" ariaLabel={`${t("csvRetailerTitle")} help`} />
              {t("csvRetailerTitle")}
            </span>
            <span className="inline-flex items-center gap-1.5 text-on-surface-variant">
              <HelperIcon size="xs" variant="ghost" side="right" textKey="csvSeatBadge" ariaLabel="Available seats help" />
              {seatsRemaining < 0
                ? t("csvNoSubscriptionBadge")
                : seatsRemaining !== 1
                  ? t("csvSeatsAvailable", { count: seatsRemaining })
                  : t("csvSeatAvailable", { count: seatsRemaining })}
            </span>
          </div>

          {/* No subscription banner */}
          {noSubscription && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {t("csvNoActiveSub")}{" "}
              <Link href="/dashboard/upgrade" className="font-semibold underline">
                {t("csvPurchasePlan")}
              </Link>{" "}
              {t("csvRetailerToAdd")}
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
            <HelperIcon size="xs" variant="ghost" side="right" textKey="csvRetailerTemplate" ariaLabel={`${t("csvDownloadTemplate")} help`} />
            <span className="text-xs text-on-surface-variant">
              {t("csvColumnsLabel")} <code className="font-mono">shopName, ownerName, phone, email, city, state, pincode</code>
            </span>
          </div>

          {/* File picker */}
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
                  <HelperIcon size="xs" variant="ghost" side="left" textKey="csvRetailerUploadZone" ariaLabel={`${t("csvSelectFile")} help`} />
                </div>
                <button
                  type="button"
                  disabled={noSubscription || seatsRemaining === 0}
                  onClick={() => fileRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-outline-variant/40 bg-surface-container-low/50 py-8 text-sm text-on-surface-variant hover:border-primary hover:text-primary disabled:opacity-50 transition-colors"
                >
                  <Upload className="h-5 w-5" />
                  {t("csvSelectFile")}
                </button>
              </div>
            </>
          )}

          {/* Preview table */}
          {parsedRows.length > 0 && !uploadRows && (
            <div className="flex flex-col gap-3">
              {/* Summary chips */}
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
                      ? t("csvRetailerDupsInCsv", { count: dupCount })
                      : t("csvRetailerDupInCsv", { count: dupCount })}
                  </span>
                )}
                {existingCount > 0 && (
                  <span className="rounded-full bg-surface-container-low text-on-surface-variant px-2.5 py-1">
                    {t("csvRetailerAlreadyInNetwork", { count: existingCount })}
                  </span>
                )}
              </div>

              {/* Seat check warning */}
              {validRows.length > 0 && seatsRemaining < validRows.length && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {t("csvRetailerNotEnoughSeats", { need: validRows.length, have: Math.max(0, seatsRemaining) })}{" "}
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
                      <th className="px-3 py-2 text-left font-semibold">{t("csvRetailerColShopName")}</th>
                      <th className="px-3 py-2 text-left font-semibold">{t("csvRetailerColOwner")}</th>
                      <th className="px-3 py-2 text-left font-semibold">{t("csvRetailerColPhone")}</th>
                      <th className="px-3 py-2 text-left font-semibold">{t("csvRetailerColCity")}</th>
                      <th className="px-3 py-2 text-left font-semibold">{t("csvRetailerColState")}</th>
                      <th className="px-3 py-2 text-left font-semibold">{t("csvColStatus")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map((row) => (
                      <tr
                        key={row.rowNum}
                        className={`border-b border-outline-variant/10 ${
                          row.isDuplicate || row.isExisting
                            ? "bg-amber-50"
                            : row.errors.length
                              ? "bg-red-50"
                              : ""
                        }`}
                      >
                        <td className="px-3 py-2 text-on-surface-variant">{row.rowNum}</td>
                        <td className="px-3 py-2 font-medium text-on-surface">{row.shopName || "—"}</td>
                        <td className="px-3 py-2 text-on-surface-variant">{row.ownerName || "—"}</td>
                        <td className="px-3 py-2 text-on-surface-variant font-mono">
                          {row.normalizedPhone || row.phone || "—"}
                        </td>
                        <td className="px-3 py-2 text-on-surface-variant">{row.city || "—"}</td>
                        <td className="px-3 py-2 text-on-surface-variant">{row.state || "—"}</td>
                        <td className="px-3 py-2">
                          {row.isDuplicate ? (
                            <span className="text-amber-600 font-medium">{t("csvRetailerDupRow")}</span>
                          ) : row.isExisting ? (
                            <span className="text-amber-600 font-medium">{t("csvRetailerExistingRow")}</span>
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
                    : <UserPlus className="h-4 w-4" />}
                  {validRows.length !== 1
                    ? t("csvRetailerAddBtnPlural", { count: validRows.length })
                    : t("csvRetailerAddBtn", { count: validRows.length })}
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
                    <Loader2 className="h-3 w-3 animate-spin" /> {t("csvRetailerAddingRetailers")}
                  </span>
                )}
                {done && (
                  <>
                    <span className="rounded-full bg-green-100 text-green-700 px-2.5 py-1">
                      {t("csvRetailerAdded", { count: uploadRows.filter((r) => r.status === "done").length })}
                    </span>
                    {uploadRows.filter((r) => r.status === "error").length > 0 && (
                      <span className="rounded-full bg-red-100 text-red-600 px-2.5 py-1">
                        {t("csvRetailerFailed", { count: uploadRows.filter((r) => r.status === "error").length })}
                      </span>
                    )}
                    {uploadRows.filter((r) => r.status === "skipped").length > 0 && (
                      <span className="rounded-full bg-surface-container-low text-on-surface-variant px-2.5 py-1">
                        {t("csvRetailerSkipped", { count: uploadRows.filter((r) => r.status === "skipped").length })}
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
                      <th className="px-3 py-2 text-left font-semibold">{t("csvRetailerColShopName")}</th>
                      <th className="px-3 py-2 text-left font-semibold">{t("csvRetailerColPhone")}</th>
                      <th className="px-3 py-2 text-left font-semibold">{t("csvColResult")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploadRows.map((row) => (
                      <tr key={row.rowNum} className="border-b border-outline-variant/10">
                        <td className="px-3 py-2 text-on-surface-variant">{row.rowNum}</td>
                        <td className="px-3 py-2 font-medium text-on-surface">{row.shopName}</td>
                        <td className="px-3 py-2 text-on-surface-variant font-mono">
                          {row.normalizedPhone || row.phone}
                        </td>
                        <td className="px-3 py-2">
                          {row.status === "uploading" && (
                            <span className="flex items-center gap-1 text-primary">
                              <Loader2 className="h-3 w-3 animate-spin" /> {t("csvRetailerAdding")}
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
