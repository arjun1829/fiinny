'use client';

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "../_components/page-header";
import { MetricTile } from "../_components/metric-tile";
import { SimpleBarChart } from "../_components/simple-bar-chart";
import { InsightCard } from "../_components/insight-card";
import {
  fetchRetailerAnalytics,
  ANALYTICS_PERIODS,
  type AnalyticsPeriodKey,
  type CustomDateRange,
  type RetailerAnalytics,
} from "../_lib/analytics-firestore";
import { useEffectiveUser } from "../_context/effective-user-context";
import { HelperIcon } from "../../../components/helpers";
import { useI18n } from "../../i18n/I18nContext";

function formatINR(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatShort(d: Date): string {
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

export default function AnalyticsPage() {
  const { t } = useI18n();
  const { uid: effectiveUid, profile } = useEffectiveUser();
  const [stats, setStats] = useState<RetailerAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // The window was hardcoded to 7 days with no way to change it, while the app
  // has offered Week/Month/Year all along — so the same seller saw different
  // numbers on each platform and assumed web was wrong.
  const [period, setPeriod] = useState<AnalyticsPeriodKey>("week");
  // Custom Date Range overrides `period` when set — same relationship as the
  // app's _customRange (mobile/lib/features/dashboard/screens/
  // dashboard_analytics_screen.dart), kept as a separate piece of state
  // rather than folded into AnalyticsPeriodKey since it carries real dates.
  const [customRange, setCustomRange] = useState<CustomDateRange | null>(null);
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");

  const load = useCallback(async () => {
    if (!effectiveUid && !profile?.phone) {
      // Identity not resolved (e.g. admin view of a uid-less account) — an
      // early return here used to leave the spinner up forever.
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const realStats = await fetchRetailerAnalytics(
        effectiveUid,
        profile,
        period,
        customRange ?? undefined,
      );
      setStats(realStats);
    } catch (err) {
      console.error("Failed to load analytics:", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [effectiveUid, profile, period, customRange]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyCustomRange = () => {
    if (!draftStart || !draftEnd) return;
    const start = new Date(`${draftStart}T00:00:00`);
    const end = new Date(`${draftEnd}T00:00:00`);
    if (start > end) return;
    setCustomRange({ start, end });
    setShowCustomPicker(false);
  };

  if (loading) {
    return (
      <div className="p-20 text-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-on-surface-variant font-medium">{t('loadingAnalytics')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-20 text-center">
        <p className="text-on-surface font-semibold mb-4">{t('anLoadError')}</p>
        <button
          onClick={() => void load()}
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:bg-primary-container transition-colors"
        >
          {t('anRetry')}
        </button>
      </div>
    );
  }

  const appearance = stats?.searchAppearance ?? { impressions: "0", ctr: "0.0%", avgPosition: "—" };
  const orders = stats?.orders;

  const emptySeries = [] as { label: string; value: number }[];

  const insightCards = [
    { id: "i1", title: t('peakTraffic'), body: t('peakTrafficBody') },
    { id: "i2", title: t('callConversion'), body: t('callConversionBody') },
    { id: "i3", title: t('directionsInsight'), body: t('directionsInsightBody') },
  ];

  return (
    <>
      <PageHeader
        title={t('analyticsTitle')}
        description={t('analyticsDesc')}
        helperKey="dashAnalytics"
      />

      {/* Window selector — matches the app's Week/Month/Year/Custom picker. */}
      <div className="mb-2 inline-flex flex-wrap items-center gap-1 rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-1">
        {ANALYTICS_PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => {
              setPeriod(p.key);
              setCustomRange(null);
              setShowCustomPicker(false);
            }}
            aria-pressed={!customRange && period === p.key}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
              !customRange && period === p.key
                ? "bg-primary text-white"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setDraftStart(customRange ? toDateInputValue(customRange.start) : "");
            setDraftEnd(customRange ? toDateInputValue(customRange.end) : "");
            setShowCustomPicker((s) => !s);
          }}
          aria-pressed={!!customRange}
          className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
            customRange
              ? "bg-primary text-white"
              : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          {customRange
            ? `${formatShort(customRange.start)} – ${formatShort(customRange.end)}`
            : "Custom"}
        </button>
      </div>

      {showCustomPicker && (
        <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-3">
          <label className="flex flex-col text-xs font-semibold text-on-surface-variant">
            From
            <input
              type="date"
              value={draftStart}
              max={draftEnd || undefined}
              onChange={(e) => setDraftStart(e.target.value)}
              className="mt-1 rounded-lg border border-outline-variant/40 px-2 py-1 text-sm text-on-surface"
            />
          </label>
          <label className="flex flex-col text-xs font-semibold text-on-surface-variant">
            To
            <input
              type="date"
              value={draftEnd}
              min={draftStart || undefined}
              max={toDateInputValue(new Date())}
              onChange={(e) => setDraftEnd(e.target.value)}
              className="mt-1 rounded-lg border border-outline-variant/40 px-2 py-1 text-sm text-on-surface"
            />
          </label>
          <button
            type="button"
            onClick={applyCustomRange}
            disabled={!draftStart || !draftEnd}
            className="rounded-lg bg-primary px-4 py-1.5 text-sm font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={() => setShowCustomPicker(false)}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-on-surface-variant hover:text-on-surface"
          >
            Cancel
          </button>
        </div>
      )}
      <div className="mb-4" />

      {stats && !stats.hasAnyData && (
        <div className="mb-6 rounded-2xl border border-outline-variant/40 bg-surface-container-low px-5 py-4">
          <p className="text-sm font-bold text-on-surface">{t('anNoDataTitle')}</p>
          <p className="mt-1 text-sm text-on-surface-variant">{t('anNoDataBody')}</p>
        </div>
      )}

      {/* Orders & revenue — the primary business numbers */}
      <section aria-label="Orders" className="grid gap-3 md:grid-cols-2">
        <MetricTile
          label={t('anOrdersTotal')}
          value={String(orders?.totalOrders ?? 0)}
          hint={t('anOrdersHint')}
        />
        <MetricTile
          label={t('anRevenueTotal')}
          value={formatINR(orders?.totalRevenue ?? 0)}
          hint={t('anRevenueHint')}
        />
      </section>

      {/* Audience — Followers and reel reach, which the app has always shown
          and web had no equivalent for. Followers is a lifetime total, so it
          is labelled as such rather than appearing to respond to the period
          picker. */}
      <section
        aria-label="Audience"
        className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <MetricTile
          label="Followers"
          value={String(stats?.followers ?? 0)}
          hint="All time"
        />
        <MetricTile
          label="Reel views"
          value={String(stats?.reelViews ?? 0)}
          hint="Across your reels"
        />
        <MetricTile
          label="Reel likes"
          value={String(stats?.reelLikes ?? 0)}
          hint="Across your reels"
        />
        <MetricTile
          label="Reel comments"
          value={String(stats?.reelComments ?? 0)}
          hint="Across your reels"
        />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <SimpleBarChart
          title={t('anRevenueOverTime')}
          data={orders?.revenueOverTime ?? emptySeries}
          accentClass="bg-primary"
        />
        <SimpleBarChart
          title={t('anOrdersOverTime')}
          data={orders?.ordersOverTime ?? emptySeries}
          accentClass="bg-secondary"
        />
      </div>

      {/* Top products by revenue */}
      {orders && orders.topProducts.length > 0 && (
        <section aria-label="Top products" className="mt-6">
          <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-ambient md:p-5">
            <h3 className="text-base font-semibold text-on-surface">{t('anTopProducts')}</h3>
            <p className="mt-1 text-sm text-on-surface-variant">{t('anTopProductsDesc')}</p>
            <ul className="mt-4 divide-y divide-outline-variant/10">
              {orders.topProducts.map((p) => (
                <li key={p.name} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0 truncate text-sm font-semibold text-on-surface">{p.name}</span>
                  <span className="shrink-0 text-xs text-on-surface-variant">
                    {p.quantity} {t('anQtySold')} · <span className="font-bold text-on-surface">{formatINR(p.revenue)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Engagement (impressions/CTR) — fills as customers browse */}
      <section aria-label="Search appearance" className="mt-6 grid gap-3 md:grid-cols-3">
        <MetricTile
          label={t('impressionsLabel')}
          value={appearance.impressions}
          hint={t('impressionsHint')}
          helperKey="dashImpressions"
        />
        <MetricTile
          label={t('ctrLabel')}
          value={appearance.ctr}
          hint={t('ctrHint')}
          helperKey="dashCtr"
        />
        <MetricTile
          label={t('avgPositionLabel')}
          value={appearance.avgPosition}
          hint={t('avgPositionHint')}
          helperKey="dashAvgPosition"
        />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <SimpleBarChart
          title={t('viewsOverTime')}
          subtitle={t('realDataStarted')}
          data={stats?.viewsOverTime ?? emptySeries}
          accentClass="bg-primary"
          helperKey="dashChartViews"
        />
        <SimpleBarChart
          title={t('callsMade')}
          subtitle={t('tapToCall')}
          data={stats?.callsOverTime ?? emptySeries}
          accentClass="bg-secondary"
          helperKey="dashChartCalls"
        />
      </div>

      <div className="mt-6">
        <SimpleBarChart
          title={t('directionRequestsLabel')}
          subtitle={t('turnByTurnOpens')}
          data={stats?.directionRequests ?? emptySeries}
          accentClass="bg-harvest"
          helperKey="dashChartDirections"
        />
      </div>

      <section aria-label="Insights" className="mt-6">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-on-surface">{t('insightsTitle')}</h2>
          <HelperIcon
            size="xs"
            variant="ghost"
            side="right"
            textKey="dashInsights"
            ariaLabel="Insights help"
          />
        </div>
        <p className="mt-1 text-sm text-on-surface-variant">
          {t('insightsDesc')}
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {insightCards.map((i) => (
            <InsightCard key={i.id} title={i.title} body={i.body} />
          ))}
        </div>
      </section>
    </>
  );
}
