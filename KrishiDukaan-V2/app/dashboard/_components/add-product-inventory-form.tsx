"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2, PackagePlus, Plus, X, Upload, Link as LinkIcon,
  Tag, ImageIcon, AlignLeft, Layers, Search, ChevronDown,
} from "lucide-react";
import Link from "next/link";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage, fetchAllMarketplaceProducts } from "../../firebase";
import { createManufacturerProduct, searchProductsByName } from "../_lib/manufacturer-products-firestore";
import { createProductAndInventory } from "../_lib/inventory-firestore";
import type { SeatStats } from "../_types/subscriptions";
import { useI18n } from "../../i18n/I18nContext";
import { HelperIcon } from "../../../components/helpers";
import type { MarketplaceProduct } from "../../../types/product";

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  "Seeds", "Fertilizers", "Pesticides", "Herbicides", "Fungicides",
  "Tools", "Irrigation", "Soil Nutrients", "Growth Promoters",
  "Equipment", "Animal Feed", "Organic Products", "Bio Pesticides",
  "Micro Nutrients", "Others",
] as const;

const UNIT_OPTIONS = [
  { group: "Weight — Small", options: [
    { value: "10g", label: "10 gm" }, { value: "25g", label: "25 gm" },
    { value: "50g", label: "50 gm" }, { value: "100g", label: "100 gm" },
    { value: "200g", label: "200 gm" }, { value: "250g", label: "250 gm" },
    { value: "500g", label: "500 gm" }, { value: "750g", label: "750 gm" },
  ]},
  { group: "Weight — Large", options: [
    { value: "1kg", label: "1 kg" }, { value: "2kg", label: "2 kg" },
    { value: "3kg", label: "3 kg" }, { value: "5kg", label: "5 kg" },
    { value: "10kg", label: "10 kg" }, { value: "15kg", label: "15 kg" },
    { value: "20kg", label: "20 kg" }, { value: "25kg", label: "25 kg" },
    { value: "50kg", label: "50 kg" },
  ]},
  { group: "Volume", options: [
    { value: "50ml", label: "50 ml" }, { value: "100ml", label: "100 ml" },
    { value: "250ml", label: "250 ml" }, { value: "500ml", label: "500 ml" },
    { value: "1L", label: "1 Litre" }, { value: "2L", label: "2 Litre" },
    { value: "5L", label: "5 Litre" }, { value: "10L", label: "10 Litre" },
    { value: "20L", label: "20 Litre" },
  ]},
  { group: "Pack / Unit", options: [
    { value: "pkt", label: "Packet" }, { value: "bag", label: "Bag" },
    { value: "pcs", label: "Piece" }, { value: "box", label: "Box" },
    { value: "bottle", label: "Bottle" }, { value: "bundle", label: "Bundle" },
    { value: "can", label: "Can" }, { value: "drum", label: "Drum" },
    { value: "roll", label: "Roll" }, { value: "set", label: "Set" },
    { value: "pair", label: "Pair" }, { value: "custom", label: "Custom…" },
  ]},
];

const KNOWN_UNITS = UNIT_OPTIONS.flatMap((g) => g.options.map((o) => o.value)).filter((v) => v !== "custom");

const SIZE_PRESETS = [
  { label: "250 gm", unit: "250g" }, { label: "500 gm", unit: "500g" },
  { label: "1 kg",   unit: "1kg"  }, { label: "5 kg",   unit: "5kg"  },
  { label: "25 kg",  unit: "25kg" }, { label: "500 ml", unit: "500ml"},
  { label: "1 L",    unit: "1L"   }, { label: "Packet", unit: "pkt"  },
  { label: "Bag",    unit: "bag"  },
];

const MAX_VARIANTS = 8;
const MAX_IMAGES   = 5;

// ─── Types ────────────────────────────────────────────────────────────────────

type Variant   = { unit: string; customUnit: string; price: string; stock: string };
type ImageSlot = { mode: "url" | "upload"; url: string; uploading: boolean; error: string };

