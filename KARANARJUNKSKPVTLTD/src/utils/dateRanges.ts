/**
 * Reusable named date-range calculator for reporting/analytics panels.
 * Every period resolves to a concrete [start, end] Date pair in the caller's
 * local timezone, suitable for a Firestore range query on a Timestamp field
 * (e.g. where('createdAt', '>=', start), where('createdAt', '<=', end)).
 */

export type DateRangePeriod =
    | 'today' | 'yesterday' | 'last7days' | 'thisWeek' | 'thisMonth' | 'lastMonth'
    | 'thisQuarter' | 'thisYear' | 'allTime' | 'customDate' | 'customRange';

export interface DateRange {
    start: Date | null; // null = no lower bound (All Time)
    end: Date;
}

const startOfDay = (d: Date) => { const c = new Date(d); c.setHours(0, 0, 0, 0); return c; };
const endOfDay = (d: Date) => { const c = new Date(d); c.setHours(23, 59, 59, 999); return c; };

/**
 * Resolves a named period (or 'customDate'/'customRange' with the supplied
 * custom values) into a concrete date range. For custom periods, pass the
 * relevant custom* argument — an invalid/missing custom value falls back to
 * "today" so the UI never ends up with an unbounded or broken query.
 */
export function resolveDateRange(period: DateRangePeriod, customDate?: string, customFrom?: string, customTo?: string): DateRange {
    const now = new Date();

    switch (period) {
        case 'today':
            return { start: startOfDay(now), end: endOfDay(now) };

        case 'yesterday': {
            const y = new Date(now); y.setDate(y.getDate() - 1);
            return { start: startOfDay(y), end: endOfDay(y) };
        }

        case 'last7days': {
            const from = new Date(now); from.setDate(from.getDate() - 6); // inclusive of today = 7 days
            return { start: startOfDay(from), end: endOfDay(now) };
        }

        case 'thisWeek': {
            const from = new Date(now);
            const dow = from.getDay(); // 0=Sun
            from.setDate(from.getDate() - dow);
            return { start: startOfDay(from), end: endOfDay(now) };
        }

        case 'thisMonth': {
            const from = new Date(now.getFullYear(), now.getMonth(), 1);
            return { start: startOfDay(from), end: endOfDay(now) };
        }

        case 'lastMonth': {
            const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const to = new Date(now.getFullYear(), now.getMonth(), 0); // last day of previous month
            return { start: startOfDay(from), end: endOfDay(to) };
        }

        case 'thisQuarter': {
            const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
            const from = new Date(now.getFullYear(), qStartMonth, 1);
            return { start: startOfDay(from), end: endOfDay(now) };
        }

        case 'thisYear': {
            const from = new Date(now.getFullYear(), 0, 1);
            return { start: startOfDay(from), end: endOfDay(now) };
        }

        case 'allTime':
            return { start: null, end: endOfDay(now) };

        case 'customDate': {
            const d = customDate ? new Date(customDate) : null;
            if (!d || isNaN(d.getTime())) return resolveDateRange('today');
            return { start: startOfDay(d), end: endOfDay(d) };
        }

        case 'customRange': {
            const from = customFrom ? new Date(customFrom) : null;
            const to = customTo ? new Date(customTo) : null;
            if (!from || isNaN(from.getTime()) || !to || isNaN(to.getTime())) return resolveDateRange('today');
            return { start: startOfDay(from), end: endOfDay(to) };
        }

        default:
            return resolveDateRange('today');
    }
}

// ─── Financial Period Filter (invoiceDate / paymentDate yyyy-mm-dd strings) ──
// A simpler subset optimised for B2B invoice/payment date comparisons.
// Returns [fromStr, toStr] in yyyy-mm-dd format for direct string comparison,
// or null for "All Time" (no filter applied).

export type FinancialPeriod = 'all' | 'week' | 'month' | 'fy' | 'custom';

export const FINANCIAL_PERIOD_LABELS: [FinancialPeriod, string][] = [
    ['all',    'All Time'],
    ['week',   'This Week'],
    ['month',  'This Month'],
    ['fy',     'This FY'],
    ['custom', 'Custom'],
];

export function getFinancialDateRange(
    period: FinancialPeriod,
    customFrom: string,
    customTo: string,
): [string, string] | null {
    if (period === 'all') return null;
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    if (period === 'week') {
        const day = now.getDay();
        const diff = day === 0 ? -6 : 1 - day; // roll back to Monday
        const monday = new Date(now);
        monday.setDate(now.getDate() + diff);
        return [monday.toISOString().slice(0, 10), todayStr];
    }
    if (period === 'month') {
        return [new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10), todayStr];
    }
    if (period === 'fy') {
        // Indian Financial Year: April 1 – March 31
        const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
        return [new Date(fyStartYear, 3, 1).toISOString().slice(0, 10), todayStr];
    }
    if (period === 'custom') return customFrom && customTo ? [customFrom, customTo] : null;
    return null;
}

export const DATE_RANGE_PERIODS: { key: DateRangePeriod; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: 'last7days', label: 'Last 7 Days' },
    { key: 'thisWeek', label: 'This Week' },
    { key: 'thisMonth', label: 'This Month' },
    { key: 'lastMonth', label: 'Last Month' },
    { key: 'thisQuarter', label: 'This Quarter' },
    { key: 'thisYear', label: 'This Year' },
    { key: 'allTime', label: 'All Time' },
    { key: 'customDate', label: 'Custom Date' },
    { key: 'customRange', label: 'Custom Range' },
];
