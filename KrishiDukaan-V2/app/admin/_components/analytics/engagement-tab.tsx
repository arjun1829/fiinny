"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, CalendarClock, Percent, Globe, Smartphone, Apple, Monitor, Tablet, Info } from "lucide-react";
import { authedJsonHeaders } from "../../../lib/authed-fetch";
import { RefreshButton } from "../refresh-button";
import {
  StatCard,
  SectionTitle,
  Panel,
  DateRangePicker,
  useDateRange,
  LoadingState,
  ErrorBanner,
  EmptyState,
  TimeSeriesLineChart,
  ChartLegend,
} from "./ui";

/**
 * Engagement tab — Google Analytics 4 (GA4) is the AUTHORITATIVE source for all
 * user-engagement metrics here. GA4 semantics (do not conflate):
 *   - DAU             : unique active users on the selected day.
 *   - MAU             : unique active users over the rolling 30 days ending on
 *                       the selected day — a single unique count, never a sum of
 *                       daily numbers, so a user active on many days counts once.
 *   - DAU / MAU       : stickiness, DAU/MAU × 100 (null when MAU is 0).
 *   - Platform        : Web / Android / iOS (the app surface).
 *   - Device category : Desktop / Mobile / Tablet — a breakdown only; the same
 *                       user can appear in several categories, so these are NEVER
 *                       summed to derive DAU/MAU.
 *
 * The old Firestore `activeUsers`/presence-derived DAU/MAU (getEngagementMetrics)
 * is intentionally no longer used by this tab. It counted Firebase-login/presence
 * signals, which are not authoritative unique-user counts. The collection and its
 * Cloud Function remain in place (untouched) pending verification of GA4.
 */

// GA4 `activeUsers` is a single metric; the trend is one series.
const ACTIVE_SERIES = [{ key: "activeUsers", label: "Active users", color: "#22c55e" }];

type Ga4Breakdown = { key: string; label: string; activeUsers: number };
type EngagementReport = {
  dau: number;
  mau: number;
  dauMauRatio: number | null;
  activeUsersOverTime: { date: string; activeUsers: number }[];
  platform: Ga4Breakdown[];
  device: Ga4Breakdown[];
  windows: { day: string; mau: { startDate: string; endDate: string }; range: { startDate: string; endDate: string } };
};

type ApiResponse =
  | { configured: false }
  | { configured: true; data: EngagementReport; cachedAt: number };

