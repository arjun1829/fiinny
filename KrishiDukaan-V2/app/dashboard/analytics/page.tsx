'use client';

import { useEffect, useState } from "react";
import {
  callsOverTime,
  directionRequests,
  viewsOverTime,
} from "../_data/mock";
import { PageHeader } from "../_components/page-header";
import { MetricTile } from "../_components/metric-tile";
import { SimpleBarChart } from "../_components/simple-bar-chart";
import { InsightCard } from "../_components/insight-card";
import { fetchRetailerAnalytics } from "../_lib/analytics-firestore";
import { useEffectiveUser } from "../_context/effective-user-context";
import { HelperIcon } from "../../../components/helpers";
import { useI18n } from "../../i18n/I18nContext";

export default function AnalyticsPage() {
  const { t } = useI18n();
  const { uid: effectiveUid } = useEffectiveUser();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!effectiveUid) return;
    (async () => {
      try {
        const realStats = await fetchRetailerAnalytics(effectiveUid);
        setStats(realStats);
      } catch (error) {
        console.error("Failed to load analytics:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, [effectiveUid]);

  if (loading) {
    return (
      <div className="p-20 text-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-on-surface-variant font-medium">{t('loadingAnalytics')}</p>
      </div>
    );
  }

  const appearance = stats?.searchAppearance || { impressions: "0", ctr: "0.0%", avgPosition: "—" };

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

      <section aria-label="Search appearance" className="grid gap-3 md:grid-cols-3">
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
          data={stats?.viewsOverTime || viewsOverTime}
          accentClass="bg-primary"
          helperKey="dashChartViews"
        />
        <SimpleBarChart
          title={t('callsMade')}
          subtitle={t('tapToCall')}
          data={stats?.callsOverTime || callsOverTime}
          accentClass="bg-secondary"
          helperKey="dashChartCalls"
        />
      </div>

      <div className="mt-6">
        <SimpleBarChart
          title={t('directionRequestsLabel')}
          subtitle={t('turnByTurnOpens')}
          data={stats?.directionRequests || directionRequests}
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
