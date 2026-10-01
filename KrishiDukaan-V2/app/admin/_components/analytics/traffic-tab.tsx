"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, Globe, Monitor, Smartphone, Tablet, Info } from "lucide-react";
import {
  getTrafficMetrics,
  type TrafficMetrics,
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
} from "./ui";

/**
 * Traffic tab — two distinct signals shown side-by-side:
 *
 *  1. Anonymous page visits (siteVisits collection): every page load counted
 *     once per request, no deduplication, no identity.
 *
 *  2. Unique logged-in users (activeUsers summaries from the CF): each user
 *     counted at most once per calendar day. Device breakdown (web/mobile/tablet)
 *     accumulates from the date the presence doc started carrying the real
 *     `platform` field (previously hardcoded to 'web').
 *
 * These two numbers are intentionally separate. A visit ≠ a user.
 */
export function TrafficTab() {
  const dr = useDateRange("30d");
  const [metrics, setMetrics] = useState<TrafficMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const m = await getTrafficMetrics(dr.range);
      setMetrics(m);
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

  const hasDeviceData = metrics !== null && metrics.deviceFrom !== null;
  const deviceNote = hasDeviceData
    ? `Device breakdown available from ${metrics!.deviceFrom}.`
    : "Device breakdown will appear once users visit after the platform detection update.";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateRangePicker {...dr} allowAllTime />
        <RefreshButton savedAt={savedAt} refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />
      </div>

      <ErrorBanner error={error} />

      {loading ? (
        <LoadingState />
      ) : (
        <>
          {/* ── Section 1: Anonymous page visits ──────────────────────────── */}
          <div>
            <SectionTitle>Anonymous page visits</SectionTitle>
            <p className="mb-3 flex items-center gap-1.5 text-[11px] text-outline">
              <Info className="h-3 w-3 shrink-0" />
              Every page load is counted once. Visits are not deduplicated — a single user refreshing counts as multiple visits.
              {metrics?.visitsFrom ? ` Tracking started ${metrics.visitsFrom}.` : " No visit data recorded yet."}
            </p>
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
              <StatCard icon={Globe} label="Total page visits (selected range)" value={(metrics?.totalVisits ?? 0).toLocaleString("en-IN")} color="bg-indigo-50 text-indigo-600" />
            </div>
            <Panel title="Daily page visits (anonymous)">
              <TimeSeriesLineChart
                data={(metrics?.perDay ?? []) as any}
                series={[{ key: "visits", label: "Visits", color: "#6366f1" }]}
              />
            </Panel>
          </div>

          {/* ── Section 2: Unique logged-in users ─────────────────────────── */}
          <div>
            <SectionTitle>Unique logged-in users</SectionTitle>
            <p className="mb-3 flex items-center gap-1.5 text-[11px] text-outline">
              <Info className="h-3 w-3 shrink-0" />
              Each logged-in user is counted at most once per calendar day (DAU). Anonymous / unauthenticated visitors are not included.
              {metrics?.usersFrom ? ` User activity tracking started ${metrics.usersFrom}.` : " No user activity data yet."}
            </p>
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 sm:gap-4">
              <StatCard icon={BarChart3} label="Total unique user-days" value={(metrics?.totalUniqueUsers ?? 0).toLocaleString("en-IN")} sub="Sum of daily active users" color="bg-emerald-50 text-emerald-600" />
              <StatCard icon={Monitor} label="Web / Desktop" value={(metrics?.web ?? 0).toLocaleString("en-IN")} color="bg-blue-50 text-blue-600" />
              <StatCard icon={Smartphone} label="Mobile" value={(metrics?.mobile ?? 0).toLocaleString("en-IN")} color="bg-purple-50 text-purple-600" />
              <StatCard icon={Tablet} label="Tablet" value={(metrics?.tablet ?? 0).toLocaleString("en-IN")} color="bg-amber-50 text-amber-600" />
            </div>
            <p className="mb-4 flex items-center gap-1.5 text-[11px] text-outline">
              <Info className="h-3 w-3 shrink-0" />
              {deviceNote}
            </p>
            <Panel title="Daily unique logged-in users">
              <TimeSeriesLineChart
                data={(metrics?.perDay ?? []) as any}
                series={[
                  { key: "uniqueUsers", label: "Unique users", color: "#10b981" },
                  { key: "web", label: "Web", color: "#3b82f6" },
                  { key: "mobile", label: "Mobile", color: "#a855f7" },
                  { key: "tablet", label: "Tablet", color: "#f59e0b" },
                ]}
              />
            </Panel>
          </div>

          <p className="flex items-center gap-1.5 text-[10px] text-outline">
            <BarChart3 className="h-3 w-3" />
            For additional traffic analytics (including anonymous device breakdown) see Google Analytics (G-7MEFGCD4EX).
          </p>
        </>
      )}
    </div>
  );
}