/** Formats a JS Date as a YYYY-MM-DD day key using local calendar fields. */
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function prettyDate(key: string): string {
  const d = new Date(`${key}T00:00:00`);
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

const nf = (n: number) => Number(n || 0).toLocaleString("en-IN");

const PLATFORM_META: Record<string, { label: string; icon: any; color: string }> = {
  web: { label: "Web", icon: Globe, color: "bg-blue-500/10 text-blue-600" },
  android: { label: "Android", icon: Smartphone, color: "bg-green-500/10 text-green-600" },
  ios: { label: "iOS", icon: Apple, color: "bg-slate-500/10 text-slate-600" },
};
const DEVICE_META: Record<string, { label: string; icon: any; color: string }> = {
  desktop: { label: "Desktop", icon: Monitor, color: "bg-indigo-500/10 text-indigo-600" },
  mobile: { label: "Mobile", icon: Smartphone, color: "bg-purple-500/10 text-purple-600" },
  tablet: { label: "Tablet", icon: Tablet, color: "bg-amber-500/10 text-amber-600" },
};

export function EngagementTab() {
  const dr = useDateRange("30d");
  const [resp, setResp] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const from = dayKey(dr.range.from.getTime() <= 0 ? new Date(0) : dr.range.from);
      const to = dayKey(dr.range.to);
      const res = await fetch(
        `/api/admin/analytics/engagement?from=${from}&to=${to}`,
        { headers: await authedJsonHeaders(), cache: "no-store" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Request failed (${res.status}).`);
      }
      const json = (await res.json()) as ApiResponse;
      setResp(json);
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

  const notConfigured = resp !== null && resp.configured === false;
  const data = resp !== null && resp.configured ? resp.data : null;
  const noData = !loading && data !== null && data.mau === 0 && data.activeUsersOverTime.every((p) => p.activeUsers === 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateRangePicker {...dr} />
        <RefreshButton savedAt={savedAt} refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />
      </div>

      <p className="flex items-center gap-1.5 rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-4 py-2.5 text-[11px] text-on-surface-variant">
        <Info className="h-3.5 w-3.5 shrink-0 text-primary" />
        Engagement metrics come from Google Analytics 4 (unique active users), not Firebase logins.
        GA4 reporting can lag real time by up to a few hours, so today&rsquo;s figures may still be settling.
      </p>

      <ErrorBanner error={error} />

      {loading ? (
        <LoadingState />
      ) : notConfigured ? (
        <EmptyState message="Google Analytics is not configured for this environment." />
      ) : noData ? (
        <EmptyState message="No Google Analytics activity for the selected range yet. Metrics will appear once GA4 has processed active-user data for these dates." />
      ) : data ? (
        <>
          {/* ── Top metrics: DAU / MAU / DAU-MAU ─────────────────────────────── */}
          <div>
            <SectionTitle>Active users (GA4)</SectionTitle>
            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 sm:gap-4">
              <StatCard
                icon={Activity}
                label="DAU"
                value={nf(data.dau)}
                sub={`Unique active users · ${prettyDate(data.windows.day)}`}
                color="bg-green-500/10 text-green-600"
              />
              <StatCard
                icon={CalendarClock}
                label="MAU"
                value={nf(data.mau)}
                sub={`Unique users · ${data.windows.mau.startDate} → ${data.windows.mau.endDate}`}
                color="bg-blue-500/10 text-blue-600"
              />
              <StatCard
                icon={Percent}
                label="DAU / MAU"
                value={data.dauMauRatio != null ? `${data.dauMauRatio.toFixed(1)}%` : "—"}
                sub={data.dauMauRatio != null ? "Stickiness" : "MAU is 0"}
                color="bg-purple-500/10 text-purple-600"
              />
            </div>
            <Panel title="Active users over time">
              <TimeSeriesLineChart data={data.activeUsersOverTime as any} series={ACTIVE_SERIES} />
              <ChartLegend series={ACTIVE_SERIES} />
              <p className="mt-2 text-[11px] text-outline">
                One point per day = GA4 unique active users for that day. Not aggregated into a single total.
              </p>
            </Panel>
          </div>

          {/* ── Platform: Web / Android / iOS ────────────────────────────────── */}
          <div>
            <SectionTitle>Platform (Web / Android / iOS)</SectionTitle>
            <div className="mb-2 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
              {["web", "android", "ios"].map((key) => {
                const meta = PLATFORM_META[key];
                const row = data.platform.find((p) => p.key === key);
                return (
                  <StatCard
                    key={key}
                    icon={meta.icon}
                    label={meta.label}
                    value={nf(row?.activeUsers ?? 0)}
                    sub="Active users (breakdown)"
                    color={meta.color}
                  />
                );
              })}
            </div>
            {/* Surface any platform values GA4 returns outside the three known surfaces. */}
            {data.platform.filter((p) => !["web", "android", "ios"].includes(p.key)).map((p) => (
              <StatCard key={p.key} label={p.label} value={nf(p.activeUsers)} sub="Active users (breakdown)" />
            ))}
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-outline">
              <Info className="h-3 w-3 shrink-0" />
              Platform is the app surface (Web / Android / iOS) and is distinct from device category.
              A user can appear on more than one platform, so these are a breakdown and are not summed to compute DAU/MAU.
            </p>
          </div>

          {/* ── Device category: Desktop / Mobile / Tablet ───────────────────── */}
          <div>
            <SectionTitle>Device category</SectionTitle>
            <div className="mb-2 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
              {["desktop", "mobile", "tablet"].map((key) => {
                const meta = DEVICE_META[key];
                const row = data.device.find((d) => d.key === key);
                return (
                  <StatCard
                    key={key}
                    icon={meta.icon}
                    label={meta.label}
                    value={nf(row?.activeUsers ?? 0)}
                    sub="Active users (breakdown)"
                    color={meta.color}
                  />
                );
              })}
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-outline">
              <Info className="h-3 w-3 shrink-0" />
              Device category (GA4 deviceCategory) is separate from platform. The same user may use several
              device categories, so these are informational and are never summed to derive DAU/MAU.
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}
