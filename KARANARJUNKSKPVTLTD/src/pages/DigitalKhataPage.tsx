import { useState, useEffect, useMemo } from 'react';
import { query, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection } from '../utils/tenantPath';
import { BookOpen, Search, IndianRupee, Clock, CheckCircle2, AlertCircle, Phone, User, Calendar, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface KhataEntry {
    id: string;
    customerName?: string;
    customerPhone?: string;
    // POS bills (POSPage.handleCheckout) store the buyer as retailerName/phoneNumber
    // and the settled amount as amountPaid. Older/other writers used
    // customerName/customerPhone/paidAmount — both shapes are read below.
    retailerName?: string;
    phoneNumber?: string;
    amountPaid?: number;
    grandTotal?: number;
    netAmount?: number;
    totalAmount?: number;
    amount?: number;
    paidAmount?: number;
    paymentStatus?: string;
    paymentMethod?: string;
    createdAt?: any;
    invoiceNumber?: string;
    orderNumber?: string;
    invoiceType?: string;
    items?: any[];
}

// Buyer identity + settled amount, tolerant of both field shapes.
const entryName = (e: KhataEntry) => e.customerName || e.retailerName || '';
const entryPhone = (e: KhataEntry) => e.customerPhone || e.phoneNumber || '';

const fmtINR = (n: number) => {
    if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1).replace(/\.0$/, '')}Cr`;
    if (n >= 1_00_000)    return `₹${(n / 1_00_000).toFixed(2).replace(/\.?0+$/, '')}L`;
    if (n >= 1_000)       return `₹${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
    return `₹${Math.round(n).toLocaleString('en-IN')}`;
};

type FilterTab = 'pending' | 'partial' | 'all';

