import { Suspense, lazy, useMemo, useRef, useState } from 'react';
import {
  METRIC_BY_KEY,
  SELECTABLE_METRICS,
  UNKNOWN_STATE,
  aggregateByState,
  slugifyCity,
  type DemographicRow,
  type MetricKey,
  type MonthTotals,
} from '../lib/demographics';
import type { ReportCategory } from '../lib/analyticsPaths';
import { useCityLocations } from '../hooks/useCityLocations';
import { OverviewCards } from './OverviewCards';
import { CityTable } from './CityTable';
import type { MapPoint } from './CityMap';

// Lazy so the Google Maps bundle only loads when a period view is shown.
const CityMap = lazy(() => import('./CityMap'));

type GeoLevel = 'state' | 'city';

/**
 * One time period (a single month or All Time). Owns the shared Metric and
 * Geographic Level selectors so the City Distribution table and the map stay in
 * sync. Layout order: filters → City Distribution → Geographic map.
 */
export function PeriodView({
  rows,
  totals,
  category,
  isAllTime,
}: {
  rows: DemographicRow[];
  totals: MonthTotals | null;
  category: ReportCategory;
  isAllTime: boolean;
}) {
  const [metric, setMetric] = useState<MetricKey>('activeUsers');
  const [level, setLevel] = useState<GeoLevel>('state');
  const [drillState, setDrillState] = useState<string | null>(null);
  const mapSectionRef = useRef<HTMLElement>(null);

  const { locations, resolving } = useCityLocations(rows, category);

  const scrollToMap = () =>
    mapSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const stateOf = useMemo(
    () => (city: string) => locations[slugifyCity(city)]?.state || UNKNOWN_STATE,
    [locations],
  );

  const cityRows = useMemo(() => rows.filter((r) => !r.isNotSet), [rows]);
  const notSetValue = useMemo(
    () => rows.filter((r) => r.isNotSet).reduce((a, r) => a + r[metric], 0),
    [rows, metric],
  );

  // Mean of member-city coordinates per state (a representative interior point).
  const stateCentroids = useMemo(() => {
    const acc: Record<string, { lat: number; lng: number; n: number }> = {};
    for (const r of cityRows) {
      const loc = locations[slugifyCity(r.city)];
      if (!loc || !loc.state) continue;
      const a = (acc[loc.state] ??= { lat: 0, lng: 0, n: 0 });
      a.lat += loc.lat;
      a.lng += loc.lng;
      a.n += 1;
    }
    const out: Record<string, { lat: number; lng: number }> = {};
    for (const [st, a] of Object.entries(acc)) out[st] = { lat: a.lat / a.n, lng: a.lng / a.n };
    return out;
  }, [cityRows, locations]);

  const showingCities = level === 'city' || drillState !== null;

  // Rows for the City Distribution table + points for the map.
  const { displayRows, points, unresolved, labelHeader } = useMemo(() => {
    if (showingCities) {
      const base = drillState
        ? cityRows.filter((r) => stateOf(r.city) === drillState)
        : cityRows;
      const pts: MapPoint[] = [];
      const miss: { label: string; value: number }[] = [];
      for (const r of base) {
        const loc = locations[slugifyCity(r.city)];
        if (loc) pts.push({ key: slugifyCity(r.city), lat: loc.lat, lng: loc.lng, value: r[metric], row: r });
        else miss.push({ label: r.city, value: r[metric] });
      }
      return { displayRows: base, points: pts, unresolved: miss, labelHeader: 'City' };
    }

    const stateRows = aggregateByState(cityRows, stateOf);
    const pts: MapPoint[] = [];
    const miss: { label: string; value: number }[] = [];
    for (const s of stateRows) {
      const c = s.city !== UNKNOWN_STATE ? stateCentroids[s.city] : undefined;
      if (c) pts.push({ key: s.city, lat: c.lat, lng: c.lng, value: s[metric], row: s });
      else miss.push({ label: s.city, value: s[metric] });
    }
    return { displayRows: stateRows, points: pts, unresolved: miss, labelHeader: 'State' };
  }, [showingCities, drillState, cityRows, locations, stateOf, stateCentroids, metric]);

  const changeLevel = (next: GeoLevel) => {
    setLevel(next);
    setDrillState(null);
  };

  return (
    <>
      {totals && <OverviewCards totals={totals} isAllTime={isAllTime} />}

      <div className="filters-bar">
        <label className="metric-select">
          <span>Metric</span>
          <select value={metric} onChange={(e) => setMetric(e.target.value as MetricKey)}>
            {SELECTABLE_METRICS.map((key) => (
              <option key={key} value={key}>
                {METRIC_BY_KEY[key].label}
              </option>
            ))}
          </select>
        </label>

        <label className="metric-select">
          <span>Geographic level</span>
          <select value={level} onChange={(e) => changeLevel(e.target.value as GeoLevel)}>
            <option value="state">State</option>
            <option value="city">City</option>
          </select>
        </label>

        {drillState && (
          <button type="button" className="back-btn" onClick={() => setDrillState(null)}>
            ← Back to States
          </button>
        )}

        <button type="button" className="see-map-btn" onClick={scrollToMap}>
          See map ↓
        </button>
      </div>

      <section>
        <h3 className="section-title">
          City Distribution
          {drillState ? ` · ${drillState}` : labelHeader === 'State' ? ' · by State' : ''}
        </h3>
        <CityTable
          key={`${level}-${drillState ?? ''}-${metric}`}
          rows={displayRows}
          initialSortKey={metric}
          highlightKey={metric}
          labelHeader={labelHeader}
        />
      </section>

      <section ref={mapSectionRef} className="map-anchor">
        <h3 className="section-title">
          Geographic map {showingCities ? '· Cities' : '· States'}
          {drillState ? ` in ${drillState}` : ''}
        </h3>
        <Suspense fallback={<div className="state">Loading map…</div>}>
          <CityMap
            points={points}
            metric={metric}
            resolving={resolving}
            notSetValue={notSetValue}
            unresolved={unresolved}
            onDrill={!showingCities ? (label) => setDrillState(label) : undefined}
          />
        </Suspense>
      </section>
    </>
  );
}
