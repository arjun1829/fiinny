import { describe, expect, it } from 'vitest';
import {
  aggregateByState,
  aggregateCitiesAcrossMonths,
  buildMonthKey,
  computeExactTotals,
  computeTotals,
  monthKeyToLabel,
  NOT_SET,
  parseDemographicCsv,
  UNKNOWN_STATE,
  type DemographicRow,
} from './demographics';

function row(partial: Partial<DemographicRow> & { city: string }): DemographicRow {
  return {
    isNotSet: partial.city === NOT_SET,
    activeUsers: 0,
    newUsers: 0,
    engagedSessions: 0,
    engagementRate: 0,
    engagedSessionsPerActiveUser: 0,
    averageEngagementTimePerActiveUser: 0,
    eventCount: 0,
    keyEvents: 0,
    userKeyEventRate: 0,
    ...partial,
  };
}

// A representative GA4 "Demographic details: City" export: comment header with a
// date range, the real table, a Total revenue column to ignore, (not set), a
// quoted/thousands value, a trailing totals row with no city, and a comment tail.
const SAMPLE_CSV = `# ----------------------------------------
# All Users
# City
# 20260901-20260930
# ----------------------------------------

Town/City,Active users,New users,Engaged sessions,Engagement rate,Engaged sessions per active user,Average engagement time per active user,Event count,Key events,User key event rate,Total revenue
Pune,"1,200",800,1500,0.6673,1.25,92.5,8000,120,0.08,0
Mumbai,900,600,1100,55.5%,1.22,1m 20s,6000,90,0.1,0
${NOT_SET},150,100,120,0.4,0.8,30,500,5,0.03,0
Nowhereville,50,40,45,0.5,0.9,25,200,2,0.04,0
,2300,1540,2765,0.61,1.2,88,14700,217,0.09,0

# ----------------------------------------`;

describe('parseDemographicCsv', () => {
  const result = parseDemographicCsv(SAMPLE_CSV);

  it('detects the report month from the comment header', () => {
    expect(result.detectedMonth).toBe('2026-09');
  });

  it('ignores the Total revenue column with a warning', () => {
    expect(result.warnings.some((w) => w.includes('Total revenue'))).toBe(true);
  });

  it('skips the trailing totals row that has no city', () => {
    expect(result.rows.map((r) => r.city)).toEqual([
      'Pune',
      'Mumbai',
      NOT_SET,
      'Nowhereville',
    ]);
  });

  it('parses thousands separators and plain counts', () => {
    const pune = result.rows.find((r) => r.city === 'Pune')!;
    expect(pune.activeUsers).toBe(1200);
    expect(pune.eventCount).toBe(8000);
  });

  it('normalizes percentage and decimal rates to 0..1', () => {
    const pune = result.rows.find((r) => r.city === 'Pune')!;
    const mumbai = result.rows.find((r) => r.city === 'Mumbai')!;
    expect(pune.engagementRate).toBeCloseTo(0.6673, 4);
    expect(mumbai.engagementRate).toBeCloseTo(0.555, 4); // "55.5%"
  });

  it('parses duration in both seconds and token form', () => {
    const pune = result.rows.find((r) => r.city === 'Pune')!;
    const mumbai = result.rows.find((r) => r.city === 'Mumbai')!;
    expect(pune.averageEngagementTimePerActiveUser).toBe(92.5);
    expect(mumbai.averageEngagementTimePerActiveUser).toBe(80); // "1m 20s"
  });

  it('flags (not set) rows separately', () => {
    const notSet = result.rows.find((r) => r.city === NOT_SET)!;
    expect(notSet.isNotSet).toBe(true);
    expect(result.rows.filter((r) => !r.isNotSet)).toHaveLength(3);
  });

  it('reports no numeric errors for valid data', () => {
    expect(result.errors).toHaveLength(0);
  });
});

describe('validation', () => {
  it('reports an error for a non-numeric metric cell', () => {
    const csv =
      'Town/City,Active users,New users,Engaged sessions,Engagement rate,Engaged sessions per active user,Average engagement time per active user,Event count,Key events,User key event rate\n' +
      'Pune,abc,10,20,0.5,1,30,100,5,0.05';
    const res = parseDemographicCsv(csv);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0].field).toBe('activeUsers');
    expect(res.errors[0].city).toBe('Pune');
  });

  it('warns when a required column is missing', () => {
    // City + 3 metrics is enough to detect the header, but the rest are absent.
    const csv =
      'Town/City,Active users,New users,Engaged sessions\nPune,100,50,40';
    const res = parseDemographicCsv(csv);
    expect(res.rows).toHaveLength(0);
    expect(res.warnings.some((w) => w.includes('Missing required column'))).toBe(true);
  });
});

describe('computeTotals', () => {
  it('sums counts and weights rates by active users', () => {
    const { rows } = parseDemographicCsv(SAMPLE_CSV);
    const t = computeTotals(rows);
    // Active users: 1200 + 900 + 150 + 50
    expect(t.activeUsers).toBe(2300);
    expect(t.newUsers).toBe(1540);
    // engagedSessionsPerActiveUser overall = totalEngaged / totalActive
    expect(t.engagedSessionsPerActiveUser).toBeCloseTo(2765 / 2300, 4);
    // Weighted engagement rate stays within 0..1
    expect(t.engagementRate).toBeGreaterThan(0);
    expect(t.engagementRate).toBeLessThan(1);
    expect(t.cityCount).toBe(3); // excludes (not set)
    expect(t.notSetActiveUsers).toBe(150);
  });
});

