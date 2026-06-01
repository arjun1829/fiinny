"use client";

import { useEffect, useState } from "react";
import {
  Tag, Search, Pencil, X, CheckCircle2, Clock,
  AlertCircle, PowerOff, Loader2, RefreshCw, Calendar,
} from "lucide-react";
import {
  fetchAllDiscounts,
  updateDiscountRecord,
  type AdminDiscountRow,
} from "../../dashboard/_lib/inventory-firestore";
import type { DiscountUpdateInput } from "../../dashboard/_types/inventory";
import { getActiveDiscountPct, calcDiscount, fmtPrice } from "../../utils/discount";
import { cn } from "../../dashboard/_lib/cn";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusOf(row: AdminDiscountRow): "active" | "scheduled" | "expired" | "disabled" {
  if (!row.discountEnabled || row.discountPct <= 0) return "disabled";
  const now = Date.now();
  const start = row.discountStartDate?.getTime() ?? 0;
  const end   = row.discountEndDate?.getTime()   ?? Infinity;
  if (now < start) return "scheduled";
  if (now > end)   return "expired";
  return "active";
}

const STATUS_META = {
  active:    { label: "Active",    icon: CheckCircle2, chip: "bg-green-100 text-green-700", dot: "bg-green-500" },
  scheduled: { label: "Scheduled", icon: Clock,        chip: "bg-amber-100 text-amber-700",  dot: "bg-amber-500" },
  expired:   { label: "Expired",   icon: AlertCircle,  chip: "bg-red-100   text-red-600",    dot: "bg-red-400"   },
  disabled:  { label: "Disabled",  icon: PowerOff,     chip: "bg-surface-container text-on-surface-variant", dot: "bg-outline-variant" },
} as const;

function toInputDate(d: Date | null) { return d ? d.toISOString().slice(0, 10) : ""; }
function fromInputDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ─── Edit Drawer ──────────────────────────────────────────────────────────────

