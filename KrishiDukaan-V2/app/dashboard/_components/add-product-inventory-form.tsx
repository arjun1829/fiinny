"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2, PackagePlus, Plus, X, Upload, Link as LinkIcon,
  Tag, ImageIcon, AlignLeft, Layers, Search, ChevronDown, CheckCircle2, Receipt, Youtube,
} from "lucide-react";
import {
  PRODUCT_CATEGORIES, isStandardCategory, CATEGORY_FIELDS, CHIPS_FIELDS,
  type ProductCategory, effectiveCategoryInfo,
} from "../_lib/category-info";
import { CompositionEditor, COMPOSITION_CATEGORIES, type CompositionEntry } from "../_components/composition-editor";
import { CustomFieldsEditor, type CustomFieldEntry } from "../_components/custom-fields-editor";
import Link from "next/link";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage, fetchAllMarketplaceProducts, adminCreateProduct, adminUpdateProduct } from "../../firebase";
import { compressImage } from "../../utils/compressImage";
import { createManufacturerProduct, searchProductsByName } from "../_lib/manufacturer-products-firestore";
import { createProductAndInventory, retailerHasProduct } from "../_lib/inventory-firestore";
import type { SeatStats } from "../_types/subscriptions";
import { useI18n } from "../../i18n/I18nContext";
import { HelperIcon } from "../../../components/helpers";
import { StatusToast } from "../../components/shared/status-toast";
import type { MarketplaceProduct } from "../../../types/product";

// ─── Constants ────────────────────────────────────────────────────────────────

// Use the shared canonical category list
const CATEGORIES = PRODUCT_CATEGORIES;

const GST_RATES = [0, 5, 12, 18, 28] as const;
type GstRate = typeof GST_RATES[number];

const UNIT_TYPES = [
  { value: "g",       label: "gm",     display: "gm" },
  { value: "kg",      label: "KG",     display: "KG" },
  { value: "ml",      label: "ml",     display: "ml" },
  { value: "L",       label: "L",      display: "L" },
  { value: "pkt",     label: "Packet", display: "Packet" },
  { value: "pcs",     label: "Piece",  display: "Piece" },
  { value: "bottle",  label: "Bottle", display: "Bottle" },
  { value: "can",     label: "Can",    display: "Can" },
  { value: "custom",  label: "Custom", display: "" },
] as const;

const SIZE_OPTIONS_BY_UNIT: Record<string, string[]> = {
  g:  ["10", "25", "50", "100", "250", "500"],
  kg: ["1", "2", "5", "10", "25", "50"],
  ml: ["50", "100", "250", "500"],
  L:  ["1", "2", "5", "10", "20"],
};

const UNITS_WITH_SIZE = new Set(["g", "kg", "ml", "L"]);

const MAX_VARIANTS = 8;
const MAX_IMAGES   = 5;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractYouTubeId(url: string): string | null {
  const t = url.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(t)) return t;
  const m = t.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function isValidYouTubeUrl(url: string): boolean {
  if (!url.trim()) return true;
  return extractYouTubeId(url) !== null;
}

