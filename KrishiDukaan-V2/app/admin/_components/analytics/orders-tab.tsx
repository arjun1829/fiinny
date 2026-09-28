"use client";

import { useCallback, useEffect, useState } from "react";
import { ShoppingCart, IndianRupee, Receipt, CheckCircle2, XCircle } from "lucide-react";
import { getOrderMetrics, ORDER_STATUSES, type OrderMetrics } from "../../_lib/analytics-queries";
import { RefreshButton } from "../refresh-button";
import {
  StatCard,
  SectionTitle,
  Panel,
  DateRangePicker,
  useDateRange,
  LoadingState,
  ErrorBanner,
  TimeSeriesLineChart,
  inr,
  pct,
} from "./ui";

const STATUS_LABEL: Record<string, string> = {
  placed: "Placed",
  accepted: "Accepted",
  dispatched: "Dispatched",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  rejected: "Rejected",
  reassigning: "Reassigning",
};

const STATUS_COLOR: Record<string, string> = {
  placed: "bg-slate-400",
  accepted: "bg-blue-500",
  dispatched: "bg-indigo-500",
  out_for_delivery: "bg-amber-500",
  delivered: "bg-green-500",
  rejected: "bg-red-500",
  reassigning: "bg-orange-400",
};

export function OrdersTab() {
  const dr = useDateRange("30d");
  const [m, setM] = useState<OrderMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setM(await getOrderMetrics(dr.range));
      setSavedAt(Date.now());
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dr.range]);

  useEffect(() => {
    void load();
  }, [load]);

  const maxStatus = m ? Math.max(1, ...ORDER_STATUSES.map((s) => m.byStatus[s] ?? 0)) : 1;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateRangePicker {...dr} />
        <RefreshButton savedAt={savedAt} refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />
      </div>

      <ErrorBanner error={error} />

      {loading ? (
        <LoadingState />
      ) : (
        <>
          <div>
            <SectionTitle>Order economics (selected range)</SectionTitle>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5 sm:gap-4">
              <StatCard icon={ShoppingCart} label="Total orders" value={m?.count ?? 0} color="bg-orange-50 text-orange-600" />
              <StatCard icon={IndianRupee} label="GMV" value={inr(m?.gmv ?? 0)} sub="Value of orders placed" color="bg-green-50 text-green-600" />
              <StatCard icon={Receipt} label="Avg order value" value={inr(m?.aov ?? 0)} color="bg-blue-50 text-blue-600" />
              <StatCard icon={CheckCircle2} label="Delivered rate" value={pct(m?.deliveredRate ?? 0)} color="bg-green-50 text-green-600" />
              <StatCard icon={XCircle} label="Rejection rate" value={pct(m?.rejectionRate ?? 0)} color="bg-red-50 text-red-500" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="Orders over time">
              <TimeSeriesLineChart
                data={(m?.perDay ?? []) as any}
                series={[{ key: "orders", label: "Orders", color: "#6366f1" }]}
              />
            </Panel>
            <Panel title="GMV over time">
              <TimeSeriesLineChart
                data={(m?.perDay ?? []) as any}
                series={[{ key: "gmv", label: "GMV", color: "#22c55e" }]}
                valueFormat={inr}
              />
            </Panel>
          </div>

          <Panel title="Order status breakdown">
            <div className="space-y-2.5">
              {ORDER_STATUSES.map((s) => {
                const v = m?.byStatus[s] ?? 0;
                return (
                  <div key={s} className="flex items-center gap-3">
                    <span className="w-32 shrink-0 text-xs font-semibold text-on-surface-variant">{STATUS_LABEL[s]}</span>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-container-high">
                      <div className={`h-full rounded-full ${STATUS_COLOR[s]}`} style={{ width: `${Math.round((v / maxStatus) * 100)}%` }} />
                    </div>
                    <span className="w-12 shrink-0 text-right text-xs font-bold text-on-surface">{v}</span>
                  </div>
                );
              })}
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
