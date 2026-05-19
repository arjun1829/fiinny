"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import type { InventoryRow, StockStatus } from "../_types/inventory";
import { deriveStockStatus, stockStatusLabel } from "../_types/inventory";
import { updateInventoryRecord } from "../_lib/inventory-firestore";
import { cn } from "../_lib/cn";
import { useI18n } from "../../i18n/I18nContext";

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
  onUpdated: () => Promise<void>;
};

export function InventoryManagementTable({
  rows,
  disabled,
  onUpdated,
}: InventoryManagementTableProps) {
  const { t } = useI18n();
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to update inventory.";
      setError(msg);
    } finally {
      setSavingId(null);
    }
  };

  const rowDirty = useMemo(() => {
    const dirty: Record<string, boolean> = {};
    rows.forEach((r) => {
      const d = drafts[r.inventoryId];
      if (!d) {
        dirty[r.inventoryId] = false;
        return;
      }
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
        {t('noInventoryYet')}
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
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">{t('productNameCol')}</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">{t('categoryCol')}</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">{t('unitCol')}</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">{t('stockQtyCol')}</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">{t('sellingPriceCol')}</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">{t('reorderAtCol')}</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">{t('statusCol')}</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">{t('lastUpdatedCol')}</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">{t('actionsCol')}</th>
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

                return (
                  <tr key={r.inventoryId} className="hover:bg-surface-container/60">
                    <td className="px-3 py-3 font-medium text-on-surface md:px-4">
                      {r.productName}
                    </td>
                    <td className="px-3 py-3 text-on-surface-variant md:px-4">{r.category}</td>
                    <td className="px-3 py-3 text-on-surface-variant md:px-4">{r.unit}</td>
                    <td className="px-3 py-3 md:px-4">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        disabled={disabled || savingId === r.inventoryId}
                        className="w-20 rounded-lg border border-outline-variant/40 bg-surface-container-low px-2 py-1.5 tabular-nums text-on-surface outline-none ring-primary/30 focus:ring-2 md:w-24"
                        value={d != null ? d.stockQuantity : ""}
                        onChange={(e) =>
                          setDraft(r.inventoryId, {
                            stockQuantity:
                              e.target.value === "" ? 0 : Number(e.target.value),
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-3 md:px-4">
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        disabled={disabled || savingId === r.inventoryId}
                        className="w-24 rounded-lg border border-outline-variant/40 bg-surface-container-low px-2 py-1.5 tabular-nums text-on-surface outline-none ring-primary/30 focus:ring-2 md:w-28"
                        value={d != null ? d.sellingPrice : ""}
                        onChange={(e) =>
                          setDraft(r.inventoryId, {
                            sellingPrice:
                              e.target.value === "" ? 0 : Number(e.target.value),
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
                        disabled={disabled || savingId === r.inventoryId}
                        className="w-20 rounded-lg border border-outline-variant/40 bg-surface-container-low px-2 py-1.5 tabular-nums text-on-surface outline-none ring-primary/30 focus:ring-2"
                        value={d != null ? d.reorderThreshold : ""}
                        onChange={(e) =>
                          setDraft(r.inventoryId, {
                            reorderThreshold:
                              e.target.value === "" ? 0 : Number(e.target.value),
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-3 md:px-4">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
                          statusStyles(status),
                        )}
                      >
                        {stockStatusLabel(status)}
                      </span>
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
                          !rowDirty[r.inventoryId]
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-on-surface-variant">
        {t('inventoryTableHint')}
      </p>
    </div>
  );
}
