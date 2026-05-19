"use client";

import { useEffect, useRef, useState } from "react";
import { X, Loader2, Save, Upload, Link as LinkIcon, Plus, ImageIcon, Layers, Tag, AlignLeft } from "lucide-react";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../../firebase";
import { updateManufacturerProduct, toggleProductActive } from "../_lib/manufacturer-products-firestore";
import type { ManufacturerProductRow } from "../_types/inventory";

// ─── Constants (shared with add form) ────────────────────────────────────────

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
const MAX_VARIANTS = 8;
const MAX_IMAGES = 5;

// ─── Types ────────────────────────────────────────────────────────────────────

type Variant   = { unit: string; customUnit: string; price: string; stock: string };
type ImgSlot   = { mode: "url" | "upload"; url: string; uploading: boolean; error: string };

function rowToVariants(row: ManufacturerProductRow): Variant[] {
  const src = row.variants.length ? row.variants : [{ unit: row.unit, price: row.price }];
  return src.map((v) => ({
    unit: KNOWN_UNITS.includes(v.unit) ? v.unit : "custom",
    customUnit: KNOWN_UNITS.includes(v.unit) ? "" : v.unit,
    price: String(v.price),
    stock: "",
  }));
}

function rowToImages(row: ManufacturerProductRow): ImgSlot[] {
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
            <span className="absolute bottom-1 left-1 rounded-full bg-primary/90 px-1.5 py-0.5 text-[9px] font-bold text-white">Main</span>
          )}
        </div>
      ) : (
        <div className="flex h-20 flex-col items-center justify-center text-on-surface-variant/40">
          <ImageIcon className="h-5 w-5" />
          <span className="text-[9px] mt-1">{index === 0 ? "Main" : `#${index + 1}`}</span>
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
              {m === "url" ? "Link" : "Upload"}
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
              {slot.uploading ? <><Loader2 className="h-2.5 w-2.5 animate-spin" /> Uploading…</> : <><Upload className="h-2.5 w-2.5" /> Choose</>}
            </button>
          </>
        )}
        {slot.error && <p className="text-[9px] text-red-500">{slot.error}</p>}
      </div>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function EditProductModal({ row, onClose, onSaved }: {
  row: ManufacturerProductRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName]               = useState(row.productName);
  const [category, setCategory]       = useState(row.category);
  const [description, setDescription] = useState(row.description);
  const [variants, setVariants]       = useState<Variant[]>(rowToVariants(row));
  const [images, setImages]           = useState<ImgSlot[]>(rowToImages(row));
  const [saving, setSaving]           = useState(false);
  const [toggling, setToggling]       = useState(false);
  const [message, setMessage]         = useState<{ type: "ok" | "err"; text: string } | null>(null);

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
    const parsedVariants = variants.map((v) => ({
      unit: v.unit === "custom" ? v.customUnit.trim() : v.unit,
      price: Number(v.price),
    }));
    if (parsedVariants.some((v) => !v.unit || !Number.isFinite(v.price) || v.price <= 0)) {
      setMessage({ type: "err", text: "Each variant needs a unit and price > 0." });
      return;
    }
    if (images.some((s) => s.uploading)) {
      setMessage({ type: "err", text: "Wait for uploads to complete." });
      return;
    }
    const imageUrls = images.map((s) => s.url.trim()).filter(Boolean);
    setSaving(true);
    setMessage(null);
    try {
      await updateManufacturerProduct(row.productId, {
        name, category, description,
        unit: parsedVariants[0].unit,
        price: parsedVariants[0].price,
        variants: parsedVariants,
        image: imageUrls[0] ?? "",
        images: imageUrls,
      });
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
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/30 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-on-surface">Edit product</h2>
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
              <p className="text-sm font-medium text-on-surface">Product status</p>
              <p className="text-xs text-on-surface-variant mt-0.5">Controls visibility to retailers</p>
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
              {row.isActive ? "Deactivate" : "Activate"}
            </button>
          </div>

          {/* ── Product details ────────────────────────────────────────────── */}
          <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/40 p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
              <Tag className="h-4 w-4 text-primary" /> Product details
            </div>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-on-surface">Product name <span className="text-red-500">*</span></span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                className="rounded-xl border border-outline-variant/40 bg-white px-3 py-2.5 text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-on-surface">Category</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)}
                className="rounded-xl border border-outline-variant/40 bg-white px-3 py-2.5 text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 appearance-none">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-on-surface flex items-center gap-1.5">
                <AlignLeft className="h-3.5 w-3.5 text-on-surface-variant" /> Description
              </span>
              <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
                className="rounded-xl border border-outline-variant/40 bg-white px-3 py-2.5 text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
                placeholder="Describe the product…" />
            </label>
          </div>

          {/* ── Variants ──────────────────────────────────────────────────── */}
          <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/40 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
              <Layers className="h-4 w-4 text-primary" /> Pack sizes &amp; prices
            </div>

            {/* Header */}
            <div className="grid grid-cols-12 gap-2 px-1">
              <span className="col-span-4 text-xs font-medium text-on-surface-variant">Unit</span>
              <span className="col-span-4 text-xs font-medium text-on-surface-variant">Price (₹)</span>
              <span className="col-span-3 text-xs font-medium text-on-surface-variant">Stock</span>
              <span className="col-span-1" />
            </div>

            {variants.map((v, i) => (
              <div key={i} className="space-y-1.5">
                <div className="grid grid-cols-12 items-center gap-2">
                  <div className="col-span-4">
                    <select value={v.unit} onChange={(e) => setV(i, { unit: e.target.value, customUnit: "" })}
                      className="w-full rounded-xl border border-outline-variant/40 bg-white px-2 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 appearance-none">
                      {UNIT_OPTIONS.map((grp) => (
                        <optgroup key={grp.group} label={grp.group}>
                          {grp.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-4 relative">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-on-surface-variant">₹</span>
                    <input type="number" min={1} step={0.01} value={v.price}
                      onChange={(e) => setV(i, { price: e.target.value })}
                      className="w-full rounded-xl border border-outline-variant/40 bg-white pl-6 pr-2 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      placeholder="0" />
                  </div>
                  <div className="col-span-3">
                    <input type="number" min={0} value={v.stock}
                      onChange={(e) => setV(i, { stock: e.target.value })}
                      className="w-full rounded-xl border border-outline-variant/40 bg-white px-2 py-2.5 text-sm text-center outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      placeholder="—" />
                  </div>
                  <div className="col-span-1 flex justify-center">
                    <button type="button" disabled={variants.length <= 1}
                      onClick={() => removeV(i)}
                      className="flex h-8 w-8 items-center justify-center rounded-xl text-on-surface-variant hover:bg-red-50 hover:text-red-500 disabled:opacity-30">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {v.unit === "custom" && (
                  <input type="text" value={v.customUnit}
                    onChange={(e) => setV(i, { customUnit: e.target.value })}
                    className="ml-0 w-full rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="e.g. 30 tablets, 1 acre dose…" />
                )}
              </div>
            ))}

            {variants.length < MAX_VARIANTS && (
              <button type="button"
                onClick={() => setVariants((vs) => [...vs, { unit: "1kg", customUnit: "", price: "", stock: "" }])}
                className="flex items-center gap-2 rounded-xl border border-dashed border-outline-variant/50 px-3 py-2 text-sm text-on-surface-variant hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors">
                <Plus className="h-4 w-4" /> Add size
              </button>
            )}
          </div>

          {/* ── Images ────────────────────────────────────────────────────── */}
          <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/40 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
              <ImageIcon className="h-4 w-4 text-primary" /> Product images
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {images.map((slot, i) => (
                <ImageSlot key={i} slot={slot} index={i} disabled={saving}
                  onChange={(p) => setImg(i, p)} onClear={() => clearImg(i)} />
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-outline-variant/30 px-5 py-4 flex items-center justify-between gap-3">
          <button type="button" onClick={onClose}
            className="rounded-xl border border-outline-variant/40 px-4 py-2.5 text-sm font-medium text-on-surface-variant hover:bg-surface-container transition-colors">
            Cancel
          </button>
          <button type="button" disabled={saving}
            onClick={handleSave}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50 transition-all">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </>
  );
}
