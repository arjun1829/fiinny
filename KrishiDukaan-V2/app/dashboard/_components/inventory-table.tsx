"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, CheckCircle2, Loader2, Pencil, Power, PowerOff, Save, Tag, Trash2,
} from "lucide-react";
import type { InventoryRow, StockStatus } from "../_types/inventory";
import { deriveStockStatus, stockStatusLabel } from "../_types/inventory";
import { updateInventoryRecord, acceptAssignedProduct } from "../_lib/inventory-firestore";
import { cn } from "../_lib/cn";
import { useI18n } from "../../i18n/I18nContext";
import { EditProductModal } from "./edit-product-modal";
import { DiscountPanel } from "./discount-panel";

// ─── Types ──────────────────────────────────────────────────────────────────

type Role = "manufacturer" | "retailer";

type InventoryTableProps = {
  rows: InventoryRow[];
  role: Role;
  userId?: string;
  disabled?: boolean;
  onUpdated: () => Promise<void> | void;
  /** Activate/deactivate an OWN product (seat-aware). */
  onToggleActive?: (productId: string, inventoryId: string, isActive: boolean) => Promise<void>;
  /** Hard-delete an OWN product. */
  onDelete?: (productId: string, inventoryId: string) => Promise<void>;
};

type RowDraft = { stockQuantity: number; sellingPrice: number };

// ─── Style helpers ──────────────────────────────────────────────────────────

function statusStyles(status: StockStatus): string {
  switch (status) {
    case "out_of_stock": return "bg-harvest/15 text-harvest";
    case "low_stock":    return "bg-secondary-container/80 text-on-secondary-container";
    default:             return "bg-primary/10 text-primary";
  }
}

function sourceLabel(row: InventoryRow): string {
  if (row.assignedByManufacturer || row.source === "manufacturer_assigned") {
    return "Manufacturer Assigned";
  }
  return "Own Catalogue";
}

function sourceCls(row: InventoryRow): string {
  return row.assignedByManufacturer || row.source === "manufacturer_assigned"
    ? "bg-on-surface/8 text-on-surface-variant"
    : "bg-primary/10 text-primary";
}

// ─── Variant chips ──────────────────────────────────────────────────────────

function VariantChips({ variants }: { variants: InventoryRow["variants"] }) {
  if (!variants || variants.length <= 1) {
    return <span className="text-on-surface-variant text-xs">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1 max-w-[180px]">
      {variants.slice(0, 3).map((v, i) => (
        <span key={i} className="rounded-full bg-surface-container px-2 py-0.5 text-[10px] font-medium text-on-surface-variant">
          {v.unit} · ₹{v.price}
        </span>
      ))}
      {variants.length > 3 && (
        <span className="rounded-full bg-surface-container px-2 py-0.5 text-[10px] text-on-surface-variant">
          +{variants.length - 3}
        </span>
      )}
    </div>
  );
}

// ─── Status / Accept cell ───────────────────────────────────────────────────