function EditDrawer({ row, onClose, onSaved }: { row: AdminDiscountRow; onClose: () => void; onSaved: () => void }) {
  const [enabled,  setEnabled]  = useState(row.discountEnabled);
  const [pct,      setPct]      = useState(String(row.discountPct || ""));
  const [startStr, setStartStr] = useState(toInputDate(row.discountStartDate));
  const [endStr,   setEndStr]   = useState(toInputDate(row.discountEndDate));
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const numPct    = Number(pct) || 0;
  const startDate = fromInputDate(startStr);
  const endDate   = fromInputDate(endStr);

  const previewPct = getActiveDiscountPct({
    discountEnabled:   enabled,
    discountPct:       numPct,
    discountStartDate: startDate ? { toMillis: () => startDate.getTime() } : null,
    discountEndDate:   endDate   ? { toMillis: () => endDate.getTime() }   : null,
  });
  const { finalPrice, discountAmt } = calcDiscount(row.sellingPrice, previewPct);

  const handleSave = async () => {
    if (enabled) {
      if (numPct <= 0 || numPct > 99) { setError("Discount must be between 1% and 99%."); return; }
      if (startDate && endDate && endDate <= startDate) { setError("End date must be after start date."); return; }
    }
    setSaving(true); setError(null);
    try {
      const patch: DiscountUpdateInput = {
        discountEnabled:   enabled,
        discountPct:       enabled ? numPct : 0,
        discountStartDate: enabled ? startDate : null,
        discountEndDate:   enabled ? endDate   : null,
      };
      await updateDiscountRecord(row.inventoryId, row.productId, patch, null);
      onSaved(); onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally { setSaving(false); }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-outline-variant/30 px-6 py-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Tag className="h-4 w-4 text-primary" />
              </div>
              <h2 className="text-base font-bold text-on-surface">Edit Discount</h2>
            </div>
            <p className="text-sm font-medium text-on-surface truncate pl-10">{row.productName}</p>
            <p className="text-xs text-on-surface-variant pl-10">{row.ownerPhone} · <span className="capitalize">{row.ownerType}</span></p>
          </div>
          <button onClick={onClose} className="mt-0.5 shrink-0 rounded-xl p-2 hover:bg-surface-container text-on-surface-variant transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
          {error && (
            <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
              <p className="text-xs text-red-700 font-medium">{error}</p>
            </div>
          )}

          {/* Enable toggle */}
          <div className="flex items-center justify-between rounded-2xl border border-outline-variant/30 bg-surface-container-low px-4 py-3.5">
            <div>
              <p className="text-sm font-semibold text-on-surface">Discount Active</p>
              <p className="text-xs text-on-surface-variant mt-0.5">Turn off to hide discount from all customers</p>
            </div>
            <button
              type="button"
              onClick={() => { setEnabled(v => !v); setError(null); }}
              aria-label="Toggle discount"
              className={cn(
                "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
                enabled ? "bg-primary" : "bg-outline-variant/60",
              )}
            >
              <span className={cn(
                "inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform",
                enabled ? "translate-x-6" : "translate-x-1",
              )} />
            </button>
          </div>

          {enabled && (
            <>
              {/* Percentage */}
              <div className="space-y-2">
                <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant">
                  Discount Percentage <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number" min={1} max={99} step={1}
                    value={pct}
                    onChange={(e) => { setPct(e.target.value); setError(null); }}
                    placeholder="e.g. 15"
                    className="w-full rounded-2xl border border-outline-variant bg-surface-container-low px-4 py-3 pr-10 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-black text-on-surface-variant">%</span>
                </div>
                {numPct >= 90 && (
                  <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
                    <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                    <p className="text-xs font-semibold text-red-700">Very high discount ({numPct}%) — double-check before saving.</p>
                  </div>
                )}
                {numPct >= 50 && numPct < 90 && (
                  <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                    <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                    <p className="text-xs font-semibold text-amber-700">High discount — confirm this is intentional.</p>
                  </div>
                )}
              </div>

              {/* Date range */}
              <div className="space-y-2">
                <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant">
                  Active Period <span className="text-on-surface-variant/50">(optional)</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold text-on-surface-variant">Start Date</p>
                    <div className="relative">
                      <Calendar className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-on-surface-variant" />
                      <input type="date" value={startStr}
                        onChange={(e) => { setStartStr(e.target.value); setError(null); }}
                        className="w-full rounded-2xl border border-outline-variant bg-surface-container-low pl-9 pr-3 py-3 text-xs text-on-surface focus:border-primary focus:outline-none" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold text-on-surface-variant">End Date</p>
                    <div className="relative">
                      <Calendar className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-on-surface-variant" />
                      <input type="date" value={endStr}
                        onChange={(e) => { setEndStr(e.target.value); setError(null); }}
                        className="w-full rounded-2xl border border-outline-variant bg-surface-container-low pl-9 pr-3 py-3 text-xs text-on-surface focus:border-primary focus:outline-none" />
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-on-surface-variant">Leave blank for immediate start / no expiry.</p>
              </div>

              {/* Live preview */}
              {numPct > 0 && (
                <div className={cn(
                  "rounded-2xl border p-4 space-y-3",
                  previewPct > 0 ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50",
                )}>
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                    {previewPct > 0 ? "Live Preview" : "Preview (not active yet)"}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-on-surface-variant">Original price</span>
                    <span className="text-xs font-medium text-on-surface-variant line-through">₹{fmtPrice(row.sellingPrice)}</span>
                  </div>
                  {previewPct > 0 ? (
                    <>
                      <div className="flex items-center justify-between border-t border-green-200 pt-3">
                        <span className="text-sm font-bold text-green-700">Final price</span>
                        <span className="text-xl font-black text-green-700">₹{fmtPrice(finalPrice)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-green-600">Customer saves</span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-600 px-2.5 py-0.5 text-[10px] font-black text-white">
                          <Tag className="h-2.5 w-2.5" />
                          ₹{fmtPrice(discountAmt)} · {numPct}% OFF
                        </span>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs font-medium text-amber-700">Discount is set but not in active date range yet.</p>
                  )}
                </div>
              )}
            </>
          )}

          {!enabled && (
            <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low px-4 py-4">
              <p className="text-sm font-medium text-on-surface-variant">
                Discount is disabled. No badge or savings will be shown to customers for this product.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t border-outline-variant/30 px-6 py-4">
          <button onClick={onClose}
            className="flex-1 rounded-2xl border border-outline-variant/40 py-3 text-sm font-bold text-on-surface-variant hover:bg-surface-container transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 rounded-2xl bg-primary py-3 text-sm font-bold text-white hover:opacity-95 disabled:opacity-50 flex items-center justify-center gap-2 transition-all">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : "Save Changes"}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function AdminDiscountsPage() {
  const [rows,    setRows]    = useState<AdminDiscountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");
  const [filter,  setFilter]  = useState<"all" | "active" | "scheduled" | "expired" | "disabled">("all");
  const [editing, setEditing] = useState<AdminDiscountRow | null>(null);

  const load = async () => {
    setLoading(true);
    try { setRows(await fetchAllDiscounts()); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const counts = {
    all:       rows.length,
    active:    rows.filter(r => statusOf(r) === "active").length,
    scheduled: rows.filter(r => statusOf(r) === "scheduled").length,
    expired:   rows.filter(r => statusOf(r) === "expired").length,
    disabled:  rows.filter(r => statusOf(r) === "disabled").length,
  };

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch = !q || r.productName.toLowerCase().includes(q) || r.ownerPhone.includes(q);
    return matchSearch && (filter === "all" || statusOf(r) === filter);
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">

      {/* ── Page header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
            <Tag className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-black text-on-surface">Discount Manager</h1>
            <p className="text-xs text-on-surface-variant mt-0.5">
              View and edit discounts set by any seller. Fix mistakes or set offers on their behalf.
            </p>
          </div>
        </div>
        <button
          onClick={load} disabled={loading}
          className="inline-flex items-center gap-2 self-start sm:self-auto rounded-xl border border-outline-variant/40 bg-white px-4 py-2.5 text-sm font-bold text-on-surface hover:bg-surface-container disabled:opacity-50 transition-colors shrink-0"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* ── Summary cards + Search row ── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* Stat cards — clickable filters */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:flex-1">
          {(["active", "scheduled", "expired", "disabled"] as const).map((key) => {
            const meta = STATUS_META[key];
            const Icon = meta.icon;
            const isSelected = filter === key;
            return (
              <button
                key={key}
                onClick={() => setFilter(isSelected ? "all" : key)}
                className={cn(
                  "flex flex-col gap-3 rounded-2xl border p-4 text-left transition-all",
                  isSelected
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-outline-variant/30 bg-white hover:border-outline-variant hover:shadow-sm",
                )}
              >
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black self-start", meta.chip)}>
                  <Icon className="h-3 w-3 shrink-0" />
                  {meta.label}
                </span>
                <p className="text-3xl font-black text-on-surface tabular-nums">{counts[key]}</p>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 rounded-2xl border border-outline-variant/40 bg-white px-4 py-3 lg:w-72">
          <Search className="h-4 w-4 text-outline shrink-0" />
          <input
            type="text"
            placeholder="Product name or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm text-on-surface placeholder-on-surface-variant outline-none min-w-0"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-on-surface-variant hover:text-on-surface shrink-0">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Filter tabs ── */}
      <div className="flex gap-2 overflow-x-auto pb-0.5">
        {(["all", "active", "scheduled", "expired", "disabled"] as const).map((key) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn(
              "shrink-0 rounded-xl px-4 py-2 text-xs font-bold transition-all",
              filter === key
                ? "bg-primary text-white shadow-sm"
                : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high",
            )}
          >
            {key === "all" ? `All  ${counts.all}` : `${STATUS_META[key].label}  ${counts[key]}`}
          </button>
        ))}
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div className="flex h-48 items-center justify-center rounded-2xl border border-outline-variant/30 bg-white">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-white">

          {/* Table header count */}
          <div className="flex items-center justify-between border-b border-outline-variant/20 bg-surface-container-low px-5 py-3">
            <span className="text-xs font-bold text-on-surface-variant">
              Showing {filtered.length} of {rows.length} discount{rows.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full text-sm">
              <thead className="border-b border-outline-variant/20 bg-surface-container-low/60">
                <tr>
                  <th className="px-5 py-3.5 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Product &amp; Seller</th>
                  <th className="px-5 py-3.5 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant whitespace-nowrap">Discount</th>
                  <th className="px-5 py-3.5 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant whitespace-nowrap">Original</th>
                  <th className="px-5 py-3.5 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant whitespace-nowrap">Final Price</th>
                  <th className="px-5 py-3.5 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant whitespace-nowrap">Valid Period</th>
                  <th className="px-5 py-3.5 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Status</th>
                  <th className="px-5 py-3.5 text-right text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {filtered.map((r) => {
                  const s = statusOf(r);
                  const meta = STATUS_META[s];
                  const Icon = meta.icon;
                  const { finalPrice } = calcDiscount(r.sellingPrice, r.effectiveDiscountPct);
                  const isActive = s === "active";

                  return (
                    <tr key={r.inventoryId} className="hover:bg-surface-container-low/40 transition-colors">

                      {/* Product + Seller */}
                      <td className="px-5 py-4 max-w-[220px]">
                        <p className="font-semibold text-on-surface truncate">{r.productName}</p>
                        <p className="text-xs text-on-surface-variant mt-0.5 truncate">
                          <span className="capitalize">{r.ownerType}</span>
                          <span className="mx-1.5 text-outline-variant">·</span>
                          {r.ownerPhone}
                        </p>
                      </td>

                      {/* Discount % */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-black",
                          isActive ? "bg-green-100 text-green-700" : "bg-surface-container text-on-surface-variant",
                        )}>
                          <Tag className="h-3 w-3 shrink-0" />
                          {r.discountPct}% OFF
                        </span>
                      </td>

                      {/* Original price */}
                      <td className="px-5 py-4 whitespace-nowrap text-sm text-on-surface-variant">
                        ₹{fmtPrice(r.sellingPrice)}
                      </td>

                      {/* Final price */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        {isActive ? (
                          <span className="text-sm font-bold text-green-700">₹{fmtPrice(finalPrice)}</span>
                        ) : (
                          <span className="text-sm text-on-surface-variant/50">—</span>
                        )}
                      </td>

                      {/* Dates */}
                      <td className="px-5 py-4 whitespace-nowrap text-xs text-on-surface-variant">
                        {r.discountStartDate || r.discountEndDate ? (
                          <>
                            <span>{r.discountStartDate ? r.discountStartDate.toLocaleDateString("en-IN") : "Now"}</span>
                            <span className="mx-1 text-outline-variant">→</span>
                            <span>{r.discountEndDate ? r.discountEndDate.toLocaleDateString("en-IN") : "No expiry"}</span>
                          </>
                        ) : (
                          <span className="text-on-surface-variant/50">Always</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", meta.chip)}>
                          <Icon className="h-3 w-3 shrink-0" />
                          {meta.label}
                        </span>
                      </td>

                      {/* Edit */}
                      <td className="px-5 py-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => setEditing(r)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-white px-3 py-1.5 text-xs font-semibold text-on-surface hover:border-primary hover:text-primary hover:bg-primary/5 transition-all"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-16 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Tag className="h-8 w-8 text-on-surface-variant/30" />
                        <p className="text-sm font-medium text-on-surface-variant">
                          {rows.length === 0 ? "No discounts configured yet by any seller." : "No discounts match your current filter."}
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="divide-y divide-outline-variant/10 md:hidden">
            {filtered.map((r) => {
              const s = statusOf(r);
              const meta = STATUS_META[s];
              const Icon = meta.icon;
              const { finalPrice } = calcDiscount(r.sellingPrice, r.effectiveDiscountPct);
              const isActive = s === "active";

              return (
                <div key={r.inventoryId} className="px-4 py-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-on-surface truncate">{r.productName}</p>
                      <p className="text-xs text-on-surface-variant mt-0.5 capitalize">{r.ownerType} · {r.ownerPhone}</p>
                    </div>
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0", meta.chip)}>
                      <Icon className="h-3 w-3" />{meta.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-black text-green-700">
                      <Tag className="h-3 w-3" />{r.discountPct}% OFF
                    </span>
                    <span className="text-sm text-on-surface-variant line-through">₹{fmtPrice(r.sellingPrice)}</span>
                    {isActive && <span className="text-sm font-bold text-green-700">→ ₹{fmtPrice(finalPrice)}</span>}
                  </div>
                  {(r.discountStartDate || r.discountEndDate) && (
                    <p className="text-xs text-on-surface-variant">
                      {r.discountStartDate ? r.discountStartDate.toLocaleDateString("en-IN") : "Immediately"}
                      {" → "}
                      {r.discountEndDate ? r.discountEndDate.toLocaleDateString("en-IN") : "No expiry"}
                    </p>
                  )}
                  <button
                    onClick={() => setEditing(r)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-white px-3 py-2 text-xs font-semibold text-on-surface hover:border-primary hover:text-primary transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit Discount
                  </button>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-16">
                <Tag className="h-8 w-8 text-on-surface-variant/30" />
                <p className="text-sm text-on-surface-variant">
                  {rows.length === 0 ? "No discounts configured yet." : "No discounts match your filter."}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {editing && (
        <EditDrawer
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}
