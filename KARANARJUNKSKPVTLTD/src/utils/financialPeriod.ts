/**
 * Financial period filter for B2B invoice/payment date comparisons.
 * Uses yyyy-mm-dd string comparison against invoiceDate / paymentDate fields.
 * Returns [fromStr, toStr] or null for "All Time".
 */

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
