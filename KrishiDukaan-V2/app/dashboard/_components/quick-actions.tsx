"use client";

import Link from "next/link";
import { Package, PlusCircle, BarChart3, ReceiptText } from "lucide-react";
import { HelperIcon } from "../../../components/helpers";
import { useI18n } from "../../i18n/I18nContext";

const actions = [
  { href: "/dashboard/inventory", labelKey: "addProductAction" as const, subKey: "createNewListing" as const, icon: PlusCircle },
  { href: "/dashboard/inventory", labelKey: "adjustStockAction" as const, subKey: "updateQuantities" as const, icon: Package },
  { href: "/dashboard/analytics", labelKey: "viewAnalyticsAction" as const, subKey: "trafficAndCalls" as const, icon: BarChart3 },
  { href: "/dashboard/orders", labelKey: "manageOrdersAction" as const, subKey: "incomingDelivery" as const, icon: ReceiptText },
];

export function QuickActions() {
  const { t } = useI18n();
  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-ambient md:p-5">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-on-surface">{t('quickActionsTitle')}</h2>
        <HelperIcon
          size="xs"
          variant="ghost"
          side="right"
          textKey="dashQuickActions"
          ariaLabel="Quick actions help"
        />
      </div>
      <p className="mt-1 text-sm text-on-surface-variant">
        {t('quickActionsDesc')}
      </p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {actions.map(({ href, labelKey, subKey, icon: Icon }) => (
          <li key={labelKey}>
            <Link
              href={href}
              className="flex items-start gap-3 rounded-xl border border-outline-variant/25 bg-surface-container-low/80 p-3 transition-colors hover:border-primary/40 hover:bg-surface-container"
            >
              <span className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
                <Icon className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-sm font-medium text-on-surface">{t(labelKey)}</span>
                <span className="block text-xs text-on-surface-variant">{t(subKey)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
