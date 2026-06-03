"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Power, PowerOff, Save, Tag, Trash2 } from "lucide-react";
import type { InventoryRow, StockStatus } from "../_types/inventory";
import { deriveStockStatus, stockStatusLabel } from "../_types/inventory";
import { updateInventoryRecord, acceptAssignedProduct } from "../_lib/inventory-firestore";
import { cn } from "../_lib/cn";
import { useI18n } from "../../i18n/I18nContext";
import { DiscountPanel } from "./discount-panel";

type RowDraft = {
  stockQuantity: number;
  sellingPrice: number;
  reorderThreshold: number;
};

function statusStyles(status: StockStatus): string {
  switch (status) {
    case "out_of_stock":
      return "bg-harvest/15 text-harvest";
    case "low_stock":
      return "bg-secondary-container/80 text-on-secondary-container";
    default:
      return "bg-primary/10 text-primary";
  }
}

type InventoryManagementTableProps = {
  rows: InventoryRow[];
  disabled?: boolean;
  userId?: string;
  onUpdated: () => Promise<void>;
  onToggleActive?: (productId: string, inventoryId: string, isActive: boolean) => Promise<void>;
  onDelete?: (productId: string, inventoryId: string) => Promise<void>;
};

function RowActions({
  row,
  userId,
  onToggleActive,
  onDelete,
  onUpdated,
}: {
  row: InventoryRow;
  userId?: string;
  onToggleActive?: (productId: string, inventoryId: string, isActive: boolean) => Promise<void>;
  onDelete?: (productId: string, inventoryId: string) => Promise<void>;
  onUpdated: () => Promise<void>;
}) {
  const [toggling, setToggling] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const [discountOpen, setDiscountOpen] = useState(false);

  const isPending = userId && row.ownerId !== userId;

  const handleAccept = async () => {
    if (!userId) return;
    setAccepting(true);
    setRowError(null);
    try {
      await acceptAssignedProduct(row.productId, row.inventoryId, userId);
      await onUpdated();
    } catch (e) {
      setRowError(e instanceof Error ? e.message : "Failed to accept.");
    } finally {
      setAccepting(false);
    }
  };

  const handleToggle = async () => {
    if (!onToggleActive) return;
    setToggling(true);
    setRowError(null);
    try {
      await onToggleActive(row.productId, row.inventoryId, row.isActive);
    } catch (e) {
      setRowError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setToggling(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    setRowError(null);
    try {
      await onDelete(row.productId, row.inventoryId);
    } catch (e) {
      setRowError(e instanceof Error ? e.message : "Failed.");
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="flex flex-col gap-1 min-w-[140px]">
      {rowError ? <p className="text-[10px] text-red-600">{rowError}</p> : null}
      <div className="flex flex-wrap items-center gap-1">
        {isPending ? (
          <button
            type="button"
            onClick={handleAccept}
            disabled={accepting}
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:opacity-95 disabled:opacity-50"
          >
            {accepting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            {accepting ? "Accepting…" : "Accept Product"}
          </button>
        ) : (
          <>
            {onToggleActive && !row.assignedByManufacturer ? (
              <button
                type="button"
                onClick={handleToggle}
                disabled={toggling || deleting}
                title={row.isActive ? "Deactivate (frees seat)" : "Activate (consumes seat)"}
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50",
                  row.isActive
                    ? "border-harvest/40 text-harvest hover:bg-harvest/10"
                    : "border-primary/40 text-primary hover:bg-primary/10",
                )}
              >
                {toggling ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : row.isActive ? (
                  <PowerOff className="h-3.5 w-3.5" />
                ) : (
                  <Power className="h-3.5 w-3.5" />
                )}
                {row.isActive ? "Deactivate" : "Activate"}
              </button>
            ) : null}

            {/* Discount button — available for all own products */}
            {!row.assignedByManufacturer ? (
              <button
                type="button"
                onClick={() => setDiscountOpen((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition-colors",
                  row.effectiveDiscountPct > 0
                    ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100"
                    : "border-outline-variant/40 text-on-surface-variant hover:border-primary/40 hover:text-primary",
                )}
              >
                <Tag className="h-3.5 w-3.5" />
                {row.effectiveDiscountPct > 0 ? `${row.effectiveDiscountPct}% OFF` : "Discount"}
              </button>
            ) : null}

            {onDelete && !row.assignedByManufacturer ? (
              confirmDelete ? (
                <div className="flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-2 py-1">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-600 shrink-0" />
                  <span className="text-xs font-medium text-red-700">Delete?</span>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={handleDelete}
                    className="rounded-lg bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60 inline-flex items-center gap-1"
                  >
                    {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    {deleting ? "Deleting…" : "Confirm"}
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => setConfirmDelete(false)}
                    className="text-xs font-medium text-red-600 px-1 hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  disabled={toggling || deleting}
                  className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/40 px-2 py-1 text-xs font-medium text-on-surface-variant hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              )
            ) : null}
          </>
        )}
      </div>

      {/* Inline discount panel */}
      {discountOpen && !row.assignedByManufacturer && (
        <div className="mt-2 w-72">
          <DiscountPanel
            inventoryId={row.inventoryId}
            productId={row.productId}
            originalProductId={row.originalProductId}
            sellingPrice={row.sellingPrice}
            discountEnabled={row.discountEnabled}
            discountPct={row.discountPct}
            discountStartDate={row.discountStartDate}
            discountEndDate={row.discountEndDate}
            isActive={row.isActive}
            onSaved={async () => {
              setDiscountOpen(false);
              await onUpdated();
            }}
          />
        </div>
      )}
    </div>
  );
}

export function InventoryManagementTable({
  rows,
  disabled,
  userId,
  onUpdated,
  onToggleActive,
  onDelete,
}: InventoryManagementTableProps) {
  const { t } = useI18n();
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const next: Record<string, RowDraft> = {};
    rows.forEach((r) => {
      next[r.inventoryId] = {
        stockQuantity: r.stockQuantity,
        sellingPrice: r.sellingPrice,
        reorderThreshold: r.reorderThreshold,
      };
    });
    setDrafts(next);
  }, [rows]);

  const hasRows = rows.length > 0;
  const hasActions = !!(onToggleActive || onDelete);

  const setDraft = (inventoryId: string, patch: Partial<RowDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [inventoryId]: { ...prev[inventoryId], ...patch },
    }));
  };

  const handleSaveRow = async (inventoryId: string) => {
    const d = drafts[inventoryId];
    if (!d) return;
    setSavingId(inventoryId);
    setError(null);
    try {
      await updateInventoryRecord(inventoryId, {
        stockQuantity: Math.max(0, Math.floor(d.stockQuantity)),
        sellingPrice: Math.max(0, d.sellingPrice),
        reorderThreshold: Math.max(0, Math.floor(d.reorderThreshold)),
      });
      await onUpdated();
      setSavedId(inventoryId);
      setTimeout(() => setSavedId((prev) => (prev === inventoryId ? null : prev)), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update inventory.");
    } finally {
      setSavingId(null);
    }
  };

  const rowDirty = useMemo(() => {
    const dirty: Record<string, boolean> = {};
    rows.forEach((r) => {
      const d = drafts[r.inventoryId];
      if (!d) { dirty[r.inventoryId] = false; return; }
      dirty[r.inventoryId] =
        d.stockQuantity !== r.stockQuantity ||
        d.sellingPrice !== r.sellingPrice ||
        d.reorderThreshold !== r.reorderThreshold;
    });
    return dirty;
  }, [rows, drafts]);

  if (!hasRows) {
    return (
      <div className="rounded-2xl border border-dashed border-outline-variant/50 bg-surface-container-low/50 px-4 py-12 text-center text-sm text-on-surface-variant">
        No inventory yet. Wait for a manufacturer to assign products to your store.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-ambient">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-outline-variant/30 bg-surface-container-low text-on-surface-variant">
              <tr>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">Product</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">Listing</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">Stock Qty</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">Selling Price</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">Reorder At</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">Stock Status</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">Discount</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">Updated</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">Save</th>
                {hasActions ? (
                  <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">Actions</th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {rows.map((r) => {
                const d = drafts[r.inventoryId];
                const stock = d?.stockQuantity ?? r.stockQuantity;
                const reorder = d?.reorderThreshold ?? r.reorderThreshold;
                const status = deriveStockStatus(
                  Number.isFinite(stock) ? stock : 0,
                  Number.isFinite(reorder) ? reorder : 0,
                );
                const updatedLabel = r.updatedAt
                  ? r.updatedAt.toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                  : "—";
                const isInactive = !r.isActive;

                return (
                  <tr
                    key={r.inventoryId}
                    className={cn(
                      "hover:bg-surface-container/60",
                      isInactive && "opacity-60",
                    )}
                  >
                    <td className="px-3 py-3 md:px-4">
                      <p className="font-medium text-on-surface">{r.productName}</p>
                      <p className="text-xs text-on-surface-variant">{r.category} · {r.unit}</p>
                      {r.variants && r.variants.length > 1 && (
                        <p className="text-[10px] text-primary font-semibold mt-0.5">
                          {r.variants.length} variants
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3 md:px-4">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
                          r.isActive
                            ? r.assignedByManufacturer
                              ? "bg-on-surface/8 text-on-surface-variant"
                              : "bg-primary/10 text-primary"
                            : "bg-surface-container text-on-surface-variant",
                        )}
                      >
                        {r.isActive
                          ? r.assignedByManufacturer
                            ? "Assigned · Active"
                            : "Own Product · Active"
                          : r.assignedByManufacturer
                            ? "Assigned · Inactive"
                            : "Own Product · Inactive"}
                      </span>
                    </td>
                    <td className="px-3 py-3 md:px-4">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        disabled={disabled || savingId === r.inventoryId || isInactive}
                        className="w-20 rounded-lg border border-outline-variant/40 bg-surface-container-low px-2 py-1.5 tabular-nums text-on-surface outline-none ring-primary/30 focus:ring-2 md:w-24 disabled:opacity-50"
                        value={d != null ? d.stockQuantity : r.stockQuantity}
                        onChange={(e) =>
                          setDraft(r.inventoryId, {
                            stockQuantity: e.target.value === "" ? 0 : Number(e.target.value),
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-3 md:px-4">
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        disabled={disabled || savingId === r.inventoryId || isInactive}
                        className="w-24 rounded-lg border border-outline-variant/40 bg-surface-container-low px-2 py-1.5 tabular-nums text-on-surface outline-none ring-primary/30 focus:ring-2 md:w-28 disabled:opacity-50"
                        value={d != null ? d.sellingPrice : r.sellingPrice}
                        onChange={(e) =>
                          setDraft(r.inventoryId, {
                            sellingPrice: e.target.value === "" ? 0 : Number(e.target.value),
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-3 md:px-4">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        title="Reorder threshold"
                        disabled={disabled || savingId === r.inventoryId || isInactive}
                        className="w-20 rounded-lg border border-outline-variant/40 bg-surface-container-low px-2 py-1.5 tabular-nums text-on-surface outline-none ring-primary/30 focus:ring-2 disabled:opacity-50"
                        value={d != null ? d.reorderThreshold : r.reorderThreshold}
                        onChange={(e) =>
                          setDraft(r.inventoryId, {
                            reorderThreshold: e.target.value === "" ? 0 : Number(e.target.value),
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-3 md:px-4">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
                          isInactive ? "bg-surface-container text-on-surface-variant" : statusStyles(status),
                        )}
                      >
                        {isInactive ? "Inactive" : stockStatusLabel(status)}
                      </span>
                    </td>
                    <td className="px-3 py-3 md:px-4">
                      {r.effectiveDiscountPct > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-700">
                          <Tag className="h-3 w-3" />
                          {r.effectiveDiscountPct}% OFF
                        </span>
                      ) : r.discountEnabled && r.discountPct > 0 ? (
                        <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                          {r.discountPct}% (inactive)
                        </span>
                      ) : (
                        <span className="text-xs text-on-surface-variant">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-on-surface-variant md:px-4">
                      {updatedLabel}
                    </td>
                    <td className="px-3 py-3 md:px-4">
                      <button
                        type="button"
                        disabled={
                          disabled ||
                          savingId === r.inventoryId ||
                          !rowDirty[r.inventoryId] ||
                          isInactive
                        }
                        onClick={() => handleSaveRow(r.inventoryId)}
                        className="inline-flex items-center justify-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-50"
                      >
                        {savingId === r.inventoryId ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Save className="h-3.5 w-3.5" />
                        )}
                        {t('saveBtn')}
                      </button>
                      {savedId === r.inventoryId && (
                        <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-primary">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Saved
                        </span>
                      )}
                    </td>
                    {hasActions ? (
                      <td className="px-3 py-3 md:px-4">
                        <RowActions
                          row={r}
                          userId={userId}
                          onToggleActive={onToggleActive}
                          onDelete={onDelete}
                          onUpdated={onUpdated}
                        />
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-on-surface-variant">
        Save applies stock, price, and reorder threshold. Inactive products are hidden from the
        marketplace and do not consume a seat.
      </p>
    </div>
  );
}
