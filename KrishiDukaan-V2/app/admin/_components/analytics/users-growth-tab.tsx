"use client";

import { useCallback, useEffect, useState } from "react";
import { Users } from "lucide-react";
import {
  getUserCounts,
  getNewUsersSeries,
  type UserCounts,
  type NewUsersSeries,
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
} from "./ui";

const REG_SERIES = [
  { key: "manufacturer", label: "Manufacturers", color: "#3b82f6" },
  { key: "retailer", label: "Retailers", color: "#22c55e" },
  { key: "customer", label: "Customers", color: "#f59e0b" },
];

export function UsersGrowthTab() {
  const dr = useDateRange("30d");
  const [counts, setCounts] = useState<UserCounts | null>(null);
  const [series, setSeries] = useState<NewUsersSeries | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [c, s] = await Promise.all([getUserCounts(), getNewUsersSeries(dr.range)]);
      setCounts(c);
      setSeries(s);
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
            <SectionTitle>Totals</SectionTitle>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 sm:gap-4">
              <StatCard icon={Users} label="Total users" value={counts?.all ?? 0} color="bg-primary/10 text-primary" />
              <StatCard label="Manufacturers" value={counts?.manufacturer ?? 0} />
              <StatCard label="Retailers" value={counts?.retailer ?? 0} />
              <StatCard label="Customers" value={counts?.customer ?? 0} />
            </div>
          </div>

          <div>
            <SectionTitle>New registrations (selected range)</SectionTitle>
            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 sm:gap-4">
              <StatCard label="New users" value={series?.total ?? 0} sub="Excludes admins" />
              <StatCard label="New manufacturers" value={series?.byRole.manufacturer ?? 0} />
              <StatCard label="New retailers" value={series?.byRole.retailer ?? 0} />
              <StatCard label="New customers" value={series?.byRole.customer ?? 0} />
            </div>
            <Panel title="Registrations over time">
              <TimeSeriesLineChart data={(series?.perDay ?? []) as any} series={REG_SERIES} />
              <ChartLegend series={REG_SERIES} />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
