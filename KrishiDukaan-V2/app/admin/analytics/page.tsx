"use client";

import { useState } from "react";
import { OverviewTab } from "../_components/analytics/overview-tab";
import { UsersGrowthTab } from "../_components/analytics/users-growth-tab";
import { OrdersTab } from "../_components/analytics/orders-tab";
import { ProductsNetworkTab } from "../_components/analytics/products-network-tab";
import { FinanceOverview } from "../_components/analytics/finance-overview";
import { TrafficTab } from "../_components/analytics/traffic-tab";
import { EngagementTab } from "../_components/analytics/engagement-tab";
import { RetentionTab } from "../_components/analytics/retention-tab";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "users", label: "Users & Growth" },
  { key: "engagement", label: "Engagement" },
  { key: "retention", label: "Retention" },
  { key: "orders", label: "Orders" },
  { key: "products", label: "Products & Network" },
  { key: "finance", label: "Finance" },
  { key: "traffic", label: "Traffic" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function AnalyticsPage() {
  const [tab, setTab] = useState<TabKey>("overview");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-black text-on-surface sm:text-2xl">Analytics</h1>
        <p className="mt-1 text-xs text-on-surface-variant sm:text-sm">
          Platform, user, order and finance metrics. All figures are read on demand with Firestore
          aggregation and date-bounded queries.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-outline-variant/20">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`pb-2 px-1 font-semibold text-sm ${
              tab === t.key
                ? "border-b-2 border-primary text-primary"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab />}
      {tab === "users" && <UsersGrowthTab />}
      {tab === "engagement" && <EngagementTab />}
      {tab === "retention" && <RetentionTab />}
      {tab === "orders" && <OrdersTab />}
      {tab === "products" && <ProductsNetworkTab />}
      {tab === "finance" && <FinanceOverview />}
      {tab === "traffic" && <TrafficTab />}
    </div>
  );
}
