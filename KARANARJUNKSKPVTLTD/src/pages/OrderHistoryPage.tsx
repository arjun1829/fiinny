import { useState, useEffect, useMemo } from 'react';
import { ShoppingCart, FileText, Loader2, Search, ExternalLink, RotateCcw, Download, SlidersHorizontal, Tag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { query, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection } from '../utils/tenantPath';
import { printB2BInvoice } from '../utils/printB2BInvoice';
import BillExportFilters, { Seg, type PartyOption, type PaymentFilter } from '../components/BillExportFilters';
import {
    type BillFilterState, defaultBillFilters, hasActiveBillFilters, inPeriod, matchesParty,
    partyKey, periodLabel, periodSlug, formatIsoDate, toIsoDate,
} from '../utils/billFilters';
import { salesInvoiceIso } from '../utils/billFigures';
import { exportBillsZip } from '../utils/caExport';
import { fetchInvoiceBranding } from '../services/invoiceTemplateService';
import { logAudit } from '../utils/auditLog';

type TypeFilter = 'all' | 'pos' | 'b2b';
const isB2BRow = (o: { invoiceType?: string; orderNumber?: string }) => o.invoiceType === 'B2B_GST' || (o.orderNumber || '').startsWith('SO-');
const customerOf = (o: { retailerName?: string }) => (o.retailerName || '').trim() || 'Walk-in Customer';

interface SalesOrder {
    id: string;
    orderNumber: string;
    billNumber?: string;
    retailerName: string;
    phoneNumber?: string;
    subtotal?: number;
    grandTotal?: number;
    netAmount?: number;
    totalAmount?: number;
    paymentStatus?: string;
    status?: string;
    modeOfPayment?: string;
    // B2B (SalesOrderPage/B2BInvoicePage) writes modeOfPayment (e.g. '15 Days',
    // 'Cash'); POS (POSPage.handleCheckout) writes the selected method under a
    // different field, paymentMethod (e.g. 'Cash', 'Khata') — both are read
    // below so the Payment column works for either origin.
    paymentMethod?: string;
    // POS writes amountPaid; other writers used paidAmount — both are read below,
    // matching DigitalKhataPage's authoritative status calculation.
    amountPaid?: number;
    paidAmount?: number;
    invoiceDate?: string;
    invoiceType?: string;
    retailerId?: string;
    createdAt?: any;
    lineItems: any[];
    buyerAddress?: string;
    buyerGstin?: string;
    buyerContact?: string;
    salesmanName?: string;
    termsOfDelivery?: string;
    taxableValue?: number;
    cgst?: number;
    sgst?: number;
    totalTax?: number;
    discountAmount?: number;
    roundOff?: number;
    previousBalance?: number;
    netBalance?: number;
    // B2C Sales Return linkage (additive; absent on bills with no returns).
    hasReturns?: boolean;
    returnTotal?: number;
    deleted?: boolean;
}

// A bill is B2C (returnable) when it is neither a B2B GST invoice nor a plain
// B2B Sales Order (orderNumber 'SO-…') — mirrors ReturnsPage.isB2C.
function isB2C(o: SalesOrder): boolean {
    return o.invoiceType !== 'B2B_GST' && !(o.orderNumber || '').startsWith('SO-');
}

/** Read amount from any known field name */
function getAmount(order: SalesOrder): number {
    return Number(order.grandTotal || order.netAmount || order.totalAmount || order.subtotal || 0);
}

// Same formula as DigitalKhataPage's authoritative per-bill status calculation —
// reused here rather than re-derived, so Order History never disagrees with the
// Invoices view for the same salesOrders document.
function getPaymentStatus(order: SalesOrder): 'paid' | 'partial' | 'pending' {
    const total = getAmount(order);
    const rawPaid = order.amountPaid ?? order.paidAmount;
    const paid = rawPaid !== undefined && rawPaid !== null
        ? Number(rawPaid) || 0
        : (String(order.paymentStatus || '').toLowerCase() === 'paid' ? total : 0);
    const outstanding = Math.max(0, total - paid);
    return outstanding <= 0 ? 'paid' : paid > 0 ? 'partial' : 'pending';
}

// `fullWidth` is set when this page is embedded as a POS sub-tab, where it
// should span the full-width POS layout instead of the standalone /order-history
// route's centered 1400px column. Defaults false so the standalone route is
// unchanged.
export default function OrderHistoryPage({ fullWidth = false }: { fullWidth?: boolean } = {}) {
    const { tenantId, currentUser, userName, userRole } = useAuth();
    const navigate = useNavigate();
    const [orders, setOrders] = useState<SalesOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // ── CA export filters (month / date / range, customer, type, payment) ──
    // No GSTIN filter here: POS customers are farmers without a GSTIN.
    const [billFilters, setBillFilters] = useState<BillFilterState>(defaultBillFilters);
    const [payFilter, setPayFilter] = useState<PaymentFilter>('all');
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
    const [showFilters, setShowFilters] = useState(false);
    const [exportProgress, setExportProgress] = useState<{ done: number; total: number } | null>(null);
    const filtersActive = hasActiveBillFilters(billFilters) || payFilter !== 'all' || typeFilter !== 'all';

    useEffect(() => {
        if (!tenantId) return;
        const q = query(getTenantCollection(db, tenantId, 'salesOrders'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const ordersData = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter((o: any) => !o.deleted) as SalesOrder[];
            setOrders(ordersData);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [tenantId]);

    // B2B_GST invoices use their own saved GST-invoice layout (same utility
    // WorklistDetailsPage's "Print Invoice" button uses) — fetches the doc,
    // renders it, and calls window.print() in a new tab without navigating or
    // touching any state. Every other order (POS bills and plain B2B Sales
    // Orders, both billed via POS-style line items) reuses the POS reprint
    // flow (POSPage reads ?reprintOrderId and prints the saved bill via its
    // print portal), the same route the Khata screen's Print button takes —
    // this never opens the editable billing screen, only the print portal.
    const reprintBill = (order: SalesOrder) => {
        if (order.invoiceType === 'B2B_GST') {
            if (tenantId) printB2BInvoice(order.id, tenantId);
            return;
        }
        navigate(`/pos?reprintOrderId=${encodeURIComponent(order.id)}`);
    };

    // Opens the customer/retailer profile associated with this order, so the
    // user lands where the account is actually managed (billed/paid/outstanding,
    // invoices, notes, payments) rather than the bill editor itself.
    // A plain B2B Sales Order never sets invoiceType (only B2BInvoicePage does,
    // via 'B2B_GST'), so it's identified by its orderNumber prefix ('SO-...',
    // assigned in SalesOrderPage.tsx) — both B2B types share the same retailer
    // profile at /worklist/:retailerId (Partner Worklist → Retailer Details).
    // POS bills route to /customers/:retailerId (CustomerProfilePage), the
    // same 'retailers' doc CustomerProfilePage matches orders against via
    // retailerId — matching the Khata customer-profile screenshot. A walk-in
    // POS bill with no linked retailer has no specific profile to open, so it
    // falls back to the plain customers list rather than a broken profile page.
    const openBill = (order: SalesOrder) => {
        const isB2B = order.invoiceType === 'B2B_GST' || order.orderNumber?.startsWith('SO-');
        if (isB2B) {
            if (order.retailerId) navigate(`/worklist/${encodeURIComponent(order.retailerId)}`);
            return;
        }
        navigate(order.retailerId ? `/customers/${encodeURIComponent(order.retailerId)}` : '/customers');
    };

    const partyOptions = useMemo<PartyOption[]>(() => {
        const m = new Map<string, PartyOption>();
        orders.forEach(o => {
            const k = partyKey(customerOf(o));
            const cur = m.get(k);
            if (cur) cur.count++; else m.set(k, { key: k, label: customerOf(o), count: 1 });
        });
        return [...m.values()].sort((a, b) => a.label.localeCompare(b.label));
    }, [orders]);

    // Period + customer + type, before payment — so the Payment buttons can show counts.
    const inScope = useMemo(() => orders.filter(o =>
        inPeriod(salesInvoiceIso(o), billFilters) &&
        matchesParty(customerOf(o), billFilters) &&
        (typeFilter === 'all' || (typeFilter === 'b2b' ? isB2BRow(o) : !isB2BRow(o))),
    ), [orders, billFilters, typeFilter]);

    const paymentCounts = useMemo(() => {
        const paid = inScope.filter(o => getPaymentStatus(o) === 'paid').length;
        return { paid, pending: inScope.length - paid };
    }, [inScope]);

    const filteredOrders = inScope.filter(o =>
        (payFilter === 'all' || (payFilter === 'paid') === (getPaymentStatus(o) === 'paid')) &&
        (o.orderNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.retailerName?.toLowerCase().includes(searchTerm.toLowerCase()))
    );
    const filteredTotal = filteredOrders.reduce((s, o) => s + getAmount(o), 0);

    // Everything the filters show, as PDFs in the same layout as Reprint. Cancelled bills never go.
    const exportPdfs = async () => {
        if (!tenantId || exportProgress) return;
        const bills = filteredOrders
            .filter(o => o.status !== 'cancelled')
            .sort((a, b) => (salesInvoiceIso(a) ?? '').localeCompare(salesInvoiceIso(b) ?? '') || String(a.orderNumber ?? '').localeCompare(String(b.orderNumber ?? ''), undefined, { numeric: true }));
        const skipped = filteredOrders.length - bills.length;
        if (bills.length === 0) { alert('No bills to export with the current filters.'); return; }
        if (bills.length > 300 && !confirm(`Export ${bills.length} bills as PDFs? This can take a few minutes.`)) return;
        setExportProgress({ done: 0, total: bills.length });
        try {
            const branding = await fetchInvoiceBranding(tenantId);
            const res = await exportBillsZip({
                kind: 'pos', bills, branding,
                periodLabel: periodLabel(billFilters), periodSlug: periodSlug(billFilters),
                onProgress: (done, total) => setExportProgress({ done, total }),
            });
            logAudit({ db, tenantId, userId: currentUser?.uid || '', userName: userName || currentUser?.email || 'Unknown', userRole: userRole || 'unknown', module: 'POS Billing', action: 'Export', entityName: `${res.count} bill(s)`, description: `Exported ${res.count} Order History bill PDFs (ZIP) · ${periodLabel(billFilters)}${payFilter === 'paid' ? ' · fully paid only' : ''}` });
            const notes = [
                skipped ? `${skipped} cancelled bill(s) were left out.` : '',
                res.failed.length ? `Could not create PDF for: ${res.failed.join(', ')}` : '',
            ].filter(Boolean);
            if (notes.length) alert(`Downloaded ${res.fileName}\n\n${notes.join('\n')}`);
        } catch (e) {
            console.error('Order History export failed', e);
            alert('Export failed. Please try again.');
        } finally {
            setExportProgress(null);
        }
    };

    if (loading) {
        return (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
                <Loader2 size={48} className="spin" style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                <p>Loading Order History...</p>
            </div>
        );
    }

    return (
        <div className="animate-fade-in" style={{ maxWidth: fullWidth ? 'none' : '1400px', margin: '0 auto' }}>
            <div style={{ marginBottom: '2rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 className="primary-gradient-text" style={{ fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                        <ShoppingCart size={32} /> Order History
                    </h1>
                    <p style={{ color: 'var(--text-secondary)' }}>View previously generated POS bills and Sales Orders — open the customer/retailer profile to manage, or reprint the saved invoice.</p>
                </div>
            </div>

            <div className="glass-panel" style={{ padding: '1rem', marginBottom: '1rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
                    <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                    <input
                        type="text"
                        placeholder="Search by Bill No or Customer Name..."
                        className="input-field"
                        style={{ paddingLeft: '2.5rem', margin: 0 }}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <button type="button" onClick={() => setShowFilters(v => !v)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.9rem', borderRadius: '20px', border: `1px solid ${showFilters || filtersActive ? 'var(--primary-light)' : 'var(--surface-border)'}`, background: filtersActive ? 'rgba(16,185,129,0.12)' : 'transparent', color: showFilters || filtersActive ? 'var(--primary-light)' : 'var(--text-secondary)', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                    <SlidersHorizontal size={14} /> Filters{filtersActive ? ' •' : ''}
                </button>
                <span style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>{filteredOrders.length} records</span>
                <button type="button" className="btn btn-primary" onClick={exportPdfs} disabled={!!exportProgress || filteredOrders.length === 0}
                    title="Download every bill shown as PDFs in one ZIP"
                    style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', height: '36px', padding: '0 1rem', fontSize: '0.85rem', opacity: filteredOrders.length === 0 ? 0.5 : 1 }}>
                    {exportProgress
                        ? <><Loader2 size={15} className="spin" /> Creating PDFs {exportProgress.done}/{exportProgress.total}</>
                        : <><Download size={15} /> Export PDFs (ZIP)</>}
                </button>
                {(showFilters || filtersActive) && (
                    <div style={{ flexBasis: '100%', borderTop: '1px solid var(--surface-border)', paddingTop: '0.85rem' }}>
                        <BillExportFilters value={billFilters} onChange={setBillFilters} partyOptions={partyOptions} partyNoun="Customer" showGst={false}
                            payment={payFilter} onPaymentChange={setPayFilter} paymentCounts={paymentCounts}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginLeft: '0.5rem' }}><Tag size={13} /> Type</span>
                            <Seg options={[['all', 'All'], ['pos', 'POS'], ['b2b', 'B2B']] as [TypeFilter, string][]} value={typeFilter} onPick={setTypeFilter} />
                        </BillExportFilters>
                        {typeFilter !== 'all' || payFilter !== 'all' || hasActiveBillFilters(billFilters) ? (
                            <div style={{ marginTop: '0.75rem', display: 'flex', gap: '1.25rem', flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                <span><strong style={{ color: 'var(--text-primary)' }}>{filteredOrders.length}</strong> bill{filteredOrders.length !== 1 ? 's' : ''} · {periodLabel(billFilters)}</span>
                                <span>Total <strong style={{ color: 'var(--text-primary)' }}>₹{Math.round(filteredTotal).toLocaleString('en-IN')}</strong></span>
                            </div>
                        ) : null}
                    </div>
                )}
            </div>

            <div className="glass-panel" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', whiteSpace: 'nowrap' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--surface-border)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                            <th style={{ padding: '1rem', fontWeight: 600 }}>Bill Date</th>
                            <th style={{ padding: '1rem', fontWeight: 600 }}>Bill No</th>
                            <th style={{ padding: '1rem', fontWeight: 600 }}>Customer Name</th>
                            <th style={{ padding: '1rem', fontWeight: 600 }}>Type</th>
                            <th style={{ padding: '1rem', fontWeight: 600, textAlign: 'right' }}>Total Amount</th>
                            <th style={{ padding: '1rem', fontWeight: 600 }}>Payment</th>
                            <th style={{ padding: '1rem', fontWeight: 600 }}>Status</th>
                            <th className="sticky-actions-col" style={{ padding: '1rem', fontWeight: 600, textAlign: 'center' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredOrders.length === 0 ? (
                            <tr>
                                <td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                                    <ShoppingCart size={48} style={{ margin: '0 auto 1rem', opacity: 0.2, display: 'block' }} />
                                    <p>No orders found.</p>
                                </td>
                            </tr>
                        ) : (
                            filteredOrders.map((order) => {
                                const amount = getAmount(order);
                                // Bill date (printed on the bill, used by the filters & GST); entry time
                                // from createdAt. A backdated/edited bill also shows when it was entered.
                                const created: Date | null = order.createdAt?.toDate ? order.createdAt.toDate() : null;
                                const billIso = salesInvoiceIso(order);
                                const enteredIso = toIsoDate(created);
                                const timeStr = created ? created.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
                                const paymentStatus = getPaymentStatus(order);
                                const statusBadge = {
                                    paid:    { bg: 'rgba(16,185,129,0.12)', color: '#10b981', label: 'Paid' },
                                    partial: { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', label: 'Partial' },
                                    pending: { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', label: 'Pending' },
                                }[paymentStatus];
                                return (
                                    <tr key={order.id}
                                        style={{ borderBottom: '1px solid var(--surface-border)', transition: 'background-color 0.2s' }}
                                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-raised)'}
                                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                    >
                                        <td style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                            {billIso ? formatIsoDate(billIso) : 'N/A'}{billIso && billIso === enteredIso && timeStr ? `, ${timeStr}` : ''}
                                            {billIso && enteredIso && billIso !== enteredIso && (
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Entered {formatIsoDate(enteredIso)}, {timeStr}</div>
                                            )}
                                        </td>
                                        <td style={{ padding: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>{order.orderNumber || 'N/A'}</td>
                                        <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{order.retailerName || 'Walk-in'}</td>
                                        <td style={{ padding: '1rem' }}>
                                            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '99px', background: order.invoiceType === 'B2B_GST' ? 'rgba(139,92,246,0.15)' : 'rgba(16,185,129,0.12)', color: order.invoiceType === 'B2B_GST' ? '#a78bfa' : '#10b981', fontWeight: 600 }}>
                                                {order.invoiceType === 'B2B_GST' ? 'B2B' : 'POS'}
                                            </span>
                                            {order.hasReturns && (
                                                <span title={`Returned ₹${Number(order.returnTotal || 0).toLocaleString('en-IN')}`} style={{ marginLeft: '0.4rem', fontSize: '0.7rem', padding: '2px 8px', borderRadius: '99px', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontWeight: 700 }}>
                                                    Returned
                                                </span>
                                            )}
                                        </td>
                                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 700, color: 'var(--primary-light)', fontSize: '1rem' }}>
                                            ₹{amount.toLocaleString('en-IN')}
                                        </td>
                                        <td style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{order.modeOfPayment || order.paymentMethod || '—'}</td>
                                        <td style={{ padding: '1rem' }}>
                                            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '99px', background: statusBadge.bg, color: statusBadge.color, fontWeight: 600 }}>
                                                {statusBadge.label}
                                            </span>
                                        </td>
                                        <td className="sticky-actions-col" style={{ padding: '1rem' }}>
                                            <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                                                <button
                                                    onClick={() => openBill(order)}
                                                    title="View Customer / Retailer Profile"
                                                    style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.3rem 0.7rem', background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit' }}
                                                >
                                                    <ExternalLink size={13} /> View Profile
                                                </button>
                                                <button
                                                    onClick={() => reprintBill(order)}
                                                    title="Reprint"
                                                    style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.3rem 0.7rem', background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit' }}
                                                >
                                                    <FileText size={13} /> Reprint
                                                </button>
                                                {isB2C(order) && !order.deleted && (
                                                    <button
                                                        onClick={() => navigate(`/returns?orderId=${encodeURIComponent(order.id)}`)}
                                                        title="Sales Return / Credit Note"
                                                        style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.3rem 0.7rem', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit' }}
                                                    >
                                                        <RotateCcw size={13} /> Return
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
