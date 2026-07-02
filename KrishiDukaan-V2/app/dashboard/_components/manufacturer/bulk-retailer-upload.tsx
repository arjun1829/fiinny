"use client";

import { useRef, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { GeoPoint } from "firebase/firestore";
import {
  CheckCircle2, ChevronDown, ChevronUp,
  FileDown, Loader2, MapPin, Upload, UserPlus, X,
} from "lucide-react";
import Link from "next/link";
import {
  createNetworkRetailer,
  linkRetailerByPhone,
} from "../../_lib/manufacturer-retailers-firestore";
import { db } from "../../../firebase";
import { parseGoogleMapsUrl } from "./add-retailer-form";
import { useI18n } from "../../../i18n/I18nContext";
import { HelperIcon } from "../../../../components/helpers";

// ─── Phone normalization (mirrors server-side toE164India) ────────────────────

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  return "";
}

// ─── Google Maps URL validation ───────────────────────────────────────────────

const MAPS_ERR_REQUIRED  = "Google Maps link required";
const MAPS_ERR_INVALID   = "Invalid Google Maps link";
const MAPS_ERR_NOT_GOOGLE = "Must be a Google Maps URL (maps.google.com or google.com/maps)";
const MAPS_ERR_NO_COORDS = "Google Maps link must include coordinates (e.g. ?q=18.55,75.00)";

function validateGoogleMapsLink(raw: string): string | null {
  const url = raw.trim();
  if (!url) return MAPS_ERR_REQUIRED;
  let u: URL;
  try { u = new URL(url); } catch { return MAPS_ERR_INVALID; }
  const host = u.hostname.toLowerCase();
  if (host === "goo.gl" || host === "maps.app.goo.gl") return null;
  const isGoogleMaps =
    host === "maps.google.com" ||
    ((host === "www.google.com" || host === "google.com") &&
      u.pathname.toLowerCase().startsWith("/maps"));
  if (!isGoogleMaps) return MAPS_ERR_NOT_GOOGLE;
  if (!parseGoogleMapsUrl(url)) return MAPS_ERR_NO_COORDS;
  return null;
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
        } else { cell += ch; }
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

// ─── Geo resolution ───────────────────────────────────────────────────────────

