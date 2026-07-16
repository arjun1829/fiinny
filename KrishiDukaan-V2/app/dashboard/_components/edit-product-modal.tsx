"use client";

import { useEffect, useRef, useState } from "react";
import { X, Loader2, Save, Upload, Link as LinkIcon, Plus, ImageIcon, Layers, Tag, AlignLeft, ChevronDown, Receipt, Youtube } from "lucide-react";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../../firebase";
import { compressImage } from "../../utils/compressImage";
import { updateManufacturerProduct, toggleProductActive, syncPriceToRetailers } from "../_lib/manufacturer-products-firestore";
import { updateInventoryRecord, updateProductSellMode } from "../_lib/inventory-firestore";
import type { InventoryRow } from "../_types/inventory";
import { useI18n } from "../../i18n/I18nContext";
import {
  PRODUCT_CATEGORIES, isStandardCategory, CATEGORY_FIELDS, CHIPS_FIELDS,
  type ProductCategory, effectiveCategoryInfo,
} from "../_lib/category-info";
import { CompositionEditor, COMPOSITION_CATEGORIES, type CompositionEntry } from "../_components/composition-editor";
import { CustomFieldsEditor, type CustomFieldEntry } from "../_components/custom-fields-editor";

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = PRODUCT_CATEGORIES;

const GST_RATES = [0, 5, 12, 18, 28] as const;
type GstRate = typeof GST_RATES[number];

const UNIT_TYPES = [
  { value: "g",      label: "gm",     display: "gm" },
  { value: "kg",     label: "KG",     display: "KG" },
  { value: "ml",     label: "ml",     display: "ml" },
  { value: "L",      label: "L",      display: "L" },
  { value: "pkt",    label: "Packet", display: "Packet" },
  { value: "pcs",    label: "Piece",  display: "Piece" },
  { value: "bottle", label: "Bottle", display: "Bottle" },
  { value: "can",    label: "Can",    display: "Can" },
  { value: "custom", label: "Custom", display: "" },
] as const;

const SIZE_OPTIONS_BY_UNIT: Record<string, string[]> = {
  g:  ["10", "25", "50", "100", "250", "500"],
  kg: ["1", "2", "5", "10", "25", "50"],
  ml: ["50", "100", "250", "500"],
  L:  ["1", "2", "5", "10", "20"],
};

const UNITS_WITH_SIZE = new Set(["g", "kg", "ml", "L"]);

const MAX_VARIANTS = 8;
const MAX_IMAGES = 5;

// ─── Types ────────────────────────────────────────────────────────────────────

