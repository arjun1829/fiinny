import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    FileText, Search, Loader2, ExternalLink, Printer,
    Receipt, IndianRupee, AlertCircle, Clock,
    CheckSquare, X, Trash2, BadgeCheck, CalendarDays,
} from 'lucide-react';
import { query, onSnapshot, orderBy, updateDoc, writeBatch, serverTimestamp, getDocs, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection, getTenantDoc } from '../utils/tenantPath';
import { useSalesFilter, fetchSalesOrdersByRetailerIds } from '../hooks/useSalesFilter';

// ─── Types ──────────────────────────────────────────────────────────────────

interface B2BInvoice {
    id: string;
    orderNumber?: string;
    retailerId?: string;
    retailerName?: string;
    grandTotal?: number;
    netAmount?: number;
    totalAmount?: number;
    amountPaid?: number;
    paymentStatus?: string;
    status?: string;
    modeOfPayment?: string;
    invoiceDate?: string;
    dueDate?: string;
    invoiceType?: string;
    createdAt?: { toDate?: () => Date };
}

// Amounts can live under a few legacy field names — read whichever is present.
const amountOf = (o: B2BInvoice) => Number(o.grandTotal ?? o.netAmount ?? o.totalAmount ?? 0);
const paidOf = (o: B2BInvoice) =>
    Number(o.amountPaid ?? (String(o.paymentStatus).toLowerCase() === 'paid' ? amountOf(o) : 0));
const outstandingOf = (o: B2BInvoice) => Math.max(0, amountOf(o) - paidOf(o));

const ORDER_STATUSES = ['pending', 'confirmed', 'dispatched', 'delivered', 'cancelled'];
const PAYMENT_MODES = ['Cash', 'UPI', 'Cheque', 'NEFT', 'RTGS', 'Credit', 'Online'];

// ─── Component ──────────────────────────────────────────────────────────────

