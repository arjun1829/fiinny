"use client";

import { useCallback, useEffect, useState } from "react";
import { Repeat, UserCheck } from "lucide-react";
import {
  getRetentionCohorts,
  type RetentionData,
} from "../../_lib/analytics-queries";
import { RefreshButton } from "../refresh-button";
import {
  StatCard,
  SectionTitle,
  Panel,
  LoadingState,
  ErrorBanner,
  EmptyState,
  pct,
} from "./ui";

function prettyDate(key: string): string {
  const d = new Date(`${key}T00:00:00`);
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

function shortDate(key: string): string {
  const d = new Date(`${key}T00:00:00`);
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

export function RetentionTab() {
  const [data, setData] = useState<RetentionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await getRetentionCohorts();
      setData(d);
      setSavedAt(Date.now());
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const noTracking = !loading && data && !data.reliableFrom;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-on-surface-variant">
          Cohort = registration day. Returns are measured from live activity data.
        </p>
        <RefreshButton savedAt={savedAt} refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />
      </div>

      <ErrorBanner error={error} />

      {data?.reliableFrom && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          Reliable retention tracking begins <strong>{prettyDate(data.reliableFrom)}</strong>.
          Cohorts registered before this date are omitted — return activity was not tracked then,
          so their retention cannot be measured honestly.
        </p>
      )}

      {loading ? (
        <LoadingState />
      ) : noTracking ? (
        <EmptyState message="No activity data collected yet. Retention will populate as cohorts registered after tracking began return to the app." />
      ) : (
        <>
          <div>
            <SectionTitle>Retention (matured cohorts)</SectionTitle>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 sm:gap-4">
              <StatCard
                icon={UserCheck}
                label="7-day retention"
                value={data?.overall7.rate != null ? pct(data.overall7.rate) : "—"}
                sub={
                  data && data.overall7.registered > 0
                    ? `${data.overall7.returned} of ${data.overall7.registered} returned`
                    : "No matured cohorts yet"
                }
                color="bg-green-500/10 text-green-600"
              />
              <StatCard
                icon={Repeat}
                label="30-day retention"
                value={data?.overall30.rate != null ? pct(data.overall30.rate) : "—"}
                sub={
                  data && data.overall30.registered > 0
                    ? `${data.overall30.returned} of ${data.overall30.registered} returned`
                    : "No matured cohorts yet"
                }
                color="bg-blue-500/10 text-blue-600"
              />
            </div>
          </div>

          <div>
            <SectionTitle>Cohort table</SectionTitle>
            <Panel>
              {(data?.cohorts ?? []).length === 0 ? (
                <EmptyState message="No cohorts in the tracking window yet." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-outline-variant/30 text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                        <th className="py-2 pr-4">Cohort (signup day)</th>
                        <th className="py-2 pr-4 text-right">Registered</th>
                        <th className="py-2 pr-4 text-right">Returned 7d</th>
                        <th className="py-2 pr-4 text-right">7-day</th>
                        <th className="py-2 pr-4 text-right">Returned 30d</th>
                        <th className="py-2 text-right">30-day</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.cohorts ?? []).map((c) => (
                        <tr key={c.cohort} className="border-b border-outline-variant/15 last:border-0">
                          <td className="py-2 pr-4 font-medium text-on-surface">{shortDate(c.cohort)}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{c.registered}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{c.returned7}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">
                            {!c.mature7 ? (
                              <span className="text-outline">in progress</span>
                            ) : c.rate7 != null ? (
                              pct(c.rate7)
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="py-2 pr-4 text-right tabular-nums">{c.returned30}</td>
                          <td className="py-2 text-right tabular-nums">
                            {!c.mature30 ? (
                              <span className="text-outline">in progress</span>
                            ) : c.rate30 != null ? (
                              pct(c.rate30)
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-3 text-[11px] text-outline">
                &ldquo;In progress&rdquo; means the window has not fully elapsed for that cohort yet, so its
                rate is not final. Headline retention above aggregates matured cohorts only.
              </p>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