export default function DigitalKhataPage() {
    const { tenantId } = useAuth();
    const [entries, setEntries] = useState<KhataEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [tab, setTab] = useState<FilterTab>('pending');

    useEffect(() => {
        if (!tenantId) return;
        // Fetch ALL salesOrders — filter B2C client-side.
        // Firestore `where invoiceType != B2B_GST` requires a composite index
        // AND silently drops docs where invoiceType is undefined (most POS bills).
        const q = query(
            getTenantCollection(db, tenantId, 'salesOrders'),
            orderBy('createdAt', 'desc')
        );
        const unsub = onSnapshot(q, snap => {
            const b2cEntries = snap.docs
                .map(d => ({ id: d.id, ...d.data() }) as KhataEntry)
                .filter(e => e.invoiceType !== 'B2B_GST'); // keep POS + undefined (walk-in)
            setEntries(b2cEntries);
            setLoading(false);
        }, err => {
            console.error('DigitalKhata fetch error:', err);
            setLoading(false);
        });
        return () => unsub();
    }, [tenantId]);

    // Compute per-entry outstanding
    const enriched = useMemo(() => entries.map(e => {
        const total = Number(e.grandTotal || e.netAmount || e.totalAmount || e.amount || 0);
        // POS writes amountPaid; other writers used paidAmount. Reading only the
        // latter made every settled cash bill look like unpaid udhari.
        const rawPaid = e.amountPaid ?? e.paidAmount;
        // If neither field is present, fall back to the explicit payment status so a
        // settled bill is never counted as outstanding.
        const paid = rawPaid !== undefined && rawPaid !== null
            ? Number(rawPaid) || 0
            : (String(e.paymentStatus || '').toLowerCase() === 'paid' ? total : 0);
        const outstanding = Math.max(0, total - paid);
        const status = outstanding <= 0 ? 'paid' : paid > 0 ? 'partial' : 'pending';
        const ts = e.createdAt?.toDate ? e.createdAt.toDate() : new Date(e.createdAt || 0);
        return { ...e, total, paid, outstanding, status, ts };
    }), [entries]);

    // KPIs
    const kpi = useMemo(() => {
        const pendingEntries = enriched.filter(e => e.status !== 'paid');
        const totalOutstanding = pendingEntries.reduce((s, e) => s + e.outstanding, 0);
        const totalPending = enriched.filter(e => e.status === 'pending').length;
        const totalPartial = enriched.filter(e => e.status === 'partial').length;
        const totalCollected = enriched.filter(e => e.status === 'paid').length;
        const grossKhata = enriched.reduce((s, e) => s + e.total, 0);
        return { totalOutstanding, totalPending, totalPartial, totalCollected, grossKhata };
    }, [enriched]);

    // Filtered list
    const filtered = useMemo(() => {
        let list = enriched;
        if (tab === 'pending') list = list.filter(e => e.status === 'pending');
        if (tab === 'partial') list = list.filter(e => e.status === 'partial');
        if (search) {
            const q = search.toLowerCase();
            list = list.filter(e =>
                entryName(e).toLowerCase().includes(q) ||
                entryPhone(e).includes(search) ||
                e.invoiceNumber?.toLowerCase().includes(q)
            );
        }
        return list;
    }, [enriched, tab, search]);

    const tabStyle = (t: FilterTab) => ({
        padding: '0.45rem 1.2rem',
        borderRadius: '20px',
        border: `1px solid ${tab === t ? 'var(--primary-light)' : 'var(--surface-border)'}`,
        background: tab === t ? 'var(--primary-light)' : 'transparent',
        color: tab === t ? '#fff' : 'var(--text-secondary)',
        fontWeight: 600,
        fontSize: '0.82rem',
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'all 0.15s',
    });

    const statusBadge = (status: string) => {
        const map: Record<string, { bg: string; color: string; label: string }> = {
            pending: { bg: '#ef444422', color: '#ef4444', label: 'Pending' },
            partial: { bg: '#f59e0b22', color: '#f59e0b', label: 'Partial' },
            paid:    { bg: '#10b98122', color: '#10b981', label: 'Paid' },
        };
        const s = map[status] || map.pending;
        return (
            <span style={{ background: s.bg, color: s.color, padding: '0.2rem 0.6rem', borderRadius: '99px', fontSize: '0.72rem', fontWeight: 700 }}>
                {s.label}
            </span>
        );
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', gap: '1rem', color: 'var(--text-secondary)' }}>
                <BookOpen size={28} style={{ color: 'var(--primary-light)' }} />
                Loading Digital Khata...
            </div>
        );
    }

    return (
        <div className="animate-fade-in" style={{ maxWidth: '1100px', margin: '0 auto' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 className="primary-gradient-text" style={{ fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.4rem' }}>
                        <BookOpen size={28} /> Digital Khata
                    </h1>
                    <p style={{ color: 'var(--text-secondary)' }}>
                        Walk-in customer udhaari (B2C POS outstanding). B2B partner dues are in{' '}
                        <Link to="/worklist" style={{ color: 'var(--primary-light)', textDecoration: 'none', fontWeight: 600 }}>Partner Worklist →</Link>
                    </p>
                </div>
            </div>

            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                {[
                    { label: 'Total Outstanding', value: fmtINR(kpi.totalOutstanding), icon: AlertCircle, border: '#ef4444', bg: 'rgba(239,68,68,0.07)' },
                    { label: 'Pending Bills', value: String(kpi.totalPending), icon: Clock, border: '#f59e0b', bg: 'rgba(245,158,11,0.07)' },
                    { label: 'Partial Bills', value: String(kpi.totalPartial), icon: IndianRupee, border: '#8b5cf6', bg: 'rgba(139,92,246,0.07)' },
                    { label: 'Cleared Bills', value: String(kpi.totalCollected), icon: CheckCircle2, border: '#10b981', bg: 'rgba(16,185,129,0.07)' },
                    { label: 'Gross Khata', value: fmtINR(kpi.grossKhata), icon: BookOpen, border: '#38bdf8', bg: 'rgba(56,189,248,0.07)' },
                ].map(c => (
                    <div key={c.label} className="glass-panel" style={{ padding: '1.1rem 1.25rem', borderLeft: `4px solid ${c.border}`, background: c.bg, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>{c.label}</p>
                                <h2 style={{ margin: 0, fontSize: 'clamp(1rem, 2vw, 1.4rem)', fontWeight: 800, color: c.border }}>{c.value}</h2>
                            </div>
                            <div style={{ background: `${c.border}22`, borderRadius: '10px', padding: '0.55rem' }}>
                                <c.icon size={18} color={c.border} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="glass-panel" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Tab pills */}
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button style={tabStyle('pending')} onClick={() => setTab('pending')}>⏳ Pending</button>
                    <button style={tabStyle('partial')} onClick={() => setTab('partial')}>🔶 Partial</button>
                    <button style={tabStyle('all')} onClick={() => setTab('all')}>📋 All</button>
                </div>
                {/* Search */}
                <div style={{ flex: '1 1 260px', position: 'relative' }}>
                    <Search size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                    <input
                        type="text"
                        placeholder="Search by name, phone or invoice no."
                        className="input-field"
                        style={{ paddingLeft: '2.2rem', margin: 0, height: '38px' }}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <span style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem', marginLeft: 'auto' }}>{filtered.length} records</span>
            </div>

            {/* Khata Table */}
            {filtered.length === 0 ? (
                <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-secondary)' }}>
                    <BookOpen size={48} color="var(--surface-border)" style={{ margin: '0 auto 1rem', display: 'block' }} />
                    <h3>No entries found</h3>
                    <p>No {tab === 'all' ? '' : tab + ' '}B2C khata entries for this filter.</p>
                </div>
            ) : (
                <div className="glass-panel" style={{ overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--surface-border)', background: 'var(--surface-raised)' }}>
                                    {['Customer', 'Phone', 'Invoice', 'Date', 'Bill Amt', 'Paid', 'Outstanding', 'Status', ''].map(h => (
                                        <th key={h} style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--text-secondary)', textAlign: h === '' ? 'center' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(e => (
                                    <tr key={e.id}
                                        style={{ borderBottom: '1px solid var(--surface-border)', cursor: 'pointer', transition: 'background 0.15s' }}
                                        onMouseOver={ev => (ev.currentTarget.style.background = 'var(--surface-raised)')}
                                        onMouseOut={ev => (ev.currentTarget.style.background = 'transparent')}>
                                        <td style={{ padding: '0.9rem 1rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--primary)22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                    <User size={14} color="var(--primary-light)" />
                                                </div>
                                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{entryName(e) || 'Walk-in'}</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.9rem 1rem', color: 'var(--text-secondary)' }}>
                                            {entryPhone(e) ? (
                                                <a href={`tel:${entryPhone(e)}`} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--primary-light)', textDecoration: 'none' }}>
                                                    <Phone size={13} /> {entryPhone(e)}
                                                </a>
                                            ) : '—'}
                                        </td>
                                        <td style={{ padding: '0.9rem 1rem', color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>{e.invoiceNumber || e.id.slice(-6).toUpperCase()}</td>
                                        <td style={{ padding: '0.9rem 1rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                <Calendar size={12} />
                                                {e.ts.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.9rem 1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{fmtINR(e.total)}</td>
                                        <td style={{ padding: '0.9rem 1rem', color: '#10b981', fontWeight: 600 }}>{fmtINR(e.paid)}</td>
                                        <td style={{ padding: '0.9rem 1rem', fontWeight: 800, color: e.outstanding > 0 ? '#ef4444' : '#10b981' }}>{fmtINR(e.outstanding)}</td>
                                        <td style={{ padding: '0.9rem 1rem' }}>{statusBadge(e.status)}</td>
                                        <td style={{ padding: '0.9rem 1rem', textAlign: 'center' }}>
                                            <ArrowUpRight size={18} color="var(--primary-light)" />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Outstanding summary bar */}
                    {tab !== 'all' && filtered.length > 0 && (
                        <div style={{ padding: '0.85rem 1.25rem', borderTop: '1px solid var(--surface-border)', background: 'var(--surface-raised)', display: 'flex', justifyContent: 'flex-end', gap: '2rem', fontSize: '0.875rem' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Total Outstanding in view:</span>
                            <span style={{ fontWeight: 800, color: '#ef4444', fontSize: '1rem' }}>
                                {fmtINR(filtered.reduce((s, e) => s + e.outstanding, 0))}
                            </span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