export default function B2BInvoiceWorklistPage() {
    const navigate = useNavigate();
    const { tenantId, userRole } = useAuth();
    const isSales = userRole === 'sales';
    const isViewOnly = isSales || userRole === 'retailer';
    const { allowedRetailerIds, filterLoading } = useSalesFilter();
    const [invoices, setInvoices] = useState<B2BInvoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [payFilter, setPayFilter] = useState<'all' | 'paid' | 'pending'>('all');

    // ── Bulk selection & quick actions ───────────────────────────────────────
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [working, setWorking] = useState(false);
    const [showBulkDelete, setShowBulkDelete] = useState(false);

    const toggleSelect = (id: string) => setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });
    const clearSelection = () => setSelectedIds(new Set());

    useEffect(() => {
        if (!tenantId || filterLoading) return;
        setLoading(true);

        if (allowedRetailerIds === null) {
            // Admin/analyst: real-time listener, no restriction
            const q = query(getTenantCollection(db, tenantId, 'salesOrders'), orderBy('createdAt', 'desc'));
            const unsub = onSnapshot(q, snap => {
                setInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() }) as B2BInvoice).filter(o => o.invoiceType === 'B2B_GST'));
                setLoading(false);
            }, () => setLoading(false));
            return () => unsub();
        }

        // Sales user: one-shot query scoped to allowed retailer IDs
        fetchSalesOrdersByRetailerIds(tenantId, allowedRetailerIds)
            .then(docs => {
                const list = docs
                    .map(d => ({ id: d.id, ...d.data() }) as B2BInvoice)
                    .filter(o => o.invoiceType === 'B2B_GST')
                    .sort((a, b) => (b.createdAt?.toDate?.()?.getTime() ?? 0) - (a.createdAt?.toDate?.()?.getTime() ?? 0));
                setInvoices(list);
            })
            .catch(() => setInvoices([]))
            .finally(() => setLoading(false));
    }, [tenantId, filterLoading, allowedRetailerIds === null ? 'all' : Array.from(allowedRetailerIds).sort().join(',')]);

    const filtered = useMemo(() => {
        let r = invoices;
        if (payFilter !== 'all') {
            r = r.filter(o => (payFilter === 'paid' ? outstandingOf(o) <= 0 : outstandingOf(o) > 0));
        }
        const s = search.trim().toLowerCase();
        if (s) {
            r = r.filter(o =>
                (o.orderNumber || '').toLowerCase().includes(s) ||
                (o.retailerName || '').toLowerCase().includes(s));
        }
        return r;
    }, [invoices, search, payFilter]);

    const kpi = useMemo(() => ({
        count: invoices.length,
        totalInvoiced: invoices.reduce((s, o) => s + amountOf(o), 0),
        totalOutstanding: invoices.reduce((s, o) => s + outstandingOf(o), 0),
        overdue: invoices.filter(o => outstandingOf(o) > 0 && o.dueDate && new Date(o.dueDate) < new Date()).length,
    }), [invoices]);

    const markPayment = async (o: B2BInvoice, status: 'Paid' | 'Pending') => {
        if (!tenantId) return;
        const total = amountOf(o);
        await updateDoc(getTenantDoc(db, tenantId, 'salesOrders', o.id), {
            paymentStatus: status,
            amountPaid: status === 'Paid' ? total : 0,
            status: status === 'Paid' ? 'paid' : (o.status === 'paid' ? 'pending' : (o.status || 'pending')),
            updatedAt: serverTimestamp(),
        });
    };

    const selectAllFiltered = () => setSelectedIds(new Set(filtered.map(o => o.id)));

    // Apply a patch to every selected invoice in one atomic batch.
    const applyToSelected = async (patch: (o: B2BInvoice) => Record<string, unknown>) => {
        if (!tenantId || selectedIds.size === 0) return;
        setWorking(true);
        try {
            const batch = writeBatch(db);
            invoices.filter(o => selectedIds.has(o.id)).forEach(o => {
                batch.update(getTenantDoc(db, tenantId, 'salesOrders', o.id), { ...patch(o), updatedAt: serverTimestamp() });
            });
            await batch.commit();
            clearSelection();
        } catch (e) {
            console.error('Bulk update failed', e);
            alert('Bulk update failed. Please try again.');
        } finally {
            setWorking(false);
        }
    };

    const bulkPayment = (status: 'Paid' | 'Pending') => applyToSelected(o => status === 'Paid'
        ? { paymentStatus: 'Paid', amountPaid: amountOf(o), status: 'paid' }
        : { paymentStatus: 'Pending', amountPaid: 0, status: o.status === 'paid' ? 'pending' : (o.status || 'pending') });

    const bulkOrderStatus = (value: string) => { if (value) applyToSelected(() => ({ status: value })); };
    const bulkPaymentMode = (value: string) => { if (value) applyToSelected(() => ({ modeOfPayment: value })); };
    const bulkInvoiceDate = (value: string) => { if (value) applyToSelected(() => ({ invoiceDate: value })); };
    const bulkDueDate = (value: string) => { if (value) applyToSelected(() => ({ dueDate: value })); };

    const bulkDelete = async () => {
        if (!tenantId || selectedIds.size === 0) return;
        setWorking(true);
        try {
            const batch = writeBatch(db);
            [...selectedIds].forEach(id => batch.delete(getTenantDoc(db, tenantId, 'salesOrders', id)));
            await batch.commit();
            clearSelection();
            setShowBulkDelete(false);
        } catch (e) {
            console.error('Bulk delete failed', e);
            alert('Bulk delete failed. Please try again.');
        } finally {
            setWorking(false);
        }
    };

    const dateStr = (o: B2BInvoice) =>
        o.createdAt?.toDate ? o.createdAt.toDate().toLocaleDateString('en-IN')
            : (o.invoiceDate || '—');

    const isOverdue = (o: B2BInvoice) =>
        outstandingOf(o) > 0 && !!o.dueDate && new Date(o.dueDate) < new Date();

    // Bulk-bar control styles (white controls on the primary background).
    const pillBtn: React.CSSProperties = { padding: '0.3rem 0.7rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.5)', background: 'transparent', color: '#fff', fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' };
    const ctrl: React.CSSProperties = { padding: '0.35rem 0.5rem', borderRadius: '6px', border: 'none', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', background: '#fff', color: 'var(--text-primary)' };
    const actBtn = (c: string): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.35rem 0.7rem', borderRadius: '6px', border: 'none', background: '#fff', color: c, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' });
    const dateLabel: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: '#fff', fontSize: '0.72rem', fontWeight: 600 };
    const dateInput: React.CSSProperties = { padding: '0.2rem 0.3rem', borderRadius: '6px', border: 'none', fontSize: '0.72rem', fontFamily: 'inherit' };

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 className="primary-gradient-text" style={{ fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
                        <FileText size={28} /> B2B Invoices
                    </h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Every B2B GST invoice across all customers — work payments in one place.</p>
                </div>
                {!isViewOnly && (
                    <button className="btn btn-primary" onClick={() => navigate('/b2b-invoice')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <FileText size={16} /> New B2B Invoice
                    </button>
                )}
            </div>

            {/* KPI Cards */}
            {!loading && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                    {[
                        { label: 'Total Invoices', value: kpi.count.toString(), icon: Receipt, border: '#38bdf8', bg: 'rgba(56,189,248,0.07)' },
                        { label: 'Total Invoiced', value: `₹${kpi.totalInvoiced.toLocaleString('en-IN')}`, icon: IndianRupee, border: '#0ea5e9', bg: 'rgba(14,165,233,0.07)' },
                        { label: 'Outstanding', value: `₹${kpi.totalOutstanding.toLocaleString('en-IN')}`, icon: AlertCircle, border: '#f59e0b', bg: 'rgba(245,158,11,0.07)' },
                        { label: 'Overdue', value: kpi.overdue.toString(), icon: Clock, border: '#ef4444', bg: 'rgba(239,68,68,0.07)' },
                    ].map(c => (
                        <div key={c.label} className="glass-panel" style={{ padding: '1rem 1.25rem', borderLeft: `4px solid ${c.border}`, background: c.bg }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>{c.label}</p>
                                    <h2 style={{ margin: 0, fontWeight: 800, fontSize: '1.5rem', color: c.border }}>{c.value}</h2>
                                </div>
                                <div style={{ background: `${c.border}22`, borderRadius: '10px', padding: '0.55rem', flexShrink: 0 }}>
                                    <c.icon size={18} color={c.border} />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Filter bar */}
            <div className="glass-panel" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ flex: '1 1 240px', position: 'relative' }}>
                    <Search size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                    <input type="text" placeholder="Search by invoice no. or customer…" className="input-field"
                        style={{ paddingLeft: '2.2rem', margin: 0, height: '38px' }} value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                    {([['all', 'All'], ['pending', 'Pending'], ['paid', 'Paid']] as const).map(([val, label]) => (
                        <button key={val} onClick={() => setPayFilter(val)}
                            style={{ padding: '0.4rem 1rem', borderRadius: '20px', border: `1px solid ${payFilter === val ? 'var(--primary-light)' : 'var(--surface-border)'}`, background: payFilter === val ? 'var(--primary-light)' : 'transparent', color: payFilter === val ? '#fff' : 'var(--text-secondary)', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                            {label}
                        </button>
                    ))}
                </div>
                <span style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem', marginLeft: 'auto' }}>{filtered.length} invoices</span>
            </div>

            {/* Bulk quick-action bar — hidden in sales view-only mode */}
            {!isViewOnly && selectedIds.size > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', padding: '0.7rem 1rem', marginBottom: '1rem', background: 'var(--primary-light)', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}>
                    <CheckSquare size={16} color="#fff" />
                    <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.88rem' }}>{selectedIds.size} selected</span>
                    <button onClick={selectAllFiltered} style={pillBtn}>Select all ({filtered.length})</button>
                    <button onClick={clearSelection} style={pillBtn}><X size={12} /> Clear</button>

                    <div style={{ width: '1px', height: '22px', background: 'rgba(255,255,255,0.4)', margin: '0 0.25rem' }} />

                    {/* Payment status */}
                    <button disabled={working} onClick={() => bulkPayment('Paid')} style={actBtn('#10b981')}><BadgeCheck size={14} /> Mark Paid</button>
                    <button disabled={working} onClick={() => bulkPayment('Pending')} style={actBtn('#d97706')}>Mark Pending</button>

                    {/* Order status */}
                    <select disabled={working} value="" onChange={e => bulkOrderStatus(e.target.value)} style={ctrl} title="Set order status">
                        <option value="">Set status…</option>
                        {ORDER_STATUSES.map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
                    </select>

                    {/* Payment mode */}
                    <select disabled={working} value="" onChange={e => bulkPaymentMode(e.target.value)} style={ctrl} title="Set payment mode">
                        <option value="">Payment mode…</option>
                        {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>

                    {/* Dates */}
                    <label style={dateLabel} title="Set invoice date">
                        <CalendarDays size={13} /> Inv
                        <input type="date" disabled={working} onChange={e => bulkInvoiceDate(e.target.value)} style={dateInput} />
                    </label>
                    <label style={dateLabel} title="Set due date">
                        <Clock size={13} /> Due
                        <input type="date" disabled={working} onChange={e => bulkDueDate(e.target.value)} style={dateInput} />
                    </label>

                    {/* Delete selected */}
                    <button disabled={working} onClick={() => setShowBulkDelete(true)} style={{ ...actBtn('#ef4444'), marginLeft: 'auto' }}><Trash2 size={14} /> Delete</button>
                    {working && <Loader2 size={16} className="animate-spin" color="#fff" />}
                </div>
            )}

            {/* Table */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                    <Loader2 size={40} className="animate-spin" style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                    Loading invoices…
                </div>
            ) : filtered.length === 0 ? (
                <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-secondary)' }}>
                    <FileText size={48} color="var(--surface-border)" style={{ margin: '0 auto 1rem', display: 'block' }} />
                    <h3>No B2B invoices found</h3>
                    <p>{search || payFilter !== 'all' ? 'Try clearing the filters.' : 'Create a B2B GST invoice to see it here.'}</p>
                </div>
            ) : (
                <div className="glass-panel" style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', whiteSpace: 'nowrap' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--surface-border)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                {!isViewOnly && (
                                    <th style={{ padding: '0.85rem 1rem', width: '40px' }}>
                                        <input type="checkbox" aria-label="Select all"
                                            checked={filtered.length > 0 && filtered.every(o => selectedIds.has(o.id))}
                                            onChange={e => (e.target.checked ? selectAllFiltered() : clearSelection())}
                                            style={{ cursor: 'pointer' }} />
                                    </th>
                                )}
                                <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Date</th>
                                <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Invoice No</th>
                                <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Customer</th>
                                <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'right' }}>Amount</th>
                                <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'right' }}>Paid</th>
                                <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'right' }}>Outstanding</th>
                                <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Payment</th>
                                <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'center' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(o => {
                                const out = outstandingOf(o);
                                const sel = selectedIds.has(o.id);
                                const restBg = sel ? 'rgba(99,179,237,0.10)' : 'transparent';
                                return (
                                    <tr key={o.id}
                                        style={{ borderBottom: '1px solid var(--surface-border)', transition: 'background-color 0.2s', backgroundColor: restBg }}
                                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-raised)'}
                                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = restBg}
                                    >
                                        {!isViewOnly && (
                                            <td style={{ padding: '0.85rem 1rem' }}>
                                                <input type="checkbox" aria-label={`Select ${o.orderNumber || o.id}`}
                                                    checked={sel} onChange={() => toggleSelect(o.id)} style={{ cursor: 'pointer' }} />
                                            </td>
                                        )}
                                        <td style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{dateStr(o)}</td>
                                        <td style={{ padding: '0.85rem 1rem', fontWeight: 700, color: 'var(--primary-light)' }}>{o.orderNumber || o.id.slice(-8).toUpperCase()}</td>
                                        <td style={{ padding: '0.85rem 1rem' }}>
                                            {o.retailerId ? (
                                                <button
                                                    onClick={() => navigate(`/worklist/${o.retailerId}`)}
                                                    title="Open customer worklist"
                                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary-light)', fontWeight: 600, fontSize: '0.9rem', fontFamily: 'inherit', padding: 0, textDecoration: 'underline', textUnderlineOffset: '2px' }}>
                                                    {o.retailerName || '—'} <ExternalLink size={13} />
                                                </button>
                                            ) : (
                                                <span style={{ color: 'var(--text-secondary)' }}>{o.retailerName || 'Walk-in'}</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>₹{amountOf(o).toLocaleString('en-IN')}</td>
                                        <td style={{ padding: '0.85rem 1rem', textAlign: 'right', color: '#10b981' }}>₹{paidOf(o).toLocaleString('en-IN')}</td>
                                        <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                                            <span style={{ fontWeight: 700, color: out > 0 ? '#ef4444' : 'var(--text-tertiary)' }}>₹{out.toLocaleString('en-IN')}</span>
                                            {isOverdue(o) && (
                                                <div style={{ fontSize: '0.65rem', color: '#ef4444', fontWeight: 700 }}>OVERDUE</div>
                                            )}
                                        </td>
                                        <td style={{ padding: '0.85rem 1rem' }}>
                                            {isViewOnly ? (
                                                <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '8px', background: out <= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.08)', color: out <= 0 ? '#10b981' : '#ef4444', border: `1px solid ${out <= 0 ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}` }}>
                                                    {out <= 0 ? 'Paid' : 'Pending'}
                                                </span>
                                            ) : (
                                                <select
                                                    value={out <= 0 ? 'Paid' : 'Pending'}
                                                    onChange={e => markPayment(o, e.target.value as 'Paid' | 'Pending')}
                                                    style={{ fontSize: '0.78rem', padding: '0.3rem 0.5rem', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', border: '1px solid var(--surface-border)', background: out <= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.08)', color: out <= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                                                    <option value="Pending">Pending</option>
                                                    <option value="Paid">Paid</option>
                                                </select>
                                            )}
                                        </td>
                                        <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                                            <button
                                                onClick={() => navigate(`/b2b-invoice?orderId=${o.id}${o.retailerId ? `&retailerId=${o.retailerId}` : ''}`)}
                                                title="View / Print invoice"
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.75rem', background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit' }}>
                                                <Printer size={13} /> View / Print
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Bulk delete confirmation */}
            {showBulkDelete && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}
                    onClick={() => setShowBulkDelete(false)}>
                    <div style={{ background: 'var(--surface-raised)', borderRadius: '20px', padding: '2rem', maxWidth: '400px', width: '100%', textAlign: 'center', border: '1px solid var(--surface-border)' }}
                        onClick={e => e.stopPropagation()}>
                        <Trash2 size={40} style={{ color: '#f87171', margin: '0 auto 1rem', display: 'block' }} />
                        <h2 style={{ margin: '0 0 0.5rem', color: 'var(--text-primary)' }}>Delete {selectedIds.size} invoice{selectedIds.size !== 1 ? 's' : ''}?</h2>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                            This permanently deletes the selected B2B invoices. This action cannot be undone.
                        </p>
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                            <button onClick={() => setShowBulkDelete(false)} className="btn btn-secondary">Cancel</button>
                            <button onClick={bulkDelete} disabled={working} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.4rem', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit', fontSize: '0.9rem' }}>
                                {working ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                Yes, Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
