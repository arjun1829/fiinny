"use client";

import { useState, useEffect } from "react";
import { Tag, Loader2, CheckCircle2, Calendar, Plus, Trash2, AlertCircle, Layers } from "lucide-react";
import { updateDiscountRecord } from "../_lib/inventory-firestore";
import { getActiveDiscountPct, getActiveDiscountAmt, calcDiscount, calcDiscountFixed, fmtPrice } from "../../utils/discount";
import { cn } from "../_lib/cn";
import type { BulkDiscountTier } from "../_types/inventory";

type Props = {
  inventoryId: string;
  productId: string;
  originalProductId?: string | null;
  sellingPrice: number;
  discountEnabled: boolean;
  discountType: "percentage" | "fixed_amount";
  discountPct: number;
  discountFixedAmt: number;
  discountStartDate: Date | null;
  discountEndDate: Date | null;
  bulkDiscountEnabled: boolean;
  bulkDiscountTiers: BulkDiscountTier[];
  isActive: boolean;
  onSaved: () => Promise<void>;
};

function toInputDate(d: Date | null): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

function fromInputDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function discountStatus(
  enabled: boolean,
  hasValue: boolean,
  start: Date | null,
  end: Date | null,
): { label: string; color: string } {
  if (!enabled || !hasValue) return { label: "No discount", color: "text-on-surface-variant" };
  const now = Date.now();
  const startMs = start?.getTime() ?? 0;
  const endMs   = end?.getTime()   ?? Infinity;
  if (now < startMs) return { label: "Scheduled — not active yet", color: "text-amber-600" };
  if (now > endMs)   return { label: "Expired", color: "text-red-500" };
  return { label: "Active now", color: "text-green-600" };
}