function buildUnit(v: Variant): string {
  if (v.unitType === "custom") return v.customUnit.trim();
  if (!UNITS_WITH_SIZE.has(v.unitType)) return v.unitType; // pkt, pcs, bottle, can
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

// ─── Types ────────────────────────────────────────────────────────────────────

type Variant = {
  unitType: string;
  sizeAmount: string;
  customSize: string;
  customUnit: string;
  price: string;
  stock: string;
};

type ImageSlot = { mode: "url" | "upload"; url: string; uploading: boolean; error: string };

type SearchResult = {
  id: string; name: string; category: string; unit: string; price: number;
  description: string; image: string; images: string[]; variants: { unit: string; price: number }[];
  categoryInfo?: Record<string, string | string[]>;
  nitrogen?: string; phosphorus?: string; potassium?: string; applicationDesc?: string; dosage?: string; bestForCrops?: string[];
};

type AdminProductPayload = {
  name: string; fullName?: string; category: string;
  price: number; unit: string; variants: { unit: string; price: number; stock?: number }[];
  description: string; image?: string; images: string[];
  isActive: true; source: "admin";
  categoryInfo?: Record<string, string | string[]>;
  gstApplicable: boolean; gstRate: number;
  sellMode: "online_delivery" | "offline_store_only"; isOnline: boolean;
  editProductId: string | null;
  videoUrl?: string;
  composition?: { name: string; value: string }[];
  customFields?: { title: string; value: string }[];
};

type AddProductInventoryFormProps = {
  userId: string | null;
  role: "manufacturer" | "retailer";
  disabled?: boolean;
  onCreated: () => Promise<void>;
  seatStats: SeatStats;
  storeName?: string;
  /** Admin-only: enables admin mode (no seat check, admin save logic) */
  adminMode?: boolean;
  /** Admin-only: pre-fill the form for editing an existing product */
  initialProduct?: any;
  /** Admin-only: custom save handler; receives validated payload. If omitted, falls back to adminCreateProduct/adminUpdateProduct. */
  onAdminSave?: (payload: AdminProductPayload) => Promise<void>;
  /** When true, shows both Online Delivery and GST toggles for non-admin sellers. */
  accountDeliveryEnabled?: boolean;
};

const newVariant = (): Variant => ({
  unitType: "kg", sizeAmount: "1", customSize: "", customUnit: "", price: "", stock: "",
});
const newSlot = (): ImageSlot => ({ mode: "url", url: "", uploading: false, error: "" });

function useAllProducts(userId: string | null) {
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  useEffect(() => {
    if (!userId) return;
    fetchAllMarketplaceProducts().then(setProducts).catch(() => {});
  }, [userId]);
  return products;
}

// ─── Dynamic Category Info Section ────────────────────────────────────────────

function CategoryInfoSection({
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

// ─── Image Card ───────────────────────────────────────────────────────────────

function ImageCard({ slot, index, disabled, onChange, onClear }: {
  slot: ImageSlot; index: number; disabled: boolean;
  onChange: (p: Partial<ImageSlot>) => void; onClear: () => void;
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
    <div className={`flex-shrink-0 w-40 flex flex-col rounded-2xl border-2 overflow-hidden transition-colors ${
      slot.url ? "border-primary/20 bg-surface-container-low" : "border-dashed border-outline-variant/40 bg-surface-container-low/50 hover:border-primary/40"
    }`}>
      {/* Preview area */}
      {slot.url ? (
        <div className="relative h-32 bg-surface-container">
          <img src={slot.url} alt="" className="h-full w-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          <button type="button" onClick={onClear}
            className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white hover:bg-red-500 transition-colors">
            <X className="h-3 w-3" />
          </button>
          {index === 0 && (
            <span className="absolute bottom-1.5 left-1.5 rounded-full bg-primary/90 px-2 py-0.5 text-[10px] font-semibold text-white">{t('formMainBadge')}</span>
          )}
        </div>
      ) : (
        <div className="flex h-32 flex-col items-center justify-center gap-1.5 text-on-surface-variant/40">
          <ImageIcon className="h-7 w-7" />
          <span className="text-[10px] font-medium">{index === 0 ? t('formMainImage') : `${t('formImageLabel')} ${index + 1}`}</span>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-col gap-2 p-2.5 bg-white/70">
        {/* Mode toggle */}
        <div className="flex rounded-lg border border-outline-variant/30 text-[11px] overflow-hidden">
          {(["url", "upload"] as const).map((m) => (
            <button key={m} type="button" disabled={disabled}
              onClick={() => onChange({ mode: m, error: "" })}
              className={`flex flex-1 items-center justify-center gap-1 py-1.5 font-semibold whitespace-nowrap transition-colors ${
                slot.mode === m ? "bg-primary text-white" : "text-on-surface-variant hover:bg-surface-container"
              } disabled:opacity-50`}
            >
              {m === "url" ? <LinkIcon className="h-3 w-3 flex-shrink-0" /> : <Upload className="h-3 w-3 flex-shrink-0" />}
              <span>{m === "url" ? t('formLinkLabel') : t('formUploadLabel')}</span>
            </button>
          ))}
        </div>

        {/* Input */}
        {slot.mode === "url" ? (
          <input type="url" disabled={disabled} placeholder="https://…"
            className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-2.5 py-1.5 text-[11px] outline-none ring-primary/30 focus:ring-2 disabled:opacity-50"
            value={slot.url} onChange={(e) => onChange({ url: e.target.value, error: "" })} />
        ) : (
          <>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            <button type="button" disabled={disabled || slot.uploading}
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-outline-variant/40 py-2 text-[11px] font-medium text-on-surface-variant hover:border-primary hover:text-primary hover:bg-primary/5 disabled:opacity-50 transition-colors">
              {slot.uploading
                ? <><Loader2 className="h-3 w-3 animate-spin flex-shrink-0" /><span>{t('formUploadingLabel')}</span></>
                : <><Upload className="h-3 w-3 flex-shrink-0" /><span>{t('formChooseFile')}</span></>}
            </button>
          </>
        )}
        {slot.error && <p className="text-[10px] text-red-500 leading-tight">{slot.error}</p>}
      </div>
    </div>
  );
}

// ─── Variant Row ──────────────────────────────────────────────────────────────

function VariantRow({ v, i, isDisabled, isOnly, setV, removeV, adminMode }: {
  v: Variant; i: number; isDisabled: boolean; isOnly: boolean; adminMode?: boolean;
  setV: (i: number, p: Partial<Variant>) => void;
  removeV: (i: number) => void;
}) {
  const hasSizes = UNITS_WITH_SIZE.has(v.unitType);
  const sizeOptions = hasSizes ? SIZE_OPTIONS_BY_UNIT[v.unitType] ?? [] : [];
  const preview = buildPreviewLabel(v);

  return (
    <div className="rounded-xl border border-outline-variant/25 bg-white p-3 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-on-surface-variant">Package {i + 1}</span>
        <button type="button" disabled={isDisabled || isOnly} onClick={() => removeV(i)}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-on-surface-variant hover:bg-red-50 hover:text-red-500 disabled:opacity-30 transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Step 1: Unit */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide">Step 1 — Unit</span>
        <div className="flex flex-wrap gap-1.5">
          {UNIT_TYPES.map(ut => (
            <button key={ut.value} type="button" disabled={isDisabled}
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

      {/* Step 2: Package Size (only for GM/KG/ML/L) */}
      {hasSizes && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide">Step 2 — Package Size</span>
          <div className="flex flex-wrap gap-1.5">
            {sizeOptions.map(size => (
              <button key={size} type="button" disabled={isDisabled}
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
            <button type="button" disabled={isDisabled}
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
            <input type="text" inputMode="numeric" pattern="[0-9]*" disabled={isDisabled}
              placeholder="e.g. 750"
              className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50 w-32"
              value={v.customSize}
              onChange={(e) => { const digits = e.target.value.replace(/\D/g, ""); setV(i, { customSize: digits === "" ? "" : String(parseInt(digits, 10)) }); }}
              onBlur={(e) => { if (e.target.value === "" || Number(e.target.value) <= 0) setV(i, { customSize: "" }); }} />
          )}
        </div>
      )}

      {/* Custom unit free text */}
      {v.unitType === "custom" && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide">Your Unit Label</span>
          <input type="text" disabled={isDisabled}
            placeholder="e.g. 30 tablets, 1 acre dose, 4L drum…"
            className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
            value={v.customUnit} onChange={(e) => setV(i, { customUnit: e.target.value })} />
        </div>
      )}

      {/* Live preview */}
      {preview && (
        <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/15 px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-primary/60">Package</span>
          <span className="text-sm font-bold text-primary">{preview}</span>
        </div>
      )}

      {/* Price (+ Stock when not in admin/catalog mode) */}
      <div className={`grid gap-3 ${adminMode ? "grid-cols-1" : "grid-cols-2"}`}>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-on-surface-variant">Price (₹) *</span>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-on-surface-variant">₹</span>
            <input required type="text" inputMode="decimal" disabled={isDisabled}
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
        {!adminMode && (
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-on-surface-variant">Stock Qty *</span>
            <input required type="text" inputMode="numeric" pattern="[0-9]*" disabled={isDisabled}
              className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2.5 text-sm text-center outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
              placeholder="0" value={v.stock}
              onChange={(e) => { const digits = e.target.value.replace(/\D/g, ""); setV(i, { stock: digits === "" ? "" : String(parseInt(digits, 10)) }); }}
              onBlur={(e) => { const n = parseInt(e.target.value, 10); setV(i, { stock: isNaN(n) ? "0" : String(Math.max(0, n)) }); }} />
          </label>
        )}
      </div>
    </div>
  );
}

// ─── Main Form ────────────────────────────────────────────────────────────────

export function AddProductInventoryForm({
  userId,
  role,
  disabled,
  onCreated,
  seatStats,
  storeName,
  adminMode,
  initialProduct,
  onAdminSave,
  accountDeliveryEnabled,
}: AddProductInventoryFormProps) {
  const { t } = useI18n();

  // Basic fields
  const [name,        setName]        = useState("");
  const [category,    setCategory]    = useState<string>(CATEGORIES[0]);
  const [customCategory, setCustomCategory] = useState("");
  const [description, setDescription] = useState("");
  const [showProductDetails, setShowProductDetails] = useState(true);

  // Category-specific info — keyed by field key, values are string (chips comma-separated in UI)
  const [categoryInfo, setCategoryInfo] = useState<Record<string, string>>({});
  const [showAdditionalData, setShowAdditionalData] = useState(false);

  const setCatField = (key: string, val: string) =>
    setCategoryInfo((prev) => ({ ...prev, [key]: val }));

  // Variants
  const [variants,    setVariants]    = useState<Variant[]>([newVariant()]);

  // Images
  const [images,      setImages]      = useState<ImageSlot[]>([newSlot()]);

  // Video
  const [videoUrl,    setVideoUrl]    = useState("");

  // Composition
  const [composition, setComposition] = useState<CompositionEntry[]>([]);

  // Custom additional fields
  const [customFields, setCustomFields] = useState<CustomFieldEntry[]>([]);

  // Search state
  const [suggestions,   setSuggestions]   = useState<SearchResult[]>([]);
  const [searching,     setSearching]     = useState(false);
  const [showDropdown,  setShowDropdown]  = useState(false);
  const [autofilled,    setAutofilled]    = useState(false);
  const [existingProductId, setExistingProductId] = useState<string | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // GST state
  const [gstApplicable, setGstApplicable] = useState(false);
  const [gstRate,       setGstRate]       = useState<GstRate>(0);

  // New products default to offline; seller opts in when account delivery is enabled
  const [sellMode, setSellMode] = useState<"online_delivery" | "offline_store_only">("offline_store_only");

  // Submit state
  const [submitting,    setSubmitting]    = useState(false);
  const [message,       setMessage]       = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [alreadyListed, setAlreadyListed] = useState(false);

  // Auto-hide inline success after 5s
  useEffect(() => {
    if (message?.type !== "ok") return;
    const id = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(id);
  }, [message]);

  // Pre-fill form when editing an admin product
  useEffect(() => {
    if (!adminMode || !initialProduct) return;
    const p = initialProduct;
    setName(p.name || "");
    const rawCat = String(p.category || "").trim();
    const canonical = CATEGORIES.find((c) => c.toLowerCase() === rawCat.toLowerCase());
    const known = Boolean(canonical) && canonical !== "Other";
    setCategory(known ? canonical! : "Other");
    setCustomCategory(known ? "" : rawCat);
    setDescription(p.description || "");
    const src: { unit: string; price: number }[] = p.variants?.length
      ? p.variants
      : [{ unit: p.unit || "", price: p.price || 0 }];
    setVariants(src.map((v) => ({ ...parseUnitToVariant(v.unit), price: String(v.price), stock: "" })));
    const urls: string[] = p.images?.length ? p.images : (p.image ? [p.image] : []);
    setImages(urls.length ? urls.map((u: string) => ({ mode: "url" as const, url: u, uploading: false, error: "" })) : [newSlot()]);
    setGstApplicable(!!p.gstApplicable);
    setGstRate(p.gstRate ?? 0);
    setSellMode(p.sellMode === "offline_store_only" ? "offline_store_only" : "online_delivery");
    setVideoUrl((p as any).videoUrl ?? "");
    setComposition(Array.isArray((p as any).composition) ? (p as any).composition : []);
    setCustomFields(Array.isArray((p as any).customFields) ? (p as any).customFields : []);
    const ci = effectiveCategoryInfo(p as Record<string, unknown>);
    if (ci) {
      const flat: Record<string, string> = {};
      Object.entries(ci).forEach(([k, v]) => { flat[k] = Array.isArray(v) ? v.join(", ") : String(v); });
      setCategoryInfo(flat);
      setShowAdditionalData(true);
    } else {
      setCategoryInfo({});
    }
    setShowProductDetails(true);
    setAutofilled(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProduct?.id, adminMode]);

  const isManufacturer = role === "manufacturer";
  const hasSeats       = seatStats.available > 0;
  const noSubscription = seatStats.totalPurchased === 0;
  const isDisabled     = disabled || submitting || !userId || (adminMode ? false : (!hasSeats || (role === "retailer" && alreadyListed)));

  // ── Search ───────────────────────────────────────────────────────────────────
  const handleNameChange = useCallback((val: string) => {
    setName(val);
    setAutofilled(false);
    setExistingProductId(null);
    setAlreadyListed(false);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (val.trim().length < 2) { setSuggestions([]); setShowDropdown(false); return; }
    setSearching(true);
    searchTimeout.current = setTimeout(async () => {
      try {
        const results = await searchProductsByName(val);
        setSuggestions(results);
        setShowDropdown(results.length > 0);
      } catch { setSuggestions([]); }
      finally { setSearching(false); }
    }, 350);
  }, []);

  const applyAutofill = (product: SearchResult) => {
    setName(product.name);
    const rawCat = (product.category || "").trim();
    // Case-insensitive match against the canonical category list.
    // Firestore may store the value in any case (e.g. "pesticides" vs "Pesticides").
    const canonicalCat = CATEGORIES.find(
      (c) => c.toLowerCase() === rawCat.toLowerCase(),
    );
    const isKnown = Boolean(canonicalCat) && canonicalCat !== "Other";
    setCategory(isKnown ? canonicalCat! : "Other");
    setCustomCategory(isKnown ? "" : rawCat);
    setDescription(product.description || "");
    setExistingProductId(product.id);

    // Build categoryInfo from product's stored data (new or legacy)
    const rawData = product as unknown as Record<string, unknown>;
    const ci = effectiveCategoryInfo(rawData);
    if (ci) {
      const flat: Record<string, string> = {};
      Object.entries(ci).forEach(([k, v]) => {
        flat[k] = Array.isArray(v) ? v.join(", ") : String(v);
      });
      setCategoryInfo(flat);
      setShowAdditionalData(true);
    } else {
      setCategoryInfo({});
      setShowAdditionalData(false);
    }

    const src = product.variants.length
      ? product.variants
      : [{ unit: product.unit, price: product.price }];
    setVariants(src.map((v) => ({
      ...parseUnitToVariant(v.unit),
      price: String(v.price),
      stock: "",
    })));

    const urls = product.images.length ? product.images : (product.image ? [product.image] : []);
    const slotCount = Math.max(1, Math.min(urls.length, MAX_IMAGES));
    setImages(Array.from({ length: slotCount }, (_, i) => ({
      mode: "url" as const,
      url: urls[i] ?? "",
      uploading: false,
      error: "",
    })));

    setShowDropdown(false);
    setSuggestions([]);
    setAutofilled(true);
    setAlreadyListed(false);

    if (role === "retailer" && userId) {
      const firstParsed = parseUnitToVariant(src[0]?.unit ?? product.unit);
      const firstUnit = buildUnit({ ...firstParsed, price: "", stock: "" });
      retailerHasProduct(userId, {
        originalProductId: product.id,
        name: product.name,
        unit: firstUnit,
      }).then(setAlreadyListed).catch(() => {});
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (nameRef.current && !nameRef.current.closest(".name-search-wrap")?.contains(e.target as Node))
        setShowDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Variants ─────────────────────────────────────────────────────────────────
  const setV    = (i: number, p: Partial<Variant>) =>
    setVariants((vs) => vs.map((v, idx) => idx === i ? { ...v, ...p } : v));
  const removeV = (i: number) => setVariants((vs) => vs.filter((_, idx) => idx !== i));

  // ── Images ───────────────────────────────────────────────────────────────────
  const setImg   = (i: number, p: Partial<ImageSlot>) =>
    setImages((imgs) => imgs.map((s, idx) => idx === i ? { ...s, ...p } : s));
  const clearImg = (i: number) =>
    setImages((imgs) => imgs.map((s, idx) => idx === i ? newSlot() : s));

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    if (!adminMode && !hasSeats) { setMessage({ type: "err", text: "No seats available. Buy more seats." }); return; }
    if (!name.trim() || !category) { setMessage({ type: "err", text: "Product name and category are required." }); return; }
    if (description.trim().length > 0 && (description.trim().length < 20 || description.trim().length > 300)) {
      setMessage({ type: "err", text: "Description must be between 20 and 300 characters." });
      return;
    }

    if (!adminMode && variants.some((v) => v.stock.trim() === "")) {
      setMessage({ type: "err", text: "Stock quantity is required for each package size." });
      return;
    }
    const parsed = variants.map((v) => ({
      unit: buildUnit(v),
      price: Number(v.price),
      stock: Number(v.stock),
    }));
    if (parsed.some((v) => !v.unit)) {
      setMessage({ type: "err", text: "Please complete the unit selection for each package." });
      return;
    }
    if (parsed.some((v) => !Number.isFinite(v.price) || v.price <= 0)) {
      setMessage({ type: "err", text: "Each package needs a price greater than 0." });
      return;
    }
    if (images.some((s) => s.uploading)) {
      setMessage({ type: "err", text: "Wait for image uploads to finish." });
      return;
    }
    if (videoUrl.trim() && !isValidYouTubeUrl(videoUrl)) {
      setMessage({ type: "err", text: "Enter a valid YouTube URL (youtube.com or youtu.be)." });
      return;
    }

    const imageUrls = images.map((s) => s.url.trim()).filter(Boolean);

    // Build the saved category: use custom value when "Other" is selected
    const savedCategory = category === "Other"
      ? (customCategory.trim() || "Other")
      : category;

    // Build categoryInfo: parse comma-separated chips to string[], drop empty values
    const savedCategoryInfo: Record<string, string | string[]> = {};
    const activeCat = isStandardCategory(savedCategory) ? savedCategory : "Other";
    const fields = CATEGORY_FIELDS[activeCat as ProductCategory] ?? CATEGORY_FIELDS["Other"];
    fields.forEach(({ key }) => {
      const raw = (categoryInfo[key] ?? "").trim();
      if (!raw) return;
      savedCategoryInfo[key] = CHIPS_FIELDS.has(key)
        ? raw.split(",").map((s) => s.trim()).filter(Boolean)
        : raw;
    });

    // Both delivery and GST are gated on the same account-level flag.
    // When the flag is off (or not yet loaded), coerce both to false/offline.
    const deliveryVisible = adminMode || accountDeliveryEnabled;
    const effectiveSellMode: "online_delivery" | "offline_store_only" = deliveryVisible ? sellMode : "offline_store_only";
    const effectiveGstApplicable = deliveryVisible ? gstApplicable : false;

    setSubmitting(true);
    setMessage(null);
    try {
      if (adminMode) {
        const adminPayload: AdminProductPayload = {
          name: name.trim(), fullName: name.trim(), category: savedCategory,
          price: parsed[0].price, unit: parsed[0].unit,
          variants: parsed.map(({ unit, price }) => ({ unit, price })),
          description, image: imageUrls[0] ?? undefined, images: imageUrls,
          isActive: true, source: "admin",
          categoryInfo: Object.keys(savedCategoryInfo).length ? savedCategoryInfo : undefined,
          gstApplicable: effectiveGstApplicable, gstRate: effectiveGstApplicable ? gstRate : 0,
          sellMode: effectiveSellMode, isOnline: effectiveSellMode === "online_delivery",
          editProductId: initialProduct?.id ?? null,
          videoUrl: videoUrl.trim() || undefined,
          composition: composition.filter(e => e.name.trim()) as any,
          customFields: customFields.filter(e => e.title.trim()),
        };
        if (onAdminSave) {
          await onAdminSave(adminPayload);
        } else if (initialProduct?.id) {
          await adminUpdateProduct(initialProduct.id, adminPayload as any);
        } else {
          await adminCreateProduct(adminPayload as any);
        }
        setMessage({ type: "ok", text: initialProduct?.id ? "Product updated." : "Product added to catalog." });
        if (!initialProduct?.id) {
          setName(""); setCategory(CATEGORIES[0]); setCustomCategory(""); setDescription("");
          setAutofilled(false); setExistingProductId(null); setAlreadyListed(false);
          setCategoryInfo({}); setShowAdditionalData(false);
          setGstApplicable(false); setGstRate(0); setSellMode("offline_store_only");
          setVariants([newVariant()]); setImages([newSlot()]); setCustomFields([]);
        }
        await onCreated();
        return;
      }
      if (isManufacturer) {
        await createManufacturerProduct(userId, {
          name, category: savedCategory,
          unit: parsed[0].unit,
          price: parsed[0].price,
          stockQuantity: parsed[0].stock,
          variants: parsed.map(({ unit, price, stock }) => ({ unit, price, stock })),
          description,
          image: imageUrls[0] ?? undefined,
          images: imageUrls,
          videoUrl: videoUrl.trim() || undefined,
          composition: composition.filter(e => e.name.trim()),
          customFields: customFields.filter(e => e.title.trim()),
          categoryInfo: Object.keys(savedCategoryInfo).length ? savedCategoryInfo : undefined,
          gstApplicable: effectiveGstApplicable,
          gstRate: effectiveGstApplicable ? gstRate : 0,
          sellMode: effectiveSellMode,
        });
      } else {
        await createProductAndInventory(userId, {
          name, category: savedCategory,
          unit: parsed[0].unit,
          stockQuantity: parsed[0].stock || 1,
          sellingPrice: parsed[0].price,
          reorderThreshold: 0,
          description,
          imageUrl: imageUrls[0] ?? undefined,
          storeName: storeName || "My Store",
          sellMode: effectiveSellMode,
          existingProductId: existingProductId ?? undefined,
          categoryInfo: Object.keys(savedCategoryInfo).length ? savedCategoryInfo : undefined,
          customFields: customFields.filter(e => e.title.trim()),
          gstApplicable: effectiveGstApplicable,
          gstRate: effectiveGstApplicable ? gstRate : 0,
        });
      }
      setMessage({ type: "ok", text: isManufacturer ? t('formProductAdded') : t('formProductAddedInv') });
      setName(""); setCategory(CATEGORIES[0]); setCustomCategory(""); setDescription(""); setAutofilled(false);
      setExistingProductId(null); setAlreadyListed(false);
      setCategoryInfo({}); setShowAdditionalData(false);
      setGstApplicable(false); setGstRate(0);
      setVariants([newVariant()]);
      setImages([newSlot()]);
      setVideoUrl("");
      setComposition([]);
      await onCreated();
    } catch (err) {
      setMessage({ type: "err", text: err instanceof Error ? err.message : "Failed to create product." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`rounded-2xl border p-5 shadow-ambient ${
      !hasSeats ? "border-red-200 bg-red-50/30" : "border-outline-variant/30 bg-surface-container-lowest"
    }`}>
      {/* Header */}
      {!adminMode && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-base font-semibold text-on-surface">
              {isManufacturer ? t('addProductToCatalogue') : t('addProductToInventory')}
            </h2>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              hasSeats ? "bg-primary/10 text-primary" : "bg-red-100 text-red-600"
            }`}>
              {seatStats.available} {seatStats.available !== 1 ? t('seatsAvailableLabel') : t('seatAvailableLabel')}
            </span>
          </div>
          {noSubscription && (
            <div className="mt-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {t('noActiveSub')} <Link href="/dashboard/upgrade" className="font-semibold underline">{t('purchasePlanLink')}</Link> {t('toStartListing')}
            </div>
          )}
          {!noSubscription && !hasSeats && (
            <div className="mt-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {t('allSeatsUsed')}{" "}
              <Link href="/dashboard/upgrade" className="font-semibold underline">{t('buyMoreSeatsLink')}</Link> {t('toContinue')}
            </div>
          )}
        </>
      )}

      {/* Error toast only — success shown inline */}
      {message?.type === "err" && (
        <StatusToast
          message={message.text}
          type="error"
          onDismiss={() => setMessage(null)}
          autoClose={0}
        />
      )}

      <form className="mt-6 flex flex-col gap-6" onSubmit={handleSubmit}>

        {/* ── Section 1: Product details (collapsible) ──────────────────────── */}
        <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/40 p-4 flex flex-col gap-4">
          <button
            type="button"
            onClick={() => setShowProductDetails(!showProductDetails)}
            className="flex items-center justify-between text-sm font-semibold text-on-surface w-full"
          >
            <span className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-primary" /> {t('formProductDetails')}
              <HelperIcon size="xs" variant="ghost" side="right" textKey="dashFormProductDetails" ariaLabel={`${t('formProductDetails')} help`} />
            </span>
            <div className="flex items-center gap-2">
              {!showProductDetails && name && (
                <span className="text-xs font-normal text-on-surface-variant truncate max-w-[180px]">{name}</span>
              )}
              <ChevronDown className={`h-4 w-4 text-on-surface-variant transition-transform ${showProductDetails ? "rotate-180" : ""}`} />
            </div>
          </button>

          {showProductDetails && (
            <div className="flex flex-col gap-4 border-t border-outline-variant/20 pt-4">
              {/* Product name — with search */}
              <div className="flex flex-col gap-1.5 text-sm name-search-wrap relative">
                <span className="font-medium text-on-surface">
                  {t('formProductNameLabel')} <span className="text-red-500">*</span>
                  <span className="ml-2 text-xs font-normal text-on-surface-variant">{t('formSearchAutofill')}</span>
                </span>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant/60" />
                  {searching && <Loader2 className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary/60" />}
                  <input
                    ref={nameRef}
                    required disabled={isDisabled}
                    className="w-full rounded-xl border border-outline-variant/40 bg-white pl-9 pr-10 py-2.5 text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
                    placeholder={t('formProductNamePlaceholder')}
                  />
                </div>

                {autofilled && (
                  <div className="flex items-center gap-2 rounded-xl bg-primary/5 border border-primary/20 px-3 py-2">
                    <span className="text-xs text-primary font-medium">{t('formAutofilledMsg')}</span>
                    <button type="button" onClick={() => { setAutofilled(false); setAlreadyListed(false); }} className="ml-auto text-primary/60 hover:text-primary">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                {role === "retailer" && alreadyListed && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                    This product is already in your inventory. Edit the existing listing instead of adding it again.
                  </div>
                )}

                {showDropdown && suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-30 mt-1 rounded-xl border border-outline-variant/40 bg-white shadow-lg overflow-hidden">
                    <p className="px-3 pt-2 pb-1 text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide">{t('formExistingProducts')}</p>
                    {suggestions.map((s) => (
                      <button key={s.id} type="button"
                        onMouseDown={(e) => { e.preventDefault(); applyAutofill(s); }}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-primary/5 transition-colors border-t border-outline-variant/10"
                      >
                        {s.image ? (
                          <img src={s.image} alt="" className="h-9 w-9 rounded-lg object-cover flex-shrink-0" />
                        ) : (
                          <div className="h-9 w-9 rounded-lg bg-surface-container flex-shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-on-surface truncate">{s.name}</p>
                          <p className="text-xs text-on-surface-variant">{s.category} · {s.unit} · ₹{s.price}</p>
                        </div>
                        <ChevronDown className="h-4 w-4 text-primary flex-shrink-0 rotate-[-90deg]" />
                      </button>
                    ))}
                    <div className="px-3 py-2 border-t border-outline-variant/10 bg-surface-container-low">
                      <p className="text-[11px] text-on-surface-variant">{t('formNotFound')}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Category */}
              <div className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-on-surface">{t('formCategoryLabel')} <span className="text-red-500">*</span></span>
                <select required disabled={isDisabled}
                  className="rounded-xl border border-outline-variant/40 bg-white px-3 py-2.5 text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50 appearance-none"
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    setCategoryInfo({});  // clear fields when category changes
                  }}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                {category === "Other" && (
                  <input type="text" disabled={isDisabled}
                    placeholder="Enter custom category name"
                    className="rounded-xl border border-outline-variant/40 bg-white px-3 py-2.5 text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50 text-sm"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)} />
                )}
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-on-surface flex items-center gap-1.5">
                  <AlignLeft className="h-3.5 w-3.5 text-on-surface-variant" /> {t('formDescriptionLabel')}
                </span>
                <textarea rows={3} disabled={isDisabled}
                  className={`rounded-xl border bg-white px-3 py-2.5 text-on-surface outline-none focus:ring-2 disabled:opacity-50 resize-none ${description.trim().length > 0 && (description.trim().length < 20 || description.trim().length > 300) ? "border-red-400 focus:border-red-400 focus:ring-red-200" : "border-outline-variant/40 focus:border-primary focus:ring-primary/20"}`}
                  value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('formDescPlaceholder')} />
                <div className="flex justify-between items-center">
                  {description.trim().length > 0 && (description.trim().length < 20 || description.trim().length > 300) ? (
                    <span className="text-xs text-red-500">Description must be between 20 and 300 characters.</span>
                  ) : <span />}
                  <span className={`text-xs ml-auto ${description.length > 300 ? "text-red-500 font-medium" : "text-on-surface-variant"}`}>{description.length}/300</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Dynamic category-specific fields */}
        <CategoryInfoSection
          category={category === "Other" ? (customCategory.trim() || "Other") : category}
          values={categoryInfo}
          onChange={setCatField}
          disabled={isDisabled}
          open={showAdditionalData}
          onToggle={() => setShowAdditionalData((v) => !v)}
        />

        {/* ── Composition (Fertilizers / Pesticides / Herbicides / Bio-Stimulants) */}
        {COMPOSITION_CATEGORIES.has(category === "Other" ? (customCategory.trim() || "Other") : category) && (
          <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/40 p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
              <Layers className="h-4 w-4 text-primary" /> Composition
              <span className="text-xs font-normal text-on-surface-variant">(Optional)</span>
            </div>
            <p className="text-xs text-on-surface-variant -mt-1">List all active ingredients, nutrients, or chemical components with their concentrations.</p>
            <CompositionEditor entries={composition} onChange={setComposition} disabled={isDisabled} />
          </div>
        )}

        {/* ── Custom Additional Fields ──────────────────────────────────────── */}
        <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/40 p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
            <Plus className="h-4 w-4 text-primary" /> Additional Information
            <span className="text-xs font-normal text-on-surface-variant">(Optional)</span>
          </div>
          <p className="text-xs text-on-surface-variant -mt-1">Add any extra product details that don't fit the standard fields above — e.g. Yield Potential, Shelf Life, Certifications.</p>
          <CustomFieldsEditor entries={customFields} onChange={setCustomFields} disabled={isDisabled} />
        </div>

        {/* ── Section 2: Pack sizes & prices ────────────────────────────────── */}
        <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/40 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
              <Layers className="h-4 w-4 text-primary" /> {t('formPackSizes')}
              <HelperIcon size="xs" variant="ghost" side="right" textKey="dashFormPackSizes" ariaLabel={`${t('formPackSizes')} help`} />
            </div>
            <span className="text-xs text-on-surface-variant">{variants.length}/{MAX_VARIANTS} {t('formSizesCount')}</span>
          </div>

          <div className="flex flex-col gap-3">
            {variants.map((v, i) => (
              <VariantRow key={i} v={v} i={i} isDisabled={isDisabled} isOnly={variants.length <= 1} adminMode={adminMode}
                setV={setV} removeV={removeV} />
            ))}
          </div>

          {variants.length < MAX_VARIANTS && (
            <button type="button" disabled={isDisabled}
              onClick={() => setVariants((vs) => [...vs, newVariant()])}
              className="flex w-fit items-center gap-2 rounded-xl border border-dashed border-outline-variant/50 bg-white px-4 py-2 text-sm text-on-surface-variant hover:border-primary hover:text-primary hover:bg-primary/5 disabled:opacity-50 transition-colors">
              <Plus className="h-4 w-4" /> {t('formAddAnotherSize')}
            </button>
          )}
        </div>

        {/* ── Section 3: Images ─────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/40 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
              <ImageIcon className="h-4 w-4 text-primary" /> {t('formProductImages')}
              <HelperIcon size="xs" variant="ghost" side="right" textKey="dashFormProductImages" ariaLabel={`${t('formProductImages')} help`} />
            </div>
            <span className="text-xs text-on-surface-variant">{images.length}/{MAX_IMAGES} images</span>
          </div>
          {/* Horizontal scroll gallery */}
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: "thin" }}>
            {images.map((slot, i) => (
              <ImageCard key={i} slot={slot} index={i} disabled={isDisabled}
                onChange={(p) => setImg(i, p)} onClear={() => clearImg(i)} />
            ))}
            {images.length < MAX_IMAGES && (
              <button type="button" disabled={isDisabled}
                onClick={() => setImages((imgs) => [...imgs, newSlot()])}
                className="flex-shrink-0 w-40 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-outline-variant/40 bg-white/50 text-on-surface-variant hover:border-primary hover:text-primary hover:bg-primary/5 disabled:opacity-50 transition-colors min-h-[11rem]">
                <Plus className="h-5 w-5" />
                <span className="text-[11px] font-medium text-center px-2">Add image</span>
              </button>
            )}
          </div>
          <p className="text-xs text-on-surface-variant">{t('formImageHint')}</p>
        </div>

        {/* ── Section 4: Product Video ──────────────────────────────────────── */}
        <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/40 p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
            <Youtube className="h-4 w-4 text-red-500" /> Product Video
            <span className="text-xs font-normal text-on-surface-variant">(Optional)</span>
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-on-surface">YouTube URL</span>
            <input
              type="url"
              disabled={isDisabled}
              placeholder="https://www.youtube.com/watch?v=… or https://youtu.be/…"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              className={`rounded-xl border px-3 py-2.5 text-on-surface outline-none focus:ring-2 text-sm disabled:opacity-50 ${
                videoUrl.trim() && !isValidYouTubeUrl(videoUrl)
                  ? "border-red-400 focus:border-red-400 focus:ring-red-200"
                  : "border-outline-variant/40 bg-surface-container-lowest focus:border-primary focus:ring-primary/20"
              }`}
            />
            {videoUrl.trim() && !isValidYouTubeUrl(videoUrl) && (
              <span className="text-xs text-red-500">Enter a valid YouTube URL (youtube.com or youtu.be).</span>
            )}
            {videoUrl.trim() && isValidYouTubeUrl(videoUrl) && (
              <span className="text-xs text-primary">✓ Valid YouTube URL — video will appear on the product page.</span>
            )}
          </label>
        </div>

        {/* ── Section 5: GST & Delivery ─────────────────────────────────────── */}
        <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/40 p-4 flex flex-col gap-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
            <Receipt className="h-4 w-4 text-primary" /> GST &amp; Delivery
          </div>

          {/* Online Delivery toggle — visible for admin always; for sellers when account-level delivery is ON */}
          {(adminMode || accountDeliveryEnabled) && (
            <div className="flex items-center justify-between rounded-xl border border-outline-variant/25 bg-white px-4 py-3">
              <div>
                <p className="text-sm font-medium text-on-surface">Online Delivery</p>
                <p className="text-xs text-on-surface-variant mt-0.5">Can buyers order this product for home delivery?</p>
              </div>
              <div className="flex rounded-lg border border-outline-variant/30 overflow-hidden text-xs font-semibold">
                {(["online_delivery", "offline_store_only"] as const).map((mode) => (
                  <button key={mode} type="button" disabled={isDisabled}
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
          )}

          {/* GST — shown only when account-level delivery is ON (same gate as the delivery toggle) */}
          {(adminMode || accountDeliveryEnabled) && (
            <>
              <div className="flex items-center justify-between rounded-xl border border-outline-variant/25 bg-white px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-on-surface">GST Applicable?</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">Is GST charged on this product?</p>
                </div>
                <div className="flex rounded-lg border border-outline-variant/30 overflow-hidden text-xs font-semibold">
                  {([true, false] as const).map((v) => (
                    <button key={String(v)} type="button" disabled={isDisabled}
                      onClick={() => { setGstApplicable(v); if (!v) setGstRate(0); }}
                      className={`px-3 py-1.5 transition-colors disabled:opacity-50 ${
                        gstApplicable === v ? "bg-primary text-white" : "text-on-surface-variant hover:bg-surface-container"
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
                      <button key={rate} type="button" disabled={isDisabled}
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
                    <p className="text-xs text-amber-700">0% selected — confirm this product is exempt or zero-rated.</p>
                  )}
                </div>
              )}

              {gstApplicable && gstRate > 0 && (
                <div className="rounded-xl bg-primary/5 border border-primary/15 px-3 py-2 text-xs text-primary/80">
                  GST at <span className="font-bold">{gstRate}%</span> will be recorded for this product.
                </div>
              )}
            </>
          )}
        </div>

        {/* Submit + inline success */}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={isDisabled}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-50 transition-all">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
            {submitting
              ? t('formSavingLabel')
              : adminMode
                ? (initialProduct?.id ? "Save Changes" : "Add to Catalog")
                : (!hasSeats ? t('formNoSeats') : isManufacturer ? t('formAddToCatalogue') : t('formAddToInventory'))
            }
          </button>
          {!adminMode && !hasSeats && (
            <Link href="/dashboard/upgrade"
              className="inline-flex items-center gap-2 rounded-xl border-2 border-primary text-primary px-5 py-3 text-sm font-bold hover:bg-primary/5 transition-all">
              {t('formBuyMoreSeats')}
            </Link>
          )}
          {message?.type === "ok" && (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary animate-in fade-in duration-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" /> {message.text}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
