"use client";

import { useState, useEffect } from "react";
import { Tag, Loader2, CheckCircle2, Calendar } from "lucide-react";
import { updateDiscountRecord } from "../_lib/inventory-firestore";
import { getActiveDiscountPct, calcDiscount, fmtPrice } from "../../utils/discount";
import { cn } from "../_lib/cn";

type Props = {
  inventoryId: string;
  productId: string;
  originalProductId?: string | null;
  sellingPrice: number;
  discountEnabled: boolean;
  discountPct: number;
  discountStartDate: Date | null;
  discountEndDate: Date | null;
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
  pct: number,
  start: Date | null,
  end: Date | null,
): { label: string; color: string } {
  if (!enabled || pct <= 0) return { label: "No discount", color: "text-on-surface-variant" };
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
  discountPct: initialPct,
  discountStartDate: initialStart,
  discountEndDate: initialEnd,
  isActive,
  onSaved,
}: Props) {
  const [enabled,   setEnabled]   = useState(initialEnabled);
  const [pct,       setPct]       = useState(String(initialPct || ""));
  const [startStr,  setStartStr]  = useState(toInputDate(initialStart));
  const [endStr,    setEndStr]    = useState(toInputDate(initialEnd));
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  // Reset saved indicator when props change (e.g. after parent reload)
  useEffect(() => {
    setEnabled(initialEnabled);
    setPct(String(initialPct || ""));
    setStartStr(toInputDate(initialStart));
    setEndStr(toInputDate(initialEnd));
  }, [inventoryId, initialEnabled, initialPct, initialStart, initialEnd]);

  const numPct    = Number(pct) || 0;
  const startDate = fromInputDate(startStr);
  const endDate   = fromInputDate(endStr);

  const previewPct = getActiveDiscountPct({
    discountEnabled:   enabled,
    discountPct:       numPct,
    discountStartDate: startDate ? { toMillis: () => startDate.getTime() } : null,
    discountEndDate:   endDate   ? { toMillis: () => endDate.getTime() }   : null,
  });
  const { finalPrice, discountAmt } = calcDiscount(sellingPrice, previewPct);
  const status = discountStatus(enabled, numPct, startDate, endDate);

  const handleSave = async () => {
    if (enabled) {
      if (numPct <= 0 || numPct > 99) {
        setError("Discount must be between 1% and 99%.");
        return;
      }
      if (startDate && endDate && endDate <= startDate) {
        setError("End date must be after start date.");
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      await updateDiscountRecord(
        inventoryId,
        productId,
        {
          discountEnabled: enabled,
          discountPct:     enabled ? numPct : 0,
          discountStartDate: enabled ? startDate : null,
          discountEndDate:   enabled ? endDate   : null,
        },
        originalProductId,
      );
      await onSaved();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save discount.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn(
      "rounded-2xl border bg-surface-container-low/50 p-4 space-y-4",
      enabled ? "border-primary/30" : "border-outline-variant/30",
    )}>
      {/* Header — toggle */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-semibold text-on-surface">
          <Tag className="h-4 w-4 text-primary" />
          Discount
        </span>
        <button
          type="button"
          disabled={!isActive || saving}
          onClick={() => { setEnabled((v) => !v); setError(null); }}
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
          {/* Percentage */}
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-on-surface">
              Discount Percentage <span className="text-red-500">*</span>
            </span>
            <div className="relative">
              <input
                type="number"
                min={1}
                max={99}
                step={1}
                disabled={saving}
                placeholder="e.g. 20"
                value={pct}
                onChange={(e) => { setPct(e.target.value); setError(null); }}
                className="w-full rounded-xl border border-outline-variant/40 bg-white py-2.5 pl-3 pr-10 text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-on-surface-variant">
                %
              </span>
            </div>
          </label>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-xs">
              <span className="flex items-center gap-1 font-medium text-on-surface-variant">
                <Calendar className="h-3 w-3" /> Start Date
                <span className="text-on-surface-variant/60">(optional)</span>
              </span>
              <input
                type="date"
                disabled={saving}
                value={startStr}
                onChange={(e) => { setStartStr(e.target.value); setError(null); }}
                className="rounded-xl border border-outline-variant/40 bg-white px-3 py-2 text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs">
              <span className="flex items-center gap-1 font-medium text-on-surface-variant">
                <Calendar className="h-3 w-3" /> End Date
                <span className="text-on-surface-variant/60">(optional)</span>
              </span>
              <input
                type="date"
                disabled={saving}
                value={endStr}
                onChange={(e) => { setEndStr(e.target.value); setError(null); }}
                className="rounded-xl border border-outline-variant/40 bg-white px-3 py-2 text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
              />
            </label>
          </div>

          {/* Live preview */}
          {numPct > 0 && (
            <div className={cn(
              "rounded-xl border px-4 py-3 space-y-1",
              previewPct > 0
                ? "border-green-200 bg-green-50"
                : "border-amber-200 bg-amber-50",
            )}>
              <div className="flex items-center justify-between">
                <span className="text-xs text-on-surface-variant">Original price</span>
                <span className="text-xs font-medium text-on-surface-variant line-through">
                  ₹{fmtPrice(sellingPrice)}
                </span>
              </div>
              {previewPct > 0 ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-green-700">Final price</span>
                    <span className="text-lg font-black text-green-700">₹{fmtPrice(finalPrice)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-green-600">Customer saves</span>
                    <span className="text-xs font-bold text-green-600">₹{fmtPrice(discountAmt)} ({numPct}% off)</span>
                  </div>
                </>
              ) : (
                <p className="text-xs text-amber-700 font-medium">
                  Discount is set but not active yet (check dates).
                </p>
              )}
            </div>
          )}

          {/* Status pill */}
          <p className={cn("text-xs font-semibold", status.color)}>
            Status: {status.label}
          </p>
        </>
      )}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
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
          "Save Discount"
        )}
      </button>
    </div>
  );
}
