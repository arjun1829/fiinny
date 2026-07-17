"use client";

import { useRef, useState } from "react";
import * as XLSX from "xlsx";
// exceljs is imported dynamically in downloadTemplate() to keep it out of the
// initial bundle — it's only needed when the user requests the template file.
import {
  AlertCircle, CheckCircle2, ChevronDown, ChevronUp,
  Download, Loader2, Upload, X,
} from "lucide-react";
import { createManufacturerProduct } from "../_lib/manufacturer-products-firestore";
import { createProductAndInventory } from "../_lib/inventory-firestore";
import { PRODUCT_CATEGORIES } from "../_lib/category-info";
import type { SeatStats } from "../_types/subscriptions";

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_CATEGORIES = PRODUCT_CATEGORIES as readonly string[];

// Labels shown in the dropdown and accepted in the upload file
const UNIT_TYPE_LABELS = [
  "gm", "KG", "ml", "L", "Packet", "Piece", "Bottle", "Can", "Custom",
] as const;
type UnitTypeLabel = (typeof UNIT_TYPE_LABELS)[number];

const DEFAULT_STOCK = 20;

const REQUIRED_HEADERS = [
  "name", "category", "packageSize", "unitType", "price", "description", "imageUrl",
] as const;

// stockQuantity is optional — present in the template but not in REQUIRED_HEADERS

// ─── Types ────────────────────────────────────────────────────────────────────

type ParsedRow = {
  rowNum: number;
  name: string;
  category: string;
  packageSize: string;
  unitType: string;
  price: string;
  /** Resolved stock: uploaded value OR DEFAULT_STOCK when blank. */
  stockQuantity: number;
  description: string;
  imageUrl: string;
};

type ValidationError = {
  row: number;
  message: string;
};

type UploadStatus = "pending" | "uploading" | "done" | "error";

type UploadRow = {
  parsed: ParsedRow;
  status: UploadStatus;
  error?: string;
};

type Props = {
  userId: string | null;
  role: "manufacturer" | "retailer";
  seatStats: SeatStats;
  onDone: () => Promise<void>;
  storeName?: string;
  accountDeliveryEnabled?: boolean;
};

// ─── Template generation ──────────────────────────────────────────────────────
// Uses ExcelJS (dynamically imported) because SheetJS CE does not write
// data validations (dropdown lists) to XLSX — that is a SheetJS Pro feature.

