"use client";

/**
 * Stock + price editor for a manufacturer-assigned product.
 *
 * Assigned products arrive with stockQuantity 0, which makes them permanently
 * "Out of stock" and unorderable. The retailer had no way to change that: the
 * Edit button is gated on `isOwn` in inventory-table.tsx, and the edit modal
 * was the only caller of updateInventoryRecord — so the write path existed and
 * the rules already permitted it, but nothing was ever wired to it.
 *
 * Deliberately NOT the full edit modal: a retailer must not be able to change
 * a manufacturer's product name, images, or specs. Only their own commercial
 * terms — how many they hold, what they charge, when to reorder.
 *
 * Multi-pack products get a stock box per size. A single flat number cannot
 * describe a product sold as 1L / 500ml / 250ml: the seller may be out of the
 * litre and full on the smaller ones, and with one field the whole product had
 * to be marked out of stock. The aggregate is then the SUM of the sizes, so the
 * listing stays visible while any size is still available.
 */

import { useState } from "react";
import { Loader2, Save, X } from "lucide-react";
import { updateInventoryRecord } from "../_lib/inventory-firestore";

type Variant = { unit: string; price: number; stock?: number };

type Props = {
  inventoryId: string;
  stockQuantity: number;
  sellingPrice: number;
  reorderThreshold: number;
  /** Pack sizes for this product. One entry (or none) means a simple product. */
  variants?: Variant[];
  onSaved: () => Promise<void> | void;
  onCancel: () => void;
};

export function AssignedStockPanel({
  inventoryId,
  stockQuantity,
  sellingPrice,
  reorderThreshold,
  variants,
  onSaved,
  onCancel,
}: Props) {
  // One size is the same as none — a per-size editor for a single row is just
  // the flat field with extra chrome.
  const packs = (variants ?? []).length > 1 ? variants! : [];
  const isMultiPack = packs.length > 0;

  const [stock, setStock] = useState(String(stockQuantity ?? 0));
  const [price, setPrice] = useState(String(sellingPrice ?? 0));
  const [threshold, setThreshold] = useState(String(reorderThreshold ?? 0));
  const [packStock, setPackStock] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      packs.map((v, i) => [
        v.unit,
        // Legacy rows kept the whole stock on the flat field with nothing per
        // size; attribute it to the first size rather than showing zeros.
        String(v.stock ?? (i === 0 ? stockQuantity ?? 0 : 0)),
      ]),
    ),
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const packTotal = packs.reduce((sum, v) => sum + (Number(packStock[v.unit]) || 0), 0);
  const effectiveStock = isMultiPack ? packTotal : Number(stock);

  const handleSave = async () => {
    const s = effectiveStock;
    const p = Number(price);
    const r = Number(threshold);

    if (isMultiPack && packs.some(v => !Number.isFinite(Number(packStock[v.unit])) || Number(packStock[v.unit]) < 0)) {
      setErr("Each pack size must be 0 or more.");
      return;
    }
    if (!Number.isFinite(s) || s < 0) { setErr("Stock must be 0 or more."); return; }
    if (!Number.isFinite(p) || p <= 0) { setErr("Enter a selling price."); return; }
    if (!Number.isFinite(r) || r < 0) { setErr("Reorder alert must be 0 or more."); return; }

    setSaving(true);
    setErr(null);
    try {
      await updateInventoryRecord(inventoryId, {
        stockQuantity: Math.floor(s),
        sellingPrice: p,
        reorderThreshold: Math.floor(r),
        ...(isMultiPack
          ? {
              variants: packs.map(v => ({
                ...v,
                stock: Math.floor(Number(packStock[v.unit]) || 0),
              })),
            }
          : {}),
      });
      await onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-3 shadow-ambient">
      <div className="mb-2.5 flex items-center justify-between">
        <p className="text-xs font-bold text-on-surface">Stock &amp; price</p>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md p-0.5 text-on-surface-variant hover:bg-surface-container"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-2">
        {isMultiPack ? (
          <div>
            <span className="mb-1 flex items-baseline justify-between text-[11px] font-medium text-on-surface-variant">
              <span>Stock per pack size</span>
              <span className="tabular-nums">
                {packTotal} total
              </span>
            </span>
            <div className="space-y-1.5 rounded-lg border border-outline-variant/40 bg-surface p-2">
              {packs.map((v) => {
                const qty = Number(packStock[v.unit]) || 0;
                return (
                  <label key={v.unit} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[11px] text-on-surface">
                      {v.unit}
                      <span className="ml-1.5 text-on-surface-variant">₹{v.price}</span>
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      aria-label={`Stock for ${v.unit}`}
                      value={packStock[v.unit] ?? "0"}
                      onChange={(e) =>
                        setPackStock((prev) => ({
                          ...prev,
                          [v.unit]: e.target.value.replace(/[^\d]/g, ""),
                        }))
                      }
                      className={`w-16 shrink-0 rounded-md border bg-surface px-2 py-1 text-right text-sm font-semibold tabular-nums text-on-surface focus:border-primary focus:outline-none ${
                        qty === 0 ? "border-red-300" : "border-outline-variant/50"
                      }`}
                    />
                  </label>
                );
              })}
            </div>
          </div>
        ) : (
          <NumField label="Stock quantity" value={stock} onChange={setStock} />
        )}
        <NumField label="Your selling price (₹)" value={price} onChange={setPrice} />
        <NumField label="Reorder alert below" value={threshold} onChange={setThreshold} />
      </div>

      {err ? <p className="mt-2 text-[11px] text-red-600">{err}</p> : null}

      <p className="mt-2 text-[10px] leading-snug text-on-surface-variant">
        {isMultiPack
          ? "A pack size at 0 is hidden from buyers. The product stays listed while any size has stock."
          : "Stock of 0 keeps this product out of the marketplace."}
      </p>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-on-primary disabled:opacity-60"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

function NumField({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-on-surface-variant">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
        className="w-full rounded-lg border border-outline-variant/50 bg-surface px-2.5 py-1.5 text-sm font-semibold text-on-surface focus:border-primary focus:outline-none"
      />
    </label>
  );
}
