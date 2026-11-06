/**
 * Filters used to pick out bills for the CA / tax-filing export.
 *
 * Shared by the B2B (sales) invoice worklist and the supplier (purchase)
 * invoice list, so both sides of the books filter the same way.
 */
import { validateGSTIN } from './gstinValidator';

export type PeriodMode = 'all' | 'month' | 'date' | 'range';
export type GstFilter = 'all' | 'with' | 'without';

export interface BillFilterState {
    periodMode: PeriodMode;
    /** 'YYYY-MM' — used when periodMode === 'month' */
    month: string;
    /** 'YYYY-MM-DD' — used when periodMode === 'date' */
    date: string;
    /** 'YYYY-MM-DD' — used when periodMode === 'range' (either end may be blank) */
    from: string;
    to: string;
    /** Normalised party keys (see partyKey). Empty = every party. */
    parties: string[];
    gst: GstFilter;
}

const pad = (n: number) => String(n).padStart(2, '0');
const localIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const thisMonthKey = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
export const lastMonthKey = (now = new Date()) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

export const defaultBillFilters = (): BillFilterState => ({
    periodMode: 'all',
    month: lastMonthKey(),
    date: localIso(new Date()),
    from: '',
    to: '',
    parties: [],
    gst: 'all',
});

/** True when any CA-export filter narrows the list. */
export const hasActiveBillFilters = (f: BillFilterState) =>
    f.periodMode !== 'all' || f.parties.length > 0 || f.gst !== 'all';

/**
 * Coerces whatever a bill stores as its date into a local 'YYYY-MM-DD'.
 * Handles ISO strings, Indian DD/MM/YYYY (also - and . separators), Firestore
 * Timestamps (live or serialised), Date objects and epoch millis. Returns null
 * when nothing usable is present so the caller can fall back to another field.
 */
export function toIsoDate(v: unknown): string | null {
    if (v == null || v === '') return null;
    if (typeof v === 'string') {
        const s = v.trim();
        let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (m) return valid(+m[1], +m[2], +m[3]);
        m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
        if (m) return valid(+m[3], +m[2], +m[1]);
        m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2})$/);
        if (m) return valid(2000 + +m[3], +m[2], +m[1]);
        const t = Date.parse(s);
        return Number.isNaN(t) ? null : localIso(new Date(t));
    }
    if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : localIso(v);
    if (typeof v === 'number') return Number.isFinite(v) ? localIso(new Date(v)) : null;
    if (typeof v === 'object') {
        const o = v as { toDate?: () => Date; seconds?: number; _seconds?: number };
        if (typeof o.toDate === 'function') return toIsoDate(o.toDate());
        const secs = o.seconds ?? o._seconds;
        if (typeof secs === 'number') return localIso(new Date(secs * 1000));
    }
    return null;
}

function valid(y: number, m: number, d: number): string | null {
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const dt = new Date(y, m - 1, d);
    if (dt.getMonth() !== m - 1) return null; // e.g. 31/02
    return `${y}-${pad(m)}-${pad(d)}`;
}

/** 'YYYY-MM-DD' → '05 Nov 2026' (or '—'). */
export function formatIsoDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Whether a bill dated `iso` falls inside the selected period. */
export function inPeriod(iso: string | null, f: BillFilterState): boolean {
    switch (f.periodMode) {
        case 'all': return true;
        case 'month': return !!iso && !!f.month && iso.startsWith(f.month + '-');
        case 'date': return !!iso && !!f.date && iso === f.date;
        case 'range': {
            if (!f.from && !f.to) return true;
            if (!iso) return false;
            if (f.from && iso < f.from) return false;
            if (f.to && iso > f.to) return false;
            return true;
        }
    }
}

export type GstinStatus = 'valid' | 'invalid' | 'missing';

export const normalizeGstin = (g: unknown) => String(g ?? '').replace(/\s+/g, '').toUpperCase();

export function gstinStatus(g: unknown): GstinStatus {
    const n = normalizeGstin(g);
    if (!n) return 'missing';
    return validateGSTIN(n).valid ? 'valid' : 'invalid';
}

/**
 * "With GSTIN" means a correctly-formatted 15-character GSTIN — a CA can't file
 * against "NA", a phone number or a typo, so those count as without.
 */
export function matchesGst(g: unknown, f: GstFilter): boolean {
    if (f === 'all') return true;
    const ok = gstinStatus(g) === 'valid';
    return f === 'with' ? ok : !ok;
}

/** Case/space-insensitive key so "Baliraja Agro" and "BALIRAJA  AGRO" group together. */
export const partyKey = (name: unknown) => String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

export function matchesParty(name: unknown, f: BillFilterState): boolean {
    return f.parties.length === 0 || f.parties.includes(partyKey(name));
}

/** Human label of the selected period — used in the ZIP file name and summary. */
export function periodLabel(f: BillFilterState): string {
    switch (f.periodMode) {
        case 'all': return 'All dates';
        case 'month': {
            if (!f.month) return 'All dates';
            const [y, m] = f.month.split('-').map(Number);
            return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
        }
        case 'date': return formatIsoDate(f.date);
        case 'range':
            if (!f.from && !f.to) return 'All dates';
            return `${f.from ? formatIsoDate(f.from) : 'Start'} to ${f.to ? formatIsoDate(f.to) : 'Today'}`;
    }
}

/** Short filename-safe tag for the period, e.g. '2026-10', '2026-10-01_to_2026-10-31'. */
export function periodSlug(f: BillFilterState): string {
    switch (f.periodMode) {
        case 'month': return f.month || 'all';
        case 'date': return f.date || 'all';
        case 'range': return (f.from || f.to) ? `${f.from || 'start'}_to_${f.to || 'today'}` : 'all';
        default: return 'all';
    }
}

/** Strips characters Windows/macOS reject in file names. */
export const safeFileName = (s: string) =>
    // eslint-disable-next-line no-control-regex
    s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120).replace(/[. ]+$/, '') || 'bill';
