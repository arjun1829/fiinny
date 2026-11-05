import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, Search, Users, BadgeCheck, RotateCcw, X, Wallet } from 'lucide-react';
import {
    type BillFilterState, type PeriodMode, type GstFilter,
    defaultBillFilters, hasActiveBillFilters, thisMonthKey, lastMonthKey,
} from '../utils/billFilters';

export interface PartyOption { key: string; label: string; count: number }

interface Props {
    value: BillFilterState;
    onChange: (next: BillFilterState) => void;
    partyOptions: PartyOption[];
    /** 'Shop owner' on sales, 'Supplier' on purchases. */
    partyNoun: string;
    /** How many bills in the current period have / lack a valid GSTIN. */
    gstCounts?: { with: number; without: number };
    /** Payment filter — shown only when the page passes it. */
    payment?: PaymentFilter;
    onPaymentChange?: (p: PaymentFilter) => void;
    paymentCounts?: { paid: number; pending: number };
}

export type PaymentFilter = 'all' | 'paid' | 'pending';
const PAY_OPTS: [PaymentFilter, string][] = [['all', 'All'], ['paid', 'Fully paid'], ['pending', 'Not fully paid']];

const PERIODS: [PeriodMode, string][] = [
    ['all', 'All dates'], ['month', 'Month'], ['date', 'Single date'], ['range', 'Date range'],
];
const GST_OPTS: [GstFilter, string][] = [['all', 'All'], ['with', 'With GSTIN'], ['without', 'No GSTIN']];