async function downloadTemplate() {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Products");

  // Column definitions
  ws.columns = [
    { header: "name",          key: "name",          width: 32 },
    { header: "category",      key: "category",      width: 20 },
    { header: "packageSize",   key: "packageSize",   width: 14 },
    { header: "unitType",      key: "unitType",      width: 14 },
    { header: "price",         key: "price",         width: 10 },
    { header: "stockQuantity", key: "stockQuantity", width: 16 },
    { header: "description",   key: "description",   width: 55 },
    { header: "imageUrl",      key: "imageUrl",      width: 60 },
  ];

  // Style the header row
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F4FF" } };
  headerRow.alignment = { vertical: "middle" };

  // Note row explaining the optional stockQuantity field
  const noteRow = ws.addRow({
    name: "← stockQuantity is optional. Leave blank to use default stock of 20.",
  });
  noteRow.font = { italic: true, color: { argb: "FF777777" } };

  // Example data row
  ws.addRow({
    name:          "Urea Fertilizer",
    category:      "Fertilizers",
    packageSize:   "50",
    unitType:      "KG",
    price:         "850",
    stockQuantity: "100",
    description:   "Premium urea fertilizer for all crops. Boosts nitrogen content and improves yield.",
    imageUrl:      "https://example.com/product.jpg",
  });

  ws.views = [{ state: "frozen", ySplit: 1 }];

  // ── Dropdown validations ─────────────────────────────────────────────────
  const categoryFormula = `"${VALID_CATEGORIES.join(",")}"`;
  const unitFormula     = `"${UNIT_TYPE_LABELS.join(",")}"`;

  // ExcelJS types omit dataValidations from Worksheet but it exists at runtime
  const dv = (ws as any).dataValidations;
  dv.add("B2:B1001", {
    type: "list",
    allowBlank: false,
    formulae: [categoryFormula],
    showErrorMessage: true,
    errorStyle: "error",
    errorTitle: "Invalid Category",
    error: `Choose one of: ${VALID_CATEGORIES.join(", ")}`,
  });
  dv.add("D2:D1001", {
    type: "list",
    allowBlank: false,
    formulae: [unitFormula],
    showErrorMessage: true,
    errorStyle: "error",
    errorTitle: "Invalid Unit Type",
    error: `Choose one of: ${UNIT_TYPE_LABELS.join(", ")}`,
  });

  // Trigger browser download
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "bulk-product-template.xlsx";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Parsing & validation ─────────────────────────────────────────────────────

async function parseAndValidate(
  file: File,
): Promise<{ rows: ParsedRow[]; errors: ValidationError[] }> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];

  if (!ws) {
    return { rows: [], errors: [{ row: 0, message: "Spreadsheet is empty or unreadable." }] };
  }

  // sheet_to_json returns objects keyed by the header row
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: "",
    raw: false, // keep everything as string (prevents Excel number coercion)
  });

  if (raw.length === 0) {
    return { rows: [], errors: [{ row: 0, message: "No data rows found in the file." }] };
  }

  // Verify required headers exist (case-sensitive)
  const firstRow = raw[0];
  const missing = REQUIRED_HEADERS.filter((h) => !(h in firstRow));
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [{ row: 0, message: `Missing required columns: ${missing.join(", ")}` }],
    };
  }

  const rows: ParsedRow[] = [];
  const errors: ValidationError[] = [];

  raw.forEach((row, idx) => {
    const rowNum = idx + 2; // 1-indexed, +1 for header, +1 for 1-based

    const name             = String(row["name"]          ?? "").trim();
    const category         = String(row["category"]      ?? "").trim();
    const packageSize      = String(row["packageSize"]   ?? "").trim();
    const unitType         = String(row["unitType"]      ?? "").trim();
    const price            = String(row["price"]         ?? "").trim();
    const stockRaw         = String(row["stockQuantity"] ?? "").trim();
    const description      = String(row["description"]   ?? "").trim();
    const imageUrl         = String(row["imageUrl"]      ?? "").trim();

    const err = (msg: string) => errors.push({ row: rowNum, message: msg });

    if (!name)
      err("Product Name is required");

    if (!category)
      err("Category is required");
    else if (!VALID_CATEGORIES.includes(category))
      err(`Invalid Category "${category}" — must be one of: ${VALID_CATEGORIES.join(", ")}`);

    if (!packageSize) {
      err("Package Size is required");
    } else {
      const n = parseFloat(packageSize);
      if (isNaN(n) || n <= 0)
        err("Package Size must be a number greater than 0");
    }

    if (!unitType)
      err("Unit Type is required");
    else if (!(UNIT_TYPE_LABELS as readonly string[]).includes(unitType))
      err(`Invalid Unit Type "${unitType}" — must be one of: ${UNIT_TYPE_LABELS.join(", ")}`);

    if (!price) {
      err("Price is required");
    } else {
      const n = parseFloat(price);
      if (isNaN(n) || n <= 0)
        err("Price must be greater than 0");
    }

    // stockQuantity — optional; blank → DEFAULT_STOCK; provided → integer ≥ 0
    let stockQuantity = DEFAULT_STOCK;
    if (stockRaw !== "") {
      const n = Number(stockRaw);
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        err("Stock Quantity must be a whole number (0 or greater) if provided");
      } else {
        stockQuantity = n;
      }
    }

    if (!description)
      err("Description is required");
    else if (description.length < 20 || description.length > 300)
      err(`Description must be between 20 and 300 characters (row ${rowNum} has ${description.length})`);

    if (!imageUrl) {
      err("Image URL is required");
    } else {
      try { new URL(imageUrl); } catch { err("Image URL must be a valid URL"); }
    }

    rows.push({ rowNum, name, category, packageSize, unitType, price, stockQuantity, description, imageUrl });
  });

  return { rows, errors };
}

// ─── Upload helpers ───────────────────────────────────────────────────────────