export function DiscountPanel({
  inventoryId,
  productId,
  originalProductId,
  sellingPrice,
  discountEnabled: initialEnabled,
  discountType: initialType,
  discountPct: initialPct,
  discountFixedAmt: initialFixed,
  discountStartDate: initialStart,
  discountEndDate: initialEnd,
  bulkDiscountEnabled: initialBulkEnabled,
  bulkDiscountTiers: initialTiers,
  isActive,
  onSaved,
}: Props) {
  const [enabled,      setEnabled]      = useState(initialEnabled);
  const [discountType, setDiscountType] = useState<"percentage" | "fixed_amount">(initialType);
  const [pct,          setPct]          = useState(String(initialPct || ""));
  const [fixedAmt,     setFixedAmt]     = useState(String(initialFixed || ""));
  const [startStr,     setStartStr]     = useState(toInputDate(initialStart));
  const [endStr,       setEndStr]       = useState(toInputDate(initialEnd));
  const [bulkEnabled,  setBulkEnabled]  = useState(initialBulkEnabled);
  const [tiers,        setTiers]        = useState<BulkDiscountTier[]>(
    initialTiers.length ? initialTiers : []
  );
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  useEffect(() => {
    setEnabled(initialEnabled);
    setDiscountType(initialType);
    setPct(String(initialPct || ""));
    setFixedAmt(String(initialFixed || ""));
    setStartStr(toInputDate(initialStart));
    setEndStr(toInputDate(initialEnd));
    setBulkEnabled(initialBulkEnabled);
    setTiers(initialTiers);
  }, [inventoryId, initialEnabled, initialType, initialPct, initialFixed,
      initialStart, initialEnd, initialBulkEnabled]);

  const numPct    = Number(pct) || 0;
  const numFixed  = Number(fixedAmt) || 0;
  const startDate = fromInputDate(startStr);
  const endDate   = fromInputDate(endStr);

  const tsLike = (d: Date | null) => d ? { toMillis: () => d.getTime() } : null;

  const previewPct = discountType === "percentage"
    ? getActiveDiscountPct({ discountEnabled: enabled, discountType, discountPct: numPct, discountStartDate: tsLike(startDate), discountEndDate: tsLike(endDate) })
    : 0;
  const previewFixed = discountType === "fixed_amount"
    ? getActiveDiscountAmt({ discountEnabled: enabled, discountType, discountFixedAmt: numFixed, discountStartDate: tsLike(startDate), discountEndDate: tsLike(endDate) })
    : 0;

  const { finalPrice: finalPct, discountAmt: savePct } = calcDiscount(sellingPrice, previewPct);
  const { finalPrice: finalFixed, discountAmt: saveFixed } = calcDiscountFixed(sellingPrice, previewFixed);
  const finalPrice = discountType === "percentage" ? finalPct : finalFixed;
  const saveAmt    = discountType === "percentage" ? savePct  : saveFixed;
  const isPreviewActive = discountType === "percentage" ? previewPct > 0 : previewFixed > 0;

  const hasValue = discountType === "percentage" ? numPct > 0 : numFixed > 0;
  const status = discountStatus(enabled, hasValue, startDate, endDate);

  // ── Bulk tier helpers ───────────────────────────────────────────────────────
  const addTier = () => {
    const existingQtys = tiers.map(t => t.minQty);
    const nextQty = existingQtys.length ? Math.max(...existingQtys) + 5 : 5;
    const nextPct  = tiers.length ? Math.min(99, (tiers[tiers.length - 1]?.discountPct ?? 5) + 5) : 5;
    setTiers(prev => [...prev, { minQty: nextQty, discountPct: nextPct }]);
  };
  const removeTier = (i: number) => setTiers(prev => prev.filter((_, idx) => idx !== i));
  const updateTier = (i: number, field: keyof BulkDiscountTier, val: number) =>
    setTiers(prev => prev.map((t, idx) => idx === i ? { ...t, [field]: val } : t));

  const handleSave = async () => {
    if (enabled) {
      if (discountType === "percentage" && (numPct <= 0 || numPct > 99)) {
        setError("Discount must be between 1% and 99%."); return;
      }
      if (discountType === "fixed_amount" && numFixed <= 0) {
        setError("Fixed discount amount must be greater than 0."); return;
      }
      if (discountType === "fixed_amount" && numFixed >= sellingPrice) {
        setError("Fixed discount cannot be equal to or more than the selling price."); return;
      }
      if (startDate && endDate && endDate <= startDate) {
        setError("End date must be after start date."); return;
      }
    }
    if (bulkEnabled && tiers.length > 0) {
      for (const t of tiers) {
        if (t.minQty < 1)              { setError("Bulk tier quantity must be at least 1."); return; }
        if (t.discountPct <= 0 || t.discountPct > 99) { setError("Bulk tier discount must be 1–99%."); return; }
      }
      const qtys = tiers.map(t => t.minQty);
      if (new Set(qtys).size !== qtys.length) { setError("Bulk tiers cannot have duplicate quantities."); return; }
    }

    setSaving(true); setError(null);
    try {
      await updateDiscountRecord(
        inventoryId, productId,
        {
          discountEnabled:   enabled,
          discountType,
          discountPct:       discountType === "percentage" && enabled ? numPct : 0,
          discountFixedAmt:  discountType === "fixed_amount" && enabled ? numFixed : 0,
          discountStartDate: enabled ? startDate : null,
          discountEndDate:   enabled ? endDate   : null,
          bulkDiscountEnabled: bulkEnabled,
          bulkDiscountTiers:   bulkEnabled ? tiers : [],
        },
        originalProductId,
      );
      await onSaved();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save discount.");
    } finally { setSaving(false); }
  };

  return (
    <div className={cn(
      "rounded-2xl border bg-surface-container-low/50 p-4 space-y-4",
      enabled ? "border-primary/30" : "border-outline-variant/30",
    )}>
      {/* ── Header toggle ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-semibold text-on-surface">
          <Tag className="h-4 w-4 text-primary" /> Base Discount
        </span>
        <button
          type="button"
          disabled={!isActive || saving}
          onClick={() => { setEnabled(v => !v); setError(null); }}
          aria-label={enabled ? "Disable discount" : "Enable discount"}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40",
            enabled ? "bg-primary" : "bg-outline-variant/60",
          )}
        >
          <span className={cn(
            "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
            enabled ? "translate-x-6" : "translate-x-1",
          )} />
        </button>
      </div>

      {enabled && (
        <>
          {/* ── Discount type ──────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-2">
            {(["percentage", "fixed_amount"] as const).map(type => (
              <button
                key={type}
                type="button"
                onClick={() => { setDiscountType(type); setError(null); }}
                className={cn(
                  "rounded-xl border py-2 text-xs font-bold transition-all",
                  discountType === type
                    ? "bg-primary text-white border-primary"
                    : "border-outline-variant/40 text-on-surface-variant hover:border-primary/40",
                )}
              >
                {type === "percentage" ? "% Percentage" : "₹ Fixed Amount"}
              </button>
            ))}
          </div>

          {/* ── Value input ────────────────────────────────────────────────────── */}
          {discountType === "percentage" ? (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-on-surface">
                Discount % <span className="text-red-500">*</span>
              </span>
              <div className="relative">
                <input
                  type="number" min={1} max={99} step={1}
                  disabled={saving} placeholder="e.g. 20"
                  value={pct}
                  onChange={e => { setPct(e.target.value); setError(null); }}
                  className="w-full rounded-xl border border-outline-variant/40 bg-white py-2.5 pl-3 pr-10 text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-on-surface-variant">%</span>
              </div>
            </label>
          ) : (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-on-surface">
                Fixed Amount (₹) <span className="text-red-500">*</span>
              </span>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-on-surface-variant">₹</span>
                <input
                  type="number" min={1} step={1}
                  disabled={saving} placeholder="e.g. 50"
                  value={fixedAmt}
                  onChange={e => { setFixedAmt(e.target.value); setError(null); }}
                  className="w-full rounded-xl border border-outline-variant/40 bg-white py-2.5 pl-8 pr-3 text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                />
              </div>
            </label>
          )}

          {/* ── Date range ─────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Start Date", val: startStr, set: setStartStr },
              { label: "End Date",   val: endStr,   set: setEndStr   },
            ].map(({ label, val, set }) => (
              <label key={label} className="flex flex-col gap-1.5 text-xs">
                <span className="flex items-center gap-1 font-medium text-on-surface-variant">
                  <Calendar className="h-3 w-3" /> {label}
                  <span className="text-on-surface-variant/60">(optional)</span>
                </span>
                <input
                  type="date" disabled={saving} value={val}
                  onChange={e => { set(e.target.value); setError(null); }}
                  className="rounded-xl border border-outline-variant/40 bg-white px-3 py-2 text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                />
              </label>
            ))}
          </div>

          {/* ── Live preview ───────────────────────────────────────────────────── */}
          {hasValue && (
            <div className={cn(
              "rounded-xl border px-4 py-3 space-y-1",
              isPreviewActive ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50",
            )}>
              <div className="flex items-center justify-between">
                <span className="text-xs text-on-surface-variant">Original price</span>
                <span className="text-xs font-medium text-on-surface-variant line-through">₹{fmtPrice(sellingPrice)}</span>
              </div>
              {isPreviewActive ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-green-700">Final price</span>
                    <span className="text-lg font-black text-green-700">₹{fmtPrice(finalPrice)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-green-600">Customer saves</span>
                    <span className="text-xs font-bold text-green-600">
                      ₹{fmtPrice(saveAmt)}
                      {discountType === "percentage" ? ` (${numPct}% off)` : " flat"}
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-xs text-amber-700 font-medium">
                  Discount is set but not active yet (check dates).
                </p>
              )}
            </div>
          )}

          <p className={cn("text-xs font-semibold", status.color)}>
            Status: {status.label}
          </p>
        </>
      )}

      {/* ── Bulk Purchase Discounts ─────────────────────────────────────────── */}
      <div className={cn(
        "rounded-xl border p-3 space-y-3",
        bulkEnabled ? "border-secondary/30 bg-secondary/5" : "border-outline-variant/20 bg-surface-container-low/30",
      )}>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold text-on-surface">
            <Layers className="h-4 w-4 text-secondary" /> Bulk Discounts
            <span className="text-[10px] text-on-surface-variant font-normal">quantity tiers</span>
          </span>
          <button
            type="button"
            disabled={!isActive || saving}
            onClick={() => { setBulkEnabled(v => !v); setError(null); }}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-40",
              bulkEnabled ? "bg-secondary" : "bg-outline-variant/60",
            )}
          >
            <span className={cn(
              "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
              bulkEnabled ? "translate-x-5" : "translate-x-0.5",
            )} />
          </button>
        </div>

        {bulkEnabled && (
          <div className="space-y-2">
            <p className="text-[11px] text-on-surface-variant">
              Customers buying more units get a bigger discount. Higher tiers override lower ones.
            </p>

            {tiers
              .slice()
              .sort((a, b) => a.minQty - b.minQty)
              .map((tier, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex items-center gap-1 flex-1">
                    <span className="text-[11px] text-on-surface-variant shrink-0">Buy</span>
                    <input
                      type="number" min={1} step={1}
                      value={tier.minQty}
                      disabled={saving}
                      onChange={e => updateTier(i, "minQty", Math.max(1, Number(e.target.value)))}
                      className="w-16 rounded-lg border border-outline-variant/40 bg-white px-2 py-1.5 text-xs text-center text-on-surface outline-none focus:border-secondary focus:ring-1 focus:ring-secondary/20"
                    />
                    <span className="text-[11px] text-on-surface-variant shrink-0">+ units →</span>
                    <input
                      type="number" min={1} max={99} step={1}
                      value={tier.discountPct}
                      disabled={saving}
                      onChange={e => updateTier(i, "discountPct", Math.min(99, Math.max(1, Number(e.target.value))))}
                      className="w-16 rounded-lg border border-outline-variant/40 bg-white px-2 py-1.5 text-xs text-center text-on-surface outline-none focus:border-secondary focus:ring-1 focus:ring-secondary/20"
                    />
                    <span className="text-[11px] text-on-surface-variant shrink-0">% off</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeTier(i)}
                    disabled={saving}
                    className="p-1 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}

            {tiers.length < 6 && (
              <button
                type="button"
                onClick={addTier}
                disabled={saving}
                className="flex items-center gap-1 text-xs font-semibold text-secondary hover:underline disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" /> Add tier
              </button>
            )}

            {/* Preview table */}
            {tiers.length > 0 && sellingPrice > 0 && (
              <div className="rounded-xl border border-secondary/20 bg-white overflow-hidden mt-2">
                <div className="px-3 py-1.5 bg-secondary/10 text-[10px] font-black uppercase tracking-widest text-secondary">
                  Bulk Savings Preview
                </div>
                <div className="divide-y divide-outline-variant/10">
                  {tiers
                    .slice()
                    .sort((a, b) => a.minQty - b.minQty)
                    .map((t, i) => {
                      const { finalPrice: fp, discountAmt: da } = calcDiscount(sellingPrice, t.discountPct);
                      return (
                        <div key={i} className="flex items-center justify-between px-3 py-2 text-xs">
                          <span className="text-on-surface-variant">Buy {t.minQty}+ units</span>
                          <div className="flex items-center gap-2">
                            <span className="text-on-surface-variant line-through text-[10px]">₹{fmtPrice(sellingPrice)}</span>
                            <span className="font-bold text-green-700">₹{fmtPrice(fp)}</span>
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-black text-green-700">
                              {t.discountPct}% OFF
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
          <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {!isActive && (
        <p className="text-xs text-on-surface-variant">
          Activate this product first before setting a discount.
        </p>
      )}

      <button
        type="button"
        disabled={saving || !isActive}
        onClick={handleSave}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50 transition-all"
      >
        {saving ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
        ) : saved ? (
          <><CheckCircle2 className="h-4 w-4" /> Saved</>
        ) : (
          "Save Discount Settings"
        )}
      </button>
    </div>
  );
}
