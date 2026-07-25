import { useState, useEffect, useMemo } from 'react';
import {
    query, onSnapshot, orderBy, addDoc, updateDoc, deleteDoc, setDoc, serverTimestamp, Timestamp, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection, getTenantDoc } from '../utils/tenantPath';
import { useToast } from '../contexts/ToastContext';
import {
    BookOpen, Search, IndianRupee, Clock, CheckCircle2, AlertCircle, Phone, User, Calendar, ArrowUpRight,
    ArrowLeft, FileText, Printer, Pencil, Plus, Receipt, X, Trash2, Wallet, AlertTriangle, Ban,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

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
    updatedAt?: any;
    invoiceNumber?: string;
    orderNumber?: string;
    invoiceType?: string;
    address?: string;
    pin?: string;
    status?: string;
    items?: any[];
    // Set on entries created directly from this page (not via POS) — gates the
    // Edit/Delete actions so POS-origin bills (inventory postings, invoice
    // numbering) are never touched by them.
    source?: string;
    note?: string;
}

// Buyer identity + settled amount, tolerant of both field shapes.
const entryName = (e: KhataEntry) => e.customerName || e.retailerName || '';
const entryPhone = (e: KhataEntry) => e.customerPhone || e.phoneNumber || '';
const billNo = (e: KhataEntry) => e.invoiceNumber || e.orderNumber || e.id.slice(-6).toUpperCase();

// Digits-only phone, matching the normaliser used in POS and the B2B invoice.
const phoneKey = (v: unknown): string => String(v ?? '').replace(/\D/g, '');

// A customer is identified by phone where we have one; otherwise by name, so a
// named walk-in like "Surve Agro" keeps its own ledger instead of collapsing
// into a single anonymous bucket.
const customerKeyOf = (e: KhataEntry): string => {
    const ph = phoneKey(entryPhone(e));
    if (ph) return `p:${ph.slice(-10)}`;
    const nm = entryName(e).trim().toLowerCase();
    return nm ? `n:${nm}` : 'n:walk-in';
};

const fmtINR = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

type FilterTab = 'pending' | 'partial' | 'all';

const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem',
};
const errStyle: React.CSSProperties = {
    fontSize: '0.78rem', color: '#ef4444', marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.35rem',
};
const modalOverlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '1rem', background: 'hsla(220, 30%, 4%, 0.72)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
};

