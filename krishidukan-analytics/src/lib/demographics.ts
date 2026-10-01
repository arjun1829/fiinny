import { parseCsv } from './csv';

/**
 * Domain model + parsing/validation for the monthly Firebase Analytics
 * "Demographic details: City" CSV export. The uploaded CSV is the sole source
 * of truth — we store the actual metrics it contains and never call any
 * Analytics API or reconstruct values row-by-row.
 */

/** Firebase Analytics uses this literal for traffic with no resolved city. */
export const NOT_SET = '(not set)';

/** Stable, filesystem/Firestore-safe id for a city name. (not set) -> _not_set. */
export function slugifyCity(city: string): string {
  if (city === NOT_SET) return '_not_set';
  return city.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'city';
}

/** Numeric metrics we store/visualise (everything except the city label). */
export type MetricKey =
  | 'activeUsers'
  | 'newUsers'
  | 'engagedSessions'
  | 'engagementRate'
  | 'engagedSessionsPerActiveUser'
  | 'averageEngagementTimePerActiveUser'
  | 'eventCount'
  | 'keyEvents'
  | 'userKeyEventRate';

export type MetricKind = 'count' | 'rate' | 'duration' | 'decimal';

export interface MetricDef {
  key: MetricKey;
  label: string;
  short: string;
  kind: MetricKind;
}

/** Display metadata + ordering for every stored metric. */
export const METRICS: MetricDef[] = [
  { key: 'activeUsers', label: 'Active Users', short: 'Active', kind: 'count' },
  { key: 'newUsers', label: 'New Users', short: 'New', kind: 'count' },
  { key: 'engagedSessions', label: 'Engaged Sessions', short: 'Eng. sessions', kind: 'count' },
  { key: 'engagementRate', label: 'Engagement Rate', short: 'Eng. rate', kind: 'rate' },
  {
    key: 'engagedSessionsPerActiveUser',
    label: 'Engaged Sessions / Active User',
    short: 'Eng. / user',
    kind: 'decimal',
  },
  {
    key: 'averageEngagementTimePerActiveUser',
    label: 'Avg Engagement Time',
    short: 'Avg time',
    kind: 'duration',
  },
  { key: 'eventCount', label: 'Event Count', short: 'Events', kind: 'count' },
  { key: 'keyEvents', label: 'Key Events', short: 'Key events', kind: 'count' },
  { key: 'userKeyEventRate', label: 'User Key Event Rate', short: 'Key event rate', kind: 'rate' },
];

export const METRIC_BY_KEY: Record<MetricKey, MetricDef> = Object.fromEntries(
  METRICS.map((m) => [m.key, m]),
) as Record<MetricKey, MetricDef>;

/**
 * Metrics the user can pick to drive the City Distribution ordering and map
 * bubble sizes. Excludes the composite "engaged sessions / active user" ratio.
 */
export const SELECTABLE_METRICS: MetricKey[] = [
  'activeUsers',
  'newUsers',
  'engagedSessions',
  'eventCount',
  'keyEvents',
  'engagementRate',
  'averageEngagementTimePerActiveUser',
  'userKeyEventRate',
];

/** One normalized city row, matching the stored Firestore row schema. */
export interface DemographicRow {
  city: string;
  activeUsers: number;
  newUsers: number;
  engagedSessions: number;
  engagementRate: number; // 0..1
  engagedSessionsPerActiveUser: number;
  averageEngagementTimePerActiveUser: number; // seconds
  eventCount: number;
  keyEvents: number;
  userKeyEventRate: number; // 0..1
  /** city === NOT_SET — excluded from the map, shown separately. */
  isNotSet: boolean;
}

/** Month-level aggregate stored on the month doc for fast trends/overview. */
export interface MonthTotals {
  activeUsers: number;
  newUsers: number;
  engagedSessions: number;
  eventCount: number;
  keyEvents: number;
  engagementRate: number; // active-user weighted
  engagedSessionsPerActiveUser: number; // engagedSessions / activeUsers
  averageEngagementTimePerActiveUser: number; // active-user weighted
  userKeyEventRate: number; // active-user weighted
  cityCount: number; // rows excluding (not set)
  notSetActiveUsers: number;
}

