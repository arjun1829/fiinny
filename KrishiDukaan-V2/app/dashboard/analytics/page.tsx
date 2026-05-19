'use client';

import { useEffect, useState } from "react";
import {
  callsOverTime,
  directionRequests,
  insightCards,
  viewsOverTime,
} from "../_data/mock";
import { PageHeader } from "../_components/page-header";
import { MetricTile } from "../_components/metric-tile";
import { SimpleBarChart } from "../_components/simple-bar-chart";
import { InsightCard } from "../_components/insight-card";
import { fetchRetailerAnalytics } from "../_lib/analytics-firestore";
import { auth } from "../../firebase";
import { HelperIcon } from "../../../components/helpers";

export default function AnalyticsPage() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      if (auth.currentUser) {
        try {
          const realStats = await fetchRetailerAnalytics(auth.currentUser.uid);
          setStats(realStats);
        } catch (error) {
          console.error("Failed to load analytics:", error);
        } finally {
          setLoading(false);
        }
      }
    }
    loadStats();
  }, []);

  if (loading) {
    return (
      <div className="p-20 text-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-on-surface-variant font-medium">Loading real-time analytics...</p>
      </div>
    );
  }

  const appearance = stats?.searchAppearance || { impressions: "0", ctr: "0.0%", avgPosition: "—" };

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Search visibility, engagement, and directional demand for your shop."
        helperKey="dashAnalytics"
      />

      <section aria-label="Search appearance" className="grid gap-3 md:grid-cols-3">
        <MetricTile
          label="Impressions"
          value={appearance.impressions}
          hint="Appearances in search results"
          helperKey="dashImpressions"
        />
        <MetricTile
          label="CTR"
          value={appearance.ctr}
          hint="Click-through rate"
          helperKey="dashCtr"
        />
        <MetricTile
          label="Avg. position"
          value={appearance.avgPosition}
          hint="Lower is better (1.0 is top)"
          helperKey="dashAvgPosition"
        />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <SimpleBarChart
          title="Views over time"
          subtitle="Real data tracking started"
          data={stats?.viewsOverTime || viewsOverTime}
          accentClass="bg-primary"
          helperKey="dashChartViews"
        />
        <SimpleBarChart
          title="Calls made"
          subtitle="Tap-to-call from your listing"
          data={stats?.callsOverTime || callsOverTime}
          accentClass="bg-secondary"
          helperKey="dashChartCalls"
        />
      </div>

      <div className="mt-6">
        <SimpleBarChart
          title="Direction requests"
          subtitle="Turn-by-turn opens from maps"
          data={stats?.directionRequests || directionRequests}
          accentClass="bg-harvest"
          helperKey="dashChartDirections"
        />
      </div>

      <section aria-label="Insights" className="mt-6">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-on-surface">Insights</h2>
          <HelperIcon
            size="xs"
            variant="ghost"
            side="right"
            textKey="dashInsights"
            ariaLabel="Insights help"
          />
        </div>
        <p className="mt-1 text-sm text-on-surface-variant">
          Personalized takeaways from your live metrics
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