type Variant = {
  unitType: string;
  sizeAmount: string;
  customSize: string;
  customUnit: string;
  price: string;
  stock: string;
};
type ImgSlot = { mode: "url" | "upload"; url: string; uploading: boolean; error: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildUnit(v: Variant): string {
  if (v.unitType === "custom") return v.customUnit.trim();
  if (!UNITS_WITH_SIZE.has(v.unitType)) return v.unitType;
  const size = v.sizeAmount === "custom" ? v.customSize.trim() : v.sizeAmount;
  if (!size) return v.unitType;
  return `${size}${v.unitType}`;
}

function buildPreviewLabel(v: Variant): string {
  if (v.unitType === "custom") return v.customUnit.trim() || "";
  const ut = UNIT_TYPES.find(u => u.value === v.unitType);
  if (!ut) return "";
  if (!UNITS_WITH_SIZE.has(v.unitType)) return ut.display;
  const size = v.sizeAmount === "custom" ? (v.customSize.trim() || "?") : v.sizeAmount;
  if (!size) return "";
  return `${size} ${ut.display}`;
}

function parseUnitToVariant(unit: string | undefined | null): Pick<Variant, "unitType" | "sizeAmount" | "customSize" | "customUnit"> {
  unit = (unit ?? "").trim();
  if (!unit) return { unitType: "custom", sizeAmount: "", customSize: "", customUnit: "" };
  const match = unit.match(/^(\d+(?:\.\d+)?)(g|kg|ml|L)$/i);
  if (match) {
    const size = match[1];
    const type = match[2] === "l" ? "L" : match[2];
    const knownSizes = SIZE_OPTIONS_BY_UNIT[type] ?? [];
    return {
      unitType: type,
      sizeAmount: knownSizes.includes(size) ? size : "custom",
      customSize: knownSizes.includes(size) ? "" : size,
      customUnit: "",
    };
  }
  if (unit === "pkt" || unit === "packet") return { unitType: "pkt", sizeAmount: "", customSize: "", customUnit: "" };
  if (unit === "pcs" || unit === "piece")  return { unitType: "pcs", sizeAmount: "", customSize: "", customUnit: "" };
  if (unit === "bottle")                   return { unitType: "bottle", sizeAmount: "", customSize: "", customUnit: "" };
  if (unit === "can")                      return { unitType: "can", sizeAmount: "", customSize: "", customUnit: "" };
  return { unitType: "custom", sizeAmount: "", customSize: "", customUnit: unit };
}

function rowToVariants(row: InventoryRow): Variant[] {
  const src = row.variants.length ? row.variants : [{ unit: row.unit, price: row.price }];
  return src.map((v, i) => ({
    ...parseUnitToVariant(v.unit),
    price: String(v.price),
    // Prefer per-variant stock saved in the variants array.
    // Fall back to the flat inventory stockQuantity for the first variant (legacy records).
    stock: v.stock !== undefined
      ? String(v.stock)
      : (i === 0 && row.stockQuantity > 0 ? String(row.stockQuantity) : ""),
  }));
}

// ─── Dynamic Category Info Section ────────────────────────────────────────────

function ModalCategoryInfoSection({
  category, values, onChange, disabled, open, onToggle,
}: {
  category: string;
  values: Record<string, string>;
  onChange: (key: string, val: string) => void;
  disabled: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const activeCat: ProductCategory = isStandardCategory(category) ? category : "Other";
  const fields = CATEGORY_FIELDS[activeCat];
  if (!fields.length) return null;

  const inputCls = "w-full rounded-xl border border-outline-variant/40 bg-white px-3 py-2.5 text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50 text-xs";

  return (
    <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/40 p-4 flex flex-col gap-4">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center justify-between text-sm font-semibold text-on-surface w-full"
      >
        <span className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          {activeCat} Info
          <span className="text-xs font-normal text-on-surface-variant">(Optional)</span>
        </span>
        <ChevronDown className={`h-4 w-4 text-on-surface-variant transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-outline-variant/20 pt-4">
          {fields.map(({ key, label, type, placeholder }) => (
            <label key={key} className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-on-surface">{label}</span>
              {type === "textarea" ? (
                <textarea rows={2} disabled={disabled} placeholder={placeholder}
                  className={`${inputCls} resize-none`}
                  value={values[key] ?? ""}
                  onChange={(e) => onChange(key, e.target.value)} />
              ) : (
                <input type="text" disabled={disabled} placeholder={placeholder}
                  className={inputCls}
                  value={values[key] ?? ""}
                  onChange={(e) => onChange(key, e.target.value)} />
              )}
              {CHIPS_FIELDS.has(key) && (
                <span className="text-[10px] text-on-surface-variant">Separate multiple values with commas</span>
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Variant Row ──────────────────────────────────────────────────────────────

function VariantRow({ v, i, disabled, isOnly, setV, removeV }: {
  v: Variant; i: number; disabled: boolean; isOnly: boolean;
  setV: (i: number, p: Partial<Variant>) => void;
  removeV: (i: number) => void;
}) {
  const hasSizes = UNITS_WITH_SIZE.has(v.unitType);
  const sizeOptions = hasSizes ? SIZE_OPTIONS_BY_UNIT[v.unitType] ?? [] : [];
  const preview = buildPreviewLabel(v);

  return (
    <div className="rounded-xl border border-outline-variant/25 bg-white p-3 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-on-surface-variant">Package {i + 1}</span>
        <button type="button" disabled={disabled || isOnly} onClick={() => removeV(i)}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-on-surface-variant hover:bg-red-50 hover:text-red-500 disabled:opacity-30 transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Step 1: Unit */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide">Step 1 — Unit</span>
        <div className="flex flex-wrap gap-1.5">
          {UNIT_TYPES.map(ut => (
            <button key={ut.value} type="button" disabled={disabled}
              onClick={() => setV(i, {
                unitType: ut.value,
                sizeAmount: UNITS_WITH_SIZE.has(ut.value) ? (SIZE_OPTIONS_BY_UNIT[ut.value]?.[0] ?? "") : "",
                customSize: "",
                customUnit: "",
              })}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                v.unitType === ut.value
                  ? "border-primary bg-primary text-white shadow-sm"
                  : "border-outline-variant/40 bg-surface-container-low text-on-surface-variant hover:border-primary/50 hover:text-primary"
              } disabled:opacity-50`}
            >
              {ut.label}
            </button>
          ))}
        </div>
      </div>

      {/* Step 2: Package Size */}
      {hasSizes && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide">Step 2 — Package Size</span>
          <div className="flex flex-wrap gap-1.5">
            {sizeOptions.map(size => (
              <button key={size} type="button" disabled={disabled}
                onClick={() => setV(i, { sizeAmount: size, customSize: "" })}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                  v.sizeAmount === size
                    ? "border-primary bg-primary text-white shadow-sm"
                    : "border-outline-variant/40 bg-surface-container-low text-on-surface-variant hover:border-primary/50 hover:text-primary"
                } disabled:opacity-50`}
              >
                {size}
              </button>
            ))}
            <button type="button" disabled={disabled}
              onClick={() => setV(i, { sizeAmount: "custom", customSize: "" })}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                v.sizeAmount === "custom"
                  ? "border-primary bg-primary text-white shadow-sm"
                  : "border-outline-variant/40 bg-surface-container-low text-on-surface-variant hover:border-primary/50 hover:text-primary"
              } disabled:opacity-50`}
            >
              Custom
            </button>
          </div>
          {v.sizeAmount === "custom" && (
            <input type="text" inputMode="numeric" pattern="[0-9]*" disabled={disabled}
              placeholder="e.g. 750"
              className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50 w-32"
              value={v.customSize}
              onChange={(e) => { const digits = e.target.value.replace(/\D/g, ""); setV(i, { customSize: digits === "" ? "" : String(parseInt(digits, 10)) }); }}
              onBlur={(e) => { if (e.target.value === "" || Number(e.target.value) <= 0) setV(i, { customSize: "" }); }} />
          )}
        </div>
      )}

      {v.unitType === "custom" && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide">Your Unit Label</span>
          <input type="text" disabled={disabled}
            placeholder="e.g. 30 tablets, 1 acre dose, 4L drum…"
            className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
            value={v.customUnit} onChange={(e) => setV(i, { customUnit: e.target.value })} />
        </div>
      )}

      {preview && (
        <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/15 px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-primary/60">Package</span>
          <span className="text-sm font-bold text-primary">{preview}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-on-surface-variant">Price (₹) *</span>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-on-surface-variant">₹</span>
            <input type="text" inputMode="decimal" disabled={disabled}
              className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest pl-7 pr-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
              placeholder="0" value={v.price}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^\d.]/g, "");
                const parts = raw.split(".");
                const joined = parts[0] + (parts.length > 1 ? "." + parts.slice(1).join("") : "");
                setV(i, { price: joined.replace(/^0+(\d)/, "$1") });
              }}
              onBlur={(e) => { const n = parseFloat(e.target.value); setV(i, { price: !isNaN(n) && n > 0 ? String(n) : "" }); }} />
          </div>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-on-surface-variant">Stock Qty</span>
          <input type="text" inputMode="numeric" pattern="[0-9]*" disabled={disabled}
            className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2.5 text-sm text-center outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
            placeholder="—" value={v.stock}
            onChange={(e) => { const digits = e.target.value.replace(/\D/g, ""); setV(i, { stock: digits === "" ? "" : String(parseInt(digits, 10)) }); }}
            onBlur={(e) => { const n = parseInt(e.target.value, 10); setV(i, { stock: isNaN(n) ? "" : String(Math.max(0, n)) }); }} />
        </label>
      </div>
    </div>
  );
}

