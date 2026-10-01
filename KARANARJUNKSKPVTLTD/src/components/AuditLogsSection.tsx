// Audit Logs section for the platform Super Admin console (/super-admin#audit-logs).
// Read-only view over the append-only `platformAuditLogs` collection: searchable
// table with category / action / admin / business + date-range filters, client-side
// pagination, and a detail modal with a before/after diff. Reads are Super-Admin-only
// (enforced in firestore.rules); this component never writes.
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    ShieldCheck, RefreshCw, Loader2, Search, Calendar, X, Eye, ScrollText, Filter,
} from 'lucide-react';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { useToast } from '../contexts/ToastContext';
import {
    PLATFORM_AUDIT_COLLECTION,
    AUDIT_CATEGORY_OPTIONS,
    AUDIT_ACTION_OPTIONS,
    AUDIT_CATEGORY_BADGE,
    type PlatformAuditLog,
    type AuditCategory,
    type AuditAction,
} from '../types/audit';

// Cap the number of entries fetched per load to bound read cost. Filters and
// pagination then operate client-side (mirrors the console's other sections).
const FETCH_LIMIT = 500;
const PAGE_SIZE = 25;

const thStyle: React.CSSProperties = { padding: '0.7rem 1.1rem', fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: '0.75rem 1.1rem', verticalAlign: 'middle' };
const badgeBase: React.CSSProperties = {
    display: 'inline-block', padding: '0.15rem 0.6rem', borderRadius: '999px',
    fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap',
};
const fieldLabel: React.CSSProperties = {
    fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-tertiary)',
    textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.35rem', display: 'block',
};

// Firestore Timestamp | Date | millis → epoch millis (0 when absent/invalid).
const tsToMillis = (ts: unknown): number => {
    if (!ts) return 0;
    try {
        const d = typeof ts === 'object' && ts !== null && 'toDate' in ts
            ? (ts as { toDate: () => Date }).toDate()
            : new Date(ts as string | number);
        const m = d.getTime();
        return isNaN(m) ? 0 : m;
    } catch { return 0; }
};

// Firestore Timestamp | Date | millis → readable date + time, or em-dash.
const formatDateTime = (ts: unknown): string => {
    const m = tsToMillis(ts);
    if (!m) return '—';
    return new Date(m).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
};

const actionLabel = (a: AuditAction): string =>
    AUDIT_ACTION_OPTIONS.find(o => o.value === a)?.label ?? a;