describe('All Time aggregation', () => {
  // Same city across two months.
  const puneM1 = row({
    city: 'Pune',
    activeUsers: 1000,
    newUsers: 800,
    engagedSessions: 1500,
    engagementRate: 0.6, // -> 2500 sessions
    averageEngagementTimePerActiveUser: 100,
    eventCount: 8000,
    keyEvents: 120,
    userKeyEventRate: 0.1,
  });
  const puneM2 = row({
    city: 'Pune',
    activeUsers: 500,
    newUsers: 300,
    engagedSessions: 600,
    engagementRate: 0.5, // -> 1200 sessions
    averageEngagementTimePerActiveUser: 40,
    eventCount: 3000,
    keyEvents: 60,
    userKeyEventRate: 0.2,
  });

  it('groups by city and sums additive metrics', () => {
    const agg = aggregateCitiesAcrossMonths([puneM1, puneM2]);
    expect(agg).toHaveLength(1);
    const p = agg[0];
    expect(p.city).toBe('Pune');
    expect(p.activeUsers).toBe(1500);
    expect(p.newUsers).toBe(1100);
    expect(p.engagedSessions).toBe(2100);
    expect(p.eventCount).toBe(11000);
    expect(p.keyEvents).toBe(180);
  });

  it('recomputes derived metrics from aggregated numerators/denominators', () => {
    const p = aggregateCitiesAcrossMonths([puneM1, puneM2])[0];
    // engagementRate = 2100 engaged / (2500 + 1200) sessions
    expect(p.engagementRate).toBeCloseTo(2100 / 3700, 6);
    // engaged sessions per active user = 2100 / 1500
    expect(p.engagedSessionsPerActiveUser).toBeCloseTo(2100 / 1500, 6);
    // avg time weighted by active users = (100*1000 + 40*500) / 1500
    expect(p.averageEngagementTimePerActiveUser).toBeCloseTo(120000 / 1500, 6);
    // user key event rate weighted by active users = (0.1*1000 + 0.2*500) / 1500
    expect(p.userKeyEventRate).toBeCloseTo(200 / 1500, 6);
  });

  it('is NOT a simple average of monthly engagement-rate percentages', () => {
    const p = aggregateCitiesAcrossMonths([puneM1, puneM2])[0];
    const naiveAverage = (0.6 + 0.5) / 2;
    expect(p.engagementRate).not.toBeCloseTo(naiveAverage, 4);
  });

  it('keeps separate cities separate and (not set) as its own group', () => {
    const agg = aggregateCitiesAcrossMonths([
      puneM1,
      row({ city: 'Mumbai', activeUsers: 200 }),
      row({ city: NOT_SET, activeUsers: 50 }),
    ]);
    expect(agg).toHaveLength(3);
    const notSet = agg.find((r) => r.city === NOT_SET)!;
    expect(notSet.isNotSet).toBe(true);
  });

  it('computeExactTotals matches aggregating then totalling', () => {
    const t = computeExactTotals([puneM1, puneM2]);
    expect(t.activeUsers).toBe(1500);
    expect(t.engagementRate).toBeCloseTo(2100 / 3700, 6);
    const aggTotals = computeExactTotals(aggregateCitiesAcrossMonths([puneM1, puneM2]));
    expect(aggTotals.engagementRate).toBeCloseTo(t.engagementRate, 6);
  });
});

describe('aggregateByState', () => {
  const rows = [
    row({ city: 'Pune', activeUsers: 1000, newUsers: 100, engagedSessions: 600, engagementRate: 0.6 }),
    row({ city: 'Mumbai', activeUsers: 500, newUsers: 50, engagedSessions: 300, engagementRate: 0.5 }),
    row({ city: 'Bengaluru', activeUsers: 200, newUsers: 20, engagedSessions: 100, engagementRate: 0.5 }),
    row({ city: 'Nowhereville', activeUsers: 10, newUsers: 1, engagedSessions: 5, engagementRate: 0.5 }),
    row({ city: NOT_SET, activeUsers: 999 }),
  ];
  const stateOf = (c: string) =>
    ({ Pune: 'Maharashtra', Mumbai: 'Maharashtra', Bengaluru: 'Karnataka' })[c] ?? '';

  const states = aggregateByState(rows, stateOf);

  it('groups cities by state and sums additive metrics', () => {
    const mh = states.find((s) => s.city === 'Maharashtra')!;
    expect(mh.activeUsers).toBe(1500);
    expect(mh.newUsers).toBe(150);
    expect(mh.engagedSessions).toBe(900);
  });

  it('recomputes state engagement rate from aggregated sessions', () => {
    const mh = states.find((s) => s.city === 'Maharashtra')!;
    // engaged 900 / sessions (600/0.6 + 300/0.5 = 1000 + 600 = 1600)
    expect(mh.engagementRate).toBeCloseTo(900 / 1600, 6);
  });

  it('collapses unresolved cities into Unknown and excludes (not set)', () => {
    expect(states.some((s) => s.city === UNKNOWN_STATE)).toBe(true);
    expect(states.find((s) => s.city === UNKNOWN_STATE)!.activeUsers).toBe(10);
    expect(states.some((s) => s.city === NOT_SET)).toBe(false);
  });
});

describe('month helpers', () => {
  it('builds and labels month keys', () => {
    expect(buildMonthKey(2026, 9)).toBe('2026-09');
    expect(monthKeyToLabel('2026-09')).toBe('September 2026');
  });
});
