import { monthKeyToLabel } from '../lib/demographics';
import type { MonthSummary } from '../lib/analyticsRepo';

export const ALL_TIME = 'all';

/**
 * Time-period primary navigation (YouTube-Analytics style). "All Time" leads,
 * followed by each uploaded month (generated dynamically — never hardcoded), and
 * a trailing "Trends" tab once two or more months exist. We never invent months.
 */
export function MonthTabs({
  months,
  selected,
  onSelect,
  showTrends,
}: {
  months: MonthSummary[];
  selected: string; // ALL_TIME, a month key, or 'trends'
  onSelect: (view: string) => void;
  showTrends: boolean;
}) {
  return (
    <nav className="month-tabs" aria-label="Time period">
      <button
        className={`tab ${selected === ALL_TIME ? 'tab-active' : ''}`}
        onClick={() => onSelect(ALL_TIME)}
      >
        All Time
      </button>
      {months.map((m) => (
        <button
          key={m.month}
          className={`tab ${selected === m.month ? 'tab-active' : ''}`}
          onClick={() => onSelect(m.month)}
        >
          {monthKeyToLabel(m.month)}
        </button>
      ))}
      {showTrends && (
        <button
          className={`tab tab-trends ${selected === 'trends' ? 'tab-active' : ''}`}
          onClick={() => onSelect('trends')}
        >
          Trends
        </button>
      )}
    </nav>
  );
}
