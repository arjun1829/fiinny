import { METRIC_BY_KEY, type MetricKey, type MonthTotals } from '../lib/demographics';
import { formatMetric } from '../lib/format';

// The eight headline metrics, in the order requested for the overview.
const CARD_METRICS: MetricKey[] = [
  'activeUsers',
  'newUsers',
  'engagedSessions',
  'engagementRate',
  'averageEngagementTimePerActiveUser',
  'eventCount',
  'keyEvents',
  'userKeyEventRate',
];

export function OverviewCards({
  totals,
  isAllTime = false,
}: {
  totals: MonthTotals;
  isAllTime?: boolean;
}) {
  return (
    <div className="cards">
      {CARD_METRICS.map((key) => {
        const def = METRIC_BY_KEY[key];
        // Summed monthly actives are not unique all-time users — flag it.
        const note = isAllTime && key === 'activeUsers'
          ? 'Sum of monthly counts — not unique users'
          : null;
        return (
          <div className="card" key={key}>
            <div className="card-label">{def.label}</div>
            <div className="card-value">{formatMetric(def.kind, totals[key])}</div>
            {note && <div className="card-note">{note}</div>}
          </div>
        );
      })}
    </div>
  );
}