// ── Column detection ─────────────────────────────────────────────────────────

const COLUMN_ALIASES: Record<keyof DemographicRow | 'city', string[]> = {
  city: ['towncity', 'city'],
  activeUsers: ['activeusers'],
  newUsers: ['newusers'],
  engagedSessions: ['engagedsessions'],
  engagementRate: ['engagementrate'],
  engagedSessionsPerActiveUser: ['engagedsessionsperactiveuser'],
  averageEngagementTimePerActiveUser: [
    'averageengagementtimeperactiveuser',
    'avgengagementtimeperactiveuser',
  ],
  eventCount: ['eventcount'],
  keyEvents: ['keyevents', 'conversions'],
  userKeyEventRate: ['userkeyeventrate', 'userconversionrate'],
  isNotSet: [], // derived, never a column
};

/** Logical columns that must be present for a valid import. */
export const REQUIRED_FIELDS: (keyof DemographicRow)[] = [
  'city',
  'activeUsers',
  'newUsers',
  'engagedSessions',
  'engagementRate',
  'engagedSessionsPerActiveUser',
  'averageEngagementTimePerActiveUser',
  'eventCount',
  'keyEvents',
  'userKeyEventRate',
];

const NUMERIC_FIELDS = REQUIRED_FIELDS.filter((f) => f !== 'city') as MetricKey[];
const RATE_FIELDS = new Set<MetricKey>(['engagementRate', 'userKeyEventRate']);
const DURATION_FIELDS = new Set<MetricKey>(['averageEngagementTimePerActiveUser']);

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '');
}

type ColumnMap = Partial<Record<keyof DemographicRow, number>>;

function detectColumns(header: string[]): ColumnMap {
  const normalized = header.map(normalizeHeader);
  const map: ColumnMap = {};
  for (const field of REQUIRED_FIELDS) {
    for (const alias of COLUMN_ALIASES[field]) {
      const idx = normalized.indexOf(alias);
      if (idx !== -1) {
        map[field] = idx;
        break;
      }
    }
  }
  return map;
}

// ── Value parsing ────────────────────────────────────────────────────────────

/** Strip grouping commas, spaces and surrounding quotes. '' / '-' -> null. */
function cleanNumeric(raw: string): string | null {
  const s = raw.trim().replace(/[,\s]/g, '');
  if (s === '' || s === '-') return null;
  return s;
}