/** Build the unit string from packageSize + unitType, e.g. "500 ml", "1 KG". */
function buildUnit(packageSize: string, unitType: string): string {
  return `${packageSize} ${unitType}`.trim();
}

async function uploadRow(
  row: ParsedRow,
  userId: string,
  role: "manufacturer" | "retailer",
  storeName: string,
  sellMode: "online_delivery" | "offline_store_only",
): Promise<void> {
  const unit  = buildUnit(row.packageSize, row.unitType);
  const price = parseFloat(row.price);
  const stock = row.stockQuantity; // already resolved (uploaded value OR DEFAULT_STOCK)

  if (role === "manufacturer") {
    await createManufacturerProduct(userId, {
      name: row.name,
      category: row.category,
      unit,
      price,
      variants: [{ unit, price, stock }],
      stockQuantity: stock,
      description: row.description,
      image: row.imageUrl,
      images: [row.imageUrl],
      gstApplicable: false,
      gstRate: 0,
      sellMode,
    });
  } else {
    await createProductAndInventory(userId, {
      name: row.name,
      category: row.category,
      unit,
      stockQuantity: stock,
      sellingPrice: price,
      reorderThreshold: 0,
      description: row.description,
      imageUrl: row.imageUrl,
      storeName,
      sellMode,
      gstApplicable: false,
      gstRate: 0,
    });
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BulkProductUpload({
  userId,
  role,
  seatStats,
  onDone,
  storeName,
  accountDeliveryEnabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [previewRows, setPreviewRows] = useState<ParsedRow[] | null>(null);
  const [uploadRows, setUploadRows] = useState<UploadRow[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const noSubscription = seatStats.totalPurchased === 0;
  const rowCount = previewRows?.length ?? 0;
  const hasEnoughSeats = seatStats.available >= rowCount && rowCount > 0;

  const reset = () => {
    setValidationErrors([]);
    setPreviewRows(null);
    setUploadRows(null);
    setAllDone(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    reset();
    setParsing(true);
    try {
      const { rows, errors } = await parseAndValidate(file);
      if (errors.length > 0) {
        setValidationErrors(errors);
        setPreviewRows(null);
      } else {
        setPreviewRows(rows);
      }
    } catch (err) {
      setValidationErrors([{
        row: 0,
        message: err instanceof Error ? err.message : "Failed to parse file.",
      }]);
    } finally {
      setParsing(false);
    }
  };

  const handleUpload = async () => {
    if (!previewRows || !userId) return;

    const sellMode: "online_delivery" | "offline_store_only" =
      accountDeliveryEnabled ? "online_delivery" : "offline_store_only";

    const rows: UploadRow[] = previewRows.map((p) => ({ parsed: p, status: "pending" }));
    setUploadRows([...rows]);
    setUploading(true);

    for (let i = 0; i < rows.length; i++) {
      rows[i] = { ...rows[i], status: "uploading" };
      setUploadRows([...rows]);
      try {
        await uploadRow(
          rows[i].parsed,
          userId,
          role,
          storeName || "My Store",
          sellMode,
        );
        rows[i] = { ...rows[i], status: "done" };
      } catch (err) {
        rows[i] = {
          ...rows[i],
          status: "error",
          error: err instanceof Error ? err.message : "Upload failed",
        };
      }
      setUploadRows([...rows]);
    }

    setUploading(false);
    setAllDone(true);
    await onDone();
  };

  const uploadedCount  = uploadRows?.filter((r) => r.status === "done").length ?? 0;
  const errorCount     = uploadRows?.filter((r) => r.status === "error").length ?? 0;

  const isManufacturer = role === "manufacturer";

  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-ambient overflow-hidden">
      {/* ── Header / toggle ─────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-surface-container/50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Upload className="h-4 w-4 text-primary shrink-0" />
          <div>
            <p className="text-sm font-semibold text-on-surface">
              Bulk Upload Products
            </p>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Import multiple products at once using an XLSX file
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!noSubscription && (
            <span className="text-xs font-semibold text-primary bg-primary/10 rounded-full px-2 py-0.5">
              {seatStats.available} seat{seatStats.available !== 1 ? "s" : ""} available
            </span>
          )}
          {open ? (
            <ChevronUp className="h-4 w-4 text-on-surface-variant" />
          ) : (
            <ChevronDown className="h-4 w-4 text-on-surface-variant" />
          )}
        </div>
      </button>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      {open && (
        <div className="border-t border-outline-variant/20 px-5 py-5 space-y-5">

          {noSubscription ? (
            <p className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 font-medium">
              A subscription is required to upload products.{" "}
              <a href="/dashboard/upgrade" className="underline font-bold">Upgrade now</a>
            </p>
          ) : (
            <>
              {/* Template download */}
              <div className="flex items-center justify-between rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-on-surface">Download Template</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    XLSX with category &amp; unit dropdowns pre-configured
                  </p>
                </div>
                <button
                  type="button"
                  disabled={downloadingTemplate}
                  onClick={async () => {
                    setDownloadingTemplate(true);
                    try { await downloadTemplate(); } finally { setDownloadingTemplate(false); }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-white px-3 py-2 text-xs font-semibold text-on-surface hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all"
                >
                  {downloadingTemplate
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Preparing…</>
                    : <><Download className="h-3.5 w-3.5" /> Template</>
                  }
                </button>
              </div>

              {/* File input */}
              {!previewRows && !uploadRows && (
                <div>
                  <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-outline-variant/40 px-6 py-8 cursor-pointer hover:border-primary/40 hover:bg-primary/3 transition-all">
                    {parsing ? (
                      <Loader2 className="h-6 w-6 text-primary animate-spin" />
                    ) : (
                      <Upload className="h-6 w-6 text-on-surface-variant" />
                    )}
                    <span className="text-sm font-medium text-on-surface">
                      {parsing ? "Parsing file…" : "Click to select XLSX file"}
                    </span>
                    <span className="text-xs text-on-surface-variant">
                      .xlsx or .xls — max 1000 rows
                    </span>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".xlsx,.xls"
                      disabled={parsing}
                      onChange={handleFileChange}
                      className="sr-only"
                    />
                  </label>
                </div>
              )}

              {/* ── Validation errors ─────────────────────────────────────── */}
              {validationErrors.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                      <p className="text-sm font-bold text-red-800">
                        Import Failed — {validationErrors.length} error{validationErrors.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <button type="button" onClick={reset} className="text-red-600 hover:text-red-800 p-1">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <ul className="space-y-1.5 max-h-64 overflow-y-auto">
                    {validationErrors.map((e, i) => (
                      <li key={i} className="text-xs text-red-700 flex gap-2">
                        <span className="font-bold shrink-0">
                          {e.row === 0 ? "File" : `Row ${e.row}`}:
                        </span>
                        <span>{e.message}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={reset}
                    className="mt-3 text-xs font-semibold text-red-700 hover:underline"
                  >
                    Choose a different file
                  </button>
                </div>
              )}

              {/* ── Preview table ─────────────────────────────────────────── */}
              {previewRows && !uploadRows && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-on-surface">
                      {previewRows.length} product{previewRows.length !== 1 ? "s" : ""} ready to import
                    </p>
                    <button type="button" onClick={reset} className="text-xs text-on-surface-variant hover:text-on-surface flex items-center gap-1">
                      <X className="h-3.5 w-3.5" /> Clear
                    </button>
                  </div>

                  {!hasEnoughSeats && (
                    <p className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 font-medium">
                      Not enough seats — you need {previewRows.length} but have {seatStats.available} available.{" "}
                      <a href="/dashboard/upgrade" className="underline font-bold">Buy more</a>
                    </p>
                  )}

                  <div className="overflow-x-auto rounded-xl border border-outline-variant/30">
                    <table className="min-w-full text-xs">
                      <thead className="bg-surface-container-low border-b border-outline-variant/20">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-on-surface-variant">#</th>
                          <th className="px-3 py-2 text-left font-semibold text-on-surface-variant">Name</th>
                          <th className="px-3 py-2 text-left font-semibold text-on-surface-variant">Category</th>
                          <th className="px-3 py-2 text-left font-semibold text-on-surface-variant">Size</th>
                          <th className="px-3 py-2 text-left font-semibold text-on-surface-variant">Price</th>
                          <th className="px-3 py-2 text-left font-semibold text-on-surface-variant">Stock</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/10">
                        {previewRows.slice(0, 50).map((r) => (
                          <tr key={r.rowNum} className="hover:bg-surface-container/40">
                            <td className="px-3 py-2 text-on-surface-variant">{r.rowNum}</td>
                            <td className="px-3 py-2 font-medium text-on-surface max-w-[200px] truncate">{r.name}</td>
                            <td className="px-3 py-2 text-on-surface-variant">{r.category}</td>
                            <td className="px-3 py-2 text-on-surface-variant whitespace-nowrap">{r.packageSize} {r.unitType}</td>
                            <td className="px-3 py-2 text-on-surface-variant whitespace-nowrap">₹{r.price}</td>
                            <td className="px-3 py-2 text-on-surface-variant whitespace-nowrap">
                              {r.stockQuantity}
                              {r.stockQuantity === DEFAULT_STOCK && (
                                <span className="ml-1 text-[10px] text-on-surface-variant/60">(default)</span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {previewRows.length > 50 && (
                          <tr>
                            <td colSpan={6} className="px-3 py-2 text-center text-on-surface-variant">
                              …and {previewRows.length - 50} more rows
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleUpload}
                      disabled={!hasEnoughSeats || !userId}
                      className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 active:scale-95 disabled:opacity-50 transition-all"
                    >
                      <Upload className="h-4 w-4" />
                      Import {previewRows.length} Product{previewRows.length !== 1 ? "s" : ""}
                    </button>
                    <button type="button" onClick={reset} className="text-sm text-on-surface-variant hover:text-on-surface">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* ── Upload progress ───────────────────────────────────────── */}
              {uploadRows && (
                <div className="space-y-4">
                  {/* Summary */}
                  {allDone && (
                    <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${
                      errorCount === 0
                        ? "bg-green-50 border border-green-200 text-green-800"
                        : "bg-amber-50 border border-amber-200 text-amber-800"
                    }`}>
                      {errorCount === 0 ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                      )}
                      {uploadedCount} of {uploadRows.length} product{uploadRows.length !== 1 ? "s" : ""} imported
                      {errorCount > 0 ? ` — ${errorCount} failed` : " successfully"}
                    </div>
                  )}

                  {/* Row-level progress */}
                  <div className="overflow-x-auto rounded-xl border border-outline-variant/30 max-h-80 overflow-y-auto">
                    <table className="min-w-full text-xs">
                      <thead className="bg-surface-container-low border-b border-outline-variant/20 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-on-surface-variant">#</th>
                          <th className="px-3 py-2 text-left font-semibold text-on-surface-variant">Product</th>
                          <th className="px-3 py-2 text-left font-semibold text-on-surface-variant">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/10">
                        {uploadRows.map((r, i) => (
                          <tr key={i} className="hover:bg-surface-container/40">
                            <td className="px-3 py-2 text-on-surface-variant">{r.parsed.rowNum}</td>
                            <td className="px-3 py-2 font-medium text-on-surface max-w-[220px] truncate">{r.parsed.name}</td>
                            <td className="px-3 py-2">
                              {r.status === "pending" && (
                                <span className="text-on-surface-variant">Waiting…</span>
                              )}
                              {r.status === "uploading" && (
                                <span className="inline-flex items-center gap-1 text-primary">
                                  <Loader2 className="h-3 w-3 animate-spin" /> Uploading…
                                </span>
                              )}
                              {r.status === "done" && (
                                <span className="inline-flex items-center gap-1 text-green-700 font-semibold">
                                  <CheckCircle2 className="h-3 w-3" /> Done
                                </span>
                              )}
                              {r.status === "error" && (
                                <span className="text-red-600 font-medium" title={r.error}>
                                  ✗ {r.error ?? "Failed"}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {allDone && (
                    <button
                      type="button"
                      onClick={() => { reset(); setOpen(false); }}
                      className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/40 px-4 py-2 text-sm font-medium text-on-surface hover:bg-surface-container transition-colors"
                    >
                      Close
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