type SearchResult = {
  id: string; name: string; category: string; unit: string; price: number;
  description: string; image: string; images: string[]; variants: { unit: string; price: number }[];
};

type AddProductInventoryFormProps = {
  userId: string | null;
  /** Both manufacturer and retailer can now add products. */
  role: "manufacturer" | "retailer";
  disabled?: boolean;
  onCreated: () => Promise<void>;
  /** Real seat availability derived from active subscriptions minus active listings. */
  seatStats: SeatStats;
  /** Optional store name for retailers */
  storeName?: string;
};

const newVariant = (unit = "1kg"): Variant => ({ unit, customUnit: "", price: "", stock: "" });
const newSlot    = (): ImageSlot => ({ mode: "url", url: "", uploading: false, error: "" });

function useAllProducts(userId: string | null) {
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  useEffect(() => {
    if (!userId) return;
    fetchAllMarketplaceProducts().then(setProducts).catch(() => {});
  }, [userId]);
  return products;
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
      const path = `product-images/${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
      const snap = await uploadBytes(storageRef(storage, path), file);
      onChange({ url: await getDownloadURL(snap.ref), uploading: false });
    } catch {
      onChange({ uploading: false, error: "Upload failed. Paste URL instead." });
    }
  };

  return (
    <div className={`flex flex-col rounded-2xl border-2 overflow-hidden transition-colors ${
      slot.url ? "border-primary/20 bg-surface-container-low" : "border-dashed border-outline-variant/40 bg-surface-container-low/50 hover:border-primary/40"
    }`}>
      {slot.url ? (
        <div className="relative">
          <img src={slot.url} alt="" className="h-28 w-full object-cover"
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
        <div className="flex h-28 flex-col items-center justify-center gap-1 text-on-surface-variant/50">
          <ImageIcon className="h-7 w-7" />
          <span className="text-[10px]">{index === 0 ? t('formMainImage') : `${t('formImageLabel')} ${index + 1}`}</span>
        </div>
      )}
      <div className="flex flex-col gap-2 p-2.5">
        <div className="flex rounded-lg border border-outline-variant/30 text-[11px] overflow-hidden">
          {(["url", "upload"] as const).map((m) => (
            <button key={m} type="button" disabled={disabled}
              onClick={() => onChange({ mode: m, error: "" })}
              className={`flex flex-1 items-center justify-center gap-1 py-1.5 font-medium transition-colors ${
                slot.mode === m ? "bg-primary text-white" : "text-on-surface-variant hover:bg-surface-container"
              } disabled:opacity-50`}
            >
              {m === "url" ? <LinkIcon className="h-3 w-3" /> : <Upload className="h-3 w-3" />}
              {m === "url" ? t('formLinkLabel') : t('formUploadLabel')}
            </button>
          ))}
        </div>
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
              className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-outline-variant/40 py-2 text-[11px] text-on-surface-variant hover:border-primary hover:text-primary disabled:opacity-50 transition-colors">
              {slot.uploading
                ? <><Loader2 className="h-3 w-3 animate-spin" />{t('formUploadingLabel')}</>
                : <><Upload className="h-3 w-3" />{t('formChooseFile')}</>}
            </button>
          </>
        )}
        {slot.error && <p className="text-[10px] text-red-500">{slot.error}</p>}
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
}: AddProductInventoryFormProps) {
  const { t } = useI18n();
  // Basic fields
  const [name,        setName]        = useState("");
  const [category,    setCategory]    = useState<string>(CATEGORIES[0]);
  const [description, setDescription] = useState("");

  // Variants
  const [variants,    setVariants]    = useState<Variant[]>([newVariant()]);

  // Images — start with 1 slot, user can add more
  const [images,      setImages]      = useState<ImageSlot[]>([newSlot()]);

  // Search state
  const [suggestions,   setSuggestions]   = useState<SearchResult[]>([]);
  const [searching,     setSearching]     = useState(false);
  const [showDropdown,  setShowDropdown]  = useState(false);
  const [autofilled,    setAutofilled]    = useState(false);
  const [existingProductId, setExistingProductId] = useState<string | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Submit state
  const [submitting,  setSubmitting]  = useState(false);
  const [message,     setMessage]     = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const isManufacturer = role === "manufacturer";
  const hasSeats       = seatStats.available > 0;
  const noSubscription = seatStats.totalPurchased === 0;
  const isDisabled     = disabled || submitting || !userId || !hasSeats;

  // ── Search ───────────────────────────────────────────────────────────────────
  const handleNameChange = useCallback((val: string) => {
    setName(val);
    setAutofilled(false);
    setExistingProductId(null);
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
    setCategory(product.category || CATEGORIES[0]);
    setDescription(product.description || "");
    setExistingProductId(product.id);

    // Populate variants from product
    const src = product.variants.length
      ? product.variants
      : [{ unit: product.unit, price: product.price }];
    setVariants(src.map((v) => ({
      unit: KNOWN_UNITS.includes(v.unit) ? v.unit : "custom",
      customUnit: KNOWN_UNITS.includes(v.unit) ? "" : v.unit,
      price: String(v.price),
      stock: "",
    })));

    // Populate images — only as many slots as we have URLs for (min 1)
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
  const setV      = (i: number, p: Partial<Variant>) =>
    setVariants((vs) => vs.map((v, idx) => idx === i ? { ...v, ...p } : v));
  const removeV   = (i: number) => setVariants((vs) => vs.filter((_, idx) => idx !== i));
  const addPreset = (unit: string) => {
    if (variants.length >= MAX_VARIANTS) return;
    if (variants.some((v) => (v.unit === "custom" ? v.customUnit : v.unit) === unit)) return;
    setVariants((vs) => [...vs, newVariant(unit)]);
  };

  // ── Images ───────────────────────────────────────────────────────────────────
  const setImg   = (i: number, p: Partial<ImageSlot>) =>
    setImages((imgs) => imgs.map((s, idx) => idx === i ? { ...s, ...p } : s));
  const clearImg = (i: number) =>
    setImages((imgs) => imgs.map((s, idx) => idx === i ? newSlot() : s));

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    if (!hasSeats) { setMessage({ type: "err", text: "No seats available. Buy more seats." }); return; }
    if (!name.trim() || !category) { setMessage({ type: "err", text: "Product name and category are required." }); return; }

    const parsed = variants.map((v) => ({
      unit: v.unit === "custom" ? v.customUnit.trim() : v.unit,
      price: Number(v.price),
    }));
    if (parsed.some((v) => !v.unit || !Number.isFinite(v.price) || v.price <= 0)) {
      setMessage({ type: "err", text: "Each variant needs a unit and price > 0." });
      return;
    }
    if (images.some((s) => s.uploading)) {
      setMessage({ type: "err", text: "Wait for image uploads to finish." });
      return;
    }

    const imageUrls = images.map((s) => s.url.trim()).filter(Boolean);
    setSubmitting(true);
    setMessage(null);
    try {
      if (isManufacturer) {
        await createManufacturerProduct(userId, {
          name,
          category,
          unit: parsed[0].unit,
          price: parsed[0].price,
          variants: parsed,
          description,
          image: imageUrls[0] ?? undefined,
          images: imageUrls,
        });
      } else {
        await createProductAndInventory(userId, {
          name,
          category,
          unit: parsed[0].unit,
          stockQuantity: Number(variants[0].stock) || 1,
          sellingPrice: parsed[0].price,
          reorderThreshold: 0,
          description,
          imageUrl: imageUrls[0] ?? undefined,
          storeName: storeName || "My Store",
          sellMode: "offline_store_only",
          existingProductId: existingProductId ?? undefined,
        });
      }
      setMessage({ type: "ok", text: isManufacturer ? t('formProductAdded') : t('formProductAddedInv') });
      setName(""); setCategory(CATEGORIES[0]); setDescription(""); setAutofilled(false); setExistingProductId(null);
      setVariants([newVariant()]);
      setImages([newSlot()]);
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

      {message && (
        <div className={`mt-4 rounded-xl px-4 py-3 text-sm font-medium ${
          message.type === "ok"
            ? "border border-primary/30 bg-primary/10 text-primary"
            : "border border-red-200 bg-red-50 text-red-700"
        }`}>
          {message.text}
        </div>
      )}

      <form className="mt-6 flex flex-col gap-6" onSubmit={handleSubmit}>

        {/* ── Section 1: Product details ────────────────────────────────────── */}
        <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/40 p-4 flex flex-col gap-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
            <Tag className="h-4 w-4 text-primary" /> {t('formProductDetails')}
            <HelperIcon size="xs" variant="ghost" side="right" textKey="dashFormProductDetails" ariaLabel={`${t('formProductDetails')} help`} />
          </div>

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

            {/* Autofill badge */}
            {autofilled && (
              <div className="flex items-center gap-2 rounded-xl bg-primary/5 border border-primary/20 px-3 py-2">
                <span className="text-xs text-primary font-medium">{t('formAutofilledMsg')}</span>
                <button type="button" onClick={() => setAutofilled(false)} className="ml-auto text-primary/60 hover:text-primary">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Dropdown */}
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
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-on-surface">{t('formCategoryLabel')} <span className="text-red-500">*</span></span>
            <select required disabled={isDisabled}
              className="rounded-xl border border-outline-variant/40 bg-white px-3 py-2.5 text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50 appearance-none"
              value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>

          {/* Description */}
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-on-surface flex items-center gap-1.5">
              <AlignLeft className="h-3.5 w-3.5 text-on-surface-variant" /> {t('formDescriptionLabel')}
            </span>
            <textarea rows={3} disabled={isDisabled}
              className="rounded-xl border border-outline-variant/40 bg-white px-3 py-2.5 text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50 resize-none"
              value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder={t('formDescPlaceholder')} />
          </label>
        </div>

        {/* ── Section 2: Pack sizes & prices ────────────────────────────────── */}
        <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/40 p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
              <Layers className="h-4 w-4 text-primary" /> {t('formPackSizes')}
              <HelperIcon size="xs" variant="ghost" side="right" textKey="dashFormPackSizes" ariaLabel={`${t('formPackSizes')} help`} />
            </div>
            <span className="text-xs text-on-surface-variant">{variants.length}/{MAX_VARIANTS} {t('formSizesCount')}</span>
          </div>

          {/* Quick presets */}
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-on-surface-variant">{t('formQuickAdd')}</p>
            <div className="flex flex-wrap gap-2">
              {SIZE_PRESETS.map((p) => {
                const active = variants.some((v) => (v.unit === "custom" ? v.customUnit : v.unit) === p.unit);
                return (
                  <button key={p.unit} type="button"
                    disabled={isDisabled || active || variants.length >= MAX_VARIANTS}
                    onClick={() => addPreset(p.unit)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                      active
                        ? "border-primary/30 bg-primary/10 text-primary cursor-default"
                        : "border-outline-variant/40 bg-white text-on-surface-variant hover:border-primary hover:text-primary hover:bg-primary/5 disabled:opacity-40"
                    }`}
                  >
                    {active ? `✓ ${p.label}` : `+ ${p.label}`}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-12 gap-2 px-1">
            <span className="col-span-4 text-xs font-medium text-on-surface-variant">{t('formUnitSize')}</span>
            <span className="col-span-4 text-xs font-medium text-on-surface-variant">{t('formPriceCol')}</span>
            <span className="col-span-3 text-xs font-medium text-on-surface-variant">{t('formStockQty')}</span>
            <span className="col-span-1" />
          </div>

          {/* Variant rows */}
          {variants.map((v, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <div className="grid grid-cols-12 items-center gap-2">
                {/* Unit */}
                <div className="col-span-4">
                  <select disabled={isDisabled} value={v.unit}
                    onChange={(e) => setV(i, { unit: e.target.value, customUnit: "" })}
                    className="w-full rounded-xl border border-outline-variant/40 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50 appearance-none">
                    {UNIT_OPTIONS.map((grp) => (
                      <optgroup key={grp.group} label={grp.group}>
                        {grp.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </div>

                {/* Price */}
                <div className="col-span-4 relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-on-surface-variant">₹</span>
                  <input required type="number" min={1} step={0.01} disabled={isDisabled}
                    className="w-full rounded-xl border border-outline-variant/40 bg-white pl-7 pr-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                    placeholder="0" value={v.price}
                    onChange={(e) => setV(i, { price: e.target.value })} />
                </div>

                {/* Stock */}
                <div className="col-span-3">
                  <input type="number" min={0} disabled={isDisabled}
                    className="w-full rounded-xl border border-outline-variant/40 bg-white px-2 py-2.5 text-sm text-center outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                    placeholder="—" value={v.stock}
                    onChange={(e) => setV(i, { stock: e.target.value })} />
                </div>

                <div className="col-span-1 flex justify-center">
                  <button type="button" disabled={isDisabled || variants.length <= 1} onClick={() => removeV(i)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-on-surface-variant hover:bg-red-50 hover:text-red-500 disabled:opacity-30 transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Custom unit input */}
              {v.unit === "custom" && (
                <input type="text" disabled={isDisabled}
                  className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                  placeholder="e.g. 30 tablets, 1 acre dose, 4L drum…"
                  value={v.customUnit} onChange={(e) => setV(i, { customUnit: e.target.value })} />
              )}
            </div>
          ))}

          {variants.length < MAX_VARIANTS && (
            <button type="button" disabled={isDisabled}
              onClick={() => setVariants((vs) => [...vs, newVariant()])}
              className="flex w-fit items-center gap-2 rounded-xl border border-dashed border-outline-variant/50 bg-white px-4 py-2 text-sm text-on-surface-variant hover:border-primary hover:text-primary hover:bg-primary/5 disabled:opacity-50 transition-colors">
              <Plus className="h-4 w-4" /> {t('formAddAnotherSize')}
            </button>
          )}
        </div>

        {/* ── Section 3: Images ─────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/40 p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
              <ImageIcon className="h-4 w-4 text-primary" /> {t('formProductImages')}
              <HelperIcon size="xs" variant="ghost" side="right" textKey="dashFormProductImages" ariaLabel={`${t('formProductImages')} help`} />
            </div>
            <span className="text-xs text-on-surface-variant">{t('formUploadOrPaste')} {MAX_IMAGES}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {images.map((slot, i) => (
              <ImageCard key={i} slot={slot} index={i} disabled={isDisabled}
                onChange={(p) => setImg(i, p)} onClear={() => clearImg(i)} />
            ))}
          </div>
          {images.length < MAX_IMAGES && (
            <button
              type="button"
              disabled={isDisabled}
              onClick={() => setImages((imgs) => [...imgs, newSlot()])}
              className="flex w-fit items-center gap-2 rounded-xl border border-dashed border-outline-variant/50 bg-white px-4 py-2 text-sm text-on-surface-variant hover:border-primary hover:text-primary hover:bg-primary/5 disabled:opacity-50 transition-colors"
            >
              <Plus className="h-4 w-4" /> Add another image
            </button>
          )}
          <p className="text-xs text-on-surface-variant">{t('formImageHint')}</p>
        </div>

        {/* Submit */}
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={isDisabled}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-50 transition-all">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
            {!hasSeats ? t('formNoSeats') : submitting ? t('formSavingLabel') : isManufacturer ? t('formAddToCatalogue') : t('formAddToInventory')}
          </button>
          {!hasSeats && (
            <Link href="/dashboard/upgrade"
              className="inline-flex items-center gap-2 rounded-xl border-2 border-primary text-primary px-5 py-3 text-sm font-bold hover:bg-primary/5 transition-all">
              {t('formBuyMoreSeats')}
            </Link>
          )}
        </div>
      </form>
    </div>
  );
}
