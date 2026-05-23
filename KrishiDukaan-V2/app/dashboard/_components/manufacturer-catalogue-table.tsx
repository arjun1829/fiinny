"use client";

import { useState } from "react";
import { Pencil, ToggleLeft, ToggleRight, Loader2 } from "lucide-react";
import type { ManufacturerProductRow } from "../_types/inventory";
import { EditProductModal } from "./edit-product-modal";
import { cn } from "../_lib/cn";
import { useI18n } from "../../i18n/I18nContext";

type Props = {
  rows: ManufacturerProductRow[];
  onRefresh: () => void;
  onToggleActive?: (productId: string, inventoryId: string | undefined, isActive: boolean) => Promise<void>;
};

function sourceCls(source: string): string {
  if (source === "manufacturer_inventory") return "bg-primary/10 text-primary";
  return "bg-surface-container text-on-surface-variant";
}

function ToggleBtn({
  row,
  onDone,
  onToggleActive,
}: {
  row: ManufacturerProductRow;
  onDone: () => void;
  onToggleActive?: (productId: string, inventoryId: string | undefined, isActive: boolean) => Promise<void>;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const handle = async () => {
    setBusy(true);
    setErr(null);
    try {
      if (onToggleActive) {
        await onToggleActive(row.productId, row.inventoryId, row.isActive);
      }
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-0.5">
      <button
        onClick={handle} disabled={busy || !onToggleActive} title={row.isActive ? t('toggleDeactivate') : t('toggleActivate')}
        className={cn(
          "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-all disabled:opacity-50",
          row.isActive
            ? "bg-primary/10 text-primary hover:bg-red-50 hover:text-red-600"
            : "bg-surface-container text-on-surface-variant hover:bg-primary/10 hover:text-primary",
        )}
      >
        {busy
          ? <Loader2 className="h-3 w-3 animate-spin" />
          : row.isActive
            ? <ToggleRight className="h-3.5 w-3.5" />
            : <ToggleLeft  className="h-3.5 w-3.5" />}
        {row.isActive ? t('statusActive') : t('statusInactive')}
      </button>
      {err && <p className="text-[10px] text-red-600 max-w-[120px]">{err}</p>}
    </div>
  );
}

export function ManufacturerCatalogueTable({ rows, onRefresh, onToggleActive }: Props) {
  const { t } = useI18n();
  const [editing, setEditing] = useState<ManufacturerProductRow | null>(null);

  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-dashed border-outline-variant/50 bg-surface-container-low/50 px-4 py-12 text-center text-sm text-on-surface-variant">
        {t('noCatalogueYet')}
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-ambient">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-outline-variant/30 bg-surface-container-low text-on-surface-variant">
              <tr>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">{t('catProductName')}</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">{t('catCategory')}</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">{t('catUnit')}</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">{t('catPriceCol')}</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">{t('catVariants')}</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">{t('catStock')}</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">{t('catSource')}</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">{t('catStatus')}</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">{t('catLastUpdated')}</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">{t('catActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {rows.map((r) => {
                const cls = sourceCls(r.source);
                const label = r.source === "manufacturer_inventory" ? t('sourceOwnCatalogue') : r.source;
                const updatedLabel = r.updatedAt
                  ? r.updatedAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
                  : "—";

                return (
                  <tr key={r.productId} className="hover:bg-surface-container/60 transition-colors">
                    {/* Name + image thumbnail */}
                    <td className="px-3 py-3 md:px-4">
                      <div className="flex items-center gap-2.5">
                        {r.image ? (
                          <img src={r.image} alt="" className="h-9 w-9 rounded-lg object-cover flex-shrink-0 border border-outline-variant/20"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        ) : (
                          <div className="h-9 w-9 rounded-lg bg-surface-container flex-shrink-0 flex items-center justify-center text-on-surface-variant/30 text-xs">
                            ?
                          </div>
                        )}
                        <div>
                          <p className="font-semibold text-on-surface leading-tight">{r.productName}</p>
                          {r.description && (
                            <p className="text-xs text-on-surface-variant mt-0.5 max-w-[180px] truncate">{r.description}</p>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-3 py-3 text-on-surface-variant md:px-4">{r.category}</td>
                    <td className="px-3 py-3 text-on-surface-variant md:px-4">{r.unit}</td>
                    <td className="px-3 py-3 tabular-nums text-on-surface md:px-4">₹{r.price.toFixed(2)}</td>

                    {/* Variants */}
                    <td className="px-3 py-3 md:px-4">
                      {r.variants.length > 1 ? (
                        <div className="flex flex-wrap gap-1">
                          {r.variants.slice(0, 3).map((v, i) => (
                            <span key={i} className="rounded-full bg-surface-container px-2 py-0.5 text-[10px] font-medium text-on-surface-variant">
                              {v.unit} · ₹{v.price}
                            </span>
                          ))}
                          {r.variants.length > 3 && (
                            <span className="rounded-full bg-surface-container px-2 py-0.5 text-[10px] text-on-surface-variant">
                              +{r.variants.length - 3}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-on-surface-variant text-xs">—</span>
                      )}
                    </td>

                    <td className="px-3 py-3 md:px-4 tabular-nums text-on-surface-variant">{r.stockQuantity > 0 ? r.stockQuantity : <span className="text-on-surface-variant/40">—</span>}</td>

                    <td className="px-3 py-3 md:px-4">
                      <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", cls)}>
                        {label}
                      </span>
                    </td>

                    {/* Status toggle */}
                    <td className="px-3 py-3 md:px-4">
                      <ToggleBtn row={r} onDone={onRefresh} onToggleActive={onToggleActive} />
                    </td>

                    <td className="whitespace-nowrap px-3 py-3 text-on-surface-variant md:px-4 text-xs">{updatedLabel}</td>

                    {/* Edit */}
                    <td className="px-3 py-3 md:px-4">
                      <button
                        onClick={() => setEditing(r)}
                        className="flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-white px-3 py-1.5 text-xs font-semibold text-on-surface hover:border-primary hover:text-primary hover:bg-primary/5 transition-all"
                      >
                        <Pencil className="h-3 w-3" /> {t('editBtn')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <EditProductModal
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { onRefresh(); setEditing(null); }}
        />
      )}
    </>
  );
}
