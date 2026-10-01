import { useMemo, useState } from 'react';
import {
  METRICS,
  NOT_SET,
  slugifyCity,
  type DemographicRow,
  type MetricKey,
} from '../lib/demographics';
import { formatMetric } from '../lib/format';

type SortKey = 'city' | MetricKey;
type SortDir = 'asc' | 'desc';

/**
 * Sortable per-city metrics table ("City Distribution"). Clicking a header sorts
 * by that column; clicking again flips direction. The parent remounts this with
 * `key={metric}` so the active metric becomes the default sort + highlight;
 * users can still re-sort manually. `(not set)` rows are kept (real usage) but
 * visually flagged so they read differently from actual cities.
 */
export function CityTable({
  rows,
  initialSortKey = 'activeUsers',
  highlightKey,
  labelHeader = 'City',
}: {
  rows: DemographicRow[];
  initialSortKey?: MetricKey;
  highlightKey?: MetricKey;
  labelHeader?: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>(initialSortKey);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      let cmp: number;
      if (sortKey === 'city') cmp = a.city.localeCompare(b.city);
      else cmp = a[sortKey] - b[sortKey];
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const toggle = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'city' ? 'asc' : 'desc');
    }
  };

  const arrow = (key: SortKey) =>
    key === sortKey ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  return (
    <div className="table-wrap">
      <table className="city-table">
        <thead>
          <tr>
            <th className="col-city sortable" onClick={() => toggle('city')}>
              {labelHeader}
              {arrow('city')}
            </th>
            {METRICS.map((m) => (
              <th
                key={m.key}
                className={`num sortable ${m.key === highlightKey ? 'col-active' : ''}`}
                onClick={() => toggle(m.key)}
              >
                {m.label}
                {arrow(m.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={slugifyCity(r.city)} className={r.isNotSet ? 'row-not-set' : ''}>
              <td className="col-city">
                {r.city === NOT_SET ? <em>{NOT_SET}</em> : r.city}
              </td>
              {METRICS.map((m) => (
                <td key={m.key} className={`num ${m.key === highlightKey ? 'col-active' : ''}`}>
                  {formatMetric(m.kind, r[m.key])}
                </td>
              ))}
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={METRICS.length + 1} className="empty">
                No cities for this period.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