export default function AuditLogsSection() {
    const { showToast } = useToast();

    const [logs, setLogs] = useState<PlatformAuditLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);

    // Filters
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<AuditCategory | 'all'>('all');
    const [actionFilter, setActionFilter] = useState<AuditAction | 'all'>('all');
    const [adminFilter, setAdminFilter] = useState<string>('all');    // actorEmail
    const [businessFilter, setBusinessFilter] = useState<string>('all'); // tenantId
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');

    const [page, setPage] = useState(0);
    const [selected, setSelected] = useState<PlatformAuditLog | null>(null);

    const loadLogs = useCallback(async () => {
        setLoading(true);
        setError(false);
        try {
            const snap = await getDocs(query(
                collection(db, PLATFORM_AUDIT_COLLECTION),
                orderBy('timestamp', 'desc'),
                limit(FETCH_LIMIT),
            ));
            setLogs(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<PlatformAuditLog, 'id'>) })));
        } catch (err) {
            console.warn('[AuditLogs] load failed:', err);
            setError(true);
            showToast('Failed to load audit logs.', 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => { loadLogs(); }, [loadLogs]);

    // Distinct admins / businesses present in the current data set, for the dropdowns.
    const adminOptions = useMemo(() => {
        const map = new Map<string, string>();
        logs.forEach(l => { if (l.actorEmail) map.set(l.actorEmail, l.actorEmail); });
        return [...map.keys()].sort();
    }, [logs]);

    const businessOptions = useMemo(() => {
        const map = new Map<string, string>();
        logs.forEach(l => { if (l.tenantId) map.set(l.tenantId, l.tenantName || l.tenantId); });
        return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    }, [logs]);

    // Reset to the first page whenever a filter changes.
    useEffect(() => { setPage(0); }, [search, categoryFilter, actionFilter, adminFilter, businessFilter, fromDate, toDate]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const fromMs = fromDate ? Date.parse(`${fromDate}T00:00:00`) : null;
        const toMs = toDate ? Date.parse(`${toDate}T23:59:59`) : null;
        return logs.filter(l => {
            if (categoryFilter !== 'all' && l.category !== categoryFilter) return false;
            if (actionFilter !== 'all' && l.action !== actionFilter) return false;
            if (adminFilter !== 'all' && l.actorEmail !== adminFilter) return false;
            if (businessFilter !== 'all' && l.tenantId !== businessFilter) return false;
            if (fromMs != null || toMs != null) {
                const ms = tsToMillis(l.timestamp);
                if (fromMs != null && ms < fromMs) return false;
                if (toMs != null && ms > toMs) return false;
            }
            if (q) {
                const hay = `${l.description} ${l.resourceName} ${l.resourceType} ${l.actorEmail} ${l.tenantName ?? ''} ${l.action} ${l.category}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }, [logs, search, categoryFilter, actionFilter, adminFilter, businessFilter, fromDate, toDate]);

    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

    const anyFilterActive = search || categoryFilter !== 'all' || actionFilter !== 'all'
        || adminFilter !== 'all' || businessFilter !== 'all' || fromDate || toDate;

    const clearFilters = () => {
        setSearch(''); setCategoryFilter('all'); setActionFilter('all');
        setAdminFilter('all'); setBusinessFilter('all'); setFromDate(''); setToDate('');
    };

    return (
        <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                <div>
                    <h1 className="primary-gradient-text" style={{ fontSize: '1.6rem', display: 'flex', alignItems: 'center', gap: '0.55rem', margin: '0 0 0.3rem' }}>
                        <ScrollText size={24} /> Audit Logs
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: 0, maxWidth: '680px' }}>
                        Append-only record of privileged Super Admin actions across the platform. Newest first;
                        up to {FETCH_LIMIT} recent entries are loaded.
                    </p>
                </div>
                <button onClick={loadLogs} disabled={loading} className="btn btn-secondary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', flexShrink: 0 }}>
                    {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Refresh
                </button>
            </div>

            {/* Filters */}
            <div className="glass-panel" style={{ padding: '1rem 1.1rem', marginBottom: '1.25rem', display: 'flex', gap: '0.85rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
                    <label style={fieldLabel}>Search</label>
                    <Search size={16} style={{ position: 'absolute', left: '0.7rem', top: '2.15rem', color: 'var(--text-tertiary)' }} />
                    <input
                        className="input-field" type="text" value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search description, resource, admin…"
                        style={{ width: '100%', paddingLeft: '2.1rem' }}
                    />
                </div>
                <div style={{ minWidth: '150px' }}>
                    <label style={fieldLabel}>Category</label>
                    <select className="input-field" style={{ width: '100%' }} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value as AuditCategory | 'all')}>
                        {AUDIT_CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </div>
                <div style={{ minWidth: '150px' }}>
                    <label style={fieldLabel}>Action</label>
                    <select className="input-field" style={{ width: '100%' }} value={actionFilter} onChange={e => setActionFilter(e.target.value as AuditAction | 'all')}>
                        {AUDIT_ACTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </div>
                <div style={{ minWidth: '160px' }}>
                    <label style={fieldLabel}>Admin</label>
                    <select className="input-field" style={{ width: '100%' }} value={adminFilter} onChange={e => setAdminFilter(e.target.value)}>
                        <option value="all">All admins</option>
                        {adminOptions.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                </div>
                <div style={{ minWidth: '160px' }}>
                    <label style={fieldLabel}>Business</label>
                    <select className="input-field" style={{ width: '100%' }} value={businessFilter} onChange={e => setBusinessFilter(e.target.value)}>
                        <option value="all">All businesses</option>
                        {businessOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                    </select>
                </div>
                <div style={{ minWidth: '140px' }}>
                    <label style={fieldLabel}>From</label>
                    <input className="input-field" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ width: '100%' }} />
                </div>
                <div style={{ minWidth: '140px' }}>
                    <label style={fieldLabel}>To</label>
                    <input className="input-field" type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={{ width: '100%' }} />
                </div>
                {anyFilterActive && (
                    <button onClick={clearFilters} className="btn btn-secondary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}>
                        <Filter size={14} /> Clear
                    </button>
                )}
            </div>

            <div className="glass-panel" style={{ overflowX: 'auto' }}>
                {loading ? (
                    <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                        <Loader2 size={22} className="animate-spin" style={{ marginBottom: '0.5rem' }} />
                        <div>Loading audit logs…</div>
                    </div>
                ) : error ? (
                    <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--danger)' }}>
                        Couldn't load audit logs.{' '}
                        <button onClick={loadLogs} className="btn btn-secondary" style={{ marginLeft: '0.5rem', fontSize: '0.82rem' }}>Retry</button>
                    </div>
                ) : logs.length === 0 ? (
                    <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>No audit activity recorded yet.</div>
                ) : filtered.length === 0 ? (
                    <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>No entries match the current filters.</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem', minWidth: '960px' }}>
                        <thead>
                            <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                <th style={thStyle}>When</th>
                                <th style={thStyle}>Admin</th>
                                <th style={thStyle}>Category</th>
                                <th style={thStyle}>Action</th>
                                <th style={thStyle}>Resource</th>
                                <th style={thStyle}>Business</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pageRows.map(l => {
                                const cat = AUDIT_CATEGORY_BADGE[l.category] ?? { bg: 'var(--surface-border)', fg: 'var(--text-secondary)', label: l.category };
                                return (
                                    <tr key={l.id} style={{ borderTop: '1px solid var(--surface-border)' }}>
                                        <td style={{ ...tdStyle, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                                <Calendar size={13} style={{ color: 'var(--text-tertiary)' }} />
                                                {formatDateTime(l.timestamp)}
                                            </span>
                                        </td>
                                        <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>
                                            <div>{l.actorEmail || '—'}</div>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{l.actorRole}</div>
                                        </td>
                                        <td style={tdStyle}><span style={{ ...badgeBase, background: cat.bg, color: cat.fg }}>{cat.label}</span></td>
                                        <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{actionLabel(l.action)}</td>
                                        <td style={{ ...tdStyle, maxWidth: '300px' }}>
                                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{l.resourceName}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{l.description}</div>
                                        </td>
                                        <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>
                                            {l.tenantName || l.tenantId
                                                ? <>
                                                    <div>{l.tenantName || '—'}</div>
                                                    {l.tenantId && <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{l.tenantId}</div>}
                                                </>
                                                : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                            <button onClick={() => setSelected(l)} title="View details" className="btn btn-secondary"
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', padding: '0.35rem 0.7rem' }}>
                                                <Eye size={14} /> View
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}

                {/* Pagination */}
                {!loading && !error && filtered.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.85rem 1.1rem', borderTop: '1px solid var(--surface-border)', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                            Showing {page * PAGE_SIZE + 1}–{Math.min(filtered.length, page * PAGE_SIZE + PAGE_SIZE)} of {filtered.length}
                        </span>
                        <div style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
                            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                                className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.35rem 0.7rem', opacity: page === 0 ? 0.5 : 1 }}>
                                Previous
                            </button>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Page {page + 1} / {pageCount}</span>
                            <button onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1}
                                className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.35rem 0.7rem', opacity: page >= pageCount - 1 ? 0.5 : 1 }}>
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {selected && <AuditDetailModal log={selected} onClose={() => setSelected(null)} />}
        </>
    );
}

// ── Detail modal with before/after diff ──────────────────────────────────────
function AuditDetailModal({ log, onClose }: { log: PlatformAuditLog; onClose: () => void }) {
    const cat = AUDIT_CATEGORY_BADGE[log.category] ?? { bg: 'var(--surface-border)', fg: 'var(--text-secondary)', label: log.category };
    return (
        <div onClick={onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
            <div onClick={e => e.stopPropagation()} className="glass-panel" style={{ width: '100%', maxWidth: '680px', maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <div>
                        <h2 style={{ fontSize: '1.15rem', margin: '0 0 0.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <ShieldCheck size={18} /> {log.resourceName}
                        </h2>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                            <span style={{ ...badgeBase, background: cat.bg, color: cat.fg, marginRight: '0.4rem' }}>{cat.label}</span>
                            {actionLabel(log.action)} · {formatDateTime(log.timestamp)}
                        </div>
                    </div>
                    <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '0.2rem' }}>
                        <X size={20} />
                    </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem 1rem', padding: '0.9rem 1rem', borderRadius: '10px', background: 'var(--surface)', marginBottom: '1.25rem' }}>
                    <div>
                        <div style={fieldLabel}>Admin</div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{log.actorEmail || '—'}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{log.actorRole} · <span style={{ fontFamily: 'monospace' }}>{log.actorUid}</span></div>
                    </div>
                    <div>
                        <div style={fieldLabel}>Resource</div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{log.resourceType}</div>
                        {log.resourceId && <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{log.resourceId}</div>}
                    </div>
                    {(log.tenantName || log.tenantId) && (
                        <div style={{ gridColumn: '1 / -1' }}>
                            <div style={fieldLabel}>Business</div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{log.tenantName || '—'}</div>
                            {log.tenantId && <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{log.tenantId}</div>}
                        </div>
                    )}
                </div>

                <div style={{ marginBottom: '1.25rem' }}>
                    <div style={fieldLabel}>Description</div>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{log.description}</p>
                </div>

                {(log.before || log.after) && (
                    <div>
                        <div style={fieldLabel}>Changes</div>
                        <DiffView before={log.before} after={log.after} />
                    </div>
                )}
            </div>
        </div>
    );
}

// Field-level before/after diff. Rows whose value changed are highlighted.
function DiffView({ before, after }: { before?: Record<string, unknown>; after?: Record<string, unknown> }) {
    const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].sort();
    const render = (v: unknown): string => {
        if (v === undefined) return '—';
        if (v === null) return 'null';
        if (typeof v === 'object') return JSON.stringify(v);
        return String(v);
    };
    return (
        <div style={{ border: '1px solid var(--surface-border)', borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', background: 'var(--surface)', padding: '0.5rem 0.85rem' }}>
                <div>Field</div><div>Before</div><div>After</div>
            </div>
            {keys.map(k => {
                const b = before?.[k];
                const a = after?.[k];
                const changed = JSON.stringify(b) !== JSON.stringify(a);
                return (
                    <div key={k} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', fontSize: '0.82rem', padding: '0.55rem 0.85rem', borderTop: '1px solid var(--surface-border)', background: changed ? 'hsla(38,92%,50%,0.06)' : 'transparent' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-word' }}>{k}</div>
                        <div style={{ color: 'var(--text-secondary)', wordBreak: 'break-word' }}>{render(b)}</div>
                        <div style={{ color: changed ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: changed ? 600 : 400, wordBreak: 'break-word' }}>{render(a)}</div>
                    </div>
                );
            })}
        </div>
    );
}