function extractYouTubeId(url: string): string | null {
  const t = url.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(t)) return t;
  const m = t.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function isValidYouTubeUrl(url: string): boolean {
  if (!url.trim()) return true; // empty is valid (optional field)
  return extractYouTubeId(url) !== null;
}

function rowToImages(row: InventoryRow): ImgSlot[] {
  const urls = row.images.length ? row.images : (row.image ? [row.image] : []);
  return Array.from({ length: MAX_IMAGES }, (_, i) => ({
    mode: "url" as const,
    url: urls[i] ?? "",
    uploading: false,
    error: "",
  }));
}

// ─── Image slot ───────────────────────────────────────────────────────────────

function ImageSlot({ slot, index, disabled, onChange, onClear }: {
  slot: ImgSlot; index: number; disabled: boolean;
  onChange: (p: Partial<ImgSlot>) => void; onClear: () => void;
}) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) { onChange({ error: "Select an image file." }); return; }
    onChange({ uploading: true, error: "" });
    try {
      const toUpload = await compressImage(file);
      const path = `product-images/${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
      const snap = await uploadBytes(storageRef(storage, path), toUpload);
      onChange({ url: await getDownloadURL(snap.ref), uploading: false });
    } catch {
      onChange({ uploading: false, error: "Upload failed. Paste URL instead." });
    }
  };

  return (
    <div className={`flex flex-col rounded-xl border-2 overflow-hidden transition-colors ${
      slot.url ? "border-primary/20" : "border-dashed border-outline-variant/40 hover:border-primary/30"
    }`}>
      {slot.url ? (
        <div className="relative">
          <img src={slot.url} alt="" className="h-20 w-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          <button type="button" onClick={onClear}
            className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white hover:bg-red-500">
            <X className="h-2.5 w-2.5" />
          </button>
          {index === 0 && (
            <span className="absolute bottom-1 left-1 rounded-full bg-primary/90 px-1.5 py-0.5 text-[9px] font-bold text-white">{t('formMainBadge')}</span>
          )}
        </div>
      ) : (
        <div className="flex h-20 flex-col items-center justify-center text-on-surface-variant/40">
          <ImageIcon className="h-5 w-5" />
          <span className="text-[9px] mt-1">{index === 0 ? t('formMainBadge') : `#${index + 1}`}</span>
        </div>
      )}
      <div className="flex flex-col gap-1.5 p-2">
        <div className="flex rounded-lg border border-outline-variant/30 text-[10px] overflow-hidden">
          {(["url", "upload"] as const).map((m) => (
            <button key={m} type="button" disabled={disabled}
              onClick={() => onChange({ mode: m, error: "" })}
              className={`flex flex-1 items-center justify-center gap-0.5 py-1 font-medium transition-colors ${
                slot.mode === m ? "bg-primary text-white" : "text-on-surface-variant hover:bg-surface-container"
              } disabled:opacity-50`}
            >
              {m === "url" ? <LinkIcon className="h-2.5 w-2.5" /> : <Upload className="h-2.5 w-2.5" />}
              {m === "url" ? t('formLinkLabel') : t('formUploadLabel')}
            </button>
          ))}
        </div>
        {slot.mode === "url" ? (
          <input type="url" disabled={disabled} placeholder="https://…"
            className="w-full rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-2 py-1 text-[10px] outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-50"
            value={slot.url} onChange={(e) => onChange({ url: e.target.value, error: "" })} />
        ) : (
          <>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            <button type="button" disabled={disabled || slot.uploading}
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-outline-variant/40 py-1.5 text-[10px] text-on-surface-variant hover:border-primary hover:text-primary disabled:opacity-50">
              {slot.uploading ? <><Loader2 className="h-2.5 w-2.5 animate-spin" /> {t('formUploadingLabel')}</> : <><Upload className="h-2.5 w-2.5" /> {t('formChooseFile')}</>}
            </button>
          </>
        )}
        {slot.error && <p className="text-[9px] text-red-500">{slot.error}</p>}
      </div>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function EditProductModal({ row, accountDeliveryEnabled, onClose, onSaved }: {
  row: InventoryRow;
  /** When false, both Online Delivery and GST fields are hidden and forced to their off defaults on save. */
  accountDeliveryEnabled?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [name, setName]               = useState(row.productName);
  // For "Other": category stores the actual custom name; isStandardCategory check determines display.
  // Use a case-insensitive lookup so Firestore values like "pesticides" resolve to "Pesticides".
  const [category, setCategory] = useState<string>(() => {
    const canonical = CATEGORIES.find((c) => c.toLowerCase() === row.category.toLowerCase());
    return (canonical && canonical !== "Other") ? canonical : (isStandardCategory(row.category) ? row.category : "Other");
  });
  const [customCategory, setCustomCategory] = useState(() => {
    const canonical = CATEGORIES.find((c) => c.toLowerCase() === row.category.toLowerCase());
    return (canonical && canonical !== "Other") ? "" : row.category;
  });
  const [description, setDescription] = useState(row.description);
  const [variants, setVariants]       = useState<Variant[]>(rowToVariants(row));
  const [images, setImages]           = useState<ImgSlot[]>(rowToImages(row));
  const [saving, setSaving]           = useState(false);
  const [toggling, setToggling]       = useState(false);
  const [message, setMessage]         = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [updateRetailerPrices, setUpdateRetailerPrices] = useState(true);
  const [gstApplicable, setGstApplicable] = useState<boolean>(row.gstApplicable ?? false);
  const [gstRate, setGstRate]             = useState<GstRate>(row.gstRate ?? 0);
  const [sellMode, setSellMode]           = useState<"online_delivery" | "offline_store_only">(
    row.sellMode === "offline_store_only" ? "offline_store_only" : "online_delivery",
  );

  const [videoUrl, setVideoUrl] = useState<string>((row as any).videoUrl ?? "");
  const [composition, setComposition] = useState<CompositionEntry[]>(
    Array.isArray((row as any).composition) ? (row as any).composition : [],
  );
  const [customFields, setCustomFields] = useState<CustomFieldEntry[]>(
    Array.isArray(row.customFields) ? row.customFields : [],
  );

  // Category-specific info — initialise from categoryInfo or fall back to legacy flat fields
  const [categoryInfo, setCategoryInfo] = useState<Record<string, string>>(() => {
    const rawData = row as unknown as Record<string, unknown>;
    const ci = effectiveCategoryInfo(rawData);
    if (!ci) return {};
    const flat: Record<string, string> = {};
    Object.entries(ci).forEach(([k, v]) => {
      flat[k] = Array.isArray(v) ? v.join(", ") : String(v);
    });
    return flat;
  });
  const [showAdditionalData, setShowAdditionalData] = useState(() => {
    const rawData = row as unknown as Record<string, unknown>;
    return !!effectiveCategoryInfo(rawData);
  });

  const setCatField = (key: string, val: string) =>
    setCategoryInfo((prev) => ({ ...prev, [key]: val }));

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Variant helpers
  const setV = (i: number, p: Partial<Variant>) =>
    setVariants((vs) => vs.map((v, idx) => idx === i ? { ...v, ...p } : v));
  const removeV = (i: number) => setVariants((vs) => vs.filter((_, idx) => idx !== i));

  // Image helpers
  const setImg  = (i: number, p: Partial<ImgSlot>) =>
    setImages((imgs) => imgs.map((s, idx) => idx === i ? { ...s, ...p } : s));
  const clearImg = (i: number) =>
    setImages((imgs) => imgs.map((s, idx) => idx === i ? { mode: "url", url: "", uploading: false, error: "" } : s));

  const handleSave = async () => {
    if (!name.trim()) { setMessage({ type: "err", text: "Product name is required." }); return; }
    if (description.trim().length > 0 && (description.trim().length < 20 || description.trim().length > 300)) {
      setMessage({ type: "err", text: "Description must be between 20 and 300 characters." });
      return;
    }
    const parsedVariants = variants.map((v) => {
      const stockNum = v.stock !== "" ? Number(v.stock) : undefined;
      return {
        unit: buildUnit(v),
        price: Number(v.price),
        ...(stockNum !== undefined && Number.isFinite(stockNum) ? { stock: stockNum } : {}),
      };
    });
    if (parsedVariants.some((v) => !v.unit)) {
      setMessage({ type: "err", text: "Please complete the unit selection for each package." });
      return;
    }
    if (parsedVariants.some((v) => !Number.isFinite(v.price) || v.price <= 0)) {
      setMessage({ type: "err", text: "Each package needs a price greater than 0." });
      return;
    }
    if (images.some((s) => s.uploading)) {
      setMessage({ type: "err", text: "Wait for uploads to complete." });
      return;
    }
    if (videoUrl.trim() && !isValidYouTubeUrl(videoUrl)) {
      setMessage({ type: "err", text: "Enter a valid YouTube URL (youtube.com or youtu.be)." });
      return;
    }
    const imageUrls = images.map((s) => s.url.trim()).filter(Boolean);

    // Resolve the saved category value
    const savedCategory = category === "Other"
      ? (customCategory.trim() || "Other")
      : category;

    // Build categoryInfo — parse chips fields
    const activeCat: ProductCategory = isStandardCategory(savedCategory) ? savedCategory : "Other";
    const fields = CATEGORY_FIELDS[activeCat];
    const savedCategoryInfo: Record<string, string | string[]> = {};
    fields.forEach(({ key }) => {
      const raw = (categoryInfo[key] ?? "").trim();
      if (!raw) return;
      savedCategoryInfo[key] = CHIPS_FIELDS.has(key)
        ? raw.split(",").map((s) => s.trim()).filter(Boolean)
        : raw;
    });

    // Both delivery and GST are gated on the same account-level flag.
    const effectiveSellMode: "online_delivery" | "offline_store_only" =
      accountDeliveryEnabled !== false ? sellMode : "offline_store_only";
    const effectiveGstApplicable = accountDeliveryEnabled !== false ? gstApplicable : false;

    setSaving(true);
    setMessage(null);
    try {
      // ── OWNERSHIP AUDIT ────────────────────────────────────────────────────
      console.log("[EditProductModal] handleSave", {
        "Editing Product (productId)": row.productId,
        "Source": row.source,
        "Owner": row.ownerId,
        "assignedByManufacturer": row.assignedByManufacturer,
        "originalProductId": row.originalProductId ?? null,
        "Inventory": row.inventoryId,
        "Saving to (products)": row.productId,
        "Saving to (inventory)": row.inventoryId,
      });
      // ───────────────────────────────────────────────────────────────────────
      await updateManufacturerProduct(row.productId, {
        name, category: savedCategory, description,
        unit: parsedVariants[0].unit,
        price: parsedVariants[0].price,
        variants: parsedVariants,
        image: imageUrls[0] ?? "",
        images: imageUrls,
        videoUrl: videoUrl.trim() || undefined,
        composition: composition.filter(e => e.name.trim()),
        customFields: customFields.filter(e => e.title.trim()),
        categoryInfo: Object.keys(savedCategoryInfo).length ? savedCategoryInfo : {},
        gstApplicable: effectiveGstApplicable,
        gstRate: effectiveGstApplicable ? gstRate : 0,
        // Clear legacy flat fields so old data doesn't conflict with categoryInfo
        nitrogen: "", phosphorus: "", potassium: "",
        applicationDesc: "", dosage: "", bestForCrops: [],
      });

      // Sync updated price to all active retailer product copies (unless opted out).
      // Only fires when the price or variants actually changed to avoid unnecessary writes.
      const priceChanged =
        parsedVariants[0].price !== row.price ||
        JSON.stringify(parsedVariants.map((v) => ({ unit: v.unit, price: v.price }))) !==
        JSON.stringify((row.variants ?? []).map((v: { unit: string; price: number }) => ({ unit: v.unit, price: v.price })));
      if (updateRetailerPrices && priceChanged) {
        await syncPriceToRetailers(row.productId, parsedVariants[0].price, parsedVariants);
      }

      // Update sellMode separately — this cascades to assigned retailer copies.
      if (effectiveSellMode !== row.sellMode) {
        await updateProductSellMode(row.productId, effectiveSellMode);
      }

      // Update inventory: use first variant's stock; fall back to existing stockQuantity.
      // Preserve the existing reorder threshold so retailer low-stock alerts aren't wiped.
      const firstVariantStock = parsedVariants[0]?.stock;
      const stockQty = firstVariantStock !== undefined ? firstVariantStock : Number(variants[0]?.stock ?? "");
      if (row.inventoryId && Number.isFinite(stockQty) && stockQty >= 0) {
        await updateInventoryRecord(row.inventoryId, {
          stockQuantity: stockQty,
          sellingPrice: parsedVariants[0].price,
          reorderThreshold: row.reorderThreshold ?? 0,
        });
      }

      setMessage({ type: "ok", text: "Saved successfully." });
      onSaved();
    } catch (err) {
      setMessage({ type: "err", text: err instanceof Error ? err.message : "Save failed." });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    setToggling(true);
    setMessage(null);
    try {
      await toggleProductActive(row.productId, !row.isActive);
      onSaved();
      onClose();
    } catch (err) {
      setMessage({ type: "err", text: err instanceof Error ? err.message : "Failed to update status." });
    } finally {
      setToggling(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-[61] flex w-full max-w-xl flex-col bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/30 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-on-surface">{t('editProductTitle')}</h2>
            <p className="text-xs text-on-surface-variant mt-0.5 truncate max-w-sm">{row.productName}</p>
          </div>
          <button type="button" onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-container text-on-surface-variant">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

          {message && (
            <div className={`rounded-xl px-3 py-2.5 text-sm font-medium ${
              message.type === "ok"
                ? "bg-primary/10 border border-primary/30 text-primary"
                : "bg-red-50 border border-red-200 text-red-700"
            }`}>
              {message.text}
            </div>
          )}

          {/* Status badge */}
          <div className="flex items-center justify-between rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3">
            <div>
              <p className="text-sm font-medium text-on-surface">{t('productStatusLabel')}</p>
              <p className="text-xs text-on-surface-variant mt-0.5">{t('controlsVisibility')}</p>
            </div>
            <button type="button" disabled={toggling}
              onClick={handleToggleActive}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all disabled:opacity-50 ${
                row.isActive
                  ? "bg-red-50 border border-red-200 text-red-600 hover:bg-red-100"
                  : "bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20"
              }`}
            >
              {toggling && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {row.isActive ? t('toggleDeactivate') : t('toggleActivate')}
            </button>
          </div>

          {/* ── Product details ────────────────────────────────────────────── */}
          <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/40 p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
              <Tag className="h-4 w-4 text-primary" /> {t('productDetailsHeading')}
            </div>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-on-surface">{t('productNameModalLabel')} <span className="text-red-500">*</span></span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                className="rounded-xl border border-outline-variant/40 bg-white px-3 py-2.5 text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
            </label>

            <div className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-on-surface">{t('categoryLabel')}</span>
              <select value={category}
                onChange={(e) => { setCategory(e.target.value); setCategoryInfo({}); }}
                className="rounded-xl border border-outline-variant/40 bg-white px-3 py-2.5 text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 appearance-none">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {category === "Other" && (
                <input type="text"
                  placeholder="Enter custom category name"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  className="rounded-xl border border-outline-variant/40 bg-white px-3 py-2.5 text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 text-sm" />
              )}
            </div>

            <div className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-on-surface flex items-center gap-1.5">
                <AlignLeft className="h-3.5 w-3.5 text-on-surface-variant" /> {t('descriptionLabel')}
              </span>
              <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
                className={`rounded-xl border bg-white px-3 py-2.5 text-on-surface outline-none focus:ring-2 resize-none ${description.trim().length > 0 && (description.trim().length < 20 || description.trim().length > 300) ? "border-red-400 focus:border-red-400 focus:ring-red-200" : "border-outline-variant/40 focus:border-primary focus:ring-primary/20"}`}
                placeholder={t('descModalPlaceholder')} />
              <div className="flex justify-between items-center">
                {description.trim().length > 0 && (description.trim().length < 20 || description.trim().length > 300) ? (
                  <span className="text-xs text-red-500">Description must be between 20 and 300 characters.</span>
                ) : <span />}
                <span className={`text-xs ml-auto ${description.length > 300 ? "text-red-500 font-medium" : "text-on-surface-variant"}`}>{description.length}/300</span>
              </div>
            </div>
          </div>

          {/* Dynamic category-specific fields */}
          <ModalCategoryInfoSection
            category={category === "Other" ? (customCategory.trim() || "Other") : category}
            values={categoryInfo}
            onChange={setCatField}
            disabled={saving}
            open={showAdditionalData}
            onToggle={() => setShowAdditionalData((v) => !v)}
          />

          {/* ── Composition ─────────────────────────────────────────────── */}
          {COMPOSITION_CATEGORIES.has(category === "Other" ? (customCategory.trim() || "Other") : category) && (
            <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/40 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
                <Layers className="h-4 w-4 text-primary" /> Composition
                <span className="text-xs font-normal text-on-surface-variant">(Optional)</span>
              </div>
              <p className="text-xs text-on-surface-variant">List active ingredients, nutrients, or chemical components with their concentrations.</p>
              <CompositionEditor entries={composition} onChange={setComposition} disabled={saving} />
            </div>
          )}

          {/* ── Custom Additional Fields ──────────────────────────────────── */}
          <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/40 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
              <Plus className="h-4 w-4 text-primary" /> Additional Information
              <span className="text-xs font-normal text-on-surface-variant">(Optional)</span>
            </div>
            <p className="text-xs text-on-surface-variant">Add extra details that don't fit the standard fields — e.g. Yield Potential, Shelf Life, Certifications.</p>
            <CustomFieldsEditor entries={customFields} onChange={setCustomFields} disabled={saving} />
          </div>

          {/* ── Variants ──────────────────────────────────────────────────── */}
          <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/40 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
              <Layers className="h-4 w-4 text-primary" /> {t('formPackSizes')}
            </div>

            <div className="flex flex-col gap-3">
              {variants.map((v, i) => (
                <VariantRow key={i} v={v} i={i} disabled={saving} isOnly={variants.length <= 1}
                  setV={setV} removeV={removeV} />
              ))}
            </div>

            {variants.length < MAX_VARIANTS && (
              <button type="button"
                onClick={() => setVariants((vs) => [...vs, { unitType: "kg", sizeAmount: "1", customSize: "", customUnit: "", price: "", stock: "" }])}
                className="flex items-center gap-2 rounded-xl border border-dashed border-outline-variant/50 px-3 py-2 text-sm text-on-surface-variant hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors">
                <Plus className="h-4 w-4" /> {t('formAddSize')}
              </button>
            )}
          </div>

          {/* ── Update retailer prices — shown directly below pricing for context ── */}
          {!row.assignedByManufacturer && row.source !== "manufacturer_assigned" && (
            <label className="flex items-start gap-3 cursor-pointer select-none rounded-2xl border border-outline-variant/20 bg-surface-container-low/40 px-4 py-3">
              <input
                type="checkbox"
                checked={updateRetailerPrices}
                onChange={(e) => setUpdateRetailerPrices(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-outline-variant accent-primary flex-shrink-0"
              />
              <div>
                <p className="text-sm font-medium text-on-surface">Update retailer prices also</p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Applies this price change to all assigned retailer product copies. Retailers with custom pricing are unaffected.
                </p>
              </div>
            </label>
          )}

          {/* ── Images ────────────────────────────────────────────────────── */}
          <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/40 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
              <ImageIcon className="h-4 w-4 text-primary" /> {t('formProductImagesEdit')}
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {images.map((slot, i) => (
                <ImageSlot key={i} slot={slot} index={i} disabled={saving}
                  onChange={(p) => setImg(i, p)} onClear={() => clearImg(i)} />
              ))}
            </div>
          </div>

          {/* ── Product Video ─────────────────────────────────────────────── */}
          <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/40 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
              <Youtube className="h-4 w-4 text-red-500" /> Product Video <span className="text-xs font-normal text-on-surface-variant">(Optional)</span>
            </div>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-on-surface">YouTube URL</span>
              <input
                type="url"
                disabled={saving}
                placeholder="https://www.youtube.com/watch?v=… or https://youtu.be/…"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                className={`rounded-xl border px-3 py-2.5 text-on-surface outline-none focus:ring-2 text-sm disabled:opacity-50 ${
                  videoUrl.trim() && !isValidYouTubeUrl(videoUrl)
                    ? "border-red-400 focus:border-red-400 focus:ring-red-200"
                    : "border-outline-variant/40 bg-white focus:border-primary focus:ring-primary/20"
                }`}
              />
              {videoUrl.trim() && !isValidYouTubeUrl(videoUrl) && (
                <span className="text-xs text-red-500">Enter a valid YouTube URL (youtube.com or youtu.be).</span>
              )}
              {videoUrl.trim() && isValidYouTubeUrl(videoUrl) && (
                <span className="text-xs text-primary flex items-center gap-1">
                  ✓ Valid YouTube URL — video will appear on the product page.
                </span>
              )}
            </label>
          </div>

          {/* ── Online Delivery + GST — both shown only when account-level delivery is ON ── */}
          {accountDeliveryEnabled !== false && (
            <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/40 p-4 space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
                <Receipt className="h-4 w-4 text-primary" /> GST &amp; Delivery
              </div>

              {/* Online Delivery toggle */}
              <div className="flex items-center justify-between rounded-xl border border-outline-variant/25 bg-white px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-on-surface">Online Delivery</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">Can buyers order this product for home delivery?</p>
                </div>
                <div className="flex rounded-lg border border-outline-variant/30 overflow-hidden text-xs font-semibold">
                  {(["online_delivery", "offline_store_only"] as const).map((mode) => (
                    <button key={mode} type="button" disabled={saving}
                      onClick={() => setSellMode(mode)}
                      className={`px-3 py-1.5 transition-colors disabled:opacity-50 ${
                        sellMode === mode ? "bg-primary text-white" : "text-on-surface-variant hover:bg-surface-container"
                      }`}
                    >
                      {mode === "online_delivery" ? "Yes" : "No"}
                    </button>
                  ))}
                </div>
              </div>

              {/* GST toggle */}
              <div className="flex items-center justify-between rounded-xl border border-outline-variant/25 bg-white px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-on-surface">GST Applicable?</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">Is GST charged on this product?</p>
                </div>
                <div className="flex rounded-lg border border-outline-variant/30 overflow-hidden text-xs font-semibold">
                  {([true, false] as const).map((v) => (
                    <button key={String(v)} type="button" disabled={saving}
                      onClick={() => { setGstApplicable(v); if (!v) setGstRate(0); }}
                      className={`px-3 py-1.5 transition-colors disabled:opacity-50 ${
                        gstApplicable === v
                          ? "bg-primary text-white"
                          : "text-on-surface-variant hover:bg-surface-container"
                      }`}
                    >
                      {v ? "Yes" : "No"}
                    </button>
                  ))}
                </div>
              </div>

              {gstApplicable && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-on-surface">GST Rate <span className="text-red-500">*</span></span>
                  <div className="flex flex-wrap gap-2">
                    {GST_RATES.map((rate) => (
                      <button key={rate} type="button" disabled={saving}
                        onClick={() => setGstRate(rate)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-50 ${
                          gstRate === rate
                            ? "border-primary bg-primary text-white shadow-sm"
                            : "border-outline-variant/40 bg-white text-on-surface-variant hover:border-primary/50 hover:text-primary"
                        }`}
                      >
                        {rate}%
                      </button>
                    ))}
                  </div>
                  {gstApplicable && gstRate === 0 && (
                    <p className="text-xs text-amber-700 flex items-center gap-1">
                      0% GST selected — confirm this product is exempt or zero-rated.
                    </p>
                  )}
                </div>
              )}

              {gstApplicable && gstRate > 0 && (
                <div className="rounded-xl bg-primary/5 border border-primary/15 px-3 py-2 text-xs text-primary/80">
                  GST at <span className="font-bold">{gstRate}%</span> will be recorded for this product.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-outline-variant/30 px-5 py-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={onClose}
              className="rounded-xl border border-outline-variant/40 px-4 py-2.5 text-sm font-medium text-on-surface-variant hover:bg-surface-container transition-colors">
              {t('cancelBtn')}
            </button>
            <button type="button" disabled={saving}
              onClick={handleSave}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50 transition-all">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? t('savingBtn') : t('saveBtn')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