export default function DigitalKhataPage() {
    const { tenantId } = useAuth();
    const [entries, setEntries] = useState<KhataEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [tab, setTab] = useState<FilterTab>('all');
    // Which customer's ledger is open (master/detail within this page).
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const navigate = useNavigate();

    // Hand-offs to POS: start a new bill for this customer, re-print an existing
    // bill, or open one for correction. POS owns the bill format and the
    // cancel-&-re-issue flow; this page only links into it.
    const startNewBill = (c: { name: string; phone: string; address: string; pin: string }) =>
        navigate(`/pos?name=${encodeURIComponent(c.name)}&phone=${encodeURIComponent(c.phone)}&address=${encodeURIComponent(c.address)}&pin=${encodeURIComponent(c.pin)}`);
    const reprintBill = (id: string) => navigate(`/pos?reprintOrderId=${encodeURIComponent(id)}`);
    const editBill = (id: string) => navigate(`/pos?orderId=${encodeURIComponent(id)}`);

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

    // Compute per-entry outstanding. Cancelled bills (superseded by a corrected
    // re-issue from POS) must not count towards anyone's dues.
    const enriched = useMemo(() => entries.filter(e => String(e.status || '').toLowerCase() !== 'cancelled').map(e => {
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
        // Last-activity timestamp for customer-list sorting — falls back to the
        // bill date when nothing (edit/payment) has touched the record since.
        const updatedTs = e.updatedAt?.toDate ? e.updatedAt.toDate() : ts;
        return { ...e, total, paid, outstanding, status, ts, updatedTs, customerKey: customerKeyOf(e) };
    }), [entries]);

    type BillRow = typeof enriched[number];

    // ── Roll bills up to one row per customer (the worklist view) ──
    const customers = useMemo(() => {
        const map = new Map<string, {
            key: string; name: string; phone: string; address: string; pin: string;
            bills: BillRow[]; total: number; paid: number; outstanding: number; lastTs: Date;
        }>();
        for (const b of enriched) {
            let c = map.get(b.customerKey);
            if (!c) {
                c = { key: b.customerKey, name: '', phone: '', address: '', pin: '', bills: [], total: 0, paid: 0, outstanding: 0, lastTs: b.updatedTs };
                map.set(b.customerKey, c);
            }
            c.bills.push(b);
            c.total += b.total;
            c.paid += b.paid;
            c.outstanding += b.outstanding;
            if (b.updatedTs > c.lastTs) c.lastTs = b.updatedTs;
            // Take the first non-empty value seen for each detail — older bills may
            // predate the customer having an address/phone on file.
            if (!c.name) c.name = entryName(b);
            if (!c.phone) c.phone = entryPhone(b);
            if (!c.address) c.address = b.address || '';
            if (!c.pin) c.pin = b.pin || '';
        }
        return Array.from(map.values())
            .map(c => ({
                ...c,
                name: c.name || 'Walk-in Customer',
                status: c.outstanding <= 0 ? 'paid' : c.paid > 0 ? 'partial' : 'pending',
                bills: c.bills.sort((a, b) => b.ts.getTime() - a.ts.getTime()),
            }))
            .sort((a, b) => b.lastTs.getTime() - a.lastTs.getTime());
    }, [enriched]);

    type CustomerRow = typeof customers[number];

    // ── Manual udhari entry — Add / Edit / Payment / Delete ─────────────────
    // Manual entries are salesOrders docs tagged source:'khata'. Only they get
    // Edit/Delete on this page — POS-origin bills keep their existing
    // Print/Edit-via-POS actions untouched (they carry inventory postings and
    // invoice numbering that this page must not disturb).
    const { showToast } = useToast();
    const emptyEntryForm = () => ({
        name: '', phone: '', address: '', pin: '', billAmount: '', paidAmount: '',
        date: new Date().toISOString().slice(0, 10), note: '',
    });
    type EntryForm = ReturnType<typeof emptyEntryForm>;

    const [addOpen, setAddOpen] = useState(false);
    const [addLocked, setAddLocked] = useState(false); // adding a bill for an existing customer — name/phone locked
    const [addForm, setAddForm] = useState<EntryForm>(emptyEntryForm());
    const [addSaving, setAddSaving] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);

    const [editingBill, setEditingBill] = useState<BillRow | null>(null);
    const [editForm, setEditForm] = useState<EntryForm>(emptyEntryForm());
    const [editSaving, setEditSaving] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);

    const [paymentFor, setPaymentFor] = useState<CustomerRow | null>(null);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentSaving, setPaymentSaving] = useState(false);
    const [paymentError, setPaymentError] = useState<string | null>(null);

    const [deleteTarget, setDeleteTarget] = useState<BillRow | null>(null);
    const [deleting, setDeleting] = useState(false);

    // POS-origin bills carry inventory postings and invoice numbering — they are
    // never hard-deleted from here. Cancelling flips status so it's excluded from
    // dues (the same status POS's own correction flow already relies on) while
    // keeping the record for audit.
    const [cancelTarget, setCancelTarget] = useState<BillRow | null>(null);
    const [cancelling, setCancelling] = useState(false);

    const openAddForNew = () => {
        setAddLocked(false);
        setAddForm(emptyEntryForm());
        setAddError(null);
        setAddOpen(true);
    };
    const openAddForCustomer = (c: CustomerRow) => {
        setAddLocked(true);
        setAddForm({ ...emptyEntryForm(), name: c.name, phone: c.phone, address: c.address, pin: c.pin });
        setAddError(null);
        setAddOpen(true);
    };

    const submitAdd = async () => {
        if (!tenantId) return;
        const name = addForm.name.trim();
        const billAmount = Number(addForm.billAmount) || 0;
        if (!name) { setAddError('Customer name is required.'); return; }
        if (billAmount <= 0) { setAddError('Bill amount must be greater than 0.'); return; }
        const paidAmount = Math.min(Number(addForm.paidAmount) || 0, billAmount);
        const phone = phoneKey(addForm.phone);
        setAddSaving(true);
        setAddError(null);
        try {
            const dateObj = addForm.date ? new Date(addForm.date) : new Date();
            await addDoc(getTenantCollection(db, tenantId, 'salesOrders'), {
                retailerName: name,
                phoneNumber: phone,
                address: addForm.address.trim(),
                pin: addForm.pin.trim(),
                grandTotal: billAmount,
                amountPaid: paidAmount,
                note: addForm.note.trim() || null,
                source: 'khata',
                createdAt: Timestamp.fromDate(dateObj),
                updatedAt: serverTimestamp(),
            });
            // Store the customer to the phone-keyed customer master (shared with Loyalty).
            if (phone) {
                await setDoc(getTenantDoc(db, tenantId, 'loyalty', phone), {
                    name, phone, updatedAt: serverTimestamp(),
                }, { merge: true });
            }
            showToast('Udhari entry added.', 'success');
            setAddOpen(false);
        } catch (e) {
            console.error('Add udhari failed:', e);
            setAddError('Could not save. Please try again.');
        } finally {
            setAddSaving(false);
        }
    };

    const openEdit = (b: BillRow) => {
        setEditingBill(b);
        setEditForm({
            name: entryName(b), phone: entryPhone(b), address: b.address || '', pin: b.pin || '',
            billAmount: String(b.total || ''), paidAmount: String(b.paid || ''),
            date: b.ts.toISOString().slice(0, 10), note: b.note || '',
        });
        setEditError(null);
    };

    const submitEdit = async () => {
        if (!tenantId || !editingBill) return;
        const name = editForm.name.trim();
        const billAmount = Number(editForm.billAmount) || 0;
        if (!name) { setEditError('Customer name is required.'); return; }
        if (billAmount <= 0) { setEditError('Bill amount must be greater than 0.'); return; }
        const paidAmount = Math.min(Number(editForm.paidAmount) || 0, billAmount);
        const phone = phoneKey(editForm.phone);
        setEditSaving(true);
        setEditError(null);
        try {
            const dateObj = editForm.date ? new Date(editForm.date) : new Date();
            await updateDoc(getTenantDoc(db, tenantId, 'salesOrders', editingBill.id), {
                retailerName: name,
                phoneNumber: phone,
                address: editForm.address.trim(),
                pin: editForm.pin.trim(),
                grandTotal: billAmount,
                amountPaid: paidAmount,
                note: editForm.note.trim() || null,
                createdAt: Timestamp.fromDate(dateObj),
                updatedAt: serverTimestamp(),
            });
            if (phone) {
                await setDoc(getTenantDoc(db, tenantId, 'loyalty', phone), {
                    name, phone, updatedAt: serverTimestamp(),
                }, { merge: true });
            }
            showToast('Udhari entry updated.', 'success');
            setEditingBill(null);
        } catch (e) {
            console.error('Edit udhari failed:', e);
            setEditError('Could not save. Please try again.');
        } finally {
            setEditSaving(false);
        }
    };

    // Payment is allocated FIFO across the customer's outstanding bills (oldest
    // first) so a partial payment settles the longest-standing dues first.
    const submitPayment = async () => {
        if (!tenantId || !paymentFor) return;
        let remaining = Math.min(Number(paymentAmount) || 0, paymentFor.outstanding);
        if (remaining <= 0) { setPaymentError('Enter a valid amount.'); return; }
        setPaymentSaving(true);
        setPaymentError(null);
        try {
            const batch = writeBatch(db);
            const ordered = [...paymentFor.bills].sort((a, b) => a.ts.getTime() - b.ts.getTime());
            for (const b of ordered) {
                if (remaining <= 0) break;
                if (b.outstanding <= 0) continue;
                const apply = Math.min(remaining, b.outstanding);
                batch.update(getTenantDoc(db, tenantId, 'salesOrders', b.id), { amountPaid: b.paid + apply, updatedAt: serverTimestamp() });
                remaining -= apply;
            }
            await batch.commit();
            showToast('Payment recorded.', 'success');
            setPaymentFor(null);
            setPaymentAmount('');
        } catch (e) {
            console.error('Record payment failed:', e);
            setPaymentError('Could not save payment. Please try again.');
        } finally {
            setPaymentSaving(false);
        }
    };

    const doDelete = async () => {
        if (!tenantId || !deleteTarget) return;
        setDeleting(true);
        try {
            await deleteDoc(getTenantDoc(db, tenantId, 'salesOrders', deleteTarget.id));
            showToast('Udhari entry deleted.', 'success');
            setDeleteTarget(null);
        } catch (e) {
            console.error('Delete udhari failed:', e);
            showToast('Could not delete. Please try again.', 'error');
        } finally {
            setDeleting(false);
        }
    };

    const doCancel = async () => {
        if (!tenantId || !cancelTarget) return;
        setCancelling(true);
        try {
            await updateDoc(getTenantDoc(db, tenantId, 'salesOrders', cancelTarget.id), {
                status: 'cancelled', updatedAt: serverTimestamp(),
            });
            showToast('Bill cancelled.', 'success');
            setCancelTarget(null);
        } catch (e) {
            console.error('Cancel bill failed:', e);
            showToast('Could not cancel. Please try again.', 'error');
        } finally {
            setCancelling(false);
        }
    };

    // KPIs — now counted per customer, not per bill.
    const kpi = useMemo(() => {
        const totalOutstanding = customers.reduce((s, c) => s + c.outstanding, 0);
        const totalPending = customers.filter(c => c.status === 'pending').length;
        const totalPartial = customers.filter(c => c.status === 'partial').length;
        const totalCollected = customers.filter(c => c.status === 'paid').length;
        const grossKhata = customers.reduce((s, c) => s + c.total, 0);
        return { totalOutstanding, totalPending, totalPartial, totalCollected, grossKhata };
    }, [customers]);

    // Filtered customer list
    const filtered = useMemo(() => {
        let list = customers;
        if (tab === 'pending') list = list.filter(c => c.status === 'pending');
        if (tab === 'partial') list = list.filter(c => c.status === 'partial');
        if (search) {
            const q = search.toLowerCase();
            list = list.filter(c =>
                c.name.toLowerCase().includes(q) ||
                c.phone.includes(search) ||
                c.bills.some(b => billNo(b).toLowerCase().includes(q))
            );
        }
        return list;
    }, [customers, tab, search]);

    // Selected customer for the details view (re-derived so it stays live).
    const selected: CustomerRow | null = selectedKey
        ? customers.find(c => c.key === selectedKey) ?? null
        : null;

    // ── Customer statement — running-balance ledger printed in a new window.
    // Same approach as the supplier statement (SupplierLedgerDetailPage.printStatement).
    const printStatement = (c: CustomerRow) => {
        let bal = 0;
        const rows = [...c.bills].sort((a, b) => a.ts.getTime() - b.ts.getTime()).map(b => {
            bal += b.total - b.paid;
            return `<tr>
                <td>${b.ts.toLocaleDateString('en-IN')}</td>
                <td>${billNo(b)}</td>
                <td class="num">${b.total.toFixed(2)}</td>
                <td class="num">${b.paid.toFixed(2)}</td>
                <td class="num">${bal.toFixed(2)}</td>
            </tr>`;
        }).join('');
        const win = window.open('', '_blank');
        if (!win) return;
        win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Khata Statement - ${c.name}</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: 'Times New Roman', Georgia, serif; color: #000; }
  h1 { font-size: 16pt; margin: 0 0 2px; }
  .meta { font-size: 10pt; color: #333; margin-bottom: 12px; }
  table { border-collapse: collapse; width: 100%; font-size: 10pt; }
  th, td { border: 1px solid #000; padding: 4px 6px; }
  th { background: #f0f0f0; text-align: left; }
  td.num, th.num { text-align: right; }
  tfoot td { font-weight: 700; }
</style></head><body>
<h1>Khata Statement</h1>
<div class="meta">
  <strong>${c.name}</strong>${c.phone ? ` &middot; ${c.phone}` : ''}${c.address ? `<br>${c.address}` : ''}
  <br>Generated ${new Date().toLocaleDateString('en-IN')} &middot; ${c.bills.length} bill(s)
</div>
<table>
  <thead><tr><th>Date</th><th>Bill No</th><th class="num">Bill Amt</th><th class="num">Paid</th><th class="num">Balance</th></tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr><td colspan="2">Total</td><td class="num">${c.total.toFixed(2)}</td><td class="num">${c.paid.toFixed(2)}</td><td class="num">${c.outstanding.toFixed(2)}</td></tr></tfoot>
</table>
</body></html>`);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 400);
    };

    // ── Add / Edit / Payment / Delete modals — shared across both the list and
    // customer-detail views below. ───────────────────────────────────────────
    const entryFormFields = (form: EntryForm, setForm: React.Dispatch<React.SetStateAction<EntryForm>>, locked: boolean) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div>
                <label style={labelStyle}>Customer Name *</label>
                <input className="input-field" style={{ width: '100%', margin: 0 }} value={form.name} disabled={locked}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Ramesh Patil" />
            </div>
            <div>
                <label style={labelStyle}>Phone</label>
                <input className="input-field" style={{ width: '100%', margin: 0 }} value={form.phone} disabled={locked}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="10-digit mobile" />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
                <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Address</label>
                    <input className="input-field" style={{ width: '100%', margin: 0 }} value={form.address} disabled={locked}
                        onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
                </div>
                <div style={{ width: '110px' }}>
                    <label style={labelStyle}>PIN</label>
                    <input className="input-field" style={{ width: '100%', margin: 0 }} value={form.pin} disabled={locked}
                        onChange={e => setForm(f => ({ ...f, pin: e.target.value }))} />
                </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
                <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Bill Amount (₹) *</label>
                    <input type="number" className="input-field" style={{ width: '100%', margin: 0 }} value={form.billAmount}
                        onChange={e => setForm(f => ({ ...f, billAmount: e.target.value }))} placeholder="0" />
                </div>
                <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Paid Now (₹)</label>
                    <input type="number" className="input-field" style={{ width: '100%', margin: 0 }} value={form.paidAmount}
                        onChange={e => setForm(f => ({ ...f, paidAmount: e.target.value }))} placeholder="0" />
                </div>
            </div>
            <div>
                <label style={labelStyle}>Date</label>
                <input type="date" className="input-field" style={{ width: '100%', margin: 0 }} value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
                <label style={labelStyle}>Note (optional)</label>
                <input className="input-field" style={{ width: '100%', margin: 0 }} value={form.note}
                    onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="e.g. seeds & fertilizer on credit" />
            </div>
        </div>
    );

    const modals = (
        <>
            {addOpen && (
                <div onMouseDown={e => { if (e.target === e.currentTarget && !addSaving) setAddOpen(false); }} style={modalOverlayStyle} role="dialog" aria-modal="true" aria-label="Add Udhari">
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto', padding: '1.75rem', borderRadius: '16px', position: 'relative' }}>
                        <button onClick={() => !addSaving && setAddOpen(false)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }} aria-label="Close">
                            <X size={20} />
                        </button>
                        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Plus size={18} className="primary-gradient-text" /> Add Udhari
                        </h2>
                        {entryFormFields(addForm, setAddForm, addLocked)}
                        {addError && <div style={errStyle}><AlertCircle size={13} /> {addError}</div>}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1.1rem' }}>
                            <button onClick={() => setAddOpen(false)} className="btn btn-secondary" disabled={addSaving} style={{ padding: '0.55rem 1.1rem', fontSize: '0.85rem' }}>Cancel</button>
                            <button onClick={submitAdd} className="btn btn-primary" disabled={addSaving} style={{ padding: '0.55rem 1.1rem', fontSize: '0.85rem' }}>
                                {addSaving ? 'Saving...' : 'Save Udhari'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {editingBill && (
                <div onMouseDown={e => { if (e.target === e.currentTarget && !editSaving) setEditingBill(null); }} style={modalOverlayStyle} role="dialog" aria-modal="true" aria-label="Edit Udhari">
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto', padding: '1.75rem', borderRadius: '16px', position: 'relative' }}>
                        <button onClick={() => !editSaving && setEditingBill(null)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }} aria-label="Close">
                            <X size={20} />
                        </button>
                        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Pencil size={18} className="primary-gradient-text" /> Edit Udhari
                        </h2>
                        {entryFormFields(editForm, setEditForm, false)}
                        {editError && <div style={errStyle}><AlertCircle size={13} /> {editError}</div>}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1.1rem' }}>
                            <button onClick={() => setEditingBill(null)} className="btn btn-secondary" disabled={editSaving} style={{ padding: '0.55rem 1.1rem', fontSize: '0.85rem' }}>Cancel</button>
                            <button onClick={submitEdit} className="btn btn-primary" disabled={editSaving} style={{ padding: '0.55rem 1.1rem', fontSize: '0.85rem' }}>
                                {editSaving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {paymentFor && (
                <div onMouseDown={e => { if (e.target === e.currentTarget && !paymentSaving) setPaymentFor(null); }} style={modalOverlayStyle} role="dialog" aria-modal="true" aria-label="Record Payment">
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '380px', padding: '1.75rem', borderRadius: '16px', position: 'relative' }}>
                        <button onClick={() => !paymentSaving && setPaymentFor(null)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }} aria-label="Close">
                            <X size={20} />
                        </button>
                        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Wallet size={18} className="primary-gradient-text" /> Record Payment
                        </h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                            {paymentFor.name} &middot; Outstanding {fmtINR(paymentFor.outstanding)}
                        </p>
                        <label style={labelStyle}>Amount Received (₹)</label>
                        <input type="number" className="input-field" style={{ width: '100%', margin: 0 }} value={paymentAmount}
                            onChange={e => setPaymentAmount(e.target.value)} placeholder="0" autoFocus />
                        {paymentError && <div style={errStyle}><AlertCircle size={13} /> {paymentError}</div>}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1.1rem' }}>
                            <button onClick={() => setPaymentFor(null)} className="btn btn-secondary" disabled={paymentSaving} style={{ padding: '0.55rem 1.1rem', fontSize: '0.85rem' }}>Cancel</button>
                            <button onClick={submitPayment} className="btn btn-primary" disabled={paymentSaving} style={{ padding: '0.55rem 1.1rem', fontSize: '0.85rem' }}>
                                {paymentSaving ? 'Saving...' : 'Record Payment'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {deleteTarget && (
                <div onMouseDown={e => { if (e.target === e.currentTarget && !deleting) setDeleteTarget(null); }} style={modalOverlayStyle} role="dialog" aria-modal="true" aria-label="Delete Udhari">
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '380px', padding: '1.75rem', borderRadius: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
                            <AlertTriangle size={20} color="#ef4444" />
                            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>Delete this entry?</h2>
                        </div>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                            {entryName(deleteTarget)} &middot; {fmtINR(deleteTarget.total)} on {deleteTarget.ts.toLocaleDateString('en-IN')}. This cannot be undone.
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
                            <button onClick={() => setDeleteTarget(null)} className="btn btn-secondary" disabled={deleting} style={{ padding: '0.55rem 1.1rem', fontSize: '0.85rem' }}>Cancel</button>
                            <button onClick={doDelete} disabled={deleting}
                                style={{ padding: '0.55rem 1.1rem', fontSize: '0.85rem', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 600 }}>
                                {deleting ? 'Deleting...' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {cancelTarget && (
                <div onMouseDown={e => { if (e.target === e.currentTarget && !cancelling) setCancelTarget(null); }} style={modalOverlayStyle} role="dialog" aria-modal="true" aria-label="Cancel Bill">
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '380px', padding: '1.75rem', borderRadius: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
                            <AlertTriangle size={20} color="#ef4444" />
                            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>Cancel this bill?</h2>
                        </div>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                            {billNo(cancelTarget)} &middot; {fmtINR(cancelTarget.total)} on {cancelTarget.ts.toLocaleDateString('en-IN')}. It will be excluded from dues but kept on record for audit — this does not delete the invoice.
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
                            <button onClick={() => setCancelTarget(null)} className="btn btn-secondary" disabled={cancelling} style={{ padding: '0.55rem 1.1rem', fontSize: '0.85rem' }}>Keep It</button>
                            <button onClick={doCancel} disabled={cancelling}
                                style={{ padding: '0.55rem 1.1rem', fontSize: '0.85rem', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 600 }}>
                                {cancelling ? 'Cancelling...' : 'Cancel Bill'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );

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

    // ── Customer details: their full invoice ledger + actions ──
    if (selected) {
        const cellStyle: React.CSSProperties = { padding: '0.85rem 1rem', whiteSpace: 'nowrap' };
        return (
            <div className="animate-fade-in" style={{ maxWidth: '1100px', margin: '0 auto' }}>
                <button onClick={() => setSelectedKey(null)} className="btn btn-secondary"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', fontSize: '0.875rem', padding: '0.5rem 1rem' }}>
                    <ArrowLeft size={16} /> Back to Khata
                </button>

                {/* Customer header */}
                <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', gap: '1.5rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--primary)22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <User size={22} color="var(--primary-light)" />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800 }}>{selected.name}</h2>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                {selected.phone && <a href={`tel:${selected.phone}`} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--primary-light)', textDecoration: 'none' }}><Phone size={13} /> {selected.phone}</a>}
                                {selected.address && <span>{selected.address}{selected.pin ? ` - ${selected.pin}` : ''}</span>}
                                <span>{selected.bills.length} bill(s)</span>
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                        <button onClick={() => printStatement(selected)} className="btn btn-secondary"
                            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', padding: '0.5rem 1rem' }}>
                            <FileText size={15} /> Statement
                        </button>
                        <button onClick={() => startNewBill(selected)} className="btn btn-primary"
                            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', padding: '0.5rem 1rem' }}>
                            <Plus size={15} /> New Bill
                        </button>
                        <button onClick={() => openAddForCustomer(selected)} className="btn btn-secondary"
                            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', padding: '0.5rem 1rem' }}>
                            <Plus size={15} /> Add Udhari
                        </button>
                        <button onClick={() => { setPaymentFor(selected); setPaymentAmount(''); setPaymentError(null); }}
                            className="btn btn-secondary" disabled={selected.outstanding <= 0}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', padding: '0.5rem 1rem', opacity: selected.outstanding <= 0 ? 0.5 : 1, cursor: selected.outstanding <= 0 ? 'not-allowed' : 'pointer' }}>
                            <Wallet size={15} /> Record Payment
                        </button>
                    </div>
                </div>

                {/* Totals */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                    {[
                        { label: 'Total Billed', value: fmtINR(selected.total), color: 'var(--text-primary)' },
                        { label: 'Paid', value: fmtINR(selected.paid), color: '#10b981' },
                        { label: 'Outstanding', value: fmtINR(selected.outstanding), color: selected.outstanding > 0 ? '#ef4444' : '#10b981' },
                    ].map(s => (
                        <div key={s.label} className="glass-panel" style={{ padding: '1.1rem 1.25rem' }}>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>{s.label}</p>
                            <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: s.color }}>{s.value}</h2>
                        </div>
                    ))}
                </div>

                {/* Invoices */}
                <div className="glass-panel" style={{ overflow: 'hidden' }}>
                    <div style={{ padding: '0.9rem 1.25rem', borderBottom: '1px solid var(--surface-border)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Receipt size={16} color="var(--primary-light)" />
                        <span style={{ fontWeight: 700 }}>Invoices</span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>({selected.bills.length})</span>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--surface-border)', background: 'var(--surface-raised)' }}>
                                    {['Bill No', 'Date', 'Bill Amt', 'Paid', 'Outstanding', 'Status', 'Actions'].map(h => (
                                        <th key={h} style={{ ...cellStyle, fontWeight: 600, color: 'var(--text-secondary)', textAlign: h === 'Actions' ? 'right' : 'left' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {selected.bills.map(b => (
                                    <tr key={b.id} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                                        <td style={{ ...cellStyle, fontWeight: 600 }}>{billNo(b)}</td>
                                        <td style={{ ...cellStyle, color: 'var(--text-secondary)' }}>{b.ts.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                                        <td style={{ ...cellStyle, fontWeight: 700 }}>{fmtINR(b.total)}</td>
                                        <td style={{ ...cellStyle, color: '#10b981', fontWeight: 600 }}>{fmtINR(b.paid)}</td>
                                        <td style={{ ...cellStyle, fontWeight: 800, color: b.outstanding > 0 ? '#ef4444' : '#10b981' }}>{fmtINR(b.outstanding)}</td>
                                        <td style={cellStyle}>{statusBadge(b.status)}</td>
                                        <td style={{ ...cellStyle, textAlign: 'right' }}>
                                            <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                                                {b.source === 'khata' ? (
                                                    <>
                                                        <button onClick={() => openEdit(b)} title="Edit this udhari entry"
                                                            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.3rem 0.6rem', background: 'hsla(220,70%,55%,0.12)', color: '#3b82f6', border: '1px solid hsla(220,70%,55%,0.25)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, font: 'inherit' }}>
                                                            <Pencil size={12} /> Edit
                                                        </button>
                                                        <button onClick={() => setDeleteTarget(b)} title="Delete this udhari entry"
                                                            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.3rem 0.6rem', background: 'hsla(0,84%,60%,0.12)', color: '#ef4444', border: '1px solid hsla(0,84%,60%,0.25)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, font: 'inherit' }}>
                                                            <Trash2 size={12} /> Delete
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button onClick={() => reprintBill(b.id)} title="Print this bill again"
                                                            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.3rem 0.6rem', background: 'hsla(152,60%,40%,0.12)', color: 'var(--primary-light)', border: '1px solid hsla(152,60%,40%,0.25)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, font: 'inherit' }}>
                                                            <Printer size={12} /> Print
                                                        </button>
                                                        <button onClick={() => editBill(b.id)} title="Correct this bill — issues a replacement and cancels this one"
                                                            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.3rem 0.6rem', background: 'hsla(220,70%,55%,0.12)', color: '#3b82f6', border: '1px solid hsla(220,70%,55%,0.25)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, font: 'inherit' }}>
                                                            <Pencil size={12} /> Edit
                                                        </button>
                                                        <button onClick={() => setCancelTarget(b)} title="Cancel this bill — excludes it from dues, keeps it for audit"
                                                            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.3rem 0.6rem', background: 'hsla(0,84%,60%,0.12)', color: '#ef4444', border: '1px solid hsla(0,84%,60%,0.25)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, font: 'inherit' }}>
                                                            <Ban size={12} /> Cancel
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
                {modals}
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
                        Farmer / walk-in udhaari by customer — open a row for their full bill history. B2B partner dues are in{' '}
                        <Link to="/worklist" style={{ color: 'var(--primary-light)', textDecoration: 'none', fontWeight: 600 }}>Partner Worklist →</Link>
                    </p>
                </div>
                <button onClick={openAddForNew} className="btn btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', padding: '0.6rem 1.1rem', whiteSpace: 'nowrap' }}>
                    <Plus size={16} /> Add Udhari
                </button>
            </div>

            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                {[
                    { label: 'Total Outstanding', value: fmtINR(kpi.totalOutstanding), icon: AlertCircle, border: '#ef4444', bg: 'rgba(239,68,68,0.07)' },
                    { label: 'Pending Customers', value: String(kpi.totalPending), icon: Clock, border: '#f59e0b', bg: 'rgba(245,158,11,0.07)' },
                    { label: 'Partial Customers', value: String(kpi.totalPartial), icon: IndianRupee, border: '#8b5cf6', bg: 'rgba(139,92,246,0.07)' },
                    { label: 'Cleared Customers', value: String(kpi.totalCollected), icon: CheckCircle2, border: '#10b981', bg: 'rgba(16,185,129,0.07)' },
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
                        placeholder="Search by customer name, phone or bill no."
                        className="input-field"
                        style={{ paddingLeft: '2.2rem', margin: 0, height: '38px' }}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <span style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem', marginLeft: 'auto' }}>{filtered.length} customers</span>
            </div>

            {/* Customer list */}
            {filtered.length === 0 ? (
                <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-secondary)' }}>
                    <BookOpen size={48} color="var(--surface-border)" style={{ margin: '0 auto 1rem', display: 'block' }} />
                    <h3>No customers found</h3>
                    <p>No {tab === 'all' ? '' : tab + ' '}khata customers for this filter.</p>
                </div>
            ) : (
                <div className="glass-panel" style={{ overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--surface-border)', background: 'var(--surface-raised)' }}>
                                    {['Customer', 'Phone', 'Bills', 'Last Bill', 'Billed', 'Paid', 'Outstanding', 'Status', ''].map(h => (
                                        <th key={h} style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--text-secondary)', textAlign: h === '' ? 'center' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(c => (
                                    <tr key={c.key}
                                        onClick={() => setSelectedKey(c.key)}
                                        style={{ borderBottom: '1px solid var(--surface-border)', cursor: 'pointer', transition: 'background 0.15s' }}
                                        onMouseOver={ev => (ev.currentTarget.style.background = 'var(--surface-raised)')}
                                        onMouseOut={ev => (ev.currentTarget.style.background = 'transparent')}>
                                        <td style={{ padding: '0.9rem 1rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--primary)22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                    <User size={14} color="var(--primary-light)" />
                                                </div>
                                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.9rem 1rem', color: 'var(--text-secondary)' }}>
                                            {c.phone ? (
                                                <a href={`tel:${c.phone}`} onClick={ev => ev.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--primary-light)', textDecoration: 'none' }}>
                                                    <Phone size={13} /> {c.phone}
                                                </a>
                                            ) : '—'}
                                        </td>
                                        <td style={{ padding: '0.9rem 1rem', color: 'var(--text-secondary)' }}>{c.bills.length}</td>
                                        <td style={{ padding: '0.9rem 1rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                <Calendar size={12} />
                                                {c.lastTs.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.9rem 1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{fmtINR(c.total)}</td>
                                        <td style={{ padding: '0.9rem 1rem', color: '#10b981', fontWeight: 600 }}>{fmtINR(c.paid)}</td>
                                        <td style={{ padding: '0.9rem 1rem', fontWeight: 800, color: c.outstanding > 0 ? '#ef4444' : '#10b981' }}>{fmtINR(c.outstanding)}</td>
                                        <td style={{ padding: '0.9rem 1rem' }}>{statusBadge(c.status)}</td>
                                        <td style={{ padding: '0.9rem 1rem', textAlign: 'center' }}>
                                            <ArrowUpRight size={18} color="var(--primary-light)" />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Outstanding summary bar */}
                    {filtered.length > 0 && (
                        <div style={{ padding: '0.85rem 1.25rem', borderTop: '1px solid var(--surface-border)', background: 'var(--surface-raised)', display: 'flex', justifyContent: 'flex-end', gap: '2rem', fontSize: '0.875rem' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Total Outstanding in view:</span>
                            <span style={{ fontWeight: 800, color: '#ef4444', fontSize: '1rem' }}>
                                {fmtINR(filtered.reduce((s, c) => s + c.outstanding, 0))}
                            </span>
                        </div>
                    )}
                </div>
            )}
            {modals}
        </div>
    );
}
