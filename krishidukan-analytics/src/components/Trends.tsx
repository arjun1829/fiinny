import { useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  METRIC_BY_KEY,
  monthKeyToShort,
  type MetricKey,
} from '../lib/demographics';
import type { MonthSummary } from '../lib/analyticsRepo';
import { formatMetric } from '../lib/format';

// Metrics offered for month-over-month comparison (per spec).
const TREND_METRICS: MetricKey[] = [
  'activeUsers',
  'newUsers',
  'engagementRate',
  'engagedSessions',
  'averageEngagementTimePerActiveUser',
  'eventCount',
  'keyEvents',
];

/**
 * Month-over-month comparison. Only uploaded months are plotted — no gap-filling
 * or invented points. Needs at least two months to be meaningful.
 */
export function Trends({ months }: { months: MonthSummary[] }) {
  const [metric, setMetric] = useState<MetricKey>('activeUsers');
  const def = METRIC_BY_KEY[metric];

  const data = months.map((m) => ({
    month: monthKeyToShort(m.month),
    value: m.totals ? m.totals[metric] : 0,
  }));

  return (
    <div className="trends">
      <div className="trend-picker">
        {TREND_METRICS.map((key) => (
          <button
            key={key}
            className={`chip ${key === metric ? 'chip-active' : ''}`}
            onClick={() => setMetric(key)}
          >
            {METRIC_BY_KEY[key].label}
          </button>
        ))}
      </div>

      <div className="chart">
        <ResponsiveContainer width="100%" height={380}>
          <LineChart data={data} margin={{ top: 16, right: 24, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis
              tick={{ fontSize: 12 }}
              width={72}
              tickFormatter={(v: number) => formatMetric(def.kind, v)}
            />
            <Tooltip
              formatter={(v) => [formatMetric(def.kind, Number(v)), def.label]}
            />
            <Line
              type="monotone"
              dataKey="value"
              name={def.label}
              stroke="#2e7d32"
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="trend-note">
        Comparing {months.length} uploaded month(s). Totals are aggregated across
        cities (counts summed; rates/time are active-user-weighted).
      </p>
    </div>
  );
}
