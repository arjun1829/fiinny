"use client";

import { useCallback, useEffect, useState } from "react";
import {
  IndianRupee, CreditCard, Wallet, UserCog, RefreshCw, CheckCircle2, Clock, AlarmClock,
  ShoppingCart, Receipt, Percent, XCircle, TrendingDown,
} from "lucide-react";
import {
  getSubscriptionRevenue,
  getSubscriptionStatusCounts,
  getSeatMetrics,
  getOrderMetrics,
  getPaymentFunnel,
  type SubscriptionRevenue,
  type SubscriptionStatusCounts,
  type SeatMetrics,
  type OrderMetrics,
  type PaymentFunnel,
} from "../../_lib/analytics-queries";
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
  ChartLegend,
  inr,
  pct,
} from "./ui";

const REVENUE_SERIES = [
  { key: "paid", label: "Paid / gateway", color: "#22c55e" },
  { key: "manual", label: "Manual / admin", color: "#a855f7" },
];

/**
 * Finance Overview — reused both as an Analytics tab and as the "Finance" tab on
 * the admin Subscriptions page. Revenue is split paid vs. manual using the
 * existing `activatedByAdmin` flag; nothing here introduces a new classification.
 */
export function FinanceOverview() {
  const dr = useDateRange("30d");
  const [rev, setRev] = useState<SubscriptionRevenue | null>(null);
  const [status, setStatus] = useState<SubscriptionStatusCounts | null>(null);
  const [seats, setSeats] = useState<SeatMetrics | null>(null);
  const [orders, setOrders] = useState<OrderMetrics | null>(null);
  const [funnel, setFunnel] = useState<PaymentFunnel | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [r, s, sm, om, pf] = await Promise.all([
        getSubscriptionRevenue(dr.range),
        getSubscriptionStatusCounts(),
        getSeatMetrics(),
        getOrderMetrics(dr.range),
        getPaymentFunnel(dr.range),
      ]);
      setRev(r);
      setStatus(s);
      setSeats(sm);
      setOrders(om);
      setFunnel(pf);
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
            <SectionTitle>Subscription revenue (selected range)</SectionTitle>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 sm:gap-4">
              <StatCard icon={IndianRupee} label="Total subscription revenue" value={inr(rev?.totalRevenue ?? 0)} color="bg-green-50 text-green-600" />
              <StatCard icon={Wallet} label="Paid / gateway revenue" value={inr(rev?.paidRevenue ?? 0)} color="bg-blue-50 text-blue-600" />
              <StatCard icon={UserCog} label="Manual / admin revenue" value={inr(rev?.manualRevenue ?? 0)} color="bg-purple-50 text-purple-600" />
              <StatCard icon={CreditCard} label="New subscriptions" value={rev?.newSubscriptions ?? 0} />
              <StatCard icon={RefreshCw} label="Renewals (in range)" value={rev?.renewalsInRange ?? 0} sub="Repeat owner in window" />
              <StatCard icon={CheckCircle2} label="Seats purchased (range)" value={rev?.seatsPurchasedInRange ?? 0} />
            </div>
          </div>

          <div>
            <SectionTitle>Subscription health (live)</SectionTitle>
            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5 sm:gap-4">
              <StatCard icon={CheckCircle2} label="Active" value={status?.active ?? 0} color="bg-green-50 text-green-600" />
              <StatCard icon={Clock} label="Expired" value={status?.expired ?? 0} color="bg-gray-100 text-gray-500" />
              <StatCard icon={AlarmClock} label="Expiring ≤ 30d" value={status?.expiringSoon ?? 0} color="bg-amber-50 text-amber-600" />
              <StatCard label="Seats used" value={seats?.seatsUsed ?? 0} />
              <StatCard label="Vacant seats" value={seats?.seatsVacant ?? 0} />
            </div>
            <Panel title="Subscription revenue over time">
              <TimeSeriesLineChart data={(rev?.perDay ?? []) as any} series={REVENUE_SERIES} valueFormat={inr} />
              <ChartLegend series={REVENUE_SERIES} />
            </Panel>
          </div>

          <div>
            <SectionTitle>Order economics (selected range)</SectionTitle>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 sm:gap-4">
              <StatCard icon={IndianRupee} label="GMV" value={inr(orders?.gmv ?? 0)} color="bg-green-50 text-green-600" />
              <StatCard icon={ShoppingCart} label="Order count" value={orders?.count ?? 0} color="bg-orange-50 text-orange-600" />
              <StatCard icon={Receipt} label="Avg order value" value={inr(orders?.aov ?? 0)} color="bg-blue-50 text-blue-600" />
              <StatCard icon={Percent} label="Platform fee revenue" value={inr(orders?.platformFee ?? 0)} sub="From delivered payouts" color="bg-purple-50 text-purple-600" />
            </div>
          </div>

          <div>
            <SectionTitle>Payment funnel (selected range)</SectionTitle>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6 sm:gap-4">
              <StatCard icon={CreditCard} label="Attempts" value={funnel?.attempts ?? 0} />
              <StatCard icon={CheckCircle2} label="Successful" value={funnel?.paid ?? 0} color="bg-green-50 text-green-600" />
              <StatCard icon={XCircle} label="Failed" value={funnel?.failed ?? 0} color="bg-red-50 text-red-500" />
              <StatCard icon={Clock} label="Abandoned" value={funnel?.abandoned ?? 0} color="bg-amber-50 text-amber-600" />
              <StatCard icon={Percent} label="Conversion" value={pct(funnel?.conversionRate ?? 0)} color="bg-blue-50 text-blue-600" />
              <StatCard icon={TrendingDown} label="Lost value" value={inr(funnel?.lostValue ?? 0)} color="bg-red-50 text-red-500" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
