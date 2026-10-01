import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection } from '../utils/tenantPath';
import { fmtINR } from '../utils/gstCalculator';
import DatePeriodFilter from '../components/DatePeriodFilter';
import { type FinancialPeriod, getFinancialDateRange } from '../utils/financialPeriod';
import {
    Wallet, Search, ArrowUpDown, ExternalLink, Loader2, Download, CreditCard,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Global payment row — joins a payment doc with its retailer and (optional) invoice. */
interface PaymentRow {
    id: string;
    retailerId: string;
    retailerName: string;
    paymentDate: string;      // yyyy-mm-dd (falls back to createdAt millis→date)
    paymentAmount: number;
    invoiceNumber: string;    // '—' when the payment is not linked to an invoice
    invoiceAmount: number | null;
    outstandingAmount: number | null;
    status: 'Paid' | 'Partial' | 'Outstanding' | 'Unlinked';
    paymentMethod: string;
    reference: string;        // transaction ref / notes
}

type SortDir = 'asc' | 'desc';

const amountOfSO = (so: { grandTotal?: number; netAmount?: number; totalAmount?: number }) =>
    Number(so.grandTotal ?? so.netAmount ?? so.totalAmount ?? 0);

const STATUS_STYLE: Record<PaymentRow['status'], { bg: string; color: string; border: string }> = {
    Paid:        { bg: 'rgba(16,185,129,0.10)', color: '#10b981', border: 'rgba(16,185,129,0.25)' },
    Partial:     { bg: 'rgba(245,158,11,0.10)', color: '#f59e0b', border: 'rgba(245,158,11,0.25)' },
    Outstanding: { bg: 'rgba(239,68,68,0.08)',  color: '#ef4444', border: 'rgba(239,68,68,0.25)' },
    Unlinked:    { bg: 'rgba(148,163,184,0.10)', color: 'var(--text-tertiary)', border: 'var(--surface-border)' },
};

// ─── Component ──────────────────────────────────────────────────────────────────

export default function AllPaymentsPage() {
    const { tenantId, userRole, assignedRetailers, assignedDistricts } = useAuth();
    const navigate = useNavigate();

    const [rows, setRows] = useState<PaymentRow[]>([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | PaymentRow['status']>('all');
    const [methodFilter, setMethodFilter] = useState('all');
    const [sortDir, setSortDir] = useState<SortDir>('desc'); // newest payments first

    // Date period filter (primary filter = payment date)
    const [period, setPeriod] = useState<FinancialPeriod>('all');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');

    useEffect(() => {
        const load = async () => {
            if (!tenantId) return;
            setLoading(true);
            try {
                const [retailersSnap, salesOrdersSnap] = await Promise.all([
                    getDocs(getTenantCollection(db, tenantId, 'retailers')),
                    getDocs(getTenantCollection(db, tenantId, 'salesOrders')),
                ]);

                // Retailer id → { name, district } — excludes POS walk-in customers.
                const retailerMap = new Map<string, { name: string; district: string }>();
                retailersSnap.docs.forEach(d => {
                    const r = d.data() as { name?: string; district?: string; channel?: string };
                    if (r.channel === 'pos') return;
                    retailerMap.set(d.id, { name: r.name || '—', district: r.district || '' });
                });

                // Sales order id → invoice fields, for invoice number / amount / outstanding.
                type SOEntry = { orderNumber?: string; invoiceNumber?: string; grandTotal?: number; netAmount?: number; totalAmount?: number; amountPaid?: number; paymentStatus?: string };
                const soMap = new Map<string, SOEntry>();
                salesOrdersSnap.docs.forEach(d => soMap.set(d.id, d.data() as SOEntry));

                // Which retailers is this user allowed to see? (mirrors WorklistPage/PartnersTab)
                const allowedRetailerIds = new Set<string>();
                if (userRole === 'sales' || userRole === 'retailer') {
                    const districts = new Set(assignedDistricts.map(dd => dd.toLowerCase()));
                    retailerMap.forEach((r, rId) => {
                        if (assignedRetailers.includes(rId) || (userRole === 'sales' && districts.has(r.district.toLowerCase()))) {
                            allowedRetailerIds.add(rId);
                        }
                    });
                }
                const canSeeAll = userRole !== 'sales' && userRole !== 'retailer';

                // Fetch payments per-retailer — naturally scoped to this tenant.
                // getTenantCollection routes master→root, others→/tenants/{id}/..., so
                // no cross-tenant reads are possible and no path parsing is needed.
                const b2bRetailerIds = Array.from(retailerMap.keys());
                const pmtSnaps = await Promise.all(
                    b2bRetailerIds.map(rId => getDocs(getTenantCollection(db, tenantId, 'retailers', rId, 'payments')))
                );

                const built: PaymentRow[] = [];
                pmtSnaps.forEach((snap, idx) => {
                    const rId = b2bRetailerIds[idx];
                    const retailer = retailerMap.get(rId)!;
                    if (!canSeeAll && !allowedRetailerIds.has(rId)) return;

                    snap.docs.forEach(pdoc => {
                    const p = pdoc.data() as {
                        amount?: number; paymentDate?: string; paymentMethod?: string;
                        orderId?: string; orderNumber?: string; linkedOrderIds?: string[];
                        paymentId?: string; notes?: string;
                        accountDetails?: { transactionRef?: string; accountName?: string };
                        createdAt?: { toDate?: () => Date };
                    };

                    // Payment date — prefer explicit paymentDate, else createdAt.
                    let paymentDate = p.paymentDate || '';
                    if (!paymentDate && p.createdAt?.toDate) {
                        paymentDate = p.createdAt.toDate().toISOString().slice(0, 10);
                    }

                    // Resolve the linked invoice (if any).
                    const linkedId = p.orderId || p.linkedOrderIds?.[0];
                    const so = linkedId ? soMap.get(linkedId) : undefined;
                    const invoiceNumber = p.orderNumber || so?.orderNumber || so?.invoiceNumber || '—';

                    let invoiceAmount: number | null = null;
                    let outstandingAmount: number | null = null;
                    let status: PaymentRow['status'] = 'Unlinked';
                    if (so) {
                        invoiceAmount = amountOfSO(so);
                        const paid = Number(so.amountPaid ?? 0);
                        outstandingAmount = Math.max(0, invoiceAmount - paid);
                        if (String(so.paymentStatus).toLowerCase() === 'paid' || outstandingAmount <= 0) status = 'Paid';
                        else if (paid > 0) status = 'Partial';
                        else status = 'Outstanding';
                    }

                    built.push({
                        id: pdoc.id,
                        retailerId: rId,
                        retailerName: retailer.name,
                        paymentDate,
                        paymentAmount: Number(p.amount ?? 0),
                        invoiceNumber,
                        invoiceAmount,
                        outstandingAmount,
                        status,
                        paymentMethod: p.paymentMethod || '—',
                        reference: p.accountDetails?.transactionRef || p.notes || '',
                    });
                    }); // end snap.docs.forEach
                }); // end pmtSnaps.forEach

                setRows(built);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [tenantId, userRole, assignedRetailers, assignedDistricts]);

    // Distinct payment methods for the method filter dropdown.
    const methods = useMemo(() => {
        const s = new Set<string>();
        rows.forEach(r => { if (r.paymentMethod && r.paymentMethod !== '—') s.add(r.paymentMethod); });
        return Array.from(s).sort();
    }, [rows]);

    const dateRange = useMemo(
        () => getFinancialDateRange(period, customFrom, customTo),
        [period, customFrom, customTo],
    );

    const filtered = useMemo(() => {
        const [from, to] = dateRange ?? [null, null];
        const q = search.trim().toLowerCase();
        return rows
            .filter(r => {
                if (from && (!r.paymentDate || r.paymentDate < from)) return false;
                if (to && (!r.paymentDate || r.paymentDate > to)) return false;
                if (statusFilter !== 'all' && r.status !== statusFilter) return false;
                if (methodFilter !== 'all' && r.paymentMethod !== methodFilter) return false;
                if (q) {
                    return r.retailerName.toLowerCase().includes(q)
                        || r.invoiceNumber.toLowerCase().includes(q)
                        || r.reference.toLowerCase().includes(q)
                        || r.paymentMethod.toLowerCase().includes(q);
                }
                return true;
            })
            .sort((a, b) => {
                const cmp = (a.paymentDate || '').localeCompare(b.paymentDate || '');
                return sortDir === 'asc' ? cmp : -cmp;
            });
    }, [rows, dateRange, search, statusFilter, methodFilter, sortDir]);

    const totalReceived = useMemo(() => filtered.reduce((s, r) => s + r.paymentAmount, 0), [filtered]);

    const exportCSV = () => {
        const header = ['Retailer', 'Payment Date', 'Invoice No', 'Payment Amount', 'Invoice Amount', 'Outstanding', 'Status', 'Method', 'Reference'];
        const lines = filtered.map(r => [
            r.retailerName,
            r.paymentDate || '',
            r.invoiceNumber,
            r.paymentAmount,
            r.invoiceAmount ?? '',
            r.outstandingAmount ?? '',
            r.status,
            r.paymentMethod,
            (r.reference || '').replace(/[\n,]/g, ' '),
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
        const csv = [header.join(','), ...lines].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `payments-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const fmtDate = (d: string) =>
        d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem', color: 'var(--text-tertiary)', gap: '0.6rem' }}>
                <Loader2 size={20} className="animate-spin" /> Loading payments…
            </div>
        );
    }

    return (
        <div className="animate-fade-in">
            {/* ── Header ── */}
            <h1 className="primary-gradient-text" style={{ fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
                <Wallet size={28} /> All Payments
            </h1>
            <p style={{ margin: '0 0 1.25rem', color: 'var(--text-secondary)' }}>
                Every retailer / B2B payment transaction across all partners.
            </p>

            {/* ── Date period filter (primary) ── */}
            <div style={{ marginBottom: '1rem' }}>
                <DatePeriodFilter
                    period={period}
                    customFrom={customFrom}
                    customTo={customTo}
                    onPeriodChange={setPeriod}
                    onCustomFromChange={setCustomFrom}
                    onCustomToChange={setCustomTo}
                />
            </div>

            {/* ── Toolbar: search + filters ── */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', marginBottom: '1.25rem' }}>
                <div style={{ position: 'relative', flex: '1 1 240px', minWidth: '200px' }}>
                    <Search size={16} style={{ position: 'absolute', left: '0.7rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                    <input
                        className="input-field"
                        placeholder="Search retailer, invoice, method, reference…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ paddingLeft: '2.2rem', height: '38px', width: '100%' }}
                    />
                </div>

                <select className="input-field" value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)} style={{ height: '38px', width: 'auto', minWidth: '150px', padding: '0 2rem 0 0.75rem' }}>
                    <option value="all">All statuses</option>
                    <option value="Paid">Paid</option>
                    <option value="Partial">Partial</option>
                    <option value="Outstanding">Outstanding</option>
                    <option value="Unlinked">Unlinked</option>
                </select>

                <select className="input-field" value={methodFilter} onChange={e => setMethodFilter(e.target.value)} style={{ height: '38px', width: 'auto', minWidth: '150px', padding: '0 2rem 0 0.75rem' }}>
                    <option value="all">All methods</option>
                    {methods.map(m => <option key={m} value={m}>{m}</option>)}
                </select>

                <button
                    onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}
                    className="btn-secondary"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', height: '38px' }}
                    title="Toggle payment-date sort order"
                >
                    <ArrowUpDown size={15} /> Date {sortDir === 'desc' ? '↓ Newest' : '↑ Oldest'}
                </button>

                <button onClick={exportCSV} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', height: '38px' }} disabled={filtered.length === 0}>
                    <Download size={15} /> Export
                </button>
            </div>

            {/* ── Summary ── */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                <span><strong style={{ color: 'var(--text-primary)' }}>{filtered.length}</strong> payment{filtered.length === 1 ? '' : 's'}</span>
                <span>·</span>
                <span>Total received: <strong style={{ color: '#10b981' }}>₹{fmtINR(totalReceived)}</strong></span>
            </div>

            {/* ── Table ── */}
            {filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: 'var(--text-tertiary)' }}>
                    <CreditCard size={40} style={{ opacity: 0.4, marginBottom: '0.75rem' }} />
                    <p style={{ margin: 0 }}>No payments match the current filters.</p>
                </div>
            ) : (
                <div className="glass-panel" style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', whiteSpace: 'nowrap' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--surface-border)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Retailer</th>
                                <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Payment Date</th>
                                <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Invoice No</th>
                                <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'right' }}>Payment</th>
                                <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'right' }}>Invoice Amt</th>
                                <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'right' }}>Outstanding</th>
                                <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Status</th>
                                <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Method</th>
                                <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Reference</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(r => {
                                const st = STATUS_STYLE[r.status];
                                return (
                                    <tr key={r.id}
                                        style={{ borderBottom: '1px solid var(--surface-border)', transition: 'background-color 0.2s' }}
                                        onMouseOver={e => (e.currentTarget.style.backgroundColor = 'var(--surface-raised)')}
                                        onMouseOut={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                                    >
                                        <td style={{ padding: '0.85rem 1rem' }}>
                                            <button
                                                onClick={() => navigate(`/worklist/${r.retailerId}`)}
                                                title="Open retailer profile"
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary-light)', fontWeight: 600, fontSize: '0.9rem', fontFamily: 'inherit', padding: 0, textDecoration: 'underline', textUnderlineOffset: '2px' }}>
                                                {r.retailerName} <ExternalLink size={13} />
                                            </button>
                                        </td>
                                        <td style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{fmtDate(r.paymentDate)}</td>
                                        <td style={{ padding: '0.85rem 1rem', fontWeight: 700, color: r.invoiceNumber === '—' ? 'var(--text-tertiary)' : 'var(--primary-light)' }}>{r.invoiceNumber}</td>
                                        <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 700, color: '#10b981' }}>₹{fmtINR(r.paymentAmount)}</td>
                                        <td style={{ padding: '0.85rem 1rem', textAlign: 'right', color: 'var(--text-primary)' }}>{r.invoiceAmount == null ? '—' : `₹${fmtINR(r.invoiceAmount)}`}</td>
                                        <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 700, color: (r.outstandingAmount ?? 0) > 0 ? '#ef4444' : 'var(--text-tertiary)' }}>{r.outstandingAmount == null ? '—' : `₹${fmtINR(r.outstandingAmount)}`}</td>
                                        <td style={{ padding: '0.85rem 1rem' }}>
                                            <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '8px', background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>{r.status}</span>
                                        </td>
                                        <td style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{r.paymentMethod}</td>
                                        <td style={{ padding: '0.85rem 1rem', color: 'var(--text-tertiary)', fontSize: '0.82rem', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.reference}>{r.reference || '—'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
