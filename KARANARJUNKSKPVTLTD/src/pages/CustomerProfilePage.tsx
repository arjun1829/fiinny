import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
    getDoc, getDocs, addDoc, updateDoc, query, orderBy,
    serverTimestamp, onSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantDoc, getTenantCollection } from '../utils/tenantPath';
import { useToast } from '../contexts/ToastContext';
import {
    ArrowLeft, User, Phone, MapPin, IndianRupee, ShoppingCart, Clock,
    Edit2, Save, X, Plus, CheckCircle2, AlertCircle, ReceiptText,
    StickyNote, CreditCard, Printer, ChevronDown, Calculator, FileText,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CustomerDoc {
    id: string;
    name?: string;
    number?: string;
    atPost?: string;
    taluka?: string;
    district?: string;
    pin?: string;
    totalSales?: number;
    outstandingAmount?: number;
    totalPaid?: number;
    lastOrderedAt?: any;
    createdAt?: any;
    channel?: string;
}

interface PosOrder {
    id: string;
    orderNumber?: string;
    invoiceDate?: string;
    grandTotal?: number;
    paymentMethod?: string;
    paymentStatus?: string;
    creditAmount?: number;
    amountPaid?: number;
    paidAmount?: number;
    lineItems?: { productName: string; quantity: number; unit: string; amount: number }[];
    createdAt?: any;
}

interface Payment {
    id: string;
    amount: number;
    paymentDate?: string;
    paymentMethod?: string;
    notes?: string;
    createdAt?: any;
}

interface Note {
    id: string;
    content: string;
    createdAt?: any;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtINR = (n: number) => {
    if (!n) return '₹0';
    if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2).replace(/\.?0+$/, '')}L`;
    if (n >= 1_000)    return `₹${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
    return `₹${Math.round(n).toLocaleString('en-IN')}`;
};

function fmtDate(ts: any): string {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateTime(ts: any): string {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}

// Digits-only phone, matching the normaliser used in POS/Digital Khata/B2B invoice.
const phoneKey = (v: unknown): string => String(v ?? '').replace(/\D/g, '');

// ── Component ─────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'purchases' | 'payments' | 'notes';

// Temporarily hidden on this page only — flip back to true to restore.
// Underlying payment recording (recordPayment, the payments subcollection,
// the modal) is untouched; Record Payment elsewhere in the app is unaffected.
const SHOW_RECORD_PAYMENT = false;

export default function CustomerProfilePage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { tenantId, userRole, currentUser, userName } = useAuth();
    const { showToast } = useToast();

    const [customer, setCustomer]   = useState<CustomerDoc | null>(null);
    const [loading, setLoading]     = useState(true);
    const [activeTab, setActiveTab] = useState<Tab>('overview');

    const [orders, setOrders]     = useState<PosOrder[]>([]);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [notes, setNotes]       = useState<Note[]>([]);

    // Edit mode
    const [editing, setEditing]         = useState(false);
    const [editForm, setEditForm]       = useState<Partial<CustomerDoc>>({});
    const [savingEdit, setSavingEdit]   = useState(false);

    // New payment
    const [showPayModal, setShowPayModal]         = useState(false);
    const [payAmount, setPayAmount]               = useState<number>(0);
    const [payDate, setPayDate]                   = useState(() => new Date().toISOString().slice(0, 10));
    const [payMethod, setPayMethod]               = useState('Cash');
    const [payNotes, setPayNotes]                 = useState('');
    const [savingPayment, setSavingPayment]       = useState(false);

    // New note
    const [newNote, setNewNote]   = useState('');
    const [savingNote, setSavingNote] = useState(false);

    // New Bill dropdown
    const [showBillMenu, setShowBillMenu] = useState(false);
    const billMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!showBillMenu) return;
        const handler = (e: MouseEvent) => {
            if (billMenuRef.current && !billMenuRef.current.contains(e.target as Node)) setShowBillMenu(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showBillMenu]);

    // Load customer doc
    useEffect(() => {
        if (!tenantId || !id) return;
        getDoc(getTenantDoc(db, tenantId, 'retailers', id)).then(snap => {
            if (snap.exists()) setCustomer({ id: snap.id, ...snap.data() } as CustomerDoc);
            setLoading(false);
        }).catch(() => setLoading(false));
    }, [tenantId, id]);

    // Live purchases.
    //
    // B2B retailers: match by retailerId only, excluding soft-deleted docs —
    // the exact same filter WorklistDetailsPage (Retailer Details) uses, so
    // this page's Total Sales/Outstanding agree with Partner Worklist.
    //
    // B2C walk-in customers: retailerId is often unset on Khata-originated
    // bills, so match the way Digital Khata itself rolls bills up to a
    // customer — by normalized name first, falling back to digits-only phone
    // — and exclude cancelled bills too (Khata excludes those; a stray exact
    // string match on `phoneNumber` here previously missed/duplicated bills
    // and let cancelled ones still count).
    useEffect(() => {
        if (!tenantId || !id || !customer) return;
        const isB2B = customer.channel !== 'pos';
        const nameKey = (customer.name || '').trim().toLowerCase();
        const phoneDigits = phoneKey(customer.number);
        const q = query(
            getTenantCollection(db, tenantId, 'salesOrders'),
            orderBy('createdAt', 'desc'),
        );
        const unsub = onSnapshot(q, snap => {
            const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as PosOrder & {
                retailerId?: string; phoneNumber?: string; customerName?: string; retailerName?: string;
                customerPhone?: string; invoiceType?: string; deleted?: boolean; status?: string;
            }));
            const docs = isB2B
                ? all.filter(o => o.retailerId === id && !o.deleted)
                : all.filter(o => {
                    if (o.invoiceType === 'B2B_GST' || o.deleted) return false;
                    if (String(o.status || '').toLowerCase() === 'cancelled') return false;
                    const oName = String(o.customerName || o.retailerName || '').trim().toLowerCase();
                    const oPhone = phoneKey(o.customerPhone || o.phoneNumber);
                    return nameKey ? oName === nameKey : (phoneDigits ? oPhone.slice(-10) === phoneDigits.slice(-10) : false);
                });
            setOrders(docs);
        });
        return () => unsub();
    }, [tenantId, id, customer?.number, customer?.name, customer?.channel]);

    // Payments subcollection
    useEffect(() => {
        if (!tenantId || !id) return;
        const unsub = onSnapshot(
            query(getTenantCollection(db, tenantId, 'retailers', id, 'payments'), orderBy('createdAt', 'desc')),
            snap => setPayments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Payment)))
        );
        return () => unsub();
    }, [tenantId, id]);

    // Notes subcollection
    useEffect(() => {
        if (!tenantId || !id) return;
        const unsub = onSnapshot(
            query(getTenantCollection(db, tenantId, 'retailers', id, 'notes'), orderBy('createdAt', 'desc')),
            snap => setNotes(snap.docs.map(d => ({ id: d.id, ...d.data() } as Note)))
        );
        return () => unsub();
    }, [tenantId, id]);

    // Outstanding mirrors whichever screen is the source of truth for this
    // customer type, instead of the `retailers.outstandingAmount` cache —
    // that field is a best-effort counter that Digital Khata's manual-entry
    // and payment flows never write to (see DigitalKhataPage), so it drifts
    // from the live Khata/Worklist balance for exactly the customers who use
    // those flows.
    //
    // B2B: Total Sales − sum(payments subcollection), same as WorklistDetailsPage.
    //      Total Paid = that same payments-subcollection sum.
    // B2C: sum of each bill's own (total − paid), same as Digital Khata.
    //      Total Paid = Total Spent − Outstanding (Khata defines each bill's
    //      paid amount as total − outstanding, so the same holds summed).
    const stats = useMemo(() => {
        const totalSpend = orders.reduce((s, o) => s + (o.grandTotal ?? 0), 0);
        const isB2B = customer?.channel !== 'pos';
        let outstanding: number;
        let totalPaid: number;
        if (isB2B) {
            totalPaid = payments.reduce((s, p) => s + (p.amount ?? 0), 0);
            outstanding = Math.max(0, totalSpend - totalPaid);
        } else {
            outstanding = orders.reduce((s, o) => {
                const total = Number(o.grandTotal ?? 0);
                const rawPaid = o.amountPaid ?? o.paidAmount;
                const paid = rawPaid !== undefined && rawPaid !== null
                    ? Number(rawPaid) || 0
                    : (String(o.paymentStatus || '').toLowerCase() === 'paid' ? total : 0);
                return s + Math.max(0, total - paid);
            }, 0);
            totalPaid = totalSpend - outstanding;
        }
        return {
            totalOrders: orders.length,
            totalSpend,
            outstanding,
            totalPaid,
            lastOrder: orders[0]?.invoiceDate || orders[0]?.createdAt,
        };
    }, [orders, payments, customer?.channel]);

    // ── Handlers ──

    const startEdit = () => {
        if (!customer) return;
        setEditForm({
            name: customer.name || '',
            number: customer.number || '',
            atPost: customer.atPost || '',
            taluka: customer.taluka || '',
            district: customer.district || '',
            pin: customer.pin || '',
        });
        setEditing(true);
    };

    const saveEdit = async () => {
        if (!tenantId || !id) return;
        setSavingEdit(true);
        try {
            await updateDoc(getTenantDoc(db, tenantId, 'retailers', id), {
                ...(editForm.name     !== undefined ? { name: editForm.name }         : {}),
                ...(editForm.number   !== undefined ? { number: editForm.number }     : {}),
                ...(editForm.atPost   !== undefined ? { atPost: editForm.atPost }     : {}),
                ...(editForm.taluka   !== undefined ? { taluka: editForm.taluka }     : {}),
                ...(editForm.district !== undefined ? { district: editForm.district } : {}),
                ...(editForm.pin      !== undefined ? { pin: editForm.pin }           : {}),
                updatedAt: serverTimestamp(),
            });
            setCustomer(prev => prev ? { ...prev, ...editForm } : prev);
            setEditing(false);
            showToast('Customer details updated', 'success');
        } catch (e) {
            console.error(e); showToast('Failed to save changes', 'error');
        } finally {
            setSavingEdit(false);
        }
    };

    const recordPayment = async () => {
        if (!tenantId || !id || payAmount <= 0) return;
        setSavingPayment(true);
        try {
            const cur = customer?.outstandingAmount ?? 0;
            const newOut = Math.max(0, cur - payAmount);
            await addDoc(getTenantCollection(db, tenantId, 'retailers', id, 'payments'), {
                amount: payAmount,
                paymentDate: payDate,
                paymentMethod: payMethod,
                notes: payNotes || null,
                createdAt: serverTimestamp(),
            });
            await updateDoc(getTenantDoc(db, tenantId, 'retailers', id), {
                outstandingAmount: newOut,
                totalPaid: (customer?.totalPaid ?? 0) + payAmount,
                updatedAt: serverTimestamp(),
            });
            setCustomer(prev => prev ? { ...prev, outstandingAmount: newOut, totalPaid: (prev.totalPaid ?? 0) + payAmount } : prev);
            setShowPayModal(false);
            setPayAmount(0); setPayNotes('');
            showToast(`Payment of ₹${payAmount.toLocaleString('en-IN')} recorded`, 'success');
        } catch (e) {
            console.error(e); showToast('Failed to record payment', 'error');
        } finally {
            setSavingPayment(false);
        }
    };

    const addNote = async () => {
        if (!tenantId || !id || !newNote.trim()) return;
        setSavingNote(true);
        try {
            await addDoc(getTenantCollection(db, tenantId, 'retailers', id, 'notes'), {
                content: newNote.trim(),
                addedBy: userName || currentUser?.email || 'Unknown',
                createdAt: serverTimestamp(),
            });
            setNewNote('');
        } catch (e) {
            showToast('Failed to save note', 'error');
        } finally {
            setSavingNote(false);
        }
    };

    const printProfile = () => {
        if (!customer) return;
        const isB2B = customer.channel !== 'pos';
        const address = [customer.atPost, customer.taluka, customer.district].filter(Boolean).join(', ');
        const win = window.open('', '_blank');
        if (!win) return;
        win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Customer Profile — ${customer.name || 'Customer'}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e1e1e; font-size: 9.5pt; line-height: 1.5; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; }
  .biz-name { font-size: 16pt; font-weight: 700; color: rgb(28,120,60); text-transform: uppercase; }
  .doc-sub { font-size: 8.5pt; color: #505050; margin-top: 5px; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 8pt; font-weight: 700; border: 1px solid ${isB2B ? '#8b5cf6' : '#0ea5e9'}; color: ${isB2B ? '#8b5cf6' : '#0ea5e9'}; margin-top: 6px; }
  .doc-title { font-size: 13pt; font-weight: 700; color: #1e1e1e; text-align: right; }
  .doc-meta { font-size: 8pt; color: #646464; margin-top: 5px; text-align: right; }
  .divider { border: none; border-top: 1px solid #c8c8c8; margin: 6px 0 10px; }
  .cust-name { font-size: 17pt; font-weight: 800; margin: 2px 0 6px; }
  .section { margin-bottom: 16px; }
  .section-title { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #646464; border-bottom: 1px solid #c8c8c8; padding-bottom: 4px; margin-bottom: 10px; }
  table.fields { width: 100%; border-collapse: collapse; }
  table.fields td { padding: 6px 4px; vertical-align: top; border-bottom: 1px solid #e5e5e5; width: 50%; }
  table.fields td label { font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #888; display: block; margin-bottom: 2px; }
  table.fields td span { font-size: 10pt; font-weight: 500; color: #1e1e1e; word-break: break-word; }
  .footer { border-top: 1px solid #c8c8c8; margin-top: 24px; padding-top: 8px; font-size: 7.5pt; color: #969696; display: flex; justify-content: space-between; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head><body>
<div class="header">
  <div>
    <div class="biz-name">${customer.name || 'Unnamed Customer'}</div>
    <div class="doc-sub">Customer Profile</div>
    <div class="badge">${isB2B ? 'B2B Retailer' : 'Walk-in Customer'}</div>
  </div>
  <div>
    <div class="doc-title">CUSTOMER PROFILE</div>
    <div class="doc-meta">Generated: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
    <div class="doc-meta">Customer since: ${fmtDate(customer.createdAt)}</div>
    <div class="doc-meta">Ref: ${id?.slice(-8).toUpperCase()}</div>
  </div>
</div>
<hr class="divider" />

<div class="section">
  <div class="section-title">Contact & Address</div>
  <table class="fields">
    <tr>
      <td><label>Phone Number</label><span>${customer.number || '—'}</span></td>
      <td><label>PIN Code</label><span>${customer.pin || '—'}</span></td>
    </tr>
    <tr>
      <td><label>Village / At Post</label><span>${customer.atPost || '—'}</span></td>
      <td><label>Taluka</label><span>${customer.taluka || '—'}</span></td>
    </tr>
    <tr>
      <td><label>District</label><span>${customer.district || '—'}</span></td>
      <td><label>Full Address</label><span>${address || '—'}</span></td>
    </tr>
  </table>
</div>

<div class="footer">
  <span>Fiinny ERP — Customer Reference Sheet</span>
  <span>To save as PDF: File → Print → Save as PDF</span>
</div>
</body></html>`);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 400);
    };

    if (userRole !== 'admin' && userRole !== 'analyst') {
        return <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--danger)' }}>Access restricted.</div>;
    }

    if (loading) return <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading…</div>;
    if (!customer) return <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--danger)' }}>Customer not found.</div>;

    const outstanding = stats.outstanding;

    const TAB_STYLES = (t: Tab): React.CSSProperties => ({
        display: 'flex', alignItems: 'center', gap: '0.45rem',
        padding: '0.6rem 1.15rem', background: 'transparent', border: 'none',
        borderBottom: activeTab === t ? '2px solid var(--primary-light)' : '2px solid transparent',
        marginBottom: '-2px', color: activeTab === t ? 'var(--primary-light)' : 'var(--text-tertiary)',
        fontWeight: activeTab === t ? 700 : 400, fontSize: '0.9rem', cursor: 'pointer',
        fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'all 0.15s',
    });

    return (
        <div className="animate-fade-in" style={{ maxWidth: '1100px', margin: '0 auto' }}>

            {/* Back */}
            <button onClick={() => navigate('/customers')}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.85rem', fontFamily: 'inherit', marginBottom: '1.25rem', padding: 0 }}>
                <ArrowLeft size={15} /> Back to Customers
            </button>

            {/* Profile header */}
            <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.25rem' }}>
                        <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'hsla(152,60%,40%,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <User size={28} color="var(--primary-light)" />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                                <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>{customer.name || 'Unnamed Customer'}</h2>
                                <span style={{ padding: '0.15rem 0.65rem', borderRadius: '99px', fontSize: '0.72rem', fontWeight: 700, background: customer.channel === 'pos' ? 'rgba(14,165,233,0.1)' : 'rgba(139,92,246,0.1)', color: customer.channel === 'pos' ? '#0ea5e9' : '#8b5cf6' }}>
                                    {customer.channel === 'pos' ? 'Walk-in Customer' : 'B2B Retailer'}
                                </span>
                            </div>
                            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                                {customer.number && (
                                    <a href={`tel:${customer.number}`} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--primary-light)', textDecoration: 'none', fontSize: '0.88rem' }}>
                                        <Phone size={14} /> {customer.number}
                                    </a>
                                )}
                                {(customer.atPost || customer.taluka || customer.district) && (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                        <MapPin size={13} />
                                        {[customer.atPost, customer.taluka, customer.district].filter(Boolean).join(', ')}
                                    </span>
                                )}
                            </div>
                            <div style={{ marginTop: '0.4rem', fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                                Customer since {fmtDate(customer.createdAt)}
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                        {/* Print Profile */}
                        <button onClick={printProfile} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                            <Printer size={15} /> Print Profile
                        </button>
                        {/* New Bill dropdown */}
                        <div ref={billMenuRef} style={{ position: 'relative' }}>
                            <button
                                onClick={() => setShowBillMenu(v => !v)}
                                className="btn btn-primary"
                                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
                            >
                                <Plus size={15} /> New Bill <ChevronDown size={13} style={{ marginLeft: '0.1rem', transition: 'transform 0.15s', transform: showBillMenu ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                            </button>
                            {showBillMenu && (
                                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 200, background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.18)', padding: '0.4rem', minWidth: '200px' }}>
                                    <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', padding: '0.4rem 0.7rem 0.2rem' }}>Choose bill type</div>
                                    <Link
                                        to={`/pos?name=${encodeURIComponent(customer.name || '')}&phone=${encodeURIComponent(customer.number || '')}&address=${encodeURIComponent(customer.atPost || '')}&pin=${encodeURIComponent(customer.pin || '')}&taluka=${encodeURIComponent(customer.taluka || '')}&district=${encodeURIComponent(customer.district || '')}&retailerId=${id}`}
                                        onClick={() => setShowBillMenu(false)}
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem 0.75rem', borderRadius: '8px', color: 'var(--text-primary)', textDecoration: 'none', fontSize: '0.85rem', background: customer.channel === 'pos' ? 'hsla(152,60%,40%,0.08)' : 'transparent', transition: 'background 0.12s' }}
                                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-base)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = customer.channel === 'pos' ? 'hsla(152,60%,40%,0.08)' : 'transparent'; }}
                                    >
                                        <Calculator size={15} color="var(--primary-light)" />
                                        <div>
                                            <div style={{ fontWeight: 600 }}>POS Bill</div>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>Counter / walk-in sale</div>
                                        </div>
                                        {customer.channel === 'pos' && <span style={{ marginLeft: 'auto', fontSize: '0.65rem', fontWeight: 700, color: 'var(--primary-light)', background: 'hsla(152,60%,40%,0.12)', padding: '1px 6px', borderRadius: '4px' }}>Default</span>}
                                    </Link>
                                    <Link
                                        to={`/b2b-invoice?retailerId=${id}&name=${encodeURIComponent(customer.name || '')}&phone=${encodeURIComponent(customer.number || '')}`}
                                        onClick={() => setShowBillMenu(false)}
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem 0.75rem', borderRadius: '8px', color: 'var(--text-primary)', textDecoration: 'none', fontSize: '0.85rem', background: customer.channel !== 'pos' ? 'hsla(139,92%,46%,0.04)' : 'transparent', transition: 'background 0.12s' }}
                                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-base)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = customer.channel !== 'pos' ? 'hsla(139,92%,46%,0.04)' : 'transparent'; }}
                                    >
                                        <FileText size={15} color="#8b5cf6" />
                                        <div>
                                            <div style={{ fontWeight: 600 }}>B2B GST Invoice</div>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>GST-compliant invoice</div>
                                        </div>
                                        {customer.channel !== 'pos' && <span style={{ marginLeft: 'auto', fontSize: '0.65rem', fontWeight: 700, color: '#8b5cf6', background: 'rgba(139,92,246,0.1)', padding: '1px 6px', borderRadius: '4px' }}>Default</span>}
                                    </Link>
                                </div>
                            )}
                        </div>
                        {SHOW_RECORD_PAYMENT && outstanding > 0 && (
                            <button className="btn btn-primary" onClick={() => setShowPayModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                                <IndianRupee size={15} /> Record Payment
                            </button>
                        )}
                        <button onClick={startEdit} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                            <Edit2 size={14} /> Edit
                        </button>
                    </div>
                </div>

                {/* KPI strip */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--surface-border)' }}>
                    {[
                        { label: 'Total Purchases', value: String(stats.totalOrders), color: '#0ea5e9', Icon: ShoppingCart },
                        { label: 'Total Spent', value: fmtINR(stats.totalSpend), color: '#10b981', Icon: IndianRupee },
                        { label: 'Total Paid', value: fmtINR(stats.totalPaid), color: '#10b981', Icon: IndianRupee },
                        { label: 'Outstanding', value: outstanding > 0 ? fmtINR(outstanding) : '—', color: outstanding > 0 ? '#ef4444' : '#10b981', Icon: outstanding > 0 ? AlertCircle : CheckCircle2 },
                        { label: 'Last Purchase', value: fmtDate(customer.lastOrderedAt), color: '#8b5cf6', Icon: Clock },
                    ].map(k => (
                        <div key={k.label} style={{ textAlign: 'center', padding: '0.75rem', borderRadius: '10px', background: `${k.color}11`, border: `1px solid ${k.color}33` }}>
                            <k.Icon size={18} color={k.color} style={{ margin: '0 auto 0.3rem' }} />
                            <div style={{ fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)', marginBottom: '0.2rem' }}>{k.label}</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: k.color }}>{k.value}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Tab bar */}
            <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '2px solid var(--surface-border)', marginBottom: '1.5rem', overflowX: 'auto' }}>
                <button style={TAB_STYLES('overview')} onClick={() => setActiveTab('overview')}><User size={15} /> Overview</button>
                <button style={TAB_STYLES('purchases')} onClick={() => setActiveTab('purchases')}><ReceiptText size={15} /> Purchases ({orders.length})</button>
                <button style={TAB_STYLES('payments')} onClick={() => setActiveTab('payments')}><CreditCard size={15} /> Payments ({payments.length})</button>
                <button style={TAB_STYLES('notes')} onClick={() => setActiveTab('notes')}><StickyNote size={15} /> Notes ({notes.length})</button>
            </div>

            {/* ── Overview tab ── */}
            {activeTab === 'overview' && (
                <div className="glass-panel" style={{ padding: '1.5rem' }}>
                    <h3 style={{ margin: '0 0 1.25rem', fontSize: '1rem', fontWeight: 700 }}>Customer Information</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                        {[
                            { label: 'Name', field: 'name' as const },
                            { label: 'Phone Number', field: 'number' as const },
                            { label: 'Village / At Post', field: 'atPost' as const },
                            { label: 'Taluka', field: 'taluka' as const },
                            { label: 'District', field: 'district' as const },
                            { label: 'PIN Code', field: 'pin' as const },
                        ].map(({ label, field }) => (
                            <div key={field}>
                                <div style={{ fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)', marginBottom: '4px' }}>{label}</div>
                                {editing ? (
                                    <input
                                        className="input-field"
                                        style={{ margin: 0, fontSize: '0.9rem' }}
                                        value={(editForm[field] as string) ?? ''}
                                        onChange={e => setEditForm(f => ({ ...f, [field]: e.target.value }))}
                                        placeholder={label}
                                    />
                                ) : (
                                    <div style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-primary)' }}>{(customer as any)[field] || '—'}</div>
                                )}
                            </div>
                        ))}
                    </div>
                    {editing && (
                        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
                            <button onClick={() => setEditing(false)} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><X size={14} /> Cancel</button>
                            <button onClick={saveEdit} disabled={savingEdit} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <Save size={14} /> {savingEdit ? 'Saving…' : 'Save Changes'}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* ── Purchases tab ── */}
            {activeTab === 'purchases' && (
                <div className="glass-panel" style={{ overflow: 'hidden' }}>
                    {orders.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)' }}>No purchases recorded yet.</div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid var(--surface-border)', background: 'var(--surface-raised)' }}>
                                        {['Bill No', 'Date', 'Items', 'Mode', 'Status', 'Amount'].map((h, i) => (
                                            <th key={h} style={{ padding: '0.7rem 0.75rem', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: i === 5 ? 'right' : 'left' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {orders.map(o => (
                                        <tr key={o.id} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                                            <td style={{ padding: '0.75rem', fontWeight: 700, color: 'var(--primary-light)' }}>{o.orderNumber || '—'}</td>
                                            <td style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{o.invoiceDate || fmtDate(o.createdAt)}</td>
                                            <td style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{(o.lineItems || []).length} item{(o.lineItems || []).length !== 1 ? 's' : ''}</td>
                                            <td style={{ padding: '0.75rem', fontSize: '0.82rem' }}>{o.paymentMethod || '—'}</td>
                                            <td style={{ padding: '0.75rem' }}>
                                                <span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '0.72rem', fontWeight: 700, background: (o.paymentStatus === 'Paid' || o.paymentStatus === 'paid') ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)', color: (o.paymentStatus === 'Paid' || o.paymentStatus === 'paid') ? '#10b981' : '#f59e0b' }}>
                                                    {o.paymentStatus || 'Paid'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>₹{(o.grandTotal ?? 0).toLocaleString('en-IN')}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ── Payments tab ── */}
            {activeTab === 'payments' && (
                <div>
                    {SHOW_RECORD_PAYMENT && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                            <button onClick={() => setShowPayModal(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <Plus size={15} /> Record Payment
                            </button>
                        </div>
                    )}
                    <div className="glass-panel" style={{ overflow: 'hidden' }}>
                        {payments.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)' }}>No payments recorded yet.</div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '2px solid var(--surface-border)', background: 'var(--surface-raised)' }}>
                                            {['Date', 'Method', 'Notes', 'Amount'].map((h, i) => (
                                                <th key={h} style={{ padding: '0.7rem 0.75rem', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: i === 3 ? 'right' : 'left' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {payments.map(p => (
                                            <tr key={p.id} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                                                <td style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{p.paymentDate || fmtDate(p.createdAt)}</td>
                                                <td style={{ padding: '0.75rem' }}>{p.paymentMethod || 'Cash'}</td>
                                                <td style={{ padding: '0.75rem', color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>{p.notes || '—'}</td>
                                                <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700, color: '#10b981' }}>₹{p.amount.toLocaleString('en-IN')}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Notes tab ── */}
            {activeTab === 'notes' && (
                <div>
                    <div className="glass-panel" style={{ padding: '1rem', marginBottom: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                        <textarea
                            className="input-field"
                            style={{ margin: 0, flex: 1, fontSize: '0.88rem', resize: 'vertical', minHeight: '64px' }}
                            placeholder="Add a note about this customer…"
                            value={newNote}
                            onChange={e => setNewNote(e.target.value)}
                        />
                        <button onClick={addNote} disabled={savingNote || !newNote.trim()} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
                            <Plus size={14} /> Add
                        </button>
                    </div>
                    {notes.length === 0 ? (
                        <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)' }}>No notes yet.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {notes.map(n => (
                                <div key={n.id} className="glass-panel" style={{ padding: '0.85rem 1rem' }}>
                                    <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: 1.6 }}>{n.content}</div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '0.4rem' }}>{fmtDateTime(n.createdAt)}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── Payment Modal ── */}
            {showPayModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
                    onClick={e => { if (e.target === e.currentTarget) setShowPayModal(false); }}>
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '420px', padding: '1.5rem', borderRadius: '14px', border: '1px solid var(--surface-border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Record Payment</h3>
                            <button onClick={() => setShowPayModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
                        </div>
                        {outstanding > 0 && (
                            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '0.6rem 0.85rem', marginBottom: '1rem', fontSize: '0.85rem', color: '#ef4444', fontWeight: 600 }}>
                                Outstanding: ₹{outstanding.toLocaleString('en-IN')}
                            </div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Amount (₹)
                                <input type="number" min={1} className="input-field" style={{ margin: '4px 0 0', display: 'block', width: '100%' }} value={payAmount || ''} onChange={e => setPayAmount(Number(e.target.value))} placeholder="Enter amount" />
                            </label>
                            <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Date
                                <input type="date" className="input-field" style={{ margin: '4px 0 0', display: 'block', width: '100%' }} value={payDate} onChange={e => setPayDate(e.target.value)} />
                            </label>
                            <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Method
                                <select className="input-field" style={{ margin: '4px 0 0', display: 'block', width: '100%' }} value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                                    {['Cash', 'UPI', 'Card', 'Cheque', 'Bank Transfer'].map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </label>
                            <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Notes (optional)
                                <input className="input-field" style={{ margin: '4px 0 0', display: 'block', width: '100%' }} value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="Transaction ref, remarks…" />
                            </label>
                        </div>
                        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowPayModal(false)} className="btn btn-secondary">Cancel</button>
                            <button onClick={recordPayment} disabled={savingPayment || payAmount <= 0} className="btn btn-primary">
                                {savingPayment ? 'Saving…' : 'Record Payment'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