async function resolveGeoFromMapsLink(mapsLink: string): Promise<GeoPoint | null> {
  if (!mapsLink) return null;
  const direct = parseGoogleMapsUrl(mapsLink);
  if (direct) return new GeoPoint(direct.lat, direct.lng);
  try {
    const res = await fetch(`/api/resolve-maps-url?url=${encodeURIComponent(mapsLink)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data.lat === "number" && typeof data.lng === "number") {
      return new GeoPoint(data.lat, data.lng);
    }
  } catch { /* geo is optional, never block the row */ }
  return null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ParsedRetailerRow = {
  rowNum: number;
  shopName: string;
  ownerName: string;
  phone: string;
  normalizedPhone: string;
  googleMapsLink: string;
  mapsError: string | null;
  city: string;
  district: string;
  state: string;
  pincode: string;
  errors: string[];
  isDuplicate: boolean;
  isExisting: boolean; // already in THIS manufacturer's network
};

// "exists_in_db" = phone has a retailers doc but is NOT yet in this manufacturer's network
type RowStatus = "pending" | "uploading" | "done" | "error" | "skipped" | "exists_in_db";

type UploadRow = ParsedRetailerRow & { status: RowStatus; statusMsg: string };

type AddExistingResult = { phone: string; shopName: string; status: "done" | "skipped" | "error"; msg: string };

const CSV_TEMPLATE = `shopName,ownerName,phone,googleMapsLink,city,district,state,pincode
Sai Agro Test 01,Sai Surve Test 01,9876500001,"https://maps.google.com/?q=18.5204,73.8567",Pune,Pune,Maharashtra,411001
Krishi Kendra Test 02,Rahul Jadhav Test 02,9876500002,"https://maps.google.com/?q=19.9975,73.7898",Nashik,Nashik,Maharashtra,422001
Agro Solutions Test 03,Amit Bhosale Test 03,9876500003,"https://maps.google.com/?q=16.7050,74.2433",Kolhapur,Kolhapur,Maharashtra,416003
Farmer Store Test 04,Nikhil Pawar Test 04,9876500004,"https://maps.google.com/?q=19.8762,75.3433",Aurangabad,Aurangabad,Maharashtra,431001
Green Agro Test 05,Pratik Shinde Test 05,9876500005,"https://maps.google.com/?q=17.6805,75.9080",Solapur,Solapur,Maharashtra,413001
`;

// ─── Parser ───────────────────────────────────────────────────────────────────

function parseRetailerCSV(text: string, existingPhones: Set<string>): ParsedRetailerRow[] {
  const rawRows = parseCSV(text);
  if (!rawRows.length) return [];
  const firstCell = (rawRows[0]?.[0] ?? "").toLowerCase();
  const isHeader = firstCell === "shopname" || firstCell.includes("shop");
  const dataRows = isHeader ? rawRows.slice(1) : rawRows;
  const seen = new Set<string>();

  return dataRows.map((cells, i) => {
    const rowNum         = isHeader ? i + 2 : i + 1;
    const shopName       = (cells[0] ?? "").trim();
    const ownerNameRaw   = (cells[1] ?? "").trim();
    const phoneRaw       = (cells[2] ?? "").trim();
    const googleMapsLink = (cells[3] ?? "").trim().replace(/[“”‘’«»]/g, "");
    const city           = (cells[4] ?? "").trim();
    const district       = (cells[5] ?? "").trim();
    const state          = (cells[6] ?? "").trim() || "Maharashtra";
    const pincode        = (cells[7] ?? "").trim();
    const ownerName      = ownerNameRaw || shopName;
    const normalizedPhone = phoneRaw ? normalizePhone(phoneRaw) : "";
    const errors: string[] = [];

    if (!shopName)             errors.push("Shop name required");
    else if (shopName.length < 3) errors.push("Shop name too short");
    if (!phoneRaw)             errors.push("Phone required");
    else if (!normalizedPhone) errors.push("Phone must contain exactly 10 digits");

    const mapsError = validateGoogleMapsLink(googleMapsLink);
    if (mapsError) errors.push(mapsError);

    const dupKey = normalizedPhone || phoneRaw;
    const isDuplicate = !!dupKey && seen.has(dupKey);
    if (isDuplicate) errors.push("Duplicate phone in file");
    else if (dupKey) seen.add(dupKey);

    const isExisting = !!normalizedPhone && existingPhones.has(normalizedPhone);

    return {
      rowNum, shopName, ownerName, phone: phoneRaw, normalizedPhone,
      googleMapsLink, mapsError, city, district, state, pincode,
      errors, isDuplicate, isExisting,
    };
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  manufacturerId: string;
  manufacturerName: string;
  seatsRemaining: number;
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

  const tErr = (msg: string): string => {
    switch (msg) {
      case "Shop name required":                   return t("csvRetailerErrShopName");
      case "Shop name too short":                  return t("csvRetailerErrShopNameMin");
      case "Phone required":                       return t("csvRetailerErrPhone");
      case "Phone must contain exactly 10 digits": return t("csvRetailerErrPhoneDigits");
      case MAPS_ERR_REQUIRED:   return t("csvRetailerErrMapsRequired");
      case MAPS_ERR_INVALID:    return t("csvRetailerErrMapsInvalid");
      case MAPS_ERR_NOT_GOOGLE: return t("csvRetailerErrMapsNotGoogle");
      case MAPS_ERR_NO_COORDS:  return t("csvRetailerErrMapsNoCoords");
      case "Duplicate phone in file": return t("csvRetailerErrDupPhone");
      default: return msg;
    }
  };

  const [open, setOpen]               = useState(false);
  const [parsedRows, setParsedRows]   = useState<ParsedRetailerRow[]>([]);
  const [uploadRows, setUploadRows]   = useState<UploadRow[] | null>(null);
  const [uploading, setUploading]     = useState(false);
  const [done, setDone]               = useState(false);

  // "Add existing to network" state — rows with status "exists_in_db" after upload
  const [addingExisting, setAddingExisting]               = useState(false);
  const [addExistingResults, setAddExistingResults]       = useState<AddExistingResult[] | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  const noSubscription = seatsRemaining < 0;
  const validRows      = parsedRows.filter((r) => !r.errors.length && !r.isDuplicate && !r.isExisting);
  const hasEnoughSeats = seatsRemaining >= validRows.length && validRows.length > 0;

  // ── File handling ──────────────────────────────────────────────────────────

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const rows = parseRetailerCSV(e.target?.result as string, existingPhones);
      setParsedRows(rows);
      setUploadRows(null);
      setDone(false);
      setAddingExisting(false);
      setAddExistingResults(null);
    };
    reader.readAsText(file);
  };

  // ── Upload ─────────────────────────────────────────────────────────────────

  const handleStart = async () => {
    if (!validRows.length || uploading) return;

    // Build initial upload row list — mark ineligible rows up front
    const rows: UploadRow[] = parsedRows.map((r) => {
      if (r.errors.length)  return { ...r, status: "skipped" as RowStatus, statusMsg: r.errors.map(tErr).join("; ") };
      if (r.isDuplicate)    return { ...r, status: "skipped" as RowStatus, statusMsg: t("csvRetailerDupSkipped") };
      if (r.isExisting)     return { ...r, status: "skipped" as RowStatus, statusMsg: t("csvRetailerExistingSkipped") };
      return { ...r, status: "pending" as RowStatus, statusMsg: "" };
    });

    setUploadRows(rows);
    setUploading(true);

    // Batch-check all pending phones against the global retailers collection.
    // This runs in parallel before the sequential upload loop so we never
    // overwrite an existing retailer's profile with CSV data.
    const pendingIndices = rows.reduce<number[]>((acc, r, i) => {
      if (r.status === "pending") acc.push(i);
      return acc;
    }, []);

    const existsInDb = new Set<string>();
    await Promise.all(
      pendingIndices.map(async (i) => {
        const phone = rows[i]!.normalizedPhone;
        if (!phone) return;
        try {
          const snap = await getDoc(doc(db, "retailers", phone));
          if (snap.exists()) existsInDb.add(phone);
        } catch { /* treat as new if read fails */ }
      }),
    );

    // Flag rows whose phone already has a retailers doc — route them to the
    // "Add Existing to My Network" panel instead of calling createNetworkRetailer
    const workingRows = rows.map((r) =>
      r.status === "pending" && existsInDb.has(r.normalizedPhone)
        ? { ...r, status: "exists_in_db" as RowStatus, statusMsg: "Already registered — not overwritten" }
        : r,
    );
    setUploadRows([...workingRows]);

    // Sequential upload loop — only "pending" (truly new) rows
    for (let i = 0; i < workingRows.length; i++) {
      if (workingRows[i]!.status !== "pending") continue;

      setUploadRows((prev) => {
        if (!prev) return prev;
        const next = [...prev];
        next[i] = { ...next[i]!, status: "uploading", statusMsg: t("csvRetailerAdding") };
        return next;
      });

      try {
        const geo = await resolveGeoFromMapsLink(workingRows[i]!.googleMapsLink);
        await createNetworkRetailer({
          manufacturerId,
          shopName: workingRows[i]!.shopName,
          ownerName: workingRows[i]!.ownerName,
          phone: workingRows[i]!.normalizedPhone,
          address: {
            line1: [workingRows[i]!.city, workingRows[i]!.district, workingRows[i]!.state].filter(Boolean).join(", "),
            city: workingRows[i]!.city,
            state: workingRows[i]!.state,
            pincode: workingRows[i]!.pincode,
          },
          geo,
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

  // ── Add existing retailers to network ──────────────────────────────────────

  const handleAddExisting = async () => {
    if (!uploadRows || addingExisting) return;
    const existingRows = uploadRows.filter((r) => r.status === "exists_in_db");
    if (!existingRows.length) return;

    setAddingExisting(true);
    setAddExistingResults(null);

    const results: AddExistingResult[] = [];
    for (const row of existingRows) {
      try {
        const { alreadyLinked } = await linkRetailerByPhone(
          manufacturerId,
          manufacturerName,
          row.normalizedPhone,
        );
        results.push({
          phone: row.normalizedPhone,
          shopName: row.shopName,
          status: alreadyLinked ? "skipped" : "done",
          msg: alreadyLinked ? t("csvRetailerExistingSkipped") : t("csvStatusAdded"),
        });
      } catch (err) {
        results.push({
          phone: row.normalizedPhone,
          shopName: row.shopName,
          status: "error",
          msg: err instanceof Error ? err.message : t("csvRetailerFailedMsg"),
        });
      }
    }

    setAddExistingResults(results);
    setAddingExisting(false);
    await onDone();
  };

  // ── Download failed rows ───────────────────────────────────────────────────

  const downloadFailedRows = () => {
    if (!uploadRows) return;
    const failed = uploadRows.filter(
      (r) => r.status === "error" || (r.status === "skipped" && (r.errors.length > 0 || r.isDuplicate)),
    );
    if (!failed.length) return;
    const header = "Row,Shop Name,Phone,Error\n";
    const body = failed
      .map((r) => {
        const reason = r.status === "error" ? r.statusMsg : r.errors.map(tErr).join("; ");
        return `${r.rowNum},"${r.shopName.replace(/"/g, '""')}","${r.normalizedPhone || r.phone}","${reason.replace(/"/g, '""')}"`;
      })
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "retailers-failed.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Reset ──────────────────────────────────────────────────────────────────

  const reset = () => {
    setParsedRows([]);
    setUploadRows(null);
    setDone(false);
    setAddingExisting(false);
    setAddExistingResults(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  // ── Template download ──────────────────────────────────────────────────────

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "retailers-bulk.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Derived counts ─────────────────────────────────────────────────────────

  const invalidCount  = parsedRows.filter((r) => r.errors.length > 0).length;
  const dupCount      = parsedRows.filter((r) => r.isDuplicate).length;
  const existingCount = parsedRows.filter((r) => r.isExisting && !r.isDuplicate).length;

  const existingInDbRows = uploadRows?.filter((r) => r.status === "exists_in_db") ?? [];

  // ── Render ─────────────────────────────────────────────────────────────────

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
          <span className="text-sm font-semibold text-on-surface">{t("csvRetailerTitle")}</span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${seatsRemaining > 0 ? "bg-primary/10 text-primary" : "bg-red-100 text-red-600"}`}>
            {seatsRemaining < 0
              ? t("csvNoSubscriptionBadge")
              : seatsRemaining !== 1
                ? t("csvSeatsAvailable", { count: seatsRemaining })
                : t("csvSeatAvailable", { count: seatsRemaining })}
          </span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-on-surface-variant shrink-0" /> : <ChevronDown className="h-4 w-4 text-on-surface-variant shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-outline-variant/20 px-5 pb-5 pt-4 flex flex-col gap-4">

          {/* Section guidance */}
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
              <Link href="/dashboard/upgrade" className="font-semibold underline">{t("csvPurchasePlan")}</Link>{" "}
              {t("csvRetailerToAdd")}
            </div>
          )}

          {/* Template download */}
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
              {t("csvColumnsLabel")} <code className="font-mono">shopName, ownerName, phone, googleMapsLink, city, district, state, pincode</code>
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
                  <Link href="/dashboard/upgrade" className="font-semibold underline">{t("csvBuyMoreSeats")}</Link>
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
                      <th className="px-3 py-2 text-left font-semibold">{t("csvRetailerColMaps")}</th>
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
                          row.isDuplicate || row.isExisting ? "bg-amber-50"
                          : row.errors.length ? "bg-red-50"
                          : ""
                        }`}
                      >
                        <td className="px-3 py-2 text-on-surface-variant">{row.rowNum}</td>
                        <td className="px-3 py-2 font-medium text-on-surface">{row.shopName || "—"}</td>
                        <td className="px-3 py-2 text-on-surface-variant">{row.ownerName || "—"}</td>
                        <td className="px-3 py-2 text-on-surface-variant font-mono">{row.normalizedPhone || row.phone || "—"}</td>
                        <td className="px-3 py-2 max-w-[140px]">
                          {row.googleMapsLink ? (
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1">
                                {row.mapsError
                                  ? <span className="text-red-500 font-bold shrink-0">✗</span>
                                  : <MapPin className="h-3 w-3 text-green-600 shrink-0" />}
                                <span className="font-mono text-[10px] text-on-surface-variant truncate" title={row.googleMapsLink}>
                                  {row.googleMapsLink.replace(/^https?:\/\/(www\.)?/, "").slice(0, 32)}
                                </span>
                              </div>
                              {row.mapsError && <span className="text-[10px] text-red-500 leading-tight">{tErr(row.mapsError)}</span>}
                            </div>
                          ) : (
                            <span className="text-red-400 text-[10px] font-medium">Missing</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-on-surface-variant">{row.city || "—"}</td>
                        <td className="px-3 py-2 text-on-surface-variant">{row.state || "—"}</td>
                        <td className="px-3 py-2">
                          {row.isDuplicate && !row.errors.filter((e) => e !== "Duplicate phone in file").length && !row.mapsError ? (
                            <span className="text-amber-600 font-medium">{t("csvRetailerDupRow")}</span>
                          ) : row.isExisting && !row.errors.length ? (
                            <span className="text-amber-600 font-medium">{t("csvRetailerExistingRow")}</span>
                          ) : row.errors.length ? (
                            <div className="flex flex-col gap-1">
                              {row.errors.map((e, idx) => (
                                <span key={idx} className="text-red-600 leading-tight">{tErr(e)}</span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-green-600 font-medium">{t("csvStatusReady")}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={!hasEnoughSeats || uploading}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-50 transition-all"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
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
            <div className="flex flex-col gap-4">
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
                    {existingInDbRows.length > 0 && (
                      <span className="rounded-full bg-blue-100 text-blue-700 px-2.5 py-1">
                        {existingInDbRows.length} already registered
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
                      <tr key={row.rowNum} className={`border-b border-outline-variant/10 ${row.status === "exists_in_db" ? "bg-blue-50" : ""}`}>
                        <td className="px-3 py-2 text-on-surface-variant">{row.rowNum}</td>
                        <td className="px-3 py-2 font-medium text-on-surface">{row.shopName}</td>
                        <td className="px-3 py-2 text-on-surface-variant font-mono">{row.normalizedPhone || row.phone}</td>
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
                          {row.status === "error" && <span className="text-red-600">{row.statusMsg}</span>}
                          {row.status === "skipped" && <span className="text-on-surface-variant">{row.statusMsg}</span>}
                          {row.status === "pending" && <span className="text-on-surface-variant">{t("csvWaiting")}</span>}
                          {row.status === "exists_in_db" && (
                            <span className="text-blue-700 font-medium">Already registered</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ── Add Existing to My Network panel ─────────────────────── */}
              {done && existingInDbRows.length > 0 && !addExistingResults && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-4 flex flex-col gap-3">
                  <div>
                    <p className="text-sm font-semibold text-blue-900">
                      {existingInDbRows.length === 1
                        ? "1 retailer is already registered in Krishi Dukan"
                        : `${existingInDbRows.length} retailers are already registered in Krishi Dukan`}
                    </p>
                    <p className="text-xs text-blue-700 mt-0.5">
                      Their existing profiles were not changed. You can add them to your network without overwriting their data.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {existingInDbRows.map((r) => (
                      <span key={r.normalizedPhone} className="rounded-full bg-white border border-blue-200 px-2.5 py-1 text-xs font-medium text-blue-800">
                        {r.shopName}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={handleAddExisting}
                    disabled={addingExisting}
                    className="inline-flex w-fit items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-all"
                  >
                    {addingExisting
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <UserPlus className="h-4 w-4" />}
                    Add Existing Retailers to My Network
                  </button>
                </div>
              )}

              {/* Add-existing results */}
              {addExistingResults && (
                <div className="rounded-xl border border-outline-variant/30 overflow-hidden">
                  <div className="px-4 py-2.5 bg-surface-container-low border-b border-outline-variant/20 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-xs font-semibold text-on-surface">
                      {addExistingResults.filter((r) => r.status === "done").length} added to your network
                      {addExistingResults.filter((r) => r.status === "skipped").length > 0 &&
                        ` · ${addExistingResults.filter((r) => r.status === "skipped").length} already linked`}
                      {addExistingResults.filter((r) => r.status === "error").length > 0 &&
                        ` · ${addExistingResults.filter((r) => r.status === "error").length} failed`}
                    </span>
                  </div>
                  <table className="w-full text-xs">
                    <tbody>
                      {addExistingResults.map((r) => (
                        <tr key={r.phone} className="border-b border-outline-variant/10">
                          <td className="px-3 py-2 font-medium text-on-surface">{r.shopName}</td>
                          <td className="px-3 py-2 text-on-surface-variant font-mono">{r.phone}</td>
                          <td className="px-3 py-2">
                            {r.status === "done"    && <span className="flex items-center gap-1 text-green-600 font-medium"><CheckCircle2 className="h-3 w-3" /> {r.msg}</span>}
                            {r.status === "skipped" && <span className="text-on-surface-variant">{r.msg}</span>}
                            {r.status === "error"   && <span className="text-red-600">{r.msg}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {done && (
                <div className="flex flex-wrap gap-3">
                  {uploadRows.some((r) => r.status === "error" || (r.status === "skipped" && (r.errors.length > 0 || r.isDuplicate))) && (
                    <button
                      type="button"
                      onClick={downloadFailedRows}
                      className="inline-flex w-fit items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-100 transition-colors"
                    >
                      <FileDown className="h-4 w-4" /> {t("csvRetailerDownloadFailed")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={reset}
                    className="inline-flex w-fit items-center gap-2 rounded-xl border border-outline-variant/40 px-4 py-2.5 text-sm font-medium text-on-surface hover:bg-surface-container transition-colors"
                  >
                    {t("csvUploadAnother")}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
