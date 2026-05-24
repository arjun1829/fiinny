"use client";

import Link from "next/link";
import { HelperIcon } from "../../../components/helpers";
import { useI18n } from "../../i18n/I18nContext";

type InventoryHealthData = {
  inStock: number;
  lowStock: number;
  outOfStock: number;
  score: number;
  label: string;
};

export function DashboardInventoryHealth({ data }: { data: InventoryHealthData | null }) {
  const { t } = useI18n();

  if (!data) {
    return (
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-ambient md:p-5">
        <p className="text-sm text-on-surface-variant">{t('noDataLabel')}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-ambient md:p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-on-surface">{t('inventoryHealthTitle')}</h2>
          <HelperIcon
            size="xs"
            variant="ghost"
            side="right"
            textKey="dashInventoryHealth"
            ariaLabel="Inventory health help"
          />
        </div>
        <Link
          href="/dashboard/inventory"
          className="text-xs font-semibold text-primary hover:underline"
        >
          {t('manageInventory')}
        </Link>
      </div>
      <p className="mt-1 text-sm text-on-surface-variant">{t('inventoryHealthDesc')}</p>

      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl bg-primary/10 p-3">
          <p className="text-xl font-bold text-primary">{data.inStock}</p>
          <p className="text-[11px] font-medium text-on-surface-variant">{t('inStockSKUs')}</p>
        </div>
        <div className="rounded-xl bg-harvest/10 p-3">
          <p className="text-xl font-bold text-harvest">{data.lowStock}</p>
          <p className="text-[11px] font-medium text-on-surface-variant">{t('lowStockLabel')}</p>
        </div>
        <div className="rounded-xl bg-red-500/10 p-3">
          <p className="text-xl font-bold text-red-600">{data.outOfStock}</p>
          <p className="text-[11px] font-medium text-on-surface-variant">{t('outOfStockLabel')}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl bg-surface-container-low px-3 py-2 text-sm">
        <span className="font-medium text-on-surface-variant">{t('healthScoreLabel')}</span>
        <span className="font-bold text-on-surface">{data.score}% — {data.label}</span>
      </div>
    </div>
  );
}