/** Count/plain number. Returns null when unparseable. */
function parseCount(raw: string): number | null {
  const s = cleanNumeric(raw);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Rate as a 0..1 decimal. Accepts GA4 decimals ("0.6673") and percentages
 * ("66.73%" / "66.73"). A bare value > 1 is treated as a percentage, since a
 * valid rate can never exceed 1.
 */
function parseRate(raw: string): number | null {
  const trimmed = raw.trim();
  const hadPercent = trimmed.includes('%');
  const s = cleanNumeric(trimmed.replace('%', ''));
  if (s === null) return null;
  let n = Number(s);
  if (!Number.isFinite(n)) return null;
  if (hadPercent || n > 1) n = n / 100;
  return n;
}

/**
 * Duration in seconds. Accepts plain seconds ("92.5"), "1h 2m 3s" / "1m 23s"
 * token form, and "h:m:s" / "m:s" clock form.
 */
function parseDuration(raw: string): number | null {
  const t = raw.trim();
  if (t === '' || t === '-') return null;

  if (t.includes(':')) {
    const parts = t.split(':').map((p) => Number(p.trim()));
    if (parts.some((p) => !Number.isFinite(p))) return null;
    return parts.reduce((acc, p) => acc * 60 + p, 0);
  }

  if (/[hms]/i.test(t)) {
    let total = 0;
    const re = /(\d+(?:\.\d+)?)\s*([hms])/gi;
    let m: RegExpExecArray | null;
    let matched = false;
    while ((m = re.exec(t)) !== null) {
      matched = true;
      const v = Number(m[1]);
      const unit = m[2].toLowerCase();
      total += unit === 'h' ? v * 3600 : unit === 'm' ? v * 60 : v;
    }
    return matched ? total : null;
  }

  return parseCount(t);
}

function parseField(field: MetricKey, raw: string): number | null {
  if (RATE_FIELDS.has(field)) return parseRate(raw);
  if (DURATION_FIELDS.has(field)) return parseDuration(raw);
  return parseCount(raw);
}

// ── Parse result ─────────────────────────────────────────────────────────────

export interface RowError {
  rowNumber: number; // 1-based position among data rows
  city: string;
  field: MetricKey;
  value: string;
}

export interface ParseResult {
  rows: DemographicRow[];
  headers: string[];
  errors: RowError[];
  /** Non-fatal notices (skipped totals rows, dropped Total revenue, etc.). */
  warnings: string[];
  /** Month inferred from the GA4 comment header, if any (YYYY-MM). */
  detectedMonth: string | null;
}

/**
 * Parse + validate a GA4 City demographic CSV. Never throws for data problems;
 * structural failures (no header / no rows) are returned via `warnings` with an
 * empty `rows`, and per-cell numeric problems via `errors`.
 */
export function parseDemographicCsv(text: string): ParseResult {
  const records = parseCsv(text);
  const warnings: string[] = [];
  const errors: RowError[] = [];

  const detectedMonth = detectMonth(records);

  // Find the header row: first record that resolves a city column and at least
  // three metric columns (skips GA4's leading comment/blank lines).
  let headerIdx = -1;
  let columns: ColumnMap = {};
  for (let i = 0; i < records.length; i++) {
    const candidate = detectColumns(records[i]);
    const metricHits = NUMERIC_FIELDS.filter((f) => candidate[f] !== undefined).length;
    if (candidate.city !== undefined && metricHits >= 3) {
      headerIdx = i;
      columns = candidate;
      break;
    }
  }

  if (headerIdx === -1) {
    warnings.push('Could not find a header row containing "Town/City" and metric columns.');
    return { rows: [], headers: [], errors, warnings, detectedMonth };
  }

  const headers = records[headerIdx];
  if (headers.some((h) => normalizeHeader(h) === 'totalrevenue')) {
    warnings.push('"Total revenue" column was ignored, as requested.');
  }

  const missing = REQUIRED_FIELDS.filter((f) => columns[f] === undefined);
  if (missing.length > 0) {
    warnings.push(`Missing required column(s): ${missing.join(', ')}.`);
    return { rows: [], headers, errors, warnings, detectedMonth };
  }

  const rows: DemographicRow[] = [];
  let dataRowNumber = 0;

  for (let i = headerIdx + 1; i < records.length; i++) {
    const rec = records[i];
    const allEmpty = rec.every((c) => c.trim() === '');
    if (allEmpty) continue;
    // GA4 appends comment blocks after the table; stop at the first one.
    if (rec[0]?.trim().startsWith('#')) break;

    const cityRaw = (rec[columns.city!] ?? '').trim();
    if (cityRaw === '') {
      warnings.push(`Row ${i + 1}: skipped a row with no city (likely a totals row).`);
      continue;
    }

    dataRowNumber++;
    const city = cityRaw;
    const isNotSet = city === NOT_SET;
    const parsed: Record<string, number> = {};

    for (const field of NUMERIC_FIELDS) {
      const raw = rec[columns[field]!] ?? '';
      const value = parseField(field, raw);
      if (value === null || !Number.isFinite(value) || value < 0) {
        errors.push({ rowNumber: dataRowNumber, city, field, value: raw.trim() });
        parsed[field] = 0;
      } else {
        parsed[field] = value;
      }
    }

    rows.push({
      city,
      isNotSet,
      activeUsers: parsed.activeUsers,
      newUsers: parsed.newUsers,
      engagedSessions: parsed.engagedSessions,
      engagementRate: parsed.engagementRate,
      engagedSessionsPerActiveUser: parsed.engagedSessionsPerActiveUser,
      averageEngagementTimePerActiveUser: parsed.averageEngagementTimePerActiveUser,
      eventCount: parsed.eventCount,
      keyEvents: parsed.keyEvents,
      userKeyEventRate: parsed.userKeyEventRate,
    });
  }

  if (rows.length === 0) {
    warnings.push('No data rows found below the header.');
  }

  return { rows, headers, errors, warnings, detectedMonth };
}

// ── Aggregation ──────────────────────────────────────────────────────────────

function weightedAverage(
  rows: DemographicRow[],
  value: (r: DemographicRow) => number,
  weight: (r: DemographicRow) => number,
): number {
  let num = 0;
  let den = 0;
  for (const r of rows) {
    const w = weight(r);
    if (w > 0) {
      num += value(r) * w;
      den += w;
    }
  }
  return den > 0 ? num / den : 0;
}

/** Month totals: sums for counts, active-user-weighted averages for rates/time. */
export function computeTotals(rows: DemographicRow[]): MonthTotals {
  const sum = (f: (r: DemographicRow) => number) => rows.reduce((a, r) => a + f(r), 0);
  const activeUsers = sum((r) => r.activeUsers);
  const engagedSessions = sum((r) => r.engagedSessions);

  return {
    activeUsers,
    newUsers: sum((r) => r.newUsers),
    engagedSessions,
    eventCount: sum((r) => r.eventCount),
    keyEvents: sum((r) => r.keyEvents),
    engagementRate: weightedAverage(rows, (r) => r.engagementRate, (r) => r.activeUsers),
    engagedSessionsPerActiveUser: activeUsers > 0 ? engagedSessions / activeUsers : 0,
    averageEngagementTimePerActiveUser: weightedAverage(
      rows,
      (r) => r.averageEngagementTimePerActiveUser,
      (r) => r.activeUsers,
    ),
    userKeyEventRate: weightedAverage(rows, (r) => r.userKeyEventRate, (r) => r.activeUsers),
    cityCount: rows.filter((r) => !r.isNotSet).length,
    notSetActiveUsers: sum((r) => (r.isNotSet ? r.activeUsers : 0)),
  };
}

// ── All-Time aggregation ─────────────────────────────────────────────────────
// GA4 does not export session counts directly, but engagementRate =
// engagedSessions / sessions, so we can reconstruct each row's session count and
// aggregate rates from true numerators/denominators instead of averaging
// monthly percentages.

function reconstructedSessions(r: DemographicRow): number {
  return r.engagementRate > 0 ? r.engagedSessions / r.engagementRate : 0;
}

/** Label used when a city/state cannot be confidently resolved. */
export const UNKNOWN_STATE = 'Unknown';

/**
 * Combine many rows into one, under a given label (stored in `city`). Count
 * metrics are summed; derived metrics are recomputed from the summed underlying
 * values (never by averaging percentages). Used for city-across-months and
 * state-across-cities aggregation alike.
 *
 * NOTE: summed activeUsers is an aggregate of monthly active-user counts, NOT
 * unique users — the CSVs carry no user ids, so a user can recur across months.
 */
function aggregateGroup(
  group: DemographicRow[],
  label: string,
  isNotSet: boolean,
): DemographicRow {
  const sum = (f: (r: DemographicRow) => number) => group.reduce((a, r) => a + f(r), 0);
  const activeUsers = sum((r) => r.activeUsers);
  const engagedSessions = sum((r) => r.engagedSessions);
  const totalSessions = sum(reconstructedSessions);
  const totalEngagementTime = sum((r) => r.averageEngagementTimePerActiveUser * r.activeUsers);
  const keyEventUsers = sum((r) => r.userKeyEventRate * r.activeUsers);

  return {
    city: label,
    isNotSet,
    activeUsers,
    newUsers: sum((r) => r.newUsers),
    engagedSessions,
    engagementRate: totalSessions > 0 ? engagedSessions / totalSessions : 0,
    engagedSessionsPerActiveUser: activeUsers > 0 ? engagedSessions / activeUsers : 0,
    averageEngagementTimePerActiveUser: activeUsers > 0 ? totalEngagementTime / activeUsers : 0,
    eventCount: sum((r) => r.eventCount),
    keyEvents: sum((r) => r.keyEvents),
    userKeyEventRate: activeUsers > 0 ? keyEventUsers / activeUsers : 0,
  };
}

/** Group all rows (across months) by normalized city into one row per city. */
export function aggregateCitiesAcrossMonths(rows: DemographicRow[]): DemographicRow[] {
  const groups = new Map<string, DemographicRow[]>();
  for (const r of rows) {
    const slug = slugifyCity(r.city);
    const g = groups.get(slug);
    if (g) g.push(r);
    else groups.set(slug, [r]);
  }
  return Array.from(groups.values(), (g) => {
    const base = g.find((r) => !r.isNotSet) ?? g[0];
    return aggregateGroup(g, base.city, base.isNotSet);
  });
}

/**
 * Aggregate city rows into one row per state (label stored in `city`). `(not set)`
 * rows are excluded (handled separately). Cities whose state cannot be resolved
 * collapse into a single UNKNOWN_STATE group — never guessed into a real state.
 * Derived metrics are recomputed from aggregated underlying values.
 */
export function aggregateByState(
  rows: DemographicRow[],
  stateOf: (city: string) => string,
): DemographicRow[] {
  const groups = new Map<string, DemographicRow[]>();
  for (const r of rows) {
    if (r.isNotSet) continue;
    const state = stateOf(r.city) || UNKNOWN_STATE;
    const g = groups.get(state);
    if (g) g.push(r);
    else groups.set(state, [r]);
  }
  return Array.from(groups.entries(), ([state, g]) => aggregateGroup(g, state, false));
}

/**
 * Period totals computed from true numerators/denominators (reconstructed
 * sessions, active-user-weighted time). Correct for both a single month's rows
 * and an aggregated All-Time set.
 */
export function computeExactTotals(rows: DemographicRow[]): MonthTotals {
  const sum = (f: (r: DemographicRow) => number) => rows.reduce((a, r) => a + f(r), 0);
  const activeUsers = sum((r) => r.activeUsers);
  const engagedSessions = sum((r) => r.engagedSessions);
  const totalSessions = sum(reconstructedSessions);
  const totalEngagementTime = sum((r) => r.averageEngagementTimePerActiveUser * r.activeUsers);
  const keyEventUsers = sum((r) => r.userKeyEventRate * r.activeUsers);

  return {
    activeUsers,
    newUsers: sum((r) => r.newUsers),
    engagedSessions,
    eventCount: sum((r) => r.eventCount),
    keyEvents: sum((r) => r.keyEvents),
    engagementRate: totalSessions > 0 ? engagedSessions / totalSessions : 0,
    engagedSessionsPerActiveUser: activeUsers > 0 ? engagedSessions / activeUsers : 0,
    averageEngagementTimePerActiveUser: activeUsers > 0 ? totalEngagementTime / activeUsers : 0,
    userKeyEventRate: activeUsers > 0 ? keyEventUsers / activeUsers : 0,
    cityCount: rows.filter((r) => !r.isNotSet).length,
    notSetActiveUsers: sum((r) => (r.isNotSet ? r.activeUsers : 0)),
  };
}

// ── Month helpers ────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** "2026-09" -> "September 2026". */
export function monthKeyToLabel(key: string): string {
  const [y, m] = key.split('-');
  const idx = Number(m) - 1;
  return idx >= 0 && idx < 12 ? `${MONTH_NAMES[idx]} ${y}` : key;
}

/** "2026-09" -> "Sep 2026" (for compact chart axes). */
export function monthKeyToShort(key: string): string {
  const [y, m] = key.split('-');
  const idx = Number(m) - 1;
  return idx >= 0 && idx < 12 ? `${MONTH_SHORT[idx]} ${y}` : key;
}

/** (year, 1-based month) -> "2026-09". */
export function buildMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export const MONTH_OPTIONS = MONTH_NAMES.map((name, i) => ({ name, value: i + 1 }));

/** Infer the report month from GA4's comment header (start date). */
function detectMonth(records: string[][]): string | null {
  for (const rec of records) {
    for (const cell of rec) {
      // "20250901-20250930" or "20250901 - 20250930"
      const range = cell.match(/(20\d{2})(\d{2})\d{2}\s*[-–—]\s*20\d{2}\d{2}\d{2}/);
      if (range) return `${range[1]}-${range[2]}`;
      // "Start date: 20250901" / "Start date,2025-09-01"
      const labelled = cell.match(/start date[:\s,]*?(20\d{2})[-/]?(\d{2})/i);
      if (labelled) return `${labelled[1]}-${labelled[2]}`;
    }
  }
  return null;
}
