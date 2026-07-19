import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Phone, Mail, MapPin, Pencil, CheckCircle2,
  X, Loader2, AlertCircle, IndianRupee, Package, ChevronDown, ChevronRight,
  MessageSquare, Plus, Truck, CreditCard, CalendarDays, Trash2, Search,
  MessageCircle, Mic, Printer, CheckSquare, FileText, Square, Receipt, Paperclip,
} from 'lucide-react';
import {
  RadialBarChart, RadialBar, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import {
  getDoc, getDocs, addDoc, updateDoc, deleteDoc, query, where,
  serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection, getTenantDoc } from '../utils/tenantPath';
import SupplierFormModal, { type SupplierLike } from '../components/SupplierFormModal';
import PurchaseOrderModal, { type POForEdit } from '../components/PurchaseOrderModal';
import PaymentModal, { type PaymentForEdit } from '../components/PaymentModal';

interface Supplier extends SupplierLike {
  id: string;
  name: string;
  outstandingBalance: number;
  totalInvoiced?: number;
  totalPaid?: number;
}

interface POLine { description: string; quantity: number; unit?: string; rate: number; amount: number; gstPct?: number; hsnCode?: string; }

interface PO {
  id: string;
  poNumber?: string;
  poDate?: string;
  date?: Timestamp | string;
  totalAmount?: number;
  amount?: number;
  taxableValue?: number;
  status?: string;
  notes?: string;
  refNo?: string;
  lines?: POLine[];
  items?: any[];
  supplierName?: string;
  createdAt?: Timestamp;
}

interface Payment {
  id: string;
  paymentId?: string;
  // legacy field names
  date?: Timestamp | string;
  mode?: string;
  paymentMode?: string;
  reference?: string;
  receiptNo?: string;
  // new field names
  paymentDate?: string;
  paymentMethod?: string;
  accountDetails?: { accountName?: string; transactionRef?: string };
  notes?: string;
  linkedOrderIds?: string[];
  unallocatedAmount?: number;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: string;
  amount: number;
  createdAt?: Timestamp;
}

interface Comment {
  id: string;
  text: string;
  createdAt?: Timestamp;
  author?: string;
}

interface Task {
  id: string;
  title: string;
  dueDate?: string;
  status?: string;
  createdAt?: Timestamp;
}

/** A saved Supplier Purchase Invoice (from the supplierInvoices collection). */
interface SupplierInvoice {
  id: string;
  internalPurchaseId?: string;
  supplierInvoiceNumber?: string;
  supplierName?: string;
  invoiceDate?: string;
  netAmount?: number;
  taxMode?: string;
  status?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

const today = () => new Date().toISOString().slice(0, 10);

function fmtDate(v?: Timestamp | string): string {
  if (!v) return '—';
  if (typeof v === 'string') {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    return v;
  }
  try { return v.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return '—'; }
}

const sortVal = (v: any): number => {
  if (!v) return 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v === 'string') { const t = new Date(v).getTime(); return isNaN(t) ? 0 : t; }
  return 0;
};

const poAmount = (po: PO): number => Number(po.totalAmount ?? po.amount ?? 0);
const poDateVal = (po: PO) => po.poDate ?? po.date ?? po.createdAt;
const pmtMode = (p: Payment) => p.paymentMethod || p.mode || p.paymentMode || 'Payment';
const pmtRef = (p: Payment) => p.accountDetails?.transactionRef || p.reference || p.receiptNo || '';
const pmtEffectiveDate = (p: Payment) => p.paymentDate ?? p.date ?? p.createdAt;

const statusColor = (s?: string): string =>
  ({ received: '#10b981', pending: '#f59e0b', partial: '#38bdf8', cancelled: '#ef4444' } as Record<string, string>)[s ?? 'received'] || '#94a3b8';

const poLines = (po: PO): POLine[] => {
  if (Array.isArray(po.lines)) return po.lines as POLine[];
  if (Array.isArray(po.items)) {
    return po.items.map((it: any) => {
      const q = Number(it.quantity ?? it.qty ?? 0);
      const r = Number(it.rate ?? 0);
      return { description: it.description ?? it.name ?? '', quantity: q, unit: it.unit, rate: r, amount: Number(it.amount ?? q * r) };
    });
  }
  return [];
};

const inr = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const firstPhone = (p?: string) => (p ?? '').split(/[,/]/)[0].replace(/\D/g, '');

export default function SupplierLedgerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tenantId, currentUser } = useAuth();

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [pos, setPOs] = useState<PO[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Supplier edit — handled by the shared SupplierFormModal in edit mode
  const [editMode, setEditMode] = useState(false);

  // Account Statement / Purchase Orders / Payments / Supplier Invoices — single tabbed view.
  const [activeTab, setActiveTab] = useState<'account' | 'purchaseOrders' | 'payments' | 'invoices'>('purchaseOrders');

  // Supplier Purchase Invoices (read-only list; created/edited via SupplierInvoicePage).
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([]);
  const [invToDelete, setInvToDelete] = useState<SupplierInvoice | null>(null);
  const [deletingInv, setDeletingInv] = useState(false);

  // Section toggles (Comments / Tasks remain independent accordions)
  const [cmtsOpen, setCmtsOpen] = useState(true);
  const [tasksOpen, setTasksOpen] = useState(true);

  // Filters
  const [poSearch, setPoSearch] = useState('');
  const [pmtSearch, setPmtSearch] = useState('');

  // Expanded PO rows
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // PO modal (add/edit) — handled by the shared PurchaseOrderModal.
  // undefined = closed, null = add, PO = edit.
  const [poEditing, setPoEditing] = useState<POForEdit | null | undefined>(undefined);

  // Payment modal (add/edit) — handled by the shared PaymentModal.
  // undefined = closed, null = add, Payment = edit.
  const [pmtEditing, setPmtEditing] = useState<PaymentForEdit | null | undefined>(undefined);

  // Comments + voice
  const [newComment, setNewComment] = useState('');
  const [cmtSaving, setCmtSaving] = useState(false);
  const [isListening, setIsListening] = useState(false);

  // Tasks
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDue, setNewTaskDue] = useState('');
  const [taskSaving, setTaskSaving] = useState(false);

  const load = useCallback(async (persist = false) => {
    if (!tenantId || !id) return;
    setLoading(true); setError(null);
    try {
      const supSnap = await getDoc(getTenantDoc(db, tenantId, 'suppliers', id));
      if (!supSnap.exists()) { setError('Supplier not found'); setLoading(false); return; }
      const sup = { id: supSnap.id, outstandingBalance: 0, ...supSnap.data() } as Supplier;

      const [posSnap, pmtsSnap, cmtsSnap, tasksSnap, invSnap] = await Promise.all([
        getDocs(query(getTenantCollection(db, tenantId, 'purchaseOrders'), where('supplierName', '==', sup.name))),
        getDocs(query(getTenantCollection(db, tenantId, 'supplierPayments'), where('supplierName', '==', sup.name))),
        getDocs(query(getTenantCollection(db, tenantId, 'supplierComments'), where('supplierId', '==', id))),
        getDocs(query(getTenantCollection(db, tenantId, 'supplierTasks'), where('supplierId', '==', id))),
        getDocs(query(getTenantCollection(db, tenantId, 'supplierInvoices'), where('supplierId', '==', id))),
      ]);

      const posList = posSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as PO))
        .sort((a, b) => sortVal(poDateVal(b)) - sortVal(poDateVal(a)));
      const pmtsList = pmtsSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as Payment))
        .sort((a, b) => sortVal(b.date ?? b.createdAt) - sortVal(a.date ?? a.createdAt));
      const cmtsList = cmtsSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as Comment))
        .sort((a, b) => sortVal(b.createdAt) - sortVal(a.createdAt));
      const tasksList = tasksSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as Task))
        .sort((a, b) => (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0) || sortVal(b.createdAt) - sortVal(a.createdAt));
      const invList = invSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as SupplierInvoice))
        .sort((a, b) => sortVal(b.createdAt) - sortVal(a.createdAt));

      // Same formula as utils/supplierLedgerSync.ts's syncSupplierTotals — kept
      // inline here (rather than calling that helper) because this page already
      // has posList/pmtsList/invList in memory for its own tables, so reusing
      // the helper would mean re-fetching all three collections a second time.
      const derivedPoInvoiced = posList.reduce((s, p) => s + poAmount(p), 0);
      const derivedInvInvoiced = invList.reduce((s, inv) => s + (Number(inv.netAmount) || 0), 0);
      const derivedInvoiced = derivedPoInvoiced + derivedInvInvoiced;
      const derivedPaid = pmtsList.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const derivedOutstanding = derivedInvoiced - derivedPaid;

      if (persist) {
        await updateDoc(getTenantDoc(db, tenantId, 'suppliers', id), {
          totalInvoiced: derivedInvoiced,
          totalPaid: derivedPaid,
          outstandingBalance: derivedOutstanding,
          updatedAt: serverTimestamp(),
        });
      }

      setSupplier({ ...sup, totalInvoiced: derivedInvoiced, totalPaid: derivedPaid, outstandingBalance: derivedOutstanding });
      setPOs(posList);
      setPayments(pmtsList);
      setComments(cmtsList);
      setTasks(tasksList);
      setInvoices(invList);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, [tenantId, id]);

  useEffect(() => { load(); }, [load]);

  const handleWhatsApp = () => {
    const phone = firstPhone(supplier?.phone);
    if (!phone) return;
    const msg = encodeURIComponent(`Hello ${supplier?.name}, this is from KaranArjun Krushi Seva Kendra regarding our account.`);
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
  };

  // ── PO add/edit ────────────────────────────────────────────────────────────
  // Open/edit/save handled by the shared PurchaseOrderModal; recompute via load(true).
  const openAddPO = () => setPoEditing(null);
  const openEditPO = (po: PO) => setPoEditing(po as POForEdit);

  const handleDeletePO = async (po: PO) => {
    if (!tenantId) return;
    if (!window.confirm(`Delete PO ${po.poNumber ?? ''} (${inr(poAmount(po))})? This cannot be undone.`)) return;
    try { await deleteDoc(getTenantDoc(db, tenantId, 'purchaseOrders', po.id)); await load(true); }
    catch (e: any) { alert(e.message); }
  };

  // ── Payment add/edit ───────────────────────────────────────────────────────
  // Open/edit/save handled by the shared PaymentModal; recompute via load(true).
  const openAddPayment = () => setPmtEditing(null);
  const openEditPayment = (pmt: Payment) => setPmtEditing(pmt as PaymentForEdit);

  const handleDeletePayment = async (pmt: Payment) => {
    if (!tenantId) return;
    if (!window.confirm(`Delete payment of ${inr(pmt.amount)} (${fmtDate(pmt.date)})? This cannot be undone.`)) return;
    try { await deleteDoc(getTenantDoc(db, tenantId, 'supplierPayments', pmt.id)); await load(true); }
    catch (e: any) { alert(e.message); }
  };

  // ── Supplier Invoice delete (confirmation modal → deleteDoc → reload) ─────────
  const handleDeleteInvoice = async (inv: SupplierInvoice) => {
    if (!tenantId) return;
    setDeletingInv(true);
    try {
      await deleteDoc(getTenantDoc(db, tenantId, 'supplierInvoices', inv.id));
      setInvToDelete(null);
      await load(true);
    } catch (e: any) { alert(e.message); }
    finally { setDeletingInv(false); }
  };

  // ── Comments + voice ─────────────────────────────────────────────────────────
  const handleAddComment = async () => {
    if (!tenantId || !id || !newComment.trim()) return;
    setCmtSaving(true);
    try {
      await addDoc(getTenantCollection(db, tenantId, 'supplierComments'), {
        supplierId: id, supplierName: supplier?.name ?? '', text: newComment.trim(),
        author: currentUser?.email ?? '', createdAt: serverTimestamp(),
      });
      setNewComment('');
      load();
    } catch (e: any) { console.error(e); }
    setCmtSaving(false);
  };

  const toggleListen = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert('Voice typing is not supported in this browser.'); return; }
    const rec = new SR();
    rec.lang = 'en-IN'; rec.continuous = false; rec.interimResults = false;
    rec.onstart = () => setIsListening(true);
    rec.onresult = (e: any) => { const t = e.results[0][0].transcript; setNewComment(prev => prev ? `${prev} ${t}` : t); };
    rec.onerror = () => setIsListening(false);
    rec.onend = () => setIsListening(false);
    rec.start();
  };

  // ── Tasks ─────────────────────────────────────────────────────────────────────
  const handleAddTask = async () => {
    if (!tenantId || !id || !newTaskTitle.trim()) return;
    setTaskSaving(true);
    try {
      await addDoc(getTenantCollection(db, tenantId, 'supplierTasks'), {
        supplierId: id, supplierName: supplier?.name ?? '', title: newTaskTitle.trim(),
        dueDate: newTaskDue || '', status: 'open', createdAt: serverTimestamp(), createdBy: currentUser?.email ?? '',
      });
      setNewTaskTitle(''); setNewTaskDue('');
      load();
    } catch (e: any) { console.error(e); }
    setTaskSaving(false);
  };

  const toggleTask = async (task: Task) => {
    if (!tenantId) return;
    await updateDoc(getTenantDoc(db, tenantId, 'supplierTasks', task.id), { status: task.status === 'done' ? 'open' : 'done' });
    load();
  };

  const deleteTask = async (task: Task) => {
    if (!tenantId || !window.confirm('Delete this task?')) return;
    await deleteDoc(getTenantDoc(db, tenantId, 'supplierTasks', task.id));
    load();
  };

  // ── Derived: filters, analytics, statement ────────────────────────────────────
  const filteredPOs = useMemo(() => {
    const q = poSearch.trim().toLowerCase();
    if (!q) return pos;
    return pos.filter(po =>
      (po.poNumber ?? '').toLowerCase().includes(q) ||
      (po.notes ?? '').toLowerCase().includes(q) ||
      poLines(po).some(l => l.description.toLowerCase().includes(q))
    );
  }, [pos, poSearch]);

  const filteredPmts = useMemo(() => {
    const q = pmtSearch.trim().toLowerCase();
    if (!q) return payments;
    return payments.filter(p =>
      pmtMode(p).toLowerCase().includes(q) || pmtRef(p).toLowerCase().includes(q) || (p.notes ?? '').toLowerCase().includes(q)
    );
  }, [payments, pmtSearch]);

  const analytics = useMemo(() => {
    const invoiced = pos.reduce((s, p) => s + poAmount(p), 0);
    const paid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const paidPct = invoiced > 0 ? Math.min(100, Math.round((paid / invoiced) * 100)) : 0;
    const largest = pos.reduce((m, p) => Math.max(m, poAmount(p)), 0);

    const monthMap: Record<string, { label: string; value: number }> = {};
    pos.forEach(p => {
      const ms = sortVal(poDateVal(p));
      if (!ms) return;
      const d = new Date(ms);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
      if (!monthMap[ym]) monthMap[ym] = { label, value: 0 };
      monthMap[ym].value += poAmount(p);
    });
    const trend = Object.keys(monthMap).sort().slice(-6).map(k => ({ month: monthMap[k].label, value: monthMap[k].value }));

    return { invoiced, paid, paidPct, largest, trend };
  }, [pos, payments]);

  const statementRows = useMemo(() => {
    const entries = [
      ...pos.map(po => ({ date: poDateVal(po), particulars: `PO ${po.poNumber ?? po.id.slice(0, 6)}${po.notes ? ' — ' + po.notes : ''}`, debit: poAmount(po), credit: 0 })),
      ...payments.map(p => ({ date: pmtEffectiveDate(p) as any, particulars: `Payment · ${pmtMode(p)}${pmtRef(p) ? ' ' + pmtRef(p) : ''}`, debit: 0, credit: Number(p.amount) || 0 })),
    ].sort((a, b) => sortVal(a.date) - sortVal(b.date));
    let bal = 0;
    return entries.map(e => { bal += e.debit - e.credit; return { ...e, balance: bal }; });
  }, [pos, payments]);

  const printStatement = () => {
    if (!supplier) return;
    const rowsHtml = statementRows.map(r => `
      <tr>
        <td>${fmtDate(r.date)}</td>
        <td>${r.particulars}</td>
        <td style="text-align:right">${r.debit ? r.debit.toLocaleString('en-IN') : ''}</td>
        <td style="text-align:right">${r.credit ? r.credit.toLocaleString('en-IN') : ''}</td>
        <td style="text-align:right;font-weight:600">${r.balance.toLocaleString('en-IN')}</td>
      </tr>`).join('');
    const html = `<!doctype html><html><head><title>Statement — ${supplier.name}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#111;padding:24px;}
        h1{font-size:18px;margin:0 0 2px}
        .sub{color:#555;font-size:12px;margin-bottom:16px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left}
        th{background:#f3f4f6}
        tfoot td{font-weight:700;border-top:2px solid #999}
        .totals{margin-top:16px;text-align:right;font-size:13px}
      </style></head><body>
      <h1>Statement of Account — ${supplier.name}</h1>
      <div class="sub">${supplier.address ?? ''}${supplier.phone ? ' · ' + supplier.phone : ''}<br/>Generated ${new Date().toLocaleString('en-IN')}</div>
      <table>
        <thead><tr><th>Date</th><th>Particulars</th><th style="text-align:right">Debit (PO)</th><th style="text-align:right">Credit (Paid)</th><th style="text-align:right">Balance</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot><tr><td colspan="2">Totals</td>
          <td style="text-align:right">${(supplier.totalInvoiced ?? 0).toLocaleString('en-IN')}</td>
          <td style="text-align:right">${(supplier.totalPaid ?? 0).toLocaleString('en-IN')}</td>
          <td style="text-align:right">${supplier.outstandingBalance.toLocaleString('en-IN')}</td></tr></tfoot>
      </table>
      <div class="totals">Outstanding payable: <strong>₹${supplier.outstandingBalance.toLocaleString('en-IN')}</strong></div>
      </body></html>`;
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { alert('Allow pop-ups to print the statement.'); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 250);
  };

  const toggleExpand = (rid: string) => setExpanded(prev => {
    const n = new Set(prev);
    n.has(rid) ? n.delete(rid) : n.add(rid);
    return n;
  });

  // ── Render helpers ───────────────────────────────────────────────────────────
  const card = (children: React.ReactNode, style?: React.CSSProperties) => (
    <div className="glass-panel" style={{ borderRadius: '12px', padding: '1.25rem 1.5rem', ...style }}>{children}</div>
  );
  const iconBtn = (icon: React.ReactNode, onClick: () => void, title: string, color = 'var(--text-tertiary)') => (
    <button onClick={onClick} title={title} className="btn-icon" style={{ padding: '0.35rem', color, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
      {icon}
    </button>
  );

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', flexDirection: 'column', gap: '1rem', color: 'var(--text-tertiary)' }}>
      <Loader2 size={32} className="animate-spin" />
      <div>Loading supplier…</div>
    </div>
  );

  if (error || !supplier) return (
    <div style={{ padding: '2rem', textAlign: 'center', color: '#ff4d4f' }}>
      <AlertCircle size={32} style={{ margin: '0 auto 0.5rem' }} />
      <div>{error ?? 'Supplier not found'}</div>
      <button className="btn btn-secondary" onClick={() => navigate('/supplier-ledger')} style={{ marginTop: '1rem' }}>← Back</button>
    </div>
  );

  const radialData = [
    { name: 'Paid', value: analytics.paidPct, fill: '#10b981' },
    { name: 'Outstanding', value: 100 - analytics.paidPct, fill: '#ef4444' },
  ];

  return (
    <div className="animate-fade-in" style={{ maxWidth: '980px', margin: '0 auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Back + title bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/supplier-ledger')} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}>
          <ArrowLeft size={15} /> Back
        </button>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, display: 'flex', alignItems: 'flex-start', gap: '0.5rem', lineHeight: 1.25 }}>
            <Truck size={20} style={{ color: 'var(--primary-light)', flexShrink: 0, marginTop: '0.15rem' }} />
            <span style={{ minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{supplier.name}</span>
          </h1>
        </div>
        <button className="btn btn-secondary" onClick={() => setEditMode(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}>
          <Pencil size={14} /> Edit
        </button>
        {firstPhone(supplier.phone) && (
          <a href={`tel:${firstPhone(supplier.phone)}`} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.9rem', fontSize: '0.85rem', textDecoration: 'none' }}>
            <Phone size={14} /> Call
          </a>
        )}
        {firstPhone(supplier.phone) && (
          <button onClick={handleWhatsApp} className="btn" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.9rem', fontSize: '0.85rem', background: '#25D366', color: '#fff' }}>
            <MessageCircle size={14} /> WhatsApp
          </button>
        )}
        <button className="btn btn-secondary" onClick={openAddPO} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}>
          <Package size={14} /> Add PO
        </button>
        <button className="btn btn-secondary" onClick={() => navigate(`/supplier-invoice?supplierId=${supplier.id}`)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}>
          <FileText size={14} /> New Invoice
        </button>
        <button className="btn btn-primary" onClick={openAddPayment} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}>
          <IndianRupee size={14} /> Record Payment
        </button>
      </div>

      {/* Outstanding strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
        {[
          { label: 'Total Invoiced', value: supplier.totalInvoiced ?? 0, color: '#ff9800' },
          { label: 'Total Paid', value: supplier.totalPaid ?? 0, color: 'var(--primary-light)' },
          { label: 'Outstanding', value: supplier.outstandingBalance, color: supplier.outstandingBalance > 0 ? '#ff4d4f' : 'var(--primary-light)' },
        ].map(s => (
          <div key={s.label} className="glass-panel" style={{ borderRadius: '12px', padding: '1rem 1.25rem', borderTop: `3px solid ${s.color}` }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>{s.label}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: s.color }}>{inr(s.value)}</div>
          </div>
        ))}
      </div>

      {/* Supplier Analytics */}
      {pos.length > 0 && card(
        <div>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)', margin: '0 0 1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Supplier Analytics</h3>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Radial paid % */}
            <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 140 }}>
              <div style={{ position: 'relative', width: 130, height: 130, margin: '0 auto' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart cx="50%" cy="50%" innerRadius="65%" outerRadius="90%" startAngle={90} endAngle={-270} data={radialData} barSize={14}>
                    <RadialBar dataKey="value" cornerRadius={8} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#10b981' }}>{analytics.paidPct}%</span>
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>PAID</span>
                </div>
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
                <span style={{ color: '#10b981', fontWeight: 600 }}>{inr(analytics.paid)}</span> paid · <span style={{ color: '#ef4444', fontWeight: 600 }}>{inr(supplier.outstandingBalance)}</span> due
              </div>
            </div>

            <div style={{ width: '1px', background: 'var(--surface-border)', alignSelf: 'stretch', minHeight: 80 }} />

            {/* Purchase value trend */}
            <div style={{ flex: 1, minWidth: 200, minHeight: 120 }}>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Purchase Value Trend</p>
              {analytics.trend.length > 0 ? (
                <ResponsiveContainer width="100%" height={110}>
                  <BarChart data={analytics.trend} barSize={22}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsla(0,0%,100%,0.05)" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip contentStyle={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderRadius: 8, fontSize: '0.78rem' }} formatter={(v: any) => [`₹${Number(v).toLocaleString('en-IN')}`, 'Purchases']} />
                    <Bar dataKey="value" fill="var(--primary-light)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>Not enough data for trend.</p>}
            </div>

            {/* Quick stats */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: 120 }}>
              {[
                { label: 'Total POs', value: pos.length },
                { label: 'Avg PO', value: inr(pos.length ? analytics.invoiced / pos.length : 0) },
                { label: 'Largest PO', value: inr(analytics.largest) },
                { label: 'Payments', value: payments.length },
              ].map(stat => (
                <div key={stat.label} style={{ background: 'var(--surface-raised)', borderRadius: '10px', padding: '0.5rem 0.85rem' }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{stat.label}</div>
                  <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>{stat.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Supplier info */}
      {card(
        <div>
          <div style={{ fontWeight: 700, marginBottom: '0.75rem', fontSize: '0.9rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Contact Details</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
            {supplier.address && (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                <MapPin size={15} style={{ color: 'var(--text-tertiary)', flexShrink: 0, marginTop: '0.1rem' }} />
                <span style={{ fontSize: '0.875rem' }}>{supplier.address}</span>
              </div>
            )}
            {supplier.phone && (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <Phone size={15} style={{ color: 'var(--text-tertiary)' }} />
                <span style={{ fontSize: '0.875rem' }}>{supplier.phone}</span>
              </div>
            )}
            {supplier.email && (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <Mail size={15} style={{ color: 'var(--text-tertiary)' }} />
                <span style={{ fontSize: '0.875rem' }}>{supplier.email}</span>
              </div>
            )}
            {!supplier.address && !supplier.phone && !supplier.email && (
              <span style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>No contact details — click Edit to add.</span>
            )}
          </div>
        </div>
      )}

      {/* Tabbed selector for Account Statement / Purchase Orders / Payments */}
      <div className="glass-panel" role="tablist" aria-label="Supplier records" style={{ borderRadius: '12px', padding: '0.35rem', display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
        {([
          { key: 'account', label: 'Account Statement', icon: <FileText size={15} />, count: statementRows.length },
          { key: 'purchaseOrders', label: 'Purchase Orders', icon: <Package size={15} />, count: pos.length },
          { key: 'payments', label: 'Payments Made', icon: <CreditCard size={15} />, count: payments.length },
          { key: 'invoices', label: 'Supplier Invoices', icon: <Receipt size={15} />, count: invoices.length },
        ] as const).map((t, idx, arr) => {
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => setActiveTab(t.key)}
              onKeyDown={e => {
                if (e.key === 'ArrowRight') { e.preventDefault(); setActiveTab(arr[(idx + 1) % arr.length].key); }
                else if (e.key === 'ArrowLeft') { e.preventDefault(); setActiveTab(arr[(idx - 1 + arr.length) % arr.length].key); }
              }}
              style={{
                flex: '1 1 auto', minWidth: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: '0.45rem', padding: '0.6rem 0.9rem', borderRadius: '9px', cursor: 'pointer',
                border: 'none', fontSize: '0.88rem', fontWeight: 700, transition: 'background 0.15s, color 0.15s',
                background: active ? 'var(--surface-raised)' : 'transparent',
                color: active ? 'var(--primary-light)' : 'var(--text-tertiary)',
                boxShadow: active ? 'inset 0 -2px 0 var(--primary-light)' : 'none',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--text-secondary)'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--text-tertiary)'; }}
            >
              {t.icon} {t.label}
              <span style={{ fontSize: '0.74rem', fontWeight: 600, opacity: 0.8 }}>({t.count})</span>
            </button>
          );
        })}
      </div>

      {/* Account Statement (running balance) */}
      {activeTab === 'account' && card(
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
              <span style={{ color: 'var(--primary-light)' }}><FileText size={16} /></span>
              <span style={{ fontWeight: 700, fontSize: '1rem' }}>Account Statement</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>({statementRows.length} entries)</span>
            </div>
            <button className="btn btn-secondary" onClick={printStatement} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.35rem 0.7rem', fontSize: '0.8rem' }}>
              <Printer size={13} /> Print
            </button>
          </div>
          {(
            <div style={{ marginTop: '1rem', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ color: 'var(--text-tertiary)', textAlign: 'left' }}>
                    <th style={{ padding: '0.4rem 0.5rem', fontWeight: 600, whiteSpace: 'nowrap' }}>Date</th>
                    <th style={{ padding: '0.4rem 0.5rem', fontWeight: 600 }}>Particulars</th>
                    <th style={{ padding: '0.4rem 0.5rem', fontWeight: 600, textAlign: 'right' }}>Debit (PO)</th>
                    <th style={{ padding: '0.4rem 0.5rem', fontWeight: 600, textAlign: 'right' }}>Credit (Paid)</th>
                    <th style={{ padding: '0.4rem 0.5rem', fontWeight: 600, textAlign: 'right' }}>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {statementRows.map((r, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--surface-border)' }}>
                      <td style={{ padding: '0.4rem 0.5rem', whiteSpace: 'nowrap', color: 'var(--text-tertiary)' }}>{fmtDate(r.date)}</td>
                      <td style={{ padding: '0.4rem 0.5rem' }}>{r.particulars}</td>
                      <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: '#ff9800' }}>{r.debit ? inr(r.debit) : ''}</td>
                      <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: '#10b981' }}>{r.credit ? inr(r.credit) : ''}</td>
                      <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', fontWeight: 700 }}>{inr(r.balance)}</td>
                    </tr>
                  ))}
                  {statementRows.length === 0 && (
                    <tr><td colSpan={5} style={{ padding: '0.75rem 0.5rem', color: 'var(--text-tertiary)' }}>No entries yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Purchase Orders */}
      {activeTab === 'purchaseOrders' && card(
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
              <span style={{ color: 'var(--primary-light)' }}><Package size={16} /></span>
              <span style={{ fontWeight: 700, fontSize: '1rem' }}>Purchase Orders</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>({pos.length})</span>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: '0.55rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                <input className="input-field" placeholder="Filter POs / products…" value={poSearch} onChange={e => setPoSearch(e.target.value)} style={{ paddingLeft: '1.9rem', height: '32px', fontSize: '0.8rem', width: '180px', margin: 0 }} />
              </div>
              <button className="btn btn-secondary" onClick={openAddPO} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.35rem 0.7rem', fontSize: '0.8rem' }}>
                <Plus size={13} /> Add
              </button>
            </div>
          </div>

          {(
            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {filteredPOs.length === 0 && (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', padding: '0.75rem 0' }}>
                  {pos.length === 0 ? 'No purchase orders on record. Click Add to create one.' : 'No POs match your filter.'}
                </div>
              )}
              {filteredPOs.map(po => {
                const lines = poLines(po);
                const isOpen = expanded.has(po.id);
                const sc = statusColor(po.status);
                return (
                  <div key={po.id} style={{ borderRadius: '8px', background: 'var(--surface-raised)', overflow: 'hidden', borderLeft: `3px solid ${sc}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', gap: '1rem', flexWrap: 'wrap' }}>
                      <button onClick={() => toggleExpand(po.id)} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-primary)', flex: 1, minWidth: 0, textAlign: 'left' }}>
                        <span style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{po.poNumber ?? po.id.slice(0, 8)}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.15rem', flexWrap: 'wrap' }}>
                            <CalendarDays size={12} /> {fmtDate(poDateVal(po) as any)}
                            {lines.length > 0 && <span>· {lines.length} item{lines.length > 1 ? 's' : ''}</span>}
                            {po.notes && <span style={{ opacity: 0.8 }}>· {po.notes}</span>}
                          </div>
                        </div>
                      </button>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {po.status && (
                          <span style={{ fontSize: '0.72rem', padding: '0.2rem 0.6rem', borderRadius: '999px', background: `${sc}22`, color: sc, fontWeight: 700, textTransform: 'uppercase' }}>
                            {po.status}
                          </span>
                        )}
                        <div style={{ fontWeight: 700, fontSize: '1rem' }}>{inr(poAmount(po))}</div>
                        {iconBtn(<Pencil size={14} />, () => openEditPO(po), 'Edit PO', 'var(--primary-light)')}
                        {iconBtn(<Trash2 size={14} />, () => handleDeletePO(po), 'Delete PO', '#ff4d4f')}
                      </div>
                    </div>

                    {isOpen && (
                      <div style={{ padding: '0 1rem 1rem 1rem' }}>
                        {lines.length > 0 ? (
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                              <thead>
                                <tr style={{ color: 'var(--text-tertiary)', textAlign: 'left' }}>
                                  <th style={{ padding: '0.4rem 0.5rem', fontWeight: 600 }}>Product</th>
                                  <th style={{ padding: '0.4rem 0.5rem', fontWeight: 600, textAlign: 'right' }}>Qty</th>
                                  <th style={{ padding: '0.4rem 0.5rem', fontWeight: 600 }}>Unit</th>
                                  <th style={{ padding: '0.4rem 0.5rem', fontWeight: 600, textAlign: 'right' }}>Rate</th>
                                  <th style={{ padding: '0.4rem 0.5rem', fontWeight: 600, textAlign: 'right' }}>Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {lines.map((l, i) => (
                                  <tr key={i} style={{ borderTop: '1px solid var(--surface-border)' }}>
                                    <td style={{ padding: '0.4rem 0.5rem' }}>{l.description}</td>
                                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>{l.quantity}</td>
                                    <td style={{ padding: '0.4rem 0.5rem', color: 'var(--text-tertiary)' }}>{l.unit ?? '—'}</td>
                                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>{inr(l.rate)}</td>
                                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', fontWeight: 600 }}>{inr(l.amount)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', paddingTop: '0.25rem' }}>
                            No line items recorded for this PO.{po.refNo ? ` Ref: ${po.refNo}` : ''}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Payments */}
      {activeTab === 'payments' && card(
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
              <span style={{ color: 'var(--primary-light)' }}><CreditCard size={16} /></span>
              <span style={{ fontWeight: 700, fontSize: '1rem' }}>Payments Made</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>({payments.length})</span>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: '0.55rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                <input className="input-field" placeholder="Filter payments…" value={pmtSearch} onChange={e => setPmtSearch(e.target.value)} style={{ paddingLeft: '1.9rem', height: '32px', fontSize: '0.8rem', width: '180px', margin: 0 }} />
              </div>
              <button className="btn btn-secondary" onClick={openAddPayment} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.35rem 0.7rem', fontSize: '0.8rem' }}>
                <Plus size={13} /> Add
              </button>
            </div>
          </div>

          {(
            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {filteredPmts.length === 0 && (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', padding: '0.75rem 0' }}>
                  {payments.length === 0 ? 'No payments recorded yet.' : 'No payments match your filter.'}
                </div>
              )}
              {filteredPmts.map(pmt => (
                <div key={pmt.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderRadius: '8px', background: 'var(--surface-raised)', gap: '1rem', flexWrap: 'wrap', borderLeft: '3px solid #10b981' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <CreditCard size={13} style={{ color: 'var(--primary-light)' }} /> {pmtMode(pmt)}
                      {pmtRef(pmt) && <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>· {pmtRef(pmt)}</span>}
                    </div>
                    {pmt.notes && <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.15rem' }}>{pmt.notes}</div>}
                    {pmt.attachmentUrl && (
                      <a href={pmt.attachmentUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.72rem', color: 'var(--primary-light)', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.15rem', textDecoration: 'none' }}>
                        <Paperclip size={11} /> {pmt.attachmentName || 'View proof'}
                      </a>
                    )}
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.15rem' }}>
                      <CalendarDays size={12} /> {fmtDate(pmtEffectiveDate(pmt) as any)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--primary-light)' }}>{inr(pmt.amount)}</div>
                    {iconBtn(<Pencil size={14} />, () => openEditPayment(pmt), 'Edit payment', 'var(--primary-light)')}
                    {iconBtn(<Trash2 size={14} />, () => handleDeletePayment(pmt), 'Delete payment', '#ff4d4f')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Supplier Purchase Invoices */}
      {activeTab === 'invoices' && card(
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
              <span style={{ color: 'var(--primary-light)' }}><Receipt size={16} /></span>
              <span style={{ fontWeight: 700, fontSize: '1rem' }}>Supplier Invoices</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>({invoices.length})</span>
            </div>
            <button className="btn btn-secondary" onClick={() => navigate(`/supplier-invoice?supplierId=${supplier.id}`)} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.35rem 0.7rem', fontSize: '0.8rem' }}>
              <Plus size={13} /> New Invoice
            </button>
          </div>

          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {invoices.length === 0 && (
              <div style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', padding: '0.75rem 0' }}>
                No supplier invoices yet. Click “New Invoice” to create one.
              </div>
            )}
            {invoices.map(inv => (
              <div key={inv.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderRadius: '8px', background: 'var(--surface-raised)', gap: '1rem', flexWrap: 'wrap', borderLeft: '3px solid #8b5cf6' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <Receipt size={13} style={{ color: 'var(--primary-light)' }} />
                    {inv.internalPurchaseId || inv.id.slice(0, 8)}
                    {inv.supplierInvoiceNumber && <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>· Bill {inv.supplierInvoiceNumber}</span>}
                    <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.5rem', borderRadius: '999px', background: inv.taxMode === 'gst' ? '#8b5cf622' : 'var(--surface-border)', color: inv.taxMode === 'gst' ? '#8b5cf6' : 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase' }}>
                      {inv.taxMode === 'gst' ? 'GST' : 'Bill of Supply'}
                    </span>
                    {inv.status && <span style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>· {inv.status}</span>}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '0.8rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><CalendarDays size={12} /> {inv.invoiceDate ? fmtDate(inv.invoiceDate) : '—'}</span>
                    {inv.updatedAt && <span>Updated {fmtDate(inv.updatedAt)}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--secondary)' }}>₹{Number(inv.netAmount || 0).toLocaleString('en-IN')}</div>
                  <button className="btn btn-secondary" onClick={() => navigate(`/supplier-invoice?supplierId=${supplier.id}&invoiceId=${inv.id}`)} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.35rem 0.7rem', fontSize: '0.78rem' }}>
                    <Pencil size={13} /> View / Edit
                  </button>
                  {iconBtn(<Trash2 size={14} />, () => setInvToDelete(inv), 'Delete invoice', '#ff4d4f')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Follow-up Tasks */}
      {card(
        <div>
          <button onClick={() => setTasksOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', width: '100%', padding: 0, color: 'var(--text-primary)' }}>
            <span style={{ color: 'var(--primary-light)' }}><CheckSquare size={16} /></span>
            <span style={{ fontWeight: 700, fontSize: '1rem' }}>Follow-up Tasks</span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>({tasks.filter(t => t.status !== 'done').length} open)</span>
            <span style={{ marginLeft: 'auto', color: 'var(--text-tertiary)' }}>{tasksOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
          </button>
          {tasksOpen && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <input className="input-field" placeholder="e.g. Pay ₹1,00,000 by month-end" value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} style={{ flex: '1 1 240px', margin: 0 }} />
                <input className="input-field" type="date" value={newTaskDue} onChange={e => setNewTaskDue(e.target.value)} title="Due date" style={{ width: '160px', margin: 0 }} />
                <button className="btn btn-primary" onClick={handleAddTask} disabled={taskSaving || !newTaskTitle.trim()} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
                  {taskSaving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {tasks.length === 0 && <div style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>No follow-up tasks.</div>}
                {tasks.map(t => {
                  const done = t.status === 'done';
                  const overdue = !done && t.dueDate && new Date(t.dueDate) < new Date(today());
                  return (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.65rem 1rem', borderRadius: '8px', background: 'var(--surface-raised)' }}>
                      <button onClick={() => toggleTask(t)} title={done ? 'Mark open' : 'Mark done'} style={{ background: 'none', border: 'none', cursor: 'pointer', color: done ? '#10b981' : 'var(--text-tertiary)', display: 'flex', padding: 0 }}>
                        {done ? <CheckSquare size={18} /> : <Square size={18} />}
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.88rem', fontWeight: 500, textDecoration: done ? 'line-through' : 'none', color: done ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>{t.title}</div>
                        {t.dueDate && (
                          <div style={{ fontSize: '0.72rem', color: overdue ? '#ff4d4f' : 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.1rem' }}>
                            <CalendarDays size={11} /> Due {fmtDate(t.dueDate)}{overdue ? ' · overdue' : ''}
                          </div>
                        )}
                      </div>
                      {iconBtn(<Trash2 size={14} />, () => deleteTask(t), 'Delete task', '#ff4d4f')}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Comments */}
      {card(
        <div>
          <button onClick={() => setCmtsOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', width: '100%', padding: 0, color: 'var(--text-primary)' }}>
            <span style={{ color: 'var(--primary-light)' }}><MessageSquare size={16} /></span>
            <span style={{ fontWeight: 700, fontSize: '1rem' }}>Notes & Comments</span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>({comments.length})</span>
            <span style={{ marginLeft: 'auto', color: 'var(--text-tertiary)' }}>{cmtsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
          </button>
          {cmtsOpen && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <textarea
                    className="input-field"
                    placeholder="Add a note, remark or follow-up… (or tap the mic to dictate)"
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    rows={2}
                    style={{ width: '100%', resize: 'vertical', minHeight: '60px', paddingRight: '3rem' }}
                  />
                  <button
                    type="button"
                    onClick={toggleListen}
                    title="Voice typing"
                    style={{
                      position: 'absolute', right: '0.6rem', bottom: '0.6rem',
                      background: isListening ? '#ff4d4f' : 'var(--surface-raised)',
                      color: isListening ? '#fff' : 'var(--text-tertiary)',
                      border: 'none', borderRadius: '50%', width: '34px', height: '34px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                      boxShadow: isListening ? '0 0 10px #ff4d4f' : 'none',
                    }}
                  >
                    <Mic size={16} className={isListening ? 'animate-pulse' : ''} />
                  </button>
                </div>
                <button className="btn btn-primary" onClick={handleAddComment} disabled={cmtSaving || !newComment.trim()} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', alignSelf: 'flex-end', padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
                  {cmtSaving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {comments.length === 0 && <div style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>No notes yet.</div>}
                {comments.map(c => (
                  <div key={c.id} style={{ padding: '0.75rem 1rem', borderRadius: '8px', background: 'var(--surface-raised)', borderLeft: '3px solid var(--primary-light)' }}>
                    <div style={{ fontSize: '0.875rem' }}>{c.text}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '0.3rem' }}>
                      {c.author} · {c.createdAt ? fmtDate(c.createdAt) : '—'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit Supplier Modal — shared dual-mode form, mounted only when open */}
      {editMode && supplier && (
        <SupplierFormModal
          mode="edit"
          supplierId={supplier.id}
          initial={supplier}
          onClose={() => setEditMode(false)}
          onSaved={() => { setEditMode(false); load(true); }}
        />
      )}

      {/* Add / Edit PO Modal — shared PurchaseOrderModal, mounted only when open */}
      {poEditing !== undefined && supplier && (
        <PurchaseOrderModal
          supplierName={supplier.name}
          editing={poEditing}
          onClose={() => setPoEditing(undefined)}
          onSaved={() => { setPoEditing(undefined); load(true); }}
        />
      )}

      {/* Add / Edit Payment Modal — shared PaymentModal, mounted only when open */}
      {pmtEditing !== undefined && supplier && (
        <PaymentModal
          supplierId={supplier.id}
          supplierName={supplier.name}
          outstandingBalance={supplier.outstandingBalance}
          editing={pmtEditing}
          onClose={() => setPmtEditing(undefined)}
          onSaved={() => { setPmtEditing(undefined); load(true); }}
        />
      )}

      {/* Delete Supplier Invoice confirmation */}
      {invToDelete && (
        <div className="modal-overlay animate-fade-in" style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', background: 'hsla(220, 30%, 4%, 0.72)', backdropFilter: 'blur(4px)' }}>
          <div className="glass-panel animate-slide-up" style={{ width: '100%', maxWidth: '440px', padding: '1.75rem', position: 'relative', borderRadius: '16px' }}>
            <button onClick={() => !deletingInv && setInvToDelete(null)} className="btn-icon" aria-label="Close" style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}><X size={20} /></button>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ff4d4f' }}>
              <AlertCircle size={20} /> Delete Supplier Invoice?
            </h2>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: 1.7 }}>
              <div>Invoice No: <strong style={{ color: 'var(--text-primary)' }}>{invToDelete.supplierInvoiceNumber || '—'}</strong></div>
              <div>Internal Purchase ID: <strong style={{ color: 'var(--text-primary)' }}>{invToDelete.internalPurchaseId || '—'}</strong></div>
              <div>Amount: <strong style={{ color: 'var(--secondary)' }}>₹{Number(invToDelete.netAmount || 0).toLocaleString('en-IN')}</strong></div>
            </div>
            <div style={{ padding: '0.7rem 0.85rem', background: 'hsla(0,100%,50%,0.1)', color: '#ff4d4f', borderRadius: '8px', fontSize: '0.82rem', marginBottom: '1.25rem' }}>
              This will permanently delete this supplier invoice. This action cannot be undone.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button className="btn btn-secondary" onClick={() => setInvToDelete(null)} disabled={deletingInv}>Cancel</button>
              <button className="btn" onClick={() => handleDeleteInvoice(invToDelete)} disabled={deletingInv} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#ff4d4f', color: '#fff', border: 'none' }}>
                {deletingInv ? <><Loader2 size={15} className="animate-spin" /> Deleting…</> : <><Trash2 size={15} /> Delete Invoice</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
