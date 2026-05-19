"use client";

import type { ManufacturerProductRow } from "../_types/inventory";
import { cn } from "../_lib/cn";
import { useI18n } from "../../i18n/I18nContext";

type ManufacturerCatalogueTableProps = {
  rows: ManufacturerProductRow[];
};

export function ManufacturerCatalogueTable({ rows }: ManufacturerCatalogueTableProps) {
  const { t } = useI18n();

  function sourceLabel(source: string): { label: string; cls: string } {
    if (source === "manufacturer_inventory") {
      return { label: t('ownCatalogue'), cls: "bg-primary/10 text-primary" };
    }
    return { label: source, cls: "bg-surface-container text-on-surface-variant" };
  }

  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-dashed border-outline-variant/50 bg-surface-container-low/50 px-4 py-12 text-center text-sm text-on-surface-variant">
        {t('noCatalogueYet')}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-ambient">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-outline-variant/30 bg-surface-container-low text-on-surface-variant">
            <tr>
              <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">{t('productNameCol')}</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">{t('categoryCol')}</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">{t('unitCol')}</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">{t('priceCol')}</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">{t('sourceCol')}</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">{t('statusCol')}</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">{t('lastUpdatedCol')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/20">
            {rows.map((r) => {
              const { label, cls } = sourceLabel(r.source);
              const updatedLabel = r.updatedAt
                ? r.updatedAt.toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : "—";

              return (
                <tr key={r.productId} className="hover:bg-surface-container/60">
                  <td className="px-3 py-3 font-medium text-on-surface md:px-4">
                    {r.productName}
                  </td>
                  <td className="px-3 py-3 text-on-surface-variant md:px-4">{r.category}</td>
                  <td className="px-3 py-3 text-on-surface-variant md:px-4">{r.unit}</td>
                  <td className="px-3 py-3 tabular-nums text-on-surface md:px-4">
                    ₹{r.price.toFixed(2)}
                  </td>
                  <td className="px-3 py-3 md:px-4">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
                        cls,
                      )}
                    >
                      {label}
                    </span>
                  </td>
                  <td className="px-3 py-3 md:px-4">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
                        r.isActive
                          ? "bg-primary/10 text-primary"
                          : "bg-surface-container text-on-surface-variant",
                      )}
                    >
                      {r.isActive ? t('activeStatus') : t('inactiveStatus')}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-on-surface-variant md:px-4">
                    {updatedLabel}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