function StatusCell({
  row, userId, onToggleActive, onUpdated,
}: {
  row: InventoryRow;
  userId?: string;
  onToggleActive?: (productId: string, inventoryId: string, isActive: boolean) => Promise<void>;
  onUpdated: () => Promise<void> | void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // A row is "pending acceptance" when it's assigned but not yet owned by the caller.
  const isPending = !!userId && row.assignedByManufacturer && row.ownerId !== userId;

  const handleAccept = async () => {
    if (!userId || !row.inventoryId) return;
    setBusy(true); setErr(null);
    try {
      await acceptAssignedProduct(row.productId, row.inventoryId, userId);
      await onUpdated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to accept.");
    } finally {
      setBusy(false);
    }
  };

  const handleToggle = async () => {
    if (!onToggleActive || !row.inventoryId) return;
    setBusy(true); setErr(null);
    try {
      await onToggleActive(row.productId, row.inventoryId, row.isActive);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  };

  if (isPending) {
    return (
      <div className="flex flex-col gap-0.5">
        <button
          type="button" onClick={handleAccept} disabled={busy}
          className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:opacity-95 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          {busy ? "Accepting…" : "Accept"}
        </button>
        {err && <p className="text-[10px] text-red-600 max-w-[120px]">{err}</p>}
      </div>
    );
  }

  // Assigned-but-accepted products can't be activated/deactivated by the retailer
  // (the manufacturer controls the listing). Show a static badge.
  if (row.assignedByManufacturer || !onToggleActive) {
    return (
      <span className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
        row.isActive ? "bg-primary/10 text-primary" : "bg-surface-container text-on-surface-variant",
      )}>
        {row.isActive ? t('statusActive') : t('statusInactive')}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button" onClick={handleToggle} disabled={busy}
        title={row.isActive ? t('toggleDeactivate') : t('toggleActivate')}
        className={cn(
          "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-all disabled:opacity-50 w-fit",
          row.isActive
            ? "bg-primary/10 text-primary hover:bg-red-50 hover:text-red-600"
            : "bg-surface-container text-on-surface-variant hover:bg-primary/10 hover:text-primary",
        )}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : row.isActive ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
        {row.isActive ? t('statusActive') : t('statusInactive')}
      </button>
      {err && <p className="text-[10px] text-red-600 max-w-[120px]">{err}</p>}
    </div>
  );
}

// ─── Actions cell ───────────────────────────────────────────────────────────

function ActionsCell({
  row, dirty, saving, onSave, onEdit, onToggleDiscount, onDelete,
}: {
  row: InventoryRow;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onEdit: () => void;
  onToggleDiscount: () => void;
  onDelete?: (productId: string, inventoryId: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Retailers cannot edit/delete/discount a manufacturer-assigned product —
  // they only control their own stock/price (inline) for it.
  const isOwn = !row.assignedByManufacturer;

  const handleDelete = async () => {
    if (!onDelete || !row.inventoryId) return;
    setDeleting(true); setErr(null);
    try {
      await onDelete(row.productId, row.inventoryId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed.");
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="flex flex-col gap-1 min-w-[150px]">
      {err && <p className="text-[10px] text-red-600">{err}</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        {dirty && (
          <button
            type="button" onClick={onSave} disabled={saving}
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {t('saveBtn')}
          </button>
        )}

        {isOwn && (
          <button
            type="button" onClick={onEdit}
            className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/40 bg-white px-2.5 py-1.5 text-xs font-semibold text-on-surface hover:border-primary hover:text-primary hover:bg-primary/5 transition-all"
          >
            <Pencil className="h-3 w-3" /> {t('editBtn')}
          </button>
        )}

        {isOwn && (
          <button
            type="button" onClick={onToggleDiscount}
            className={cn(
              "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all",
              row.effectiveDiscountPct > 0
                ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100"
                : "border-outline-variant/40 bg-white text-on-surface-variant hover:border-primary/40 hover:text-primary hover:bg-primary/5",
            )}
          >
            <Tag className="h-3 w-3" />
            {row.effectiveDiscountPct > 0 ? `${row.effectiveDiscountPct}% OFF` : "Discount"}
          </button>
        )}

        {isOwn && onDelete && (
          confirmDelete ? (
            <div className="flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-2 py-1">
              <AlertTriangle className="h-3.5 w-3.5 text-red-600 shrink-0" />
              <span className="text-xs font-medium text-red-700">Delete?</span>
              <button
                type="button" disabled={deleting} onClick={handleDelete}
                className="rounded-lg bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60 inline-flex items-center gap-1"
              >
                {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                {deleting ? "…" : "Confirm"}
              </button>
              <button type="button" disabled={deleting} onClick={() => setConfirmDelete(false)} className="text-xs font-medium text-red-600 px-1 hover:underline">
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button" onClick={() => setConfirmDelete(true)} disabled={deleting}
              className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/40 px-2 py-1.5 text-xs font-medium text-on-surface-variant hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          )
        )}
      </div>
    </div>
  );
}

// ─── Shared Inventory Table ─────────────────────────────────────────────────

export function InventoryTable({
  rows, role, userId, disabled, onUpdated, onToggleActive, onDelete,
}: InventoryTableProps) {
  const { t } = useI18n();
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<InventoryRow | null>(null);
  const [discountId, setDiscountId] = useState<string | null>(null);

  // Reset inline drafts whenever the rows change.
  useEffect(() => {
    const next: Record<string, RowDraft> = {};
    rows.forEach((r) => {
      if (r.inventoryId) {
        next[r.inventoryId] = { stockQuantity: r.stockQuantity, sellingPrice: r.sellingPrice };
      }
    });
    setDrafts(next);
  }, [rows]);

  const setDraft = (inventoryId: string, patch: Partial<RowDraft>) =>
    setDrafts((prev) => ({ ...prev, [inventoryId]: { ...prev[inventoryId], ...patch } }));

  const rowDirty = useMemo(() => {
    const dirty: Record<string, boolean> = {};
    rows.forEach((r) => {
      const d = drafts[r.inventoryId];
      dirty[r.inventoryId] = !!d && (d.stockQuantity !== r.stockQuantity || d.sellingPrice !== r.sellingPrice);
    });
    return dirty;
  }, [rows, drafts]);

  const handleSaveRow = async (row: InventoryRow) => {
    const d = drafts[row.inventoryId];
    if (!d || !row.inventoryId) return;
    setSavingId(row.inventoryId);
    setError(null);
    try {
      // Preserve the existing reorder threshold — it isn't edited inline.
      await updateInventoryRecord(row.inventoryId, {
        stockQuantity: Math.max(0, Math.floor(d.stockQuantity)),
        sellingPrice: Math.max(0, d.sellingPrice),
        reorderThreshold: Math.max(0, Math.floor(row.reorderThreshold)),
      });
      await onUpdated();
      setSavedId(row.inventoryId);
      setTimeout(() => setSavedId((p) => (p === row.inventoryId ? null : p)), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update inventory.");
    } finally {
      setSavingId(null);
    }
  };

  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-dashed border-outline-variant/50 bg-surface-container-low/50 px-4 py-12 text-center text-sm text-on-surface-variant">
        {role === "manufacturer" ? t('noCatalogueYet') : "No inventory yet. Add a product or wait for a manufacturer to assign one."}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-ambient">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-outline-variant/30 bg-surface-container-low text-on-surface-variant">
              <tr>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">{t('catProductName')}</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">{t('catCategory')}</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">{t('catVariants')}</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">{t('catStock')}</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">{t('catPriceCol')}</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">{t('catSource')}</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">{t('catStatus')}</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">{t('catLastUpdated')}</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">{t('catActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {rows.map((r) => {
                const d = drafts[r.inventoryId];
                const stock = d?.stockQuantity ?? r.stockQuantity;
                const status = deriveStockStatus(Number.isFinite(stock) ? stock : 0, r.reorderThreshold);
                const isInactive = !r.isActive;
                const canEditInline = !!r.inventoryId && !isInactive && !disabled;
                const updatedLabel = r.updatedAt
                  ? r.updatedAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
                  : "—";

                return (
                  <tr key={r.productId} className={cn("hover:bg-surface-container/60 transition-colors", isInactive && "opacity-60")}>
                    {/* Product */}
                    <td className="px-3 py-3 md:px-4">
                      <div className="flex items-center gap-2.5">
                        {r.image ? (
                          <img src={r.image} alt="" className="h-9 w-9 rounded-lg object-cover flex-shrink-0 border border-outline-variant/20"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        ) : (
                          <div className="h-9 w-9 rounded-lg bg-surface-container flex-shrink-0 flex items-center justify-center text-on-surface-variant/30 text-xs">?</div>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold text-on-surface leading-tight">{r.productName}</p>
                          {r.variants && r.variants.length > 1 && (
                            <p className="text-[10px] text-primary font-semibold mt-0.5">{r.variants.length} variants</p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="px-3 py-3 text-on-surface-variant md:px-4">
                      <span className="block">{r.category}</span>
                      <span className="text-xs text-on-surface-variant/70">{r.unit}</span>
                    </td>

                    {/* Variants */}
                    <td className="px-3 py-3 md:px-4"><VariantChips variants={r.variants} /></td>

                    {/* Stock (inline editable) + status badge */}
                    <td className="px-3 py-3 md:px-4">
                      <div className="flex flex-col gap-1">
                        <input
                          type="number" min={0} step={1}
                          disabled={!canEditInline || savingId === r.inventoryId}
                          className="w-20 rounded-lg border border-outline-variant/40 bg-surface-container-low px-2 py-1.5 tabular-nums text-on-surface outline-none ring-primary/30 focus:ring-2 disabled:opacity-50"
                          value={d != null ? d.stockQuantity : r.stockQuantity}
                          onChange={(e) => setDraft(r.inventoryId, { stockQuantity: e.target.value === "" ? 0 : Number(e.target.value) })}
                        />
                        <span className={cn(
                          "inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          isInactive ? "bg-surface-container text-on-surface-variant" : statusStyles(status),
                        )}>
                          {isInactive ? "Inactive" : stockStatusLabel(status)}
                        </span>
                      </div>
                    </td>

                    {/* Price (inline editable) + discount badge */}
                    <td className="px-3 py-3 md:px-4">
                      <div className="flex flex-col gap-1">
                        <input
                          type="number" min={0} step={0.01}
                          disabled={!canEditInline || savingId === r.inventoryId}
                          className="w-24 rounded-lg border border-outline-variant/40 bg-surface-container-low px-2 py-1.5 tabular-nums text-on-surface outline-none ring-primary/30 focus:ring-2 disabled:opacity-50"
                          value={d != null ? d.sellingPrice : r.sellingPrice}
                          onChange={(e) => setDraft(r.inventoryId, { sellingPrice: e.target.value === "" ? 0 : Number(e.target.value) })}
                        />
                        {r.effectiveDiscountPct > 0 ? (
                          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">
                            <Tag className="h-2.5 w-2.5" /> {r.effectiveDiscountPct}% OFF
                          </span>
                        ) : r.discountEnabled && r.discountPct > 0 ? (
                          <span className="inline-flex w-fit rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                            {r.discountPct}% (inactive)
                          </span>
                        ) : null}
                      </div>
                    </td>

                    {/* Source */}
                    <td className="px-3 py-3 md:px-4">
                      <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", sourceCls(r))}>
                        {sourceLabel(r)}
                      </span>
                    </td>

                    {/* Status / Accept */}
                    <td className="px-3 py-3 md:px-4">
                      <StatusCell row={r} userId={userId} onToggleActive={onToggleActive} onUpdated={onUpdated} />
                    </td>

                    {/* Updated */}
                    <td className="whitespace-nowrap px-3 py-3 text-on-surface-variant md:px-4 text-xs">{updatedLabel}</td>

                    {/* Actions */}
                    <td className="px-3 py-3 md:px-4">
                      <ActionsCell
                        row={r}
                        dirty={!!rowDirty[r.inventoryId]}
                        saving={savingId === r.inventoryId}
                        onSave={() => handleSaveRow(r)}
                        onEdit={() => setEditing(r)}
                        onToggleDiscount={() => setDiscountId((prev) => (prev === r.productId ? null : r.productId))}
                        onDelete={onDelete}
                      />
                      {savedId === r.inventoryId && (
                        <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Saved
                        </span>
                      )}
                      {/* Inline discount panel */}
                      {discountId === r.productId && !r.assignedByManufacturer && (
                        r.inventoryId ? (
                          <div className="mt-2 w-72">
                            <DiscountPanel
                              inventoryId={r.inventoryId}
                              productId={r.productId}
                              originalProductId={r.originalProductId}
                              sellingPrice={r.sellingPrice}
                              discountEnabled={r.discountEnabled}
                              discountPct={r.discountPct}
                              discountStartDate={r.discountStartDate}
                              discountEndDate={r.discountEndDate}
                              isActive={r.isActive}
                              onSaved={async () => { setDiscountId(null); await onUpdated(); }}
                            />
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-on-surface-variant max-w-[200px]">
                            No inventory record yet — add stock first to enable discounts.
                          </p>
                        )
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-on-surface-variant">
        Edit stock and price inline, then Save. Use Edit for full product details and variants.
        Inactive products are hidden from the marketplace and do not consume a seat.
      </p>

      {editing && (
        <EditProductModal
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { void onUpdated(); setEditing(null); }}
        />
      )}
    </div>
  );
}
