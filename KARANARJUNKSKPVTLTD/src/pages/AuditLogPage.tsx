import { useState, useEffect, useMemo } from 'react';
import {
    getDocs, query, orderBy, limit,
    where, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection } from '../utils/tenantPath';
import type { AuditModule, AuditAction } from '../utils/auditLog';
import {
    Shield, Search, ChevronDown, ChevronRight, RefreshCw,
    Clock, X,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuditEntry {
    id: string;
    timestamp: Timestamp | null;
    userId: string;
    userName: string;
    userRole: string;
    module: AuditModule;
    action: AuditAction;
    entityName: string;
    entityId?: string;
    description?: string;
    remarks?: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ALL_MODULES: AuditModule[] = [
    'POS Billing', 'B2B Invoice', 'Worklist', 'Supplier Ledger',
    'Inventory', 'Manage Retailers', 'Customers', 'Manage Users',
    'Role Matrix', 'Digital Khata', 'Purchase Orders', 'Expenses',
    'Online Orders', 'Settings', 'Dispatch Board', 'Delivery Challans',
];

const ALL_ACTIONS: AuditAction[] = [
    'Create', 'Update', 'Delete', 'Restore', 'Void',
    'Record Payment', 'Link Payment', 'Split Payment',
    'Generate Invoice', 'Cancel Invoice',
    'Status Change', 'Assign Salesperson', 'Assign Transporter',
    'Stock Adjustment', 'Rate Update', 'Batch Create',
    'Login', 'Logout', 'Export',
];

const ACTION_COLORS: Record<string, { bg: string; color: string }> = {
    'Create':              { bg: 'rgba(16,185,129,0.12)',  color: '#059669' },
    'Update':              { bg: 'rgba(14,165,233,0.12)',  color: '#0284c7' },
    'Delete':              { bg: 'rgba(239,68,68,0.12)',   color: '#dc2626' },
    'Restore':             { bg: 'rgba(16,185,129,0.10)',  color: '#10b981' },
    'Void':                { bg: 'rgba(239,68,68,0.10)',   color: '#dc2626' },
    'Record Payment':      { bg: 'rgba(20,184,166,0.12)',  color: '#0d9488' },
    'Link Payment':        { bg: 'rgba(99,102,241,0.12)',  color: '#4f46e5' },
    'Split Payment':       { bg: 'rgba(99,102,241,0.10)',  color: '#6366f1' },
    'Generate Invoice':    { bg: 'rgba(16,185,129,0.12)',  color: '#059669' },
    'Cancel Invoice':      { bg: 'rgba(239,68,68,0.12)',   color: '#dc2626' },
    'Status Change':       { bg: 'rgba(245,158,11,0.12)',  color: '#d97706' },
    'Assign Salesperson':  { bg: 'rgba(56,189,248,0.12)',  color: '#0284c7' },
    'Assign Transporter':  { bg: 'rgba(56,189,248,0.10)',  color: '#0369a1' },
    'Stock Adjustment':    { bg: 'rgba(139,92,246,0.12)',  color: '#7c3aed' },
    'Rate Update':         { bg: 'rgba(249,115,22,0.12)',  color: '#ea580c' },
    'Batch Create':        { bg: 'rgba(139,92,246,0.10)',  color: '#8b5cf6' },
    'Login':               { bg: 'rgba(167,139,250,0.12)', color: '#7c3aed' },
    'Logout':              { bg: 'rgba(107,114,128,0.12)', color: '#6b7280' },
    'Export':              { bg: 'rgba(14,165,233,0.12)',  color: '#0284c7' },
};

const MODULE_COLORS: Partial<Record<string, string>> = {
    'POS Billing':      '#059669',
    'B2B Invoice':      '#0284c7',
    'Manage Users':     '#dc2626',
    'Role Matrix':      '#d97706',
    'Inventory':        '#7c3aed',
    'Supplier Ledger':  '#ea580c',
    'Worklist':         '#0369a1',
    'Manage Retailers': '#0d9488',
    'Digital Khata':    '#6366f1',
    'Purchase Orders':  '#f59e0b',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTimestamp(ts: Timestamp | null): string {
    if (!ts) return '—';
    const d = ts.toDate();
    const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${date}, ${time}`;
}

function fmtTimestampShort(ts: Timestamp | null): { date: string; time: string } {
    if (!ts) return { date: '—', time: '' };
    const d = ts.toDate();
    return {
        date: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        time: d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
    };
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ── Sub-components ────────────────────────────────────────────────────────────

function ActionBadge({ action }: { action: string }) {
    const c = ACTION_COLORS[action] ?? { bg: 'var(--surface-raised)', color: 'var(--text-secondary)' };
    return (
        <span style={{ background: c.bg, color: c.color, padding: '1px 7px', borderRadius: '99px', fontSize: '0.70rem', fontWeight: 700, whiteSpace: 'nowrap', letterSpacing: '0.01em' }}>
            {action}
        </span>
    );
}

function DetailField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <div>
            <div style={{ color: 'var(--text-tertiary)', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>
                {label}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: 500, fontFamily: mono ? 'monospace' : 'inherit', wordBreak: 'break-all' }}>
                {value || '—'}
            </div>
        </div>
    );
}

// Compact select with icon prefix
function FilterSelect({ value, onChange, placeholder, options }: {
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
    options: string[];
}) {
    const active = !!value;
    return (
        <select
            value={value}
            onChange={e => onChange(e.target.value)}
            style={{
                padding: '0 0.6rem', height: '30px', borderRadius: '6px', fontSize: '0.78rem',
                border: `1px solid ${active ? 'var(--primary-light)' : 'var(--surface-border)'}`,
                background: active ? 'hsla(220,80%,60%,0.06)' : 'var(--surface-raised)',
                color: active ? 'var(--primary-light)' : 'var(--text-secondary)',
                fontWeight: active ? 700 : 400, cursor: 'pointer', outline: 'none', fontFamily: 'inherit',
            }}
        >
            <option value="">{placeholder}</option>
            {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AuditLogPage() {
    const { tenantId, userRole } = useAuth();

    const [entries, setEntries]   = useState<AuditEntry[]>([]);
    const [loading, setLoading]   = useState(true);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    // Filters
    const [search, setSearch]         = useState('');
    const [dateFrom, setDateFrom]     = useState('');
    const [dateTo, setDateTo]         = useState('');
    const [moduleFilter, setModule]   = useState('');
    const [actionFilter, setAction]   = useState('');
    const [userFilter, setUser]       = useState('');   // userName value
    const [roleFilter, setRole]       = useState('');

    const fetchEntries = async () => {
        if (!tenantId) return;
        setLoading(true);
        try {
            let q = query(
                getTenantCollection(db, tenantId, 'auditLogs'),
                orderBy('timestamp', 'desc'),
                limit(1000),
            );
            if (dateFrom) {
                const from = new Date(dateFrom); from.setHours(0, 0, 0, 0);
                q = query(q, where('timestamp', '>=', Timestamp.fromDate(from)));
            }
            if (dateTo) {
                const to = new Date(dateTo); to.setHours(23, 59, 59, 999);
                q = query(q, where('timestamp', '<=', Timestamp.fromDate(to)));
            }
            const snap = await getDocs(q);
            setEntries(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<AuditEntry, 'id'>) })));
        } catch (err) {
            console.error('AuditLog fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { fetchEntries(); }, [tenantId]);

    // Derive unique users and roles from loaded data for dropdowns
    const uniqueUsers = useMemo(() => {
        const seen = new Map<string, string>();
        entries.forEach(e => { if (e.userName && !seen.has(e.userName)) seen.set(e.userName, e.userName); });
        return Array.from(seen.keys()).sort();
    }, [entries]);

    const uniqueRoles = useMemo(() => {
        const seen = new Set<string>();
        entries.forEach(e => { if (e.userRole) seen.add(e.userRole); });
        return Array.from(seen).sort();
    }, [entries]);

    const toggleExpand = (id: string) =>
        setExpanded(prev => {
            const n = new Set(prev);
            if (n.has(id)) { n.delete(id); } else { n.add(id); }
            return n;
        });

    const filtered = useMemo(() => {
        const ls = search.toLowerCase();
        return entries.filter(e => {
            if (moduleFilter && e.module !== moduleFilter) return false;
            if (actionFilter && e.action !== actionFilter) return false;
            if (userFilter  && e.userName !== userFilter)  return false;
            if (roleFilter  && e.userRole !== roleFilter)  return false;
            if (search && !(
                e.userName.toLowerCase().includes(ls) ||
                e.module.toLowerCase().includes(ls) ||
                e.action.toLowerCase().includes(ls) ||
                e.entityName.toLowerCase().includes(ls) ||
                (e.description || '').toLowerCase().includes(ls) ||
                (e.entityId    || '').toLowerCase().includes(ls) ||
                (e.remarks     || '').toLowerCase().includes(ls)
            )) return false;
            return true;
        });
    }, [entries, search, moduleFilter, actionFilter, userFilter, roleFilter]);

    const hasFilters = !!(search || moduleFilter || actionFilter || userFilter || roleFilter || dateFrom || dateTo);
    const clearFilters = () => {
        setSearch(''); setModule(''); setAction(''); setUser(''); setRole(''); setDateFrom(''); setDateTo('');
    };

    if ((userRole as string) !== 'admin' && (userRole as string) !== 'owner') {
        return (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--danger)' }}>
                <Shield size={48} style={{ margin: '0 auto 1rem', display: 'block' }} />
                <h2>Access Denied</h2>
                <p>Audit Log is restricted to administrators.</p>
            </div>
        );
    }

    return (
        <div className="animate-fade-in" style={{ maxWidth: '1400px', margin: '0 auto' }}>

            {/* ── Header ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                        <Shield size={20} color="var(--primary-light)" /> Audit Log
                    </h1>
                    <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', margin: '2px 0 0' }}>
                        Append-only record of all system events · {entries.length} entries loaded
                    </p>
                </div>
                <button onClick={fetchEntries} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.9rem', fontSize: '0.82rem' }}>
                    <RefreshCw size={13} /> Refresh
                </button>
            </div>

            {/* ── Filter bar ── */}
            <div className="glass-panel" style={{ padding: '0.6rem 0.85rem', marginBottom: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>

                {/* Global search */}
                <div style={{ position: 'relative', flex: '1 1 180px', minWidth: '160px' }}>
                    <Search size={12} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
                    <input
                        type="text"
                        placeholder="Search…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ width: '100%', paddingLeft: '26px', paddingRight: '8px', height: '30px', borderRadius: '6px', border: '1px solid var(--surface-border)', background: 'var(--surface-raised)', color: 'var(--text-primary)', fontSize: '0.78rem', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                    />
                </div>

                {/* Date range */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={12} color="var(--text-tertiary)" style={{ flexShrink: 0 }} />
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                        style={{ height: '30px', padding: '0 6px', borderRadius: '6px', border: '1px solid var(--surface-border)', background: 'var(--surface-raised)', color: 'var(--text-primary)', fontSize: '0.75rem', fontFamily: 'inherit', outline: 'none', width: '130px' }} />
                    <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>–</span>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                        style={{ height: '30px', padding: '0 6px', borderRadius: '6px', border: '1px solid var(--surface-border)', background: 'var(--surface-raised)', color: 'var(--text-primary)', fontSize: '0.75rem', fontFamily: 'inherit', outline: 'none', width: '130px' }} />
                </div>

                {/* User dropdown */}
                <FilterSelect value={userFilter} onChange={setUser} placeholder="All Users" options={uniqueUsers} />

                {/* Role dropdown */}
                <FilterSelect value={roleFilter} onChange={setRole} placeholder="All Roles" options={uniqueRoles.map(cap)} />

                {/* Module */}
                <FilterSelect value={moduleFilter} onChange={setModule} placeholder="All Modules" options={ALL_MODULES} />

                {/* Action */}
                <FilterSelect value={actionFilter} onChange={setAction} placeholder="All Actions" options={ALL_ACTIONS} />

                {/* Clear + count */}
                {hasFilters && (
                    <button onClick={clearFilters} title="Clear all filters"
                        style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '0 8px', height: '30px', borderRadius: '6px', border: '1px solid var(--surface-border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '0.75rem', fontFamily: 'inherit' }}>
                        <X size={11} /> Clear
                    </button>
                )}

                <span style={{ marginLeft: 'auto', color: 'var(--text-tertiary)', fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {filtered.length}{entries.length !== filtered.length ? ` / ${entries.length}` : ''} rows
                </span>
            </div>

            {/* ── Table ── */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                    <RefreshCw size={16} className="animate-spin" style={{ color: 'var(--primary-light)' }} /> Loading…
                </div>
            ) : filtered.length === 0 ? (
                <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
                    <Shield size={36} color="var(--surface-border)" style={{ margin: '0 auto 0.75rem', display: 'block' }} />
                    <p style={{ color: 'var(--text-secondary)', margin: 0, fontWeight: 600 }}>No entries found</p>
                    <p style={{ color: 'var(--text-tertiary)', margin: '0.25rem 0 0', fontSize: '0.82rem' }}>
                        {entries.length === 0
                            ? 'Audit events will appear here once users perform actions in the ERP.'
                            : 'No entries match the current filters.'}
                    </p>
                </div>
            ) : (
                <div className="glass-panel" style={{ overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', tableLayout: 'fixed' }}>
                            <colgroup>
                                <col style={{ width: '140px' }} />  {/* Date & Time */}
                                <col style={{ width: '130px' }} />  {/* User */}
                                <col style={{ width: '68px' }} />   {/* Role */}
                                <col style={{ width: '130px' }} />  {/* Module */}
                                <col style={{ width: '120px' }} />  {/* Action */}
                                <col style={{ width: '160px' }} />  {/* Entity */}
                                <col />                              {/* Description */}
                                <col style={{ width: '24px' }} />   {/* Expand */}
                            </colgroup>
                            <thead>
                                <tr style={{ background: 'var(--surface-raised)', borderBottom: '2px solid var(--surface-border)' }}>
                                    {['Date & Time', 'User', 'Role', 'Module', 'Action', 'Entity', 'Description', ''].map((h, i) => (
                                        <th key={i} style={{ padding: '5px 8px', fontWeight: 700, color: 'var(--text-tertiary)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '1px solid var(--surface-border)' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((e, rowIdx) => {
                                    const isOpen = expanded.has(e.id);
                                    const modColor = MODULE_COLORS[e.module] ?? '#94a3b8';
                                    const { date, time } = fmtTimestampShort(e.timestamp);
                                    const zebra = rowIdx % 2 === 0 ? 'transparent' : 'hsla(0,0%,50%,0.025)';

                                    return (
                                        <>
                                            <tr
                                                key={e.id}
                                                onClick={() => toggleExpand(e.id)}
                                                style={{
                                                    borderBottom: isOpen ? '1px solid var(--primary-light)' : '1px solid var(--surface-border)',
                                                    cursor: 'pointer',
                                                    background: isOpen ? 'hsla(220,80%,60%,0.05)' : zebra,
                                                }}
                                                onMouseEnter={ev => { ev.currentTarget.style.background = isOpen ? 'hsla(220,80%,60%,0.07)' : 'var(--surface-raised)'; }}
                                                onMouseLeave={ev => { ev.currentTarget.style.background = isOpen ? 'hsla(220,80%,60%,0.05)' : zebra; }}
                                            >
                                                {/* Date & Time */}
                                                <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                                                    <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{date}</div>
                                                    <div style={{ color: 'var(--text-tertiary)', fontSize: '0.70rem' }}>{time}</div>
                                                </td>

                                                {/* User */}
                                                <td style={{ padding: '4px 8px', overflow: 'hidden' }}>
                                                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.userName}</div>
                                                </td>

                                                {/* Role */}
                                                <td style={{ padding: '4px 8px' }}>
                                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>{cap(e.userRole || '')}</span>
                                                </td>

                                                {/* Module */}
                                                <td style={{ padding: '4px 8px', overflow: 'hidden' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', overflow: 'hidden' }}>
                                                        <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: modColor, flexShrink: 0, display: 'inline-block' }} />
                                                        <span style={{ color: modColor, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.76rem' }}>{e.module}</span>
                                                    </div>
                                                </td>

                                                {/* Action */}
                                                <td style={{ padding: '4px 8px' }}>
                                                    <ActionBadge action={e.action} />
                                                </td>

                                                {/* Entity */}
                                                <td style={{ padding: '4px 8px', overflow: 'hidden' }}>
                                                    <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', color: 'var(--text-primary)' }}>{e.entityName}</span>
                                                </td>

                                                {/* Description */}
                                                <td style={{ padding: '4px 8px', overflow: 'hidden' }}>
                                                    <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                                                        {e.description || e.remarks || ''}
                                                    </span>
                                                </td>

                                                {/* Expand chevron */}
                                                <td style={{ padding: '4px 4px', textAlign: 'center' }}>
                                                    {isOpen
                                                        ? <ChevronDown size={13} color="var(--primary-light)" />
                                                        : <ChevronRight size={13} color="var(--text-tertiary)" />}
                                                </td>
                                            </tr>

                                            {/* ── Expanded detail panel ── */}
                                            {isOpen && (
                                                <tr key={`${e.id}-x`} style={{ background: 'hsla(220,80%,60%,0.04)', borderBottom: '2px solid var(--primary-light)' }}>
                                                    <td colSpan={8} style={{ padding: '10px 16px 14px 24px' }}>

                                                        {/* Meta fields grid */}
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px 20px', marginBottom: (e.description || e.before || e.after || e.remarks) ? '12px' : 0 }}>
                                                            <DetailField label="Timestamp"   value={fmtTimestamp(e.timestamp)} />
                                                            <DetailField label="User"         value={`${e.userName} (${cap(e.userRole)})`} />
                                                            <DetailField label="User ID"      value={e.userId} mono />
                                                            <DetailField label="Module"       value={e.module} />
                                                            <DetailField label="Action"       value={e.action} />
                                                            <DetailField label="Entity"       value={e.entityName} />
                                                            {e.entityId    && <DetailField label="Entity ID"   value={e.entityId}    mono />}
                                                            {e.description && <DetailField label="Description" value={e.description} />}
                                                            {e.remarks     && <DetailField label="Remarks"     value={e.remarks} />}
                                                        </div>

                                                        {/* Before / After */}
                                                        {(e.before || e.after) && (
                                                            <div style={{ display: 'grid', gridTemplateColumns: e.before && e.after ? '1fr 1fr' : '1fr', gap: '10px' }}>
                                                                {e.before && (
                                                                    <div>
                                                                        <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#dc2626', marginBottom: '4px' }}>Before</div>
                                                                        <pre style={{ margin: 0, fontSize: '0.73rem', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: '6px', padding: '6px 10px', overflowX: 'auto', color: 'var(--text-primary)', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.5 }}>
                                                                            {JSON.stringify(e.before, null, 2)}
                                                                        </pre>
                                                                    </div>
                                                                )}
                                                                {e.after && (
                                                                    <div>
                                                                        <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#059669', marginBottom: '4px' }}>After</div>
                                                                        <pre style={{ margin: 0, fontSize: '0.73rem', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.18)', borderRadius: '6px', padding: '6px 10px', overflowX: 'auto', color: 'var(--text-primary)', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.5 }}>
                                                                            {JSON.stringify(e.after, null, 2)}
                                                                        </pre>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            )}
                                        </>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Footer */}
                    <div style={{ padding: '5px 10px', borderTop: '1px solid var(--surface-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
                            Showing {filtered.length} of {entries.length} entries · sorted newest first
                        </span>
                        {entries.length >= 1000 && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
                                Showing most recent 1,000 — narrow the date range to see older events
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