const label: React.CSSProperties = { fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', minWidth: '84px' };
const dateInput: React.CSSProperties = { height: '32px', padding: '0 0.5rem', fontSize: '0.82rem', width: 'auto', margin: 0 };

function Seg<T extends string>({ options, value, onPick }: { options: [T, string][]; value: T; onPick: (v: T) => void }) {
    return (
        <div style={{ display: 'inline-flex', border: '1px solid var(--surface-border)', borderRadius: '8px', overflow: 'hidden', flexShrink: 0 }}>
            {options.map(([v, text], i) => {
                const on = v === value;
                return (
                    <button key={v} type="button" onClick={() => onPick(v)}
                        style={{ padding: '0.35rem 0.8rem', border: 'none', borderLeft: i ? '1px solid var(--surface-border)' : 'none', background: on ? 'var(--primary-light)' : 'transparent', color: on ? '#fff' : 'var(--text-secondary)', fontWeight: on ? 700 : 500, fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                        {text}
                    </button>
                );
            })}
        </div>
    );
}

function Chip({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
    return (
        <button type="button" onClick={onClick}
            style={{ padding: '0.25rem 0.65rem', borderRadius: '99px', border: `1px solid ${on ? 'var(--primary-light)' : 'var(--surface-border)'}`, background: on ? 'rgba(16,185,129,0.12)' : 'transparent', color: on ? 'var(--primary-light)' : 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            {children}
        </button>
    );
}

/** Searchable multi-select of parties (shop owners / suppliers). */
function PartyPicker({ options, selected, onChange, noun }: { options: PartyOption[]; selected: string[]; onChange: (keys: string[]) => void; noun: string }) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);

    const shown = useMemo(() => {
        const s = q.trim().toLowerCase();
        return s ? options.filter(o => o.label.toLowerCase().includes(s)) : options;
    }, [options, q]);

    const sel = new Set(selected);
    const toggle = (k: string) => onChange(sel.has(k) ? selected.filter(x => x !== k) : [...selected, k]);
    const buttonText = selected.length === 0 ? `All ${noun.toLowerCase()}s`
        : selected.length === 1 ? (options.find(o => o.key === selected[0])?.label ?? '1 selected')
        : `${selected.length} ${noun.toLowerCase()}s`;

    return (
        <div ref={ref} style={{ position: 'relative', flex: '0 1 320px', minWidth: 0 }}>
            <button type="button" onClick={() => setOpen(o => !o)}
                style={{ width: '100%', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', padding: '0 0.7rem', borderRadius: '8px', border: `1px solid ${selected.length ? 'var(--primary-light)' : 'var(--surface-border)'}`, background: 'transparent', color: 'var(--text-primary)', fontSize: '0.82rem', fontWeight: selected.length ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{buttonText}</span>
                <ChevronDown size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
            </button>
            {open && (
                <div style={{ position: 'absolute', zIndex: 50, top: 'calc(100% + 4px)', left: 0, width: 'min(360px, 90vw)', background: 'var(--bg-color)', border: '1px solid var(--surface-border)', borderRadius: '10px', boxShadow: '0 10px 30px rgba(0,0,0,0.18)', padding: '0.5rem' }}>
                    <div style={{ position: 'relative', marginBottom: '0.4rem' }}>
                        <Search size={14} style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                        <input autoFocus className="input-field" placeholder={`Search ${noun.toLowerCase()}…`} value={q} onChange={e => setQ(e.target.value)}
                            style={{ margin: 0, height: '32px', paddingLeft: '1.9rem', fontSize: '0.82rem' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0.25rem 0.35rem', fontSize: '0.74rem' }}>
                        <span style={{ color: 'var(--text-tertiary)' }}>{selected.length} of {options.length} selected</span>
                        <span style={{ display: 'flex', gap: '0.6rem' }}>
                            {q && shown.length > 0 && (
                                <button type="button" onClick={() => onChange([...new Set([...selected, ...shown.map(o => o.key)])])}
                                    style={{ background: 'none', border: 'none', color: 'var(--primary-light)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.74rem', padding: 0 }}>Select shown</button>
                            )}
                            {selected.length > 0 && (
                                <button type="button" onClick={() => onChange([])}
                                    style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.74rem', padding: 0 }}>Clear</button>
                            )}
                        </span>
                    </div>
                    <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
                        {shown.length === 0 && <div style={{ padding: '0.75rem', color: 'var(--text-tertiary)', fontSize: '0.8rem', textAlign: 'center' }}>No match</div>}
                        {shown.map(o => (
                            <label key={o.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.4rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem', background: sel.has(o.key) ? 'rgba(16,185,129,0.08)' : 'transparent' }}>
                                <input type="checkbox" checked={sel.has(o.key)} onChange={() => toggle(o.key)} style={{ cursor: 'pointer' }} />
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>{o.label}</span>
                                <span style={{ color: 'var(--text-tertiary)', fontSize: '0.72rem' }}>{o.count}</span>
                            </label>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

/**
 * Month / single date / date range, party (shop owner or supplier) and GSTIN
 * filters — the selection a CA asks for at filing time.
 */
export default function BillExportFilters({ value, onChange, partyOptions, partyNoun, gstCounts, payment, onPaymentChange, paymentCounts }: Props) {
    const set = (patch: Partial<BillFilterState>) => onChange({ ...value, ...patch });
    const active = hasActiveBillFilters(value) || (payment !== undefined && payment !== 'all');

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
            {/* Period */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <span style={label}><CalendarDays size={13} /> Period</span>
                <Seg options={PERIODS} value={value.periodMode} onPick={v => set({ periodMode: v })} />
                {value.periodMode === 'month' && (
                    <>
                        <input type="month" className="input-field" value={value.month} onChange={e => set({ month: e.target.value })} style={dateInput} aria-label="Month" />
                        <Chip on={value.month === thisMonthKey()} onClick={() => set({ month: thisMonthKey() })}>This month</Chip>
                        <Chip on={value.month === lastMonthKey()} onClick={() => set({ month: lastMonthKey() })}>Last month</Chip>
                    </>
                )}
                {value.periodMode === 'date' && (
                    <input type="date" className="input-field" value={value.date} onChange={e => set({ date: e.target.value })} style={dateInput} aria-label="Date" />
                )}
                {value.periodMode === 'range' && (
                    <>
                        <input type="date" className="input-field" value={value.from} max={value.to || undefined} onChange={e => set({ from: e.target.value })} style={dateInput} aria-label="From date" />
                        <span style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>to</span>
                        <input type="date" className="input-field" value={value.to} min={value.from || undefined} onChange={e => set({ to: e.target.value })} style={dateInput} aria-label="To date" />
                        {(value.from || value.to) && (
                            <button type="button" title="Clear dates" onClick={() => set({ from: '', to: '' })}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', padding: 0 }}><X size={14} /></button>
                        )}
                    </>
                )}
            </div>

            {/* Party + GSTIN */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <span style={label}><Users size={13} /> {partyNoun}</span>
                <PartyPicker options={partyOptions} selected={value.parties} onChange={parties => set({ parties })} noun={partyNoun} />

                <span style={{ ...label, minWidth: 0, marginLeft: '0.5rem' }}><BadgeCheck size={13} /> GSTIN</span>
                <Seg
                    options={GST_OPTS.map(([v, t]) => [v, gstCounts && v !== 'all' ? `${t} (${v === 'with' ? gstCounts.with : gstCounts.without})` : t] as [GstFilter, string])}
                    value={value.gst} onPick={v => set({ gst: v })} />

                {payment !== undefined && onPaymentChange && (
                    <>
                        <span style={{ ...label, minWidth: 0, marginLeft: '0.5rem' }}><Wallet size={13} /> Payment</span>
                        <Seg
                            options={PAY_OPTS.map(([v, t]) => [v, paymentCounts && v !== 'all' ? `${t} (${paymentCounts[v]})` : t] as [PaymentFilter, string])}
                            value={payment} onPick={onPaymentChange} />
                    </>
                )}

                {active && (
                    <button type="button" onClick={() => { onChange({ ...defaultBillFilters(), month: value.month }); onPaymentChange?.('all'); }}
                        style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                        <RotateCcw size={13} /> Reset filters
                    </button>
                )}
            </div>
        </div>
    );
}
