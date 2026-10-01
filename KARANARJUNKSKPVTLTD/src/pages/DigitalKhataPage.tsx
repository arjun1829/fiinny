import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    query, onSnapshot, orderBy, addDoc, updateDoc, setDoc, serverTimestamp, Timestamp, writeBatch,
    where, limit, getDocs,
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { softDelete } from '../utils/softDelete';
import { getTenantCollection, getTenantDoc } from '../utils/tenantPath';
import { useToast } from '../contexts/ToastContext';
import { resolveDateRange } from '../utils/dateRanges';
import {
    BookOpen, Search, IndianRupee, AlertCircle, Phone, User, Calendar, ArrowUpRight,
    ArrowLeft, FileText, Printer, Pencil, Plus, Receipt, X, Trash2, Wallet, AlertTriangle, Ban,
    Download, ChevronUp, ChevronDown,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

const PAYMENT_METHODS = ['Cash', 'UPI', 'NEFT', 'RTGS', 'Bank Transfer', 'Cheque', 'Other'] as const;

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
    // Cumulative ₹ returned against this bill via B2C Sales Returns (additive
    // linkage written by ReturnsPage; nets the bill's outstanding down).
    returnTotal?: number;
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

// A customer is identified primarily by normalized name — matches the POS
// identity-resolution priority (name is the primary key, phone optional), so
// a person billed once without a phone and again with one still rolls up to
// a single Khata row instead of splitting into "sai · 98…" and "sai · —".
// Only a genuinely anonymous entry (no name at all) falls back to phone, and
// a phone-only entry with neither falls back to a shared walk-in bucket —
// both exactly as before.
const customerKeyOf = (e: KhataEntry): string => {
    const nm = entryName(e).trim().toLowerCase();
    if (nm) return `n:${nm}`;
    const ph = phoneKey(entryPhone(e));
    if (ph) return `p:${ph.slice(-10)}`;
    return 'n:walk-in';
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

function SuggestionItem({
    c, style, onSelect,
}: {
    c: { name: string; phone: string; outstanding: number };
    style: (hover: boolean) => React.CSSProperties;
    onSelect: () => void;
}) {
    const [hover, setHover] = useState(false);
    return (
        <div
            style={style(hover)}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            onMouseDown={e => { e.preventDefault(); onSelect(); }}
        >
            <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#f1f5f9' }}>{c.name}</span>
            {c.phone && <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{c.phone} · Outstanding: ₹{Math.round(c.outstanding).toLocaleString('en-IN')}</span>}
        </div>
    );
}

// `fullWidth` is set when this page is embedded as a POS sub-tab, where it
// should span the full-width POS layout instead of the standalone /digital-khata
// route's centered 1100px column. Defaults false so the standalone route is
// unchanged.
export default function DigitalKhataPage({ fullWidth = false }: { fullWidth?: boolean } = {}) {
    const { tenantId, currentUser, userName, userRole } = useAuth();
    const [entries, setEntries] = useState<KhataEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [tab, setTab] = useState<FilterTab>('all');
    // Date filter — scoped to the customer-list toolbar only (does not touch
    // exportPendingCustomers, which intentionally always exports every
    // pending/partial customer regardless of the toolbar filters).
    type DateFilterKey = 'all' | 'today' | 'yesterday' | 'last7' | 'last30' | 'custom';
    const [dateFilter, setDateFilter] = useState<DateFilterKey>('all');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');
    type SortCol = 'name' | 'outstanding' | 'total' | 'paid' | 'lastTs';
    // Default to most-recent-first: the rows people need are the ones just
    // billed, not the largest balances. Both columns stay sortable.
    const [sortCol, setSortCol] = useState<SortCol>('lastTs');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
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
                .filter(e => e.invoiceType !== 'B2B_GST' && !(e as any).deleted); // keep POS + undefined (walk-in), exclude soft-deleted
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
        // Net the bill down by any B2C sales returns booked against it (additive
        // returnTotal linkage on the original salesOrder; 0/absent for bills with
        // no return, so this leaves them unchanged and never mutates grandTotal).
        const totalBase = Number(e.grandTotal || e.netAmount || e.totalAmount || e.amount || 0);
        const total = Math.max(0, totalBase - Number(e.returnTotal || 0));
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
    // linkedBillId: '' = unallocated, falls back to the original FIFO-across-all-
    // bills behavior (oldest outstanding first) for backward compatibility. A
    // specific bill id restricts the payment to that one invoice only.
    const emptyPaymentForm = () => ({ amount: '', method: 'Cash', date: new Date().toISOString().slice(0, 10), ref: '', notes: '', linkedBillId: '' });
    const [paymentForm, setPaymentForm] = useState(emptyPaymentForm());
    const [paymentSaving, setPaymentSaving] = useState(false);
    const [paymentError, setPaymentError] = useState<string | null>(null);

    // Autocomplete state for Add modal
    const [nameSuggestions, setNameSuggestions] = useState<typeof customers>([]);
    const [phoneSuggestions, setPhoneSuggestions] = useState<typeof customers>([]);
    const addNameRef = useRef<HTMLDivElement>(null);
    const addPhoneRef = useRef<HTMLDivElement>(null);

    const [deleteTarget, setDeleteTarget] = useState<BillRow | null>(null);
    const [deleting, setDeleting] = useState(false);

    // POS-origin bills carry inventory postings and invoice numbering — they are
    // never hard-deleted from here. Cancelling flips status so it's excluded from
    // dues (the same status POS's own correction flow already relies on) while
    // keeping the record for audit.
    const [cancelTarget, setCancelTarget] = useState<BillRow | null>(null);
    const [cancelling, setCancelling] = useState(false);

    const isAddFormDirty = (f: EntryForm) =>
        !!(f.name || f.phone || f.billAmount || f.paidAmount || f.note);

    const openAddForNew = () => {
        setAddLocked(false);
        setAddForm(emptyEntryForm());
        setAddError(null);
        setNameSuggestions([]);
        setPhoneSuggestions([]);
        setAddOpen(true);
    };
    const openAddForCustomer = (c: CustomerRow) => {
        setAddLocked(true);
        setAddForm({ ...emptyEntryForm(), name: c.name, phone: c.phone, address: c.address, pin: c.pin });
        setAddError(null);
        setNameSuggestions([]);
        setPhoneSuggestions([]);
        setAddOpen(true);
    };

    const tryCloseAdd = () => {
        if (addSaving) return;
        if (isAddFormDirty(addForm)) {
            if (!window.confirm('You have unsaved data. Close and discard it?')) return;
        }
        setAddOpen(false);
    };

    const selectCustomerSuggestion = (c: CustomerRow) => {
        setAddLocked(true);
        setAddForm(f => ({ ...f, name: c.name, phone: c.phone, address: c.address, pin: c.pin }));
        setNameSuggestions([]);
        setPhoneSuggestions([]);
    };

    const submitAdd = async () => {
        if (!tenantId) return;
        const name = addForm.name.trim();
        const billAmount = Number(addForm.billAmount) || 0;
        if (!name) { setAddError('Customer name is required.'); return; }
        if (billAmount <= 0) { setAddError('Bill amount must be greater than 0.'); return; }
        const paidAmount = Math.min(Number(addForm.paidAmount) || 0, billAmount);
        // Defensive layer — the input already sanitizes on every keystroke/paste,
        // this just guards against a stale/programmatic form.phone value. Capped
        // locally (not inside phoneKey itself, which is also used to match
        // against already-stored numbers of unknown length elsewhere).
        const phone = phoneKey(addForm.phone).slice(0, 10);
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
            // Also upsert into `retailers` — the collection POS Billing's buyer
            // suggestion dropdown queries. Without this, a customer added only via
            // Khata (never billed through POS) would never appear there. Same
            // identity priority POS itself uses when saving a walk-in: match by
            // phone first, else by normalized name, else create a new record —
            // so this never forks a duplicate for a customer who already has one.
            try {
                let existingRef: ReturnType<typeof getTenantDoc> | null = null;
                if (phone) {
                    const snap = await getDocs(query(getTenantCollection(db, tenantId, 'retailers'), where('number', '==', phone), limit(1)));
                    if (!snap.empty) existingRef = snap.docs[0].ref;
                }
                if (!existingRef) {
                    const nameKey = name.toLowerCase();
                    const allSnap = await getDocs(getTenantCollection(db, tenantId, 'retailers'));
                    const match = allSnap.docs.find(d => (d.data().name || '').trim().toLowerCase() === nameKey);
                    if (match) existingRef = match.ref;
                }
                if (existingRef) {
                    await updateDoc(existingRef, {
                        ...(name ? { name } : {}),
                        ...(phone ? { number: phone } : {}),
                        ...(addForm.address.trim() ? { atPost: addForm.address.trim() } : {}),
                        ...(addForm.pin.trim() ? { pin: addForm.pin.trim() } : {}),
                        lastOrderedAt: serverTimestamp(),
                    });
                } else {
                    // totalSales/outstandingAmount/totalPaid seed at 0, not the bill's
                    // amount — this doc exists purely so the customer is findable in
                    // POS suggestions. The actual balance the invoice shows is always
                    // computed live from salesOrders (see POSPage.fetchLiveOutstanding),
                    // so this cached counter is informational only and never read for
                    // that calculation — keeping it at 0 avoids a second, divergent
                    // source of truth for the same figure.
                    await addDoc(getTenantCollection(db, tenantId, 'retailers'), {
                        name, number: phone, atPost: addForm.address.trim(), pin: addForm.pin.trim(),
                        taluka: '', district: '',
                        status: 'active', channel: 'pos',
                        totalSales: 0, outstandingAmount: 0, totalPaid: 0,
                        createdAt: serverTimestamp(),
                        lastOrderedAt: serverTimestamp(),
                    });
                }
            } catch (err) {
                // Never block the udhari entry itself on this best-effort sync.
                console.error('Khata → retailers sync failed:', err);
            }
            showToast('Udhari entry added.', 'success');
            setAddOpen(false);
            setAddLocked(false);
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
        // Defensive layer — see the matching comment in submitAdd.
        const phone = phoneKey(editForm.phone).slice(0, 10);
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

    // With a specific invoice linked, the payment applies only to that one
    // salesOrders document. Without one (linkedBillId === ''), falls back to
    // the original behavior — FIFO across the customer's outstanding bills
    // (oldest first) — unchanged, for backward compatibility.
    const submitPayment = async () => {
        if (!tenantId || !paymentFor) return;
        const enteredAmount = Number(paymentForm.amount) || 0;
        const linkedBill = paymentForm.linkedBillId
            ? paymentFor.bills.find(b => b.id === paymentForm.linkedBillId)
            : null;

        if (paymentForm.linkedBillId && !linkedBill) { setPaymentError('Selected invoice could not be found.'); return; }
        if (linkedBill && linkedBill.outstanding <= 0) { setPaymentError('That invoice is already fully paid.'); return; }

        const cap = linkedBill ? linkedBill.outstanding : paymentFor.outstanding;
        const remaining = Math.min(enteredAmount, cap);
        if (remaining <= 0) { setPaymentError('Enter a valid amount.'); return; }
        setPaymentSaving(true);
        setPaymentError(null);
        try {
            if (linkedBill) {
                // Single-invoice allocation — updates only the selected document.
                await updateDoc(getTenantDoc(db, tenantId, 'salesOrders', linkedBill.id), {
                    amountPaid: linkedBill.paid + remaining,
                    paymentMethod: paymentForm.method,
                    paymentDate: paymentForm.date,
                    transactionRef: paymentForm.ref.trim() || null,
                    paymentNotes: paymentForm.notes.trim() || null,
                    updatedAt: serverTimestamp(),
                });
            } else {
                let toApply = remaining;
                const batch = writeBatch(db);
                const ordered = [...paymentFor.bills].sort((a, b) => a.ts.getTime() - b.ts.getTime());
                for (const b of ordered) {
                    if (toApply <= 0) break;
                    if (b.outstanding <= 0) continue;
                    const apply = Math.min(toApply, b.outstanding);
                    batch.update(getTenantDoc(db, tenantId, 'salesOrders', b.id), {
                        amountPaid: b.paid + apply,
                        paymentMethod: paymentForm.method,
                        paymentDate: paymentForm.date,
                        transactionRef: paymentForm.ref.trim() || null,
                        paymentNotes: paymentForm.notes.trim() || null,
                        updatedAt: serverTimestamp(),
                    });
                    toApply -= apply;
                }
                await batch.commit();
            }
            showToast('Payment recorded.', 'success');
            setPaymentFor(null);
            setPaymentForm(emptyPaymentForm());
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
            await softDelete({
                db, tenantId,
                collectionName: 'salesOrders',
                docId: deleteTarget.id,
                userId: currentUser?.uid || '',
                userName: userName || currentUser?.email || 'Unknown',
                userRole: userRole || 'unknown',
                module: 'Digital Khata',
                entityName: (deleteTarget as any).billNumber || deleteTarget.id,
            });
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

    // Lock background scroll whenever any modal is open.
    const anyModalOpen = addOpen || !!editingBill || !!paymentFor || !!deleteTarget || !!cancelTarget;
    useEffect(() => {
        if (anyModalOpen) {
            const prev = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            return () => { document.body.style.overflow = prev; };
        }
    }, [anyModalOpen]);

    // Close suggestions when clicking outside their containers.
    useEffect(() => {
        if (!nameSuggestions.length && !phoneSuggestions.length) return;
        const handler = (e: MouseEvent) => {
            if (addNameRef.current && !addNameRef.current.contains(e.target as Node)) setNameSuggestions([]);
            if (addPhoneRef.current && !addPhoneRef.current.contains(e.target as Node)) setPhoneSuggestions([]);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [nameSuggestions.length, phoneSuggestions.length]);

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
        // Filters on lastTs — the same "Last Bill" timestamp already shown in
        // the customer-list column, so this uses the one authoritative date
        // the page already computes rather than introducing a second source.
        if (dateFilter !== 'all') {
            let range: { start: Date | null; end: Date };
            if (dateFilter === 'last30') {
                const from = new Date(); from.setDate(from.getDate() - 29); from.setHours(0, 0, 0, 0);
                const to = new Date(); to.setHours(23, 59, 59, 999);
                range = { start: from, end: to };
            } else if (dateFilter === 'custom') {
                range = resolveDateRange('customRange', undefined, customFrom, customTo);
            } else {
                range = resolveDateRange(dateFilter === 'last7' ? 'last7days' : dateFilter);
            }
            list = list.filter(c => (!range.start || c.lastTs >= range.start) && c.lastTs <= range.end);
        }
        return list;
    }, [customers, tab, search, dateFilter, customFrom, customTo]);

    const sorted = useMemo(() => {
        const mult = sortDir === 'asc' ? 1 : -1;
        return [...filtered].sort((a, b) => {
            switch (sortCol) {
                case 'name': return mult * a.name.localeCompare(b.name);
                case 'outstanding': return mult * (a.outstanding - b.outstanding);
                case 'total': return mult * (a.total - b.total);
                case 'paid': return mult * (a.paid - b.paid);
                case 'lastTs': return mult * (a.lastTs.getTime() - b.lastTs.getTime());
                default: return 0;
            }
        });
    }, [filtered, sortCol, sortDir]);

    const toggleSort = (col: SortCol) => {
        if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortCol(col); setSortDir('desc'); }
    };

    const exportPendingCustomers = () => {
        const rows = customers
            .filter(c => c.status === 'pending' || c.status === 'partial')
            .sort((a, b) => b.outstanding - a.outstanding)
            .map(c => ({
                'Customer Name': c.name,
                'Phone': c.phone || '',
                'Address': c.address || '',
                'PIN': c.pin || '',
                'Total Billed (₹)': c.total,
                'Total Paid (₹)': c.paid,
                'Outstanding (₹)': c.outstanding,
                'Last Transaction': c.lastTs.toLocaleDateString('en-IN'),
                'Status': c.status === 'pending' ? 'Pending' : 'Partial',
            }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const colWidths = [
            { wch: 28 }, { wch: 14 }, { wch: 32 }, { wch: 8 },
            { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 10 },
        ];
        ws['!cols'] = colWidths;
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Pending Customers');
        XLSX.writeFile(wb, `pending-customers-${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

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
                <td>${b.ts.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
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
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e1e1e; font-size: 9.5pt; line-height: 1.5; margin: 0; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; }
  .cust-name { font-size: 16pt; font-weight: 700; color: rgb(28,120,60); text-transform: uppercase; }
  .doc-sub { font-size: 8.5pt; color: #505050; margin-top: 5px; }
  .doc-title { font-size: 13pt; font-weight: 700; color: #1e1e1e; text-align: right; }
  .doc-meta { font-size: 8pt; color: #646464; margin-top: 5px; text-align: right; }
  .divider { border: none; border-top: 1px solid #c8c8c8; margin: 6px 0 10px; }
  table { border-collapse: collapse; width: 100%; font-size: 8.5pt; }
  thead th { background: rgb(28,120,60); color: #fff; font-weight: 700; text-align: left; padding: 6px 8px; }
  th.num, td.num { text-align: right; }
  tbody td { padding: 5px 8px; border-bottom: 1px solid #e5e5e5; }
  tbody tr:nth-child(even) { background: #f6f8f6; }
  tfoot td { padding: 7px 8px; font-weight: 700; border-top: 1.5px solid #1e1e1e; }
  .summary { display: flex; gap: 48px; margin-top: 14px; font-size: 8.5pt; }
  .summary .label { color: #646464; }
  .summary .value { font-weight: 700; color: #1e1e1e; margin-top: 3px; }
  .summary .value.outstanding { color: ${c.outstanding > 0 ? '#c81e1e' : '#1c8c46'}; }
  .footer { border-top: 1px solid #c8c8c8; margin-top: 24px; padding-top: 8px; font-size: 7.5pt; color: #969696; display: flex; justify-content: space-between; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
<div class="header">
  <div>
    <div class="cust-name">${c.name}</div>
    <div class="doc-sub">${[c.phone, c.address].filter(Boolean).join(' &middot; ')}</div>
  </div>
  <div>
    <div class="doc-title">KHATA STATEMENT</div>
    <div class="doc-meta">Generated: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
    <div class="doc-meta">${c.bills.length} bill(s)</div>
  </div>
</div>
<hr class="divider" />
<table>
  <thead><tr><th>Date</th><th>Bill No</th><th class="num">Bill Amt</th><th class="num">Paid</th><th class="num">Balance</th></tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr><td colspan="2">Total</td><td class="num">${c.total.toFixed(2)}</td><td class="num">${c.paid.toFixed(2)}</td><td class="num">${c.outstanding.toFixed(2)}</td></tr></tfoot>
</table>
<div class="summary">
  <div><div class="label">Total Billed</div><div class="value">Rs. ${c.total.toFixed(2)}</div></div>
  <div><div class="label">Total Paid</div><div class="value">Rs. ${c.paid.toFixed(2)}</div></div>
  <div><div class="label">Outstanding</div><div class="value outstanding">Rs. ${c.outstanding.toFixed(2)}</div></div>
</div>
<div class="footer">
  <span>Fiinny ERP — Khata Statement</span>
  <span>To save as PDF: File → Print → Save as PDF</span>
</div>
</body></html>`);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 400);
    };

    // ── Add / Edit / Payment / Delete modals — shared across both the list and
    // customer-detail views below. ───────────────────────────────────────────
    const suggestionListStyle: React.CSSProperties = {
        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 2000,
        background: '#1e2535',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '10px', marginTop: '4px', maxHeight: '220px', overflowY: 'auto',
        boxShadow: '0 12px 32px rgba(0,0,0,0.55)',
    };
    const suggestionItemStyle = (hover: boolean): React.CSSProperties => ({
        padding: '0.6rem 0.9rem', cursor: 'pointer',
        background: hover ? 'rgba(255,255,255,0.08)' : 'transparent',
        display: 'flex', flexDirection: 'column', gap: '0.15rem',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        transition: 'background 0.1s',
    });

    const entryFormFields = (form: EntryForm, setForm: React.Dispatch<React.SetStateAction<EntryForm>>, locked: boolean) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div ref={locked ? undefined : addNameRef} style={{ position: 'relative' }}>
                <label style={labelStyle}>Customer Name *</label>
                <input className="input-field" style={{ width: '100%', margin: 0 }} value={form.name} disabled={locked}
                    onChange={e => {
                        const val = e.target.value;
                        setForm(f => ({ ...f, name: val }));
                        if (!locked && val.length >= 1) {
                            const q = val.toLowerCase();
                            setNameSuggestions(customers.filter(c => c.name.toLowerCase().includes(q)).slice(0, 6));
                        } else {
                            setNameSuggestions([]);
                        }
                    }}
                    onFocus={() => {
                        if (!locked && form.name.length >= 1) {
                            const q = form.name.toLowerCase();
                            setNameSuggestions(customers.filter(c => c.name.toLowerCase().includes(q)).slice(0, 6));
                        }
                    }}
                    placeholder="e.g. Ramesh Patil" autoComplete="off" />
                {!locked && nameSuggestions.length > 0 && (
                    <div style={suggestionListStyle}>
                        {nameSuggestions.map(c => (
                            <SuggestionItem key={c.key} c={c} style={suggestionItemStyle} onSelect={() => selectCustomerSuggestion(c)} />
                        ))}
                    </div>
                )}
            </div>
            <div ref={locked ? undefined : addPhoneRef} style={{ position: 'relative' }}>
                <label style={labelStyle}>Phone</label>
                <input className="input-field" style={{ width: '100%', margin: 0 }} value={form.phone} disabled={locked}
                    inputMode="numeric" maxLength={10}
                    onChange={e => {
                        // Digits only, capped at 10 — applies to typed input, IME
                        // composition, and paste alike, since paste fires this same
                        // onChange with the full pasted string as e.target.value.
                        const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                        setForm(f => ({ ...f, phone: val }));
                        if (!locked && val.length >= 3) {
                            setPhoneSuggestions(customers.filter(c => c.phone.includes(val)).slice(0, 6));
                        } else {
                            setPhoneSuggestions([]);
                        }
                    }}
                    onFocus={() => {
                        if (!locked && form.phone.replace(/\D/g, '').length >= 3) {
                            const q = form.phone.replace(/\D/g, '');
                            setPhoneSuggestions(customers.filter(c => c.phone.includes(q)).slice(0, 6));
                        }
                    }}
                    placeholder="10-digit mobile" autoComplete="off" />
                {!locked && phoneSuggestions.length > 0 && (
                    <div style={suggestionListStyle}>
                        {phoneSuggestions.map(c => (
                            <SuggestionItem key={c.key} c={c} style={suggestionItemStyle} onSelect={() => selectCustomerSuggestion(c)} />
                        ))}
                    </div>
                )}
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

    const modalPortal = (content: React.ReactNode) => createPortal(content, document.body);

    const modals = (
        <>
            {addOpen && modalPortal(
                <div onMouseDown={e => { if (e.target === e.currentTarget) tryCloseAdd(); }} style={modalOverlayStyle} role="dialog" aria-modal="true" aria-label="Add Udhari">
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto', padding: '1.75rem', borderRadius: '16px', position: 'relative' }}>
                        <button onClick={tryCloseAdd} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }} aria-label="Close">
                            <X size={20} />
                        </button>
                        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Plus size={18} className="primary-gradient-text" /> Add Udhari
                        </h2>
                        {addLocked && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', padding: '0.5rem 0.75rem', background: 'var(--primary)11', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--primary-light)' }}>
                                <User size={13} /> Adding bill for existing customer — name &amp; phone locked.
                                <button onClick={() => { setAddLocked(false); setAddForm(f => f); }} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.75rem', fontFamily: 'inherit' }}>
                                    Change
                                </button>
                            </div>
                        )}
                        {entryFormFields(addForm, setAddForm, addLocked)}
                        {addError && <div style={errStyle}><AlertCircle size={13} /> {addError}</div>}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1.1rem' }}>
                            <button onClick={tryCloseAdd} className="btn btn-secondary" disabled={addSaving} style={{ padding: '0.55rem 1.1rem', fontSize: '0.85rem' }}>Cancel</button>
                            <button onClick={submitAdd} className="btn btn-primary" disabled={addSaving} style={{ padding: '0.55rem 1.1rem', fontSize: '0.85rem' }}>
                                {addSaving ? 'Saving...' : 'Save Udhari'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {editingBill && modalPortal(
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

            {paymentFor && modalPortal(
                <div onMouseDown={e => { if (e.target === e.currentTarget && !paymentSaving) { setPaymentFor(null); setPaymentForm(emptyPaymentForm()); } }} style={modalOverlayStyle} role="dialog" aria-modal="true" aria-label="Record Payment">
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '440px', padding: '1.75rem', borderRadius: '16px', position: 'relative' }}>
                        <button onClick={() => { if (!paymentSaving) { setPaymentFor(null); setPaymentForm(emptyPaymentForm()); } }} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }} aria-label="Close">
                            <X size={20} />
                        </button>
                        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Wallet size={18} className="primary-gradient-text" /> Record Payment
                        </h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                            <strong>{paymentFor.name}</strong> &middot; Outstanding <strong style={{ color: '#ef4444' }}>{fmtINR(paymentFor.outstanding)}</strong>
                        </p>
                        {(() => {
                            const outstandingBills = paymentFor.bills.filter(b => b.outstanding > 0);
                            const linkedBill = paymentForm.linkedBillId ? paymentFor.bills.find(b => b.id === paymentForm.linkedBillId) : null;
                            const enteredAmount = Number(paymentForm.amount) || 0;
                            return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                                    {outstandingBills.length > 0 && (
                                        <div>
                                            <label style={labelStyle}>Link to Invoice</label>
                                            <select className="input-field" style={{ width: '100%', margin: 0 }} value={paymentForm.linkedBillId}
                                                onChange={e => setPaymentForm(f => ({ ...f, linkedBillId: e.target.value }))}>
                                                <option value="">Unallocated — settle oldest dues first</option>
                                                {outstandingBills.map(b => (
                                                    <option key={b.id} value={b.id}>
                                                        {billNo(b)} · Bill {fmtINR(b.total)} · Paid {fmtINR(b.paid)} · Due {fmtINR(b.outstanding)}
                                                    </option>
                                                ))}
                                            </select>
                                            {linkedBill && (
                                                <div style={{ marginTop: '0.5rem', padding: '0.55rem 0.75rem', borderRadius: '8px', background: 'var(--surface-raised)', fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', flexWrap: 'wrap', gap: '0.4rem 0.9rem' }}>
                                                    <span>Invoice: <strong style={{ color: 'var(--text-primary)' }}>{billNo(linkedBill)}</strong></span>
                                                    <span>Bill: <strong style={{ color: 'var(--text-primary)' }}>{fmtINR(linkedBill.total)}</strong></span>
                                                    <span>Paid: <strong style={{ color: '#10b981' }}>{fmtINR(linkedBill.paid)}</strong></span>
                                                    <span>Outstanding: <strong style={{ color: '#ef4444' }}>{fmtINR(linkedBill.outstanding)}</strong></span>
                                                    {enteredAmount > 0 && (
                                                        <span style={{ width: '100%', borderTop: '1px dashed var(--surface-border)', paddingTop: '0.4rem', marginTop: '0.1rem' }}>
                                                            After this payment — Paid: <strong style={{ color: '#10b981' }}>{fmtINR(linkedBill.paid + Math.min(enteredAmount, linkedBill.outstanding))}</strong>
                                                            {' · '}Outstanding: <strong style={{ color: '#ef4444' }}>{fmtINR(Math.max(0, linkedBill.outstanding - enteredAmount))}</strong>
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                        <div>
                                            <label style={labelStyle}>Amount Received (₹) *</label>
                                            <input type="number" className="input-field" style={{ width: '100%', margin: 0 }} value={paymentForm.amount}
                                                onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" autoFocus />
                                        </div>
                                        <div>
                                            <label style={labelStyle}>Payment Date</label>
                                            <input type="date" className="input-field" style={{ width: '100%', margin: 0 }} value={paymentForm.date}
                                                onChange={e => setPaymentForm(f => ({ ...f, date: e.target.value }))} />
                                        </div>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Payment Method</label>
                                        <select className="input-field" style={{ width: '100%', margin: 0 }} value={paymentForm.method}
                                            onChange={e => setPaymentForm(f => ({ ...f, method: e.target.value }))}>
                                            {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
                                        </select>
                                    </div>
                                    {paymentForm.method !== 'Cash' && (
                                        <div>
                                            <label style={labelStyle}>Transaction Reference / UTR</label>
                                            <input className="input-field" style={{ width: '100%', margin: 0 }} value={paymentForm.ref}
                                                onChange={e => setPaymentForm(f => ({ ...f, ref: e.target.value }))} placeholder="UPI Ref / Cheque No / UTR" />
                                        </div>
                                    )}
                                    <div>
                                        <label style={labelStyle}>Notes (optional)</label>
                                        <input className="input-field" style={{ width: '100%', margin: 0 }} value={paymentForm.notes}
                                            onChange={e => setPaymentForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. partial payment for July dues" />
                                    </div>
                                </div>
                            );
                        })()}
                        {paymentError && <div style={{ ...errStyle, marginTop: '0.75rem' }}><AlertCircle size={13} /> {paymentError}</div>}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1.25rem' }}>
                            <button onClick={() => { setPaymentFor(null); setPaymentForm(emptyPaymentForm()); }} className="btn btn-secondary" disabled={paymentSaving} style={{ padding: '0.55rem 1.1rem', fontSize: '0.85rem' }}>Cancel</button>
                            <button onClick={submitPayment} className="btn btn-primary" disabled={paymentSaving} style={{ padding: '0.55rem 1.1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <IndianRupee size={14} /> {paymentSaving ? 'Saving...' : 'Record Payment'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {deleteTarget && modalPortal(
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

            {cancelTarget && modalPortal(
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
            <div className="animate-fade-in" style={{ maxWidth: fullWidth ? 'none' : '1100px', margin: '0 auto' }}>
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
                        <button onClick={() => {
                            setPaymentFor(selected);
                            // Default to the oldest outstanding bill (matches the FIFO
                            // fallback's own settle-oldest-first convention) — still
                            // fully changeable via the Link to Invoice selector.
                            const oldestOutstanding = [...selected.bills].filter(b => b.outstanding > 0).sort((a, b) => a.ts.getTime() - b.ts.getTime())[0];
                            setPaymentForm({ ...emptyPaymentForm(), linkedBillId: oldestOutstanding?.id || '' });
                            setPaymentError(null);
                        }}
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
                                    {['Bill No', 'Date', 'Bill Amount', 'Paid', 'Outstanding', 'Status', 'Actions'].map(h => (
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
        <div className="animate-fade-in" style={{ maxWidth: fullWidth ? 'none' : '1100px', margin: '0 auto' }}>

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

            {/* Filters */}
            <div className="glass-panel" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Status */}
                <select
                    value={tab}
                    onChange={e => setTab(e.target.value as FilterTab)}
                    className="input-field"
                    style={{ margin: 0, height: '38px', width: '150px', flexShrink: 0, cursor: 'pointer', padding: '0.4rem 0.6rem' }}
                >
                    <option value="pending">Pending</option>
                    <option value="partial">Partial</option>
                    <option value="all">All</option>
                </select>

                {/* Date Range */}
                <select
                    value={dateFilter}
                    onChange={e => setDateFilter(e.target.value as DateFilterKey)}
                    className="input-field"
                    style={{ margin: 0, height: '38px', width: '170px', flexShrink: 0, cursor: 'pointer', padding: '0.4rem 0.6rem' }}
                >
                    <option value="all">All Time</option>
                    <option value="today">Today</option>
                    <option value="yesterday">Yesterday</option>
                    <option value="last7">Last 7 Days</option>
                    <option value="last30">Last 30 Days</option>
                    <option value="custom">Custom Range</option>
                </select>
                {dateFilter === 'custom' && (
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        <input type="date" className="input-field" style={{ margin: 0, height: '38px', width: '150px' }}
                            value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
                        <span style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>–</span>
                        <input type="date" className="input-field" style={{ margin: 0, height: '38px', width: '150px' }}
                            value={customTo} onChange={e => setCustomTo(e.target.value)} />
                    </div>
                )}

                {/* Search */}
                <div style={{ flex: '1 1 260px', maxWidth: '480px', position: 'relative' }}>
                    <Search size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                    <input
                        type="text"
                        placeholder="Search customer, phone or bill no."
                        className="input-field"
                        style={{ paddingLeft: '2.2rem', margin: 0, height: '38px', width: '100%' }}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <span style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>{filtered.length} customers</span>
                <button
                    onClick={exportPendingCustomers}
                    title="Export pending & partial customers to Excel"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 0.85rem', borderRadius: '20px', border: '1px solid #ef4444', background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'all 0.15s' }}
                    onMouseOver={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.18)')}
                    onMouseOut={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
                >
                    <Download size={13} /> Download Pending Customers
                </button>
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
                                    {([['Customer', 'name'], ['Mobile Number', null], ['Total Bills', null], ['Last Bill Date', 'lastTs'], ['Total Billed Amount', 'total'], ['Total Paid Amount', 'paid'], ['Outstanding', 'outstanding'], ['Status', null], ['', null]] as [string, SortCol | null][]).map(([label, col]) => {
                                        const active = col && sortCol === col;
                                        return (
                                            <th key={label}
                                                onClick={col ? () => toggleSort(col) : undefined}
                                                style={{ padding: '0.85rem 1rem', fontWeight: 600, color: active ? 'var(--primary-light)' : 'var(--text-secondary)', textAlign: label === '' ? 'center' : 'left', whiteSpace: 'nowrap', cursor: col ? 'pointer' : 'default', userSelect: 'none' }}>
                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                                    {label}
                                                    {col && (active
                                                        ? (sortDir === 'desc' ? <ChevronDown size={13} /> : <ChevronUp size={13} />)
                                                        : <ChevronDown size={13} style={{ opacity: 0.3 }} />
                                                    )}
                                                </div>
                                            </th>
                                        );
                                    })}
                                </tr>
                                <tr style={{ borderBottom: '2px solid var(--surface-border)', background: 'var(--surface-raised)' }}>
                                    <td style={{ padding: '0.6rem 1rem', fontWeight: 700, color: 'var(--text-secondary)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                                        {filtered.length} customer{filtered.length !== 1 ? 's' : ''}
                                    </td>
                                    <td style={{ padding: '0.6rem 1rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>—</td>
                                    <td style={{ padding: '0.6rem 1rem', fontWeight: 700, color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                                        {filtered.reduce((s, c) => s + c.bills.length, 0)}
                                    </td>
                                    <td style={{ padding: '0.6rem 1rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>—</td>
                                    <td style={{ padding: '0.6rem 1rem', fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                                        {fmtINR(filtered.reduce((s, c) => s + c.total, 0))}
                                    </td>
                                    <td style={{ padding: '0.6rem 1rem', fontWeight: 800, color: '#10b981', whiteSpace: 'nowrap' }}>
                                        {fmtINR(filtered.reduce((s, c) => s + c.paid, 0))}
                                    </td>
                                    <td style={{ padding: '0.6rem 1rem', fontWeight: 800, color: '#ef4444', whiteSpace: 'nowrap' }}>
                                        {fmtINR(filtered.reduce((s, c) => s + c.outstanding, 0))}
                                    </td>
                                    <td style={{ padding: '0.6rem 1rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>—</td>
                                    <td style={{ padding: '0.6rem 1rem' }} />
                                </tr>
                            </thead>
                            <tbody>
                                {sorted.map(c => (
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
