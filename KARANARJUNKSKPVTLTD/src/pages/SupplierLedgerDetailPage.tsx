import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Phone, Mail, MapPin, Pencil, CheckCircle2,
  X, Loader2, AlertCircle, IndianRupee, Package, ChevronDown, ChevronRight,
  MessageSquare, Plus, Truck, CreditCard, CalendarDays, Trash2, Search,
  MessageCircle, Mic, Printer, CheckSquare, FileText, Square, Receipt, Paperclip,
  Download, Tag, Edit2, Bell,
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
import { logAudit } from '../utils/auditLog';
import { softDelete } from '../utils/softDelete';
import SupplierFormModal, { type SupplierLike } from '../components/SupplierFormModal';
import PurchaseOrderModal, { type POForEdit } from '../components/PurchaseOrderModal';
import PaymentModal, { type PaymentForEdit, type ApplicableDoc } from '../components/PaymentModal';
import { generatePurchaseOrderPDF } from '../utils/purchaseOrderPDF';
import { fetchInvoiceBranding } from '../services/invoiceTemplateService';
import { downloadPaymentReceiptPDF, downloadSupplierStatementPDF } from '../utils/invoiceEngine';
import type { InvoiceTemplateBranding } from '../types/invoiceTemplate';

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
  bankDetails?: {
    holderName?: string;
    beneficiaryName?: string;
    payerAccountNumber?: string;
    beneficiaryAccountNumber?: string;
    ifscCode?: string;
    cbsTransactionId?: string;
    statusRemark?: string;
  };
  notes?: string;
  linkedOrderIds?: string[];
  unallocatedAmount?: number;
  linkedInvoiceId?: string;
  linkedInvoiceNumber?: string;
  linkedInvoiceType?: 'po' | 'invoice';
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

/** One item in a supplier-specific price list. */
interface PriceListItem {
  id: string;
  productName: string;
  productId?: string;
  packaging: string;
  purchaseRate: number;
  gstPct: number;
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

type ReminderSchedule = 'same_day' | '1_day_before' | '3_days_before' | '5_days_before' | '7_days_before' | 'custom';

interface PaymentReminder {
  id: string;
  supplierId: string;
  supplierName: string;
  commitmentDate: string;
  reminderDate: string;
  reminderSchedule?: ReminderSchedule;
  amount: number;
  title: string;
  notes?: string;
  status: 'open' | 'completed';
  lockedByPayment?: boolean;
  notifyVia?: string[];
  createdAt?: Timestamp;
  createdBy?: string;
  updatedAt?: Timestamp;
}

const today = () => new Date().toISOString().slice(0, 10);

const REMINDER_SCHEDULE_OPTIONS: { value: ReminderSchedule; label: string }[] = [
  { value: 'same_day',     label: 'Same Day as Commitment' },
  { value: '1_day_before', label: '1 Day Before' },
  { value: '3_days_before', label: '3 Days Before' },
  { value: '5_days_before', label: '5 Days Before' },
  { value: '7_days_before', label: '7 Days Before' },
  { value: 'custom',       label: 'Custom Date' },
];

const SCHEDULE_OFFSETS: Record<string, number> = {
  same_day: 0,
  '1_day_before': -1,
  '3_days_before': -3,
  '5_days_before': -5,
  '7_days_before': -7,
};

function computeReminderDate(commitmentDate: string, schedule: string, customDate: string): string {
  if (!commitmentDate) return customDate;
  if (schedule === 'custom') return customDate;
  const d = new Date(commitmentDate);
  d.setDate(d.getDate() + (SCHEDULE_OFFSETS[schedule] ?? 0));
  return d.toISOString().slice(0, 10);
}

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
const pmtDateStr = (p: Payment): string | undefined => {
  const v = pmtEffectiveDate(p);
  if (!v) return undefined;
  if (typeof v === 'string') return v;
  if (typeof (v as any).toMillis === 'function') {
    const ms = (v as any).toMillis();
    if (!isNaN(ms)) return new Date(ms).toISOString().slice(0, 10);
  }
  return undefined;
};

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
  const { tenantId, currentUser, userName, userRole } = useAuth();

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [pos, setPOs] = useState<PO[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Supplier edit — handled by the shared SupplierFormModal in edit mode
  const [editMode, setEditMode] = useState(false);

  // Account Statement / Purchase Orders / Payments / Supplier Invoices / Price List / Reminders — single tabbed view.
  const [activeTab, setActiveTab] = useState<'account' | 'purchaseOrders' | 'payments' | 'invoices' | 'priceList' | 'reminders' | 'tasks' | 'notes'>('account');
  const [stmtDir, setStmtDir] = useState<'asc' | 'desc'>('desc'); // newest first by default

  // Supplier Purchase Invoices (read-only list; created/edited via SupplierInvoicePage).
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([]);
  const [invToDelete, setInvToDelete] = useState<SupplierInvoice | null>(null);
  const [deletingInv, setDeletingInv] = useState(false);

  // Filters
  const [poSearch, setPoSearch] = useState('');
  const [pmtSearch, setPmtSearch] = useState('');
  const [invSearch, setInvSearch] = useState('');

  // Expanded PO rows
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // PO modal (add/edit) — handled by the shared PurchaseOrderModal.
  // undefined = closed, null = add, PO = edit.
  const [poEditing, setPoEditing] = useState<POForEdit | null | undefined>(undefined);

  // Payment modal (add/edit) — handled by the shared PaymentModal.
  // undefined = closed, null = add, Payment = edit.
  const [pmtEditing, setPmtEditing] = useState<PaymentForEdit | null | undefined>(undefined);

  // Invoice branding — fetched lazily on first PDF/WhatsApp action, then cached.
  const [branding, setBranding] = useState<InvoiceTemplateBranding | null>(null);

  // Comments + voice
  const [newComment, setNewComment] = useState('');
  const [cmtSaving, setCmtSaving] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [cmtToDelete, setCmtToDelete] = useState<Comment | null>(null);
  const [deletingCmt, setDeletingCmt] = useState(false);

  // Tasks
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDue, setNewTaskDue] = useState('');
  const [taskSaving, setTaskSaving] = useState(false);

  // Price List
  const [priceList, setPriceList] = useState<PriceListItem[]>([]);
  const [plLoading, setPlLoading] = useState(false);
  const [plEditId, setPlEditId] = useState<string | null>(null);
  const [plForm, setPlForm] = useState<{ productName: string; packaging: string; purchaseRate: string; gstPct: string } | null>(null);
  const [plSaving, setPlSaving] = useState(false);

  // Payment Reminders
  const [reminders, setReminders] = useState<PaymentReminder[]>([]);
  const [remLoading, setRemLoading] = useState(false);
  const [remEditId, setRemEditId] = useState<string | null>(null);
  const [remForm, setRemForm] = useState<{
    commitmentDate: string;
    reminderSchedule: string;
    reminderDate: string;
    amount: string;
    title: string;
    notes: string;
  } | null>(null);
  const [remSaving, setRemSaving] = useState(false);
  const [highlightedReminderId, setHighlightedReminderId] = useState<string | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);
  const [searchParams] = useSearchParams();

  // Reminder-to-payment flow
  const [reminderToComplete, setReminderToComplete] = useState<PaymentReminder | null>(null);
  const [pmtFromReminder, setPmtFromReminder] = useState<{ reminderId: string; amount: number } | null>(null);

  const load = useCallback(async (persist = false) => {
    if (!tenantId || !id) return;
    setLoading(true); setError(null);
    try {
      const supSnap = await getDoc(getTenantDoc(db, tenantId, 'suppliers', id));
      if (!supSnap.exists()) { setError('Supplier not found'); setLoading(false); return; }
      const sup = { id: supSnap.id, outstandingBalance: 0, ...supSnap.data() } as Supplier;

      // Purchase Orders and Payments were historically joined to a supplier by
      // the mutable `supplierName` string rather than the stable doc id, so
      // renaming a supplier silently orphaned their POs/payments from view
      // (the records were never deleted — just no longer matched). Query by
      // BOTH supplierId and the current name and merge, so nothing disappears
      // on a rename; the opportunistic backfill below heals it permanently.
      const [posByIdSnap, posByNameSnap, pmtsByIdSnap, pmtsByNameSnap, cmtsSnap, tasksSnap, invSnap] = await Promise.all([
        getDocs(query(getTenantCollection(db, tenantId, 'purchaseOrders'), where('supplierId', '==', id))),
        getDocs(query(getTenantCollection(db, tenantId, 'purchaseOrders'), where('supplierName', '==', sup.name))),
        getDocs(query(getTenantCollection(db, tenantId, 'supplierPayments'), where('supplierId', '==', id))),
        getDocs(query(getTenantCollection(db, tenantId, 'supplierPayments'), where('supplierName', '==', sup.name))),
        getDocs(query(getTenantCollection(db, tenantId, 'supplierComments'), where('supplierId', '==', id))),
        getDocs(query(getTenantCollection(db, tenantId, 'supplierTasks'), where('supplierId', '==', id))),
        getDocs(query(getTenantCollection(db, tenantId, 'supplierInvoices'), where('supplierId', '==', id))),
      ]);

      const posDocsMap = new Map<string, PO>();
      posByIdSnap.docs.forEach(d => posDocsMap.set(d.id, { id: d.id, ...d.data() } as PO));
      posByNameSnap.docs.forEach(d => {
        if (!posDocsMap.has(d.id)) posDocsMap.set(d.id, { id: d.id, ...d.data() } as PO);
        if (!(d.data() as any).supplierId) {
          updateDoc(getTenantDoc(db, tenantId, 'purchaseOrders', d.id), { supplierId: id }).catch(() => {});
        }
      });
      const pmtDocsMap = new Map<string, Payment>();
      pmtsByIdSnap.docs.forEach(d => pmtDocsMap.set(d.id, { id: d.id, ...d.data() } as Payment));
      pmtsByNameSnap.docs.forEach(d => {
        if (!pmtDocsMap.has(d.id)) pmtDocsMap.set(d.id, { id: d.id, ...d.data() } as Payment);
        if (!(d.data() as any).supplierId) {
          updateDoc(getTenantDoc(db, tenantId, 'supplierPayments', d.id), { supplierId: id }).catch(() => {});
        }
      });

      const posList = Array.from(posDocsMap.values())
        .filter((p: any) => !p.deleted)
        .sort((a, b) => sortVal(poDateVal(b)) - sortVal(poDateVal(a)));
      const pmtsList = Array.from(pmtDocsMap.values())
        .filter((p: any) => !p.deleted)
        .sort((a, b) => sortVal(pmtEffectiveDate(b)) - sortVal(pmtEffectiveDate(a)));
      const cmtsList = cmtsSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as Comment))
        .sort((a, b) => sortVal(b.createdAt) - sortVal(a.createdAt));
      const tasksList = tasksSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as Task))
        .sort((a, b) => (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0) || sortVal(b.createdAt) - sortVal(a.createdAt));
      const invList = invSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as SupplierInvoice))
        .filter((inv: any) => !inv.deleted)
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

  // Parse URL query params to auto-navigate to reminders tab and highlight a specific reminder
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'reminders') setActiveTab('reminders');
    const remId = searchParams.get('reminderId');
    if (remId) setHighlightedReminderId(remId);
  }, [searchParams]);

  // Lock body scroll while any inline portal modal is open (PO/Payment modals handle their own lock)
  useEffect(() => {
    const isOpen = !!remForm || !!invToDelete || !!reminderToComplete || !!cmtToDelete;
    if (isOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [remForm, invToDelete, reminderToComplete, cmtToDelete]);

  // Scroll highlighted reminder into view once reminders are loaded
  useEffect(() => {
    if (highlightedReminderId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightedReminderId, reminders]);

  // Load reminders whenever the Reminders tab becomes active
  useEffect(() => {
    if (activeTab !== 'reminders' || !tenantId || !id) return;
    let cancelled = false;
    setRemLoading(true);
    getDocs(query(getTenantCollection(db, tenantId, 'supplierPaymentReminders'), where('supplierId', '==', id)))
      .then(snap => {
        if (cancelled) return;
        const list = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as PaymentReminder))
          .sort((a, b) => a.reminderDate.localeCompare(b.reminderDate));
        setReminders(list);
      })
      .catch(console.error)
      .finally(() => { if (!cancelled) setRemLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, tenantId, id]);

  // Load price list whenever the Price List tab becomes active
  useEffect(() => {
    if (activeTab !== 'priceList' || !tenantId || !id) return;
    let cancelled = false;
    setPlLoading(true);
    getDocs(getTenantCollection(db, tenantId, 'suppliers', id, 'priceList'))
      .then(snap => {
        if (cancelled) return;
        setPriceList(snap.docs.map(d => ({ id: d.id, ...d.data() } as PriceListItem))
          .sort((a, b) => a.productName.localeCompare(b.productName)));
      })
      .catch(console.error)
      .finally(() => { if (!cancelled) setPlLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, tenantId, id]);

  const handleSavePriceListItem = async () => {
    if (!plForm || !tenantId || !id) return;
    if (!plForm.productName.trim()) return;
    setPlSaving(true);
    try {
      const data = {
        productName: plForm.productName.trim(),
        packaging: plForm.packaging.trim(),
        purchaseRate: parseFloat(plForm.purchaseRate) || 0,
        gstPct: parseFloat(plForm.gstPct) || 0,
        updatedAt: serverTimestamp(),
      };
      if (plEditId) {
        await updateDoc(getTenantDoc(db, tenantId, 'suppliers', id, 'priceList', plEditId), data);
        setPriceList(prev => prev.map(p => p.id === plEditId ? { ...p, ...data } : p));
      } else {
        const ref = await addDoc(getTenantCollection(db, tenantId, 'suppliers', id, 'priceList'), { ...data, createdAt: serverTimestamp() });
        setPriceList(prev => [...prev, { id: ref.id, ...data } as PriceListItem]
          .sort((a, b) => a.productName.localeCompare(b.productName)));
      }
      setPlForm(null);
      setPlEditId(null);
    } catch (e) { console.error(e); }
    finally { setPlSaving(false); }
  };

  const handleDeletePriceListItem = async (item: PriceListItem) => {
    if (!window.confirm(`Remove "${item.productName}" from this supplier's price list?`)) return;
    if (!tenantId || !id) return;
    await deleteDoc(getTenantDoc(db, tenantId, 'suppliers', id, 'priceList', item.id));
    setPriceList(prev => prev.filter(p => p.id !== item.id));
  };

  // ── Payment Reminders ──────────────────────────────────────────────────────
  const getReminderDisplayStatus = (r: PaymentReminder): 'upcoming' | 'completed' | 'overdue' => {
    if (r.status === 'completed') return 'completed';
    return r.reminderDate < today() ? 'overdue' : 'upcoming';
  };

  const handleSaveReminder = async () => {
    if (!remForm || !tenantId || !id || !supplier) return;
    if (!remForm.commitmentDate || !remForm.title.trim()) return;
    const computedReminderDate = computeReminderDate(remForm.commitmentDate, remForm.reminderSchedule, remForm.reminderDate);
    if (!computedReminderDate) return;
    setRemSaving(true);
    try {
      const localFields = {
        commitmentDate: remForm.commitmentDate,
        reminderDate: computedReminderDate,
        reminderSchedule: remForm.reminderSchedule as ReminderSchedule,
        amount: parseFloat(remForm.amount) || 0,
        title: remForm.title.trim(),
        notes: remForm.notes.trim(),
      };
      if (remEditId) {
        await updateDoc(getTenantDoc(db, tenantId, 'supplierPaymentReminders', remEditId), { ...localFields, updatedAt: serverTimestamp() });
        setReminders(prev => prev.map(r => r.id === remEditId ? { ...r, ...localFields } : r)
          .sort((a, b) => a.reminderDate.localeCompare(b.reminderDate)));
      } else {
        const ref = await addDoc(getTenantCollection(db, tenantId, 'supplierPaymentReminders'), {
          ...localFields,
          supplierId: id,
          supplierName: supplier.name,
          status: 'open' as const,
          notifyVia: [] as string[],
          createdAt: serverTimestamp(),
          createdBy: currentUser?.email ?? '',
        });
        const newRem: PaymentReminder = { id: ref.id, supplierId: id, supplierName: supplier.name, status: 'open', notifyVia: [], ...localFields };
        setReminders(prev => [...prev, newRem].sort((a, b) => a.reminderDate.localeCompare(b.reminderDate)));
      }
      logAudit({ db, tenantId: tenantId!, userId: currentUser?.uid || '', userName: userName || currentUser?.email || 'Unknown', userRole: userRole || 'unknown', module: 'Supplier Ledger', action: remEditId ? 'Update' : 'Create', entityName: remForm.title, entityId: remEditId || undefined, description: `Payment reminder ${remEditId ? 'updated' : 'created'} for ${supplier?.name} · ₹${remForm.amount} · due ${remForm.commitmentDate}` });
      setRemForm(null);
      setRemEditId(null);
    } catch (e) { console.error(e); }
    finally { setRemSaving(false); }
  };

  const markReminderStatus = async (reminderId: string, status: 'open' | 'completed', lockedByPayment?: boolean) => {
    if (!tenantId) return;
    const patch: Record<string, unknown> = { status, updatedAt: serverTimestamp() };
    if (lockedByPayment !== undefined) patch.lockedByPayment = lockedByPayment;
    await updateDoc(getTenantDoc(db, tenantId, 'supplierPaymentReminders', reminderId), patch);
    logAudit({ db, tenantId: tenantId!, userId: currentUser?.uid || '', userName: userName || currentUser?.email || 'Unknown', userRole: userRole || 'unknown', module: 'Supplier Ledger', action: 'Status Change', entityName: supplier?.name || id || '', entityId: reminderId, description: `Payment reminder marked ${status}`, after: { status } });
    setReminders(prev => prev.map(r =>
      r.id === reminderId
        ? { ...r, status, ...(lockedByPayment !== undefined ? { lockedByPayment } : {}) }
        : r
    ));
  };

  const handleReminderToggle = (r: PaymentReminder) => {
    if (r.status === 'completed') {
      if (r.lockedByPayment) {
        alert('This reminder was completed by recording a payment.\nTo reopen it, delete the linked payment first — this keeps financial totals accurate.');
        return;
      }
      void markReminderStatus(r.id, 'open');
    } else {
      setReminderToComplete(r);
    }
  };

  const handleDeleteReminder = async (r: PaymentReminder) => {
    if (!tenantId || !window.confirm(`Delete reminder "${r.title}"? This cannot be undone.`)) return;
    await deleteDoc(getTenantDoc(db, tenantId, 'supplierPaymentReminders', r.id));
    logAudit({ db, tenantId: tenantId!, userId: currentUser?.uid || '', userName: userName || currentUser?.email || 'Unknown', userRole: userRole || 'unknown', module: 'Supplier Ledger', action: 'Delete', entityName: r.title, entityId: r.id, description: `Payment reminder deleted for ${supplier?.name}` });
    setReminders(prev => prev.filter(rem => rem.id !== r.id));
  };

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
    if (!window.confirm(`Delete PO ${po.poNumber ?? ''} (${inr(poAmount(po))})? It will be moved to trash and recoverable for 30 days.`)) return;
    try {
      await softDelete({
        db, tenantId: tenantId!,
        collectionName: 'purchaseOrders',
        docId: po.id,
        userId: currentUser?.uid || '',
        userName: userName || currentUser?.email || 'Unknown',
        userRole: userRole || 'unknown',
        module: 'Purchase Orders',
        entityName: po.poNumber ?? po.id,
      });
      await load(true);
    }
    catch (e: any) { alert(e.message); }
  };

  const handleDownloadPOPDF = (po: PO) => {
    if (!supplier) return;
    generatePurchaseOrderPDF({
      poNumber: po.poNumber,
      internalId: po.id,
      date: fmtDate(poDateVal(po) as any),
      status: po.status,
      notes: po.notes,
      supplierName: supplier.name,
      supplierAddress: supplier.address,
      supplierPhone: supplier.phone,
      supplierEmail: supplier.email,
      lines: poLines(po),
      totalAmount: poAmount(po),
    });
  };

  // ── Payment add/edit ───────────────────────────────────────────────────────
  // Open/edit/save handled by the shared PaymentModal; recompute via load(true).
  const openAddPayment = () => setPmtEditing(null);
  const openEditPayment = (pmt: Payment) => setPmtEditing(pmt as PaymentForEdit);

  const handleDeletePayment = async (pmt: Payment) => {
    if (!tenantId) return;
    if (!window.confirm(`Delete payment of ${inr(pmt.amount)} (${fmtDate(pmt.date)})? It will be moved to trash and recoverable for 30 days.`)) return;
    try {
      await softDelete({
        db, tenantId: tenantId!,
        collectionName: 'supplierPayments',
        docId: pmt.id,
        userId: currentUser?.uid || '',
        userName: userName || currentUser?.email || 'Unknown',
        userRole: userRole || 'unknown',
        module: 'Supplier Ledger',
        entityName: `Payment ${inr(pmt.amount)} · ${supplier?.name ?? ''}`,
      });
      await load(true);
    }
    catch (e: any) { alert(e.message); }
  };

  // ── Supplier Invoice delete (confirmation modal → softDelete → reload) ────────
  const handleDeleteInvoice = async (inv: SupplierInvoice) => {
    if (!tenantId) return;
    setDeletingInv(true);
    try {
      await softDelete({
        db, tenantId: tenantId!,
        collectionName: 'supplierInvoices',
        docId: inv.id,
        userId: currentUser?.uid || '',
        userName: userName || currentUser?.email || 'Unknown',
        userRole: userRole || 'unknown',
        module: 'Supplier Ledger',
        entityName: (inv as any).invoiceNumber || `Supplier Invoice · ${supplier?.name ?? ''}`,
      });
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

  const handleDeleteComment = async (cmt: Comment) => {
    if (!tenantId) return;
    setDeletingCmt(true);
    try {
      await deleteDoc(getTenantDoc(db, tenantId, 'supplierComments', cmt.id));
      setComments(prev => prev.filter(c => c.id !== cmt.id));
      setCmtToDelete(null);
    } catch (e: any) { alert(e.message); }
    finally { setDeletingCmt(false); }
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

  const filteredInvoices = useMemo(() => {
    const q = invSearch.trim().toLowerCase();
    if (!q) return invoices;
    return invoices.filter(inv =>
      (inv.internalPurchaseId ?? '').toLowerCase().includes(q) ||
      (inv.supplierInvoiceNumber ?? '').toLowerCase().includes(q) ||
      (inv.invoiceDate ?? '').toLowerCase().includes(q) ||
      (inv.status ?? '').toLowerCase().includes(q) ||
      (inv.taxMode ?? '').toLowerCase().includes(q) ||
      String(inv.netAmount ?? '').includes(q) ||
      // Match on what was actually bought — product name, company or batch.
      (Array.isArray((inv as any).lines) ? (inv as any).lines.some((l: any) =>
        (l?.description ?? '').toLowerCase().includes(q) ||
        (l?.mfgCompany ?? '').toLowerCase().includes(q) ||
        (l?.batchNo ?? '').toLowerCase().includes(q)
      ) : false)
    );
  }, [invoices, invSearch]);

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
    // Always accumulate balance oldest → newest (chronological is the only correct direction).
    const entries = [
      ...pos.map(po => ({ date: poDateVal(po), particulars: `PO ${po.poNumber ?? po.id.slice(0, 6)}${po.notes ? ' — ' + po.notes : ''}`, debit: poAmount(po), credit: 0 })),
      ...invoices.map(inv => ({ date: (inv.invoiceDate ?? inv.createdAt) as any, particulars: `Invoice ${inv.supplierInvoiceNumber || inv.internalPurchaseId || inv.id.slice(0, 6)}`, debit: Number(inv.netAmount) || 0, credit: 0 })),
      ...payments.map(p => ({ date: pmtEffectiveDate(p) as any, particulars: `Payment · ${pmtMode(p)}${pmtRef(p) ? ' ' + pmtRef(p) : ''}${p.linkedInvoiceNumber ? ' → ' + p.linkedInvoiceNumber : ''}`, debit: 0, credit: Number(p.amount) || 0 })),
    ].sort((a, b) => sortVal(a.date) - sortVal(b.date));
    let bal = 0;
    return entries.map(e => { bal += e.debit - e.credit; return { ...e, balance: bal }; });
  }, [pos, invoices, payments]);

  const displayedStatementRows = useMemo(
    () => stmtDir === 'desc' ? [...statementRows].reverse() : statementRows,
    [statementRows, stmtDir],
  );

  // Purchase Orders + Supplier Invoices a payment can optionally be tagged against.
  const applicableDocs = useMemo<ApplicableDoc[]>(() => [
    ...pos.map(po => ({ id: po.id, type: 'po' as const, label: `PO ${po.poNumber ?? po.id.slice(0, 6)}`, amount: poAmount(po) })),
    ...invoices.map(inv => ({ id: inv.id, type: 'invoice' as const, label: inv.supplierInvoiceNumber || inv.internalPurchaseId || inv.id.slice(0, 8), amount: Number(inv.netAmount) || 0 })),
  ], [pos, invoices]);

  const getBranding = async (): Promise<InvoiceTemplateBranding> => {
    if (branding) return branding;
    if (!tenantId) return { businessName: '', address: '' };
    const b = await fetchInvoiceBranding(tenantId);
    setBranding(b);
    return b;
  };

  const handleDownloadReceipt = async (pmt: Payment) => {
    if (!supplier) return;
    const b = await getBranding();
    downloadPaymentReceiptPDF(b, {
      paymentId: pmt.paymentId,
      amount: pmt.amount,
      paymentDate: pmtDateStr(pmt),
      paymentMethod: pmtMode(pmt),
      accountDetails: { accountName: pmt.accountDetails?.accountName || '', transactionRef: pmtRef(pmt) },
      bankDetails: pmt.bankDetails,
      notes: pmt.notes,
      linkedInvoiceNumber: pmt.linkedInvoiceNumber,
    }, supplier);
  };

  const handleWhatsAppReceipt = async (pmt: Payment) => {
    if (!supplier) return;
    const phone = firstPhone(supplier.phone);
    if (!phone) { alert('No phone number on file for this supplier.'); return; }
    await handleDownloadReceipt(pmt);
    const msg = encodeURIComponent(
      `Payment Receipt\n\n` +
      `To: ${supplier.name}\n` +
      `Receipt No: ${pmt.paymentId || '—'}\n` +
      `Date: ${fmtDate(pmtEffectiveDate(pmt) as any)}\n` +
      `Amount: Rs. ${Number(pmt.amount || 0).toLocaleString('en-IN')}\n` +
      `Method: ${pmtMode(pmt)}${pmtRef(pmt) ? ' · ' + pmtRef(pmt) : ''}\n` +
      (pmt.linkedInvoiceNumber ? `Against: ${pmt.linkedInvoiceNumber}\n` : '') +
      `\nPlease find the receipt PDF attached (just downloaded).`
    );
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
  };

  const handleDownloadStatement = async () => {
    if (!supplier) return;
    const b = await getBranding();
    downloadSupplierStatementPDF(b, supplier, statementRows, (v: any) => fmtDate(v));
  };

  const handleWhatsAppStatement = async () => {
    if (!supplier) return;
    const phone = firstPhone(supplier.phone);
    if (!phone) { alert('No phone number on file for this supplier.'); return; }
    await handleDownloadStatement();
    const msg = encodeURIComponent(
      `Statement of Account\n\n` +
      `Party: ${supplier.name}\n` +
      `Total Invoiced: Rs. ${(supplier.totalInvoiced ?? 0).toLocaleString('en-IN')}\n` +
      `Total Paid: Rs. ${(supplier.totalPaid ?? 0).toLocaleString('en-IN')}\n` +
      `Outstanding: Rs. ${supplier.outstandingBalance.toLocaleString('en-IN')}\n\n` +
      `Please find the statement PDF attached (just downloaded).`
    );
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
  };

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
    <>
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
        <button className="btn btn-secondary" onClick={() => { setActiveTab('reminders'); setRemEditId(null); setRemForm({ commitmentDate: '', reminderSchedule: '1_day_before', reminderDate: '', amount: '', title: '', notes: '' }); }} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}>
          <Bell size={14} /> Add Reminder
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
          { key: 'priceList', label: 'Price List', icon: <Tag size={15} />, count: priceList.length },
          { key: 'reminders', label: 'Payment Reminders', icon: <Bell size={15} />, count: reminders.length },
          { key: 'tasks', label: 'Follow-up Tasks', icon: <CheckSquare size={15} />, count: tasks.filter(t => t.status !== 'done').length },
          { key: 'notes', label: 'Notes & Comments', icon: <MessageSquare size={15} />, count: comments.length },
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
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={printStatement} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.35rem 0.7rem', fontSize: '0.8rem' }}>
                <Printer size={13} /> Print
              </button>
              <button className="btn btn-secondary" onClick={handleDownloadStatement} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.35rem 0.7rem', fontSize: '0.8rem' }}>
                <Download size={13} /> Download PDF
              </button>
              <button className="btn" onClick={handleWhatsAppStatement} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.35rem 0.7rem', fontSize: '0.8rem', background: '#25D366', color: '#fff' }}>
                <MessageCircle size={13} /> Share via WhatsApp
              </button>
            </div>
          </div>
          {(
            <div style={{ marginTop: '1rem', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ color: 'var(--text-tertiary)', textAlign: 'left', borderBottom: '2px solid var(--surface-border)', background: 'var(--surface-raised)' }}>
                    <th
                      onClick={() => setStmtDir(d => d === 'asc' ? 'desc' : 'asc')}
                      style={{ padding: '0.5rem 0.5rem', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none', color: 'var(--primary-light)' }}
                    >
                      Date {stmtDir === 'desc' ? '↓' : '↑'}
                    </th>
                    <th style={{ padding: '0.5rem 0.5rem', fontWeight: 600 }}>Particulars</th>
                    <th style={{ padding: '0.5rem 0.5rem', fontWeight: 600, textAlign: 'right' }}>Debit (PO)</th>
                    <th style={{ padding: '0.5rem 0.5rem', fontWeight: 600, textAlign: 'right' }}>Credit (Paid)</th>
                    <th style={{ padding: '0.5rem 0.5rem', fontWeight: 600, textAlign: 'right' }}>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedStatementRows.map((r, i) => (
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
                        {iconBtn(<Download size={14} />, () => handleDownloadPOPDF(po), 'Download PDF', 'var(--text-tertiary)')}
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
                    {pmt.linkedInvoiceNumber && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--primary-light)', marginTop: '0.15rem' }}>Against: {pmt.linkedInvoiceNumber}</div>
                    )}
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
                    {iconBtn(<Download size={14} />, () => handleDownloadReceipt(pmt), 'Download receipt', 'var(--primary-light)')}
                    {iconBtn(<MessageCircle size={14} />, () => handleWhatsAppReceipt(pmt), 'Share receipt via WhatsApp', '#25D366')}
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
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: '0.55rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                <input className="input-field" placeholder="Filter invoices / products…" value={invSearch} onChange={e => setInvSearch(e.target.value)} style={{ paddingLeft: '1.9rem', height: '32px', fontSize: '0.8rem', width: '200px', margin: 0 }} />
              </div>
              <button className="btn btn-secondary" onClick={() => navigate(`/supplier-invoice?supplierId=${supplier.id}`)} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.35rem 0.7rem', fontSize: '0.8rem' }}>
                <Plus size={13} /> New Invoice
              </button>
            </div>
          </div>

          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {filteredInvoices.length === 0 && (
              <div style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', padding: '0.75rem 0' }}>
                {invoices.length === 0
                  ? 'No supplier invoices yet. Click “New Invoice” to create one.'
                  : 'No invoices match your filter.'}
              </div>
            )}
            {filteredInvoices.map(inv => (
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

      {/* Price List */}
      {activeTab === 'priceList' && card(
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
              <span style={{ color: 'var(--primary-light)' }}><Tag size={16} /></span>
              <span style={{ fontWeight: 700, fontSize: '1rem' }}>Supplier Price List</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>({priceList.length} items)</span>
            </div>
            {!plForm && (
              <button className="btn btn-primary" onClick={() => { setPlEditId(null); setPlForm({ productName: '', packaging: '', purchaseRate: '', gstPct: '5' }); }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.9rem', fontSize: '0.85rem' }}>
                <Plus size={14} /> Add Product
              </button>
            )}
          </div>

          {/* Add / Edit form */}
          {plForm && (
            <div style={{ background: 'var(--surface-raised)', borderRadius: '10px', padding: '1rem', marginBottom: '1rem', border: '1px solid var(--primary-light)' }}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.75rem', color: 'var(--primary-light)' }}>
                {plEditId ? 'Edit Product' : 'New Product'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.6rem', marginBottom: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>Product Name *</label>
                  <input className="input-field" placeholder="e.g. Urea 45kg" value={plForm.productName}
                    onChange={e => setPlForm(f => f ? { ...f, productName: e.target.value } : f)}
                    style={{ margin: 0, width: '100%' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>Packaging / Unit</label>
                  <input className="input-field" placeholder="e.g. 500ml, 1L, 50kg" value={plForm.packaging}
                    onChange={e => setPlForm(f => f ? { ...f, packaging: e.target.value } : f)}
                    style={{ margin: 0, width: '100%' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>Purchase Rate (₹) *</label>
                  <input className="input-field" type="number" placeholder="0.00" value={plForm.purchaseRate}
                    onChange={e => setPlForm(f => f ? { ...f, purchaseRate: e.target.value } : f)}
                    style={{ margin: 0, width: '100%' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>GST %</label>
                  <input className="input-field" type="number" placeholder="5" value={plForm.gstPct}
                    onChange={e => setPlForm(f => f ? { ...f, gstPct: e.target.value } : f)}
                    style={{ margin: 0, width: '100%' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => { setPlForm(null); setPlEditId(null); }} disabled={plSaving}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSavePriceListItem} disabled={plSaving || !plForm.productName.trim()}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  {plSaving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  {plEditId ? 'Save Changes' : 'Add to Price List'}
                </button>
              </div>
            </div>
          )}

          {/* Price list table */}
          {plLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><Loader2 size={24} className="animate-spin" style={{ color: 'var(--text-tertiary)' }} /></div>
          ) : priceList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>
              No products in this supplier's price list yet.<br />
              <span style={{ fontSize: '0.8rem' }}>Click "Add Product" to get started.</span>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ color: 'var(--text-tertiary)', textAlign: 'left' }}>
                    <th style={{ padding: '0.4rem 0.6rem', fontWeight: 600 }}>Product</th>
                    <th style={{ padding: '0.4rem 0.6rem', fontWeight: 600 }}>Packaging</th>
                    <th style={{ padding: '0.4rem 0.6rem', fontWeight: 600, textAlign: 'right' }}>Purchase Rate</th>
                    <th style={{ padding: '0.4rem 0.6rem', fontWeight: 600, textAlign: 'right' }}>GST %</th>
                    <th style={{ padding: '0.4rem 0.6rem', fontWeight: 600, textAlign: 'right' }}>Rate + GST</th>
                    <th style={{ padding: '0.4rem 0.6rem' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {priceList.map(item => (
                    <tr key={item.id} style={{ borderTop: '1px solid var(--surface-border)' }}>
                      <td style={{ padding: '0.5rem 0.6rem', fontWeight: 500 }}>{item.productName}</td>
                      <td style={{ padding: '0.5rem 0.6rem', color: 'var(--text-secondary)' }}>{item.packaging || '—'}</td>
                      <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontWeight: 600 }}>{inr(item.purchaseRate)}</td>
                      <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', color: 'var(--text-secondary)' }}>{item.gstPct}%</td>
                      <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', color: 'var(--primary-light)', fontWeight: 700 }}>
                        {inr(item.purchaseRate * (1 + item.gstPct / 100))}
                      </td>
                      <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                          <button onClick={() => { setPlEditId(item.id); setPlForm({ productName: item.productName, packaging: item.packaging, purchaseRate: String(item.purchaseRate), gstPct: String(item.gstPct) }); }}
                            title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '0.2rem', display: 'flex' }}>
                            <Edit2 size={14} />
                          </button>
                          <button onClick={() => handleDeletePriceListItem(item)} title="Delete"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '0.2rem', display: 'flex' }}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Payment Reminders */}
      {activeTab === 'reminders' && card(
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
              <span style={{ color: 'var(--primary-light)' }}><Bell size={16} /></span>
              <span style={{ fontWeight: 700, fontSize: '1rem' }}>Payment Reminders</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>({reminders.length})</span>
            </div>
            {!remForm && (
              <button className="btn btn-primary" onClick={() => { setRemEditId(null); setRemForm({ commitmentDate: '', reminderSchedule: '1_day_before', reminderDate: '', amount: '', title: '', notes: '' }); }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.9rem', fontSize: '0.85rem' }}>
                <Plus size={14} /> Add Reminder
              </button>
            )}
          </div>

          {/* Reminders list */}
          {remLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><Loader2 size={24} className="animate-spin" style={{ color: 'var(--text-tertiary)' }} /></div>
          ) : reminders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>
              No payment reminders yet.<br />
              <span style={{ fontSize: '0.8rem' }}>Click "Add Reminder" to set one up.</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {reminders.map(r => {
                const ds = getReminderDisplayStatus(r);
                const statusColors: Record<string, string> = { upcoming: '#3b82f6', completed: '#10b981', overdue: '#ef4444' };
                const sc = statusColors[ds];
                const isHighlighted = r.id === highlightedReminderId;
                return (
                  <div
                    key={r.id}
                    ref={isHighlighted ? highlightRef : null}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '0.75rem 1rem', borderRadius: '8px', background: 'var(--surface-raised)',
                      gap: '1rem', flexWrap: 'wrap', borderLeft: `3px solid ${sc}`,
                      boxShadow: isHighlighted ? `0 0 0 2px ${sc}` : 'none',
                      transition: 'box-shadow 0.3s',
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <Bell size={13} style={{ color: sc, flexShrink: 0 }} />
                        <span style={{ textDecoration: ds === 'completed' ? 'line-through' : 'none', color: ds === 'completed' ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>{r.title}</span>
                        <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.5rem', borderRadius: '999px', background: `${sc}22`, color: sc, fontWeight: 700, textTransform: 'uppercase' }}>{ds}</span>
                      </div>
                      {r.notes && <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.15rem' }}>{r.notes}</div>}
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <Bell size={11} style={{ color: '#f59e0b' }} />
                          <span style={{ color: '#f59e0b', fontWeight: 600 }}>Remind:</span> {fmtDate(r.reminderDate)}
                        </span>
                        {r.commitmentDate && r.commitmentDate !== r.reminderDate && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <CalendarDays size={11} style={{ color: '#10b981' }} />
                            <span style={{ color: '#10b981', fontWeight: 600 }}>Pay by:</span> {fmtDate(r.commitmentDate)}
                          </span>
                        )}
                        {r.lockedByPayment && (
                          <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '999px', background: '#10b98122', color: '#10b981', fontWeight: 700, textTransform: 'uppercase' }}>
                            Payment Recorded
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                      {r.amount > 0 && <div style={{ fontWeight: 800, fontSize: '1rem', color: sc }}>{inr(r.amount)}</div>}
                      <button
                        onClick={() => handleReminderToggle(r)}
                        title={r.status === 'completed' ? 'Mark as open' : 'Mark complete'}
                        className="btn btn-secondary"
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                      >
                        {r.status === 'completed' ? <Square size={13} /> : <CheckCircle2 size={13} />}
                        {r.status === 'completed' ? 'Reopen' : 'Complete'}
                      </button>
                      {!r.lockedByPayment && iconBtn(<Pencil size={14} />, () => {
                        setRemEditId(r.id);
                        setRemForm({
                          commitmentDate: r.commitmentDate || r.reminderDate,
                          reminderSchedule: r.reminderSchedule ?? 'custom',
                          reminderDate: r.reminderDate,
                          amount: String(r.amount || ''),
                          title: r.title,
                          notes: r.notes ?? '',
                        });
                      }, 'Edit reminder', 'var(--primary-light)')}
                      {iconBtn(<Trash2 size={14} />, () => handleDeleteReminder(r), 'Delete reminder', '#ff4d4f')}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Follow-up Tasks */}
      {activeTab === 'tasks' && card(
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
            <span style={{ color: 'var(--primary-light)' }}><CheckSquare size={16} /></span>
            <span style={{ fontWeight: 700, fontSize: '1rem' }}>Follow-up Tasks</span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>({tasks.filter(t => t.status !== 'done').length} open)</span>
          </div>
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
        </div>
      )}

      {/* Comments */}
      {activeTab === 'notes' && card(
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
            <span style={{ color: 'var(--primary-light)' }}><MessageSquare size={16} /></span>
            <span style={{ fontWeight: 700, fontSize: '1rem' }}>Notes & Comments</span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>({comments.length})</span>
          </div>
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
                <div key={c.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.75rem 1rem', borderRadius: '8px', background: 'var(--surface-raised)', borderLeft: '3px solid var(--primary-light)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.875rem' }}>{c.text}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '0.3rem' }}>
                      {c.author} · {c.createdAt ? fmtDate(c.createdAt) : '—'}
                    </div>
                  </div>
                  {iconBtn(<Trash2 size={14} />, () => setCmtToDelete(c), 'Delete note', '#ff4d4f')}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Edit Supplier Modal — shared dual-mode form, mounted only when open */}
    </div>

    {/* ── Portalled modals — rendered outside the animated page div to avoid transform containment ── */}

    {editMode && supplier && (
      <SupplierFormModal
        mode="edit"
        supplierId={supplier.id}
        initial={supplier}
        onClose={() => setEditMode(false)}
        onSaved={() => { setEditMode(false); load(true); }}
      />
    )}

    {poEditing !== undefined && supplier && (
      <PurchaseOrderModal
        supplierId={supplier.id}
        supplierName={supplier.name}
        editing={poEditing}
        onClose={() => setPoEditing(undefined)}
        onSaved={() => { setPoEditing(undefined); load(true); }}
      />
    )}

    {pmtEditing !== undefined && supplier && (
      <PaymentModal
        supplierId={supplier.id}
        supplierName={supplier.name}
        outstandingBalance={supplier.outstandingBalance}
        editing={pmtEditing}
        applicableDocs={applicableDocs}
        defaultAmount={pmtFromReminder?.amount}
        defaultDate={today()}
        onClose={() => { setPmtEditing(undefined); setPmtFromReminder(null); }}
        onSaved={() => {
          if (pmtFromReminder) {
            void markReminderStatus(pmtFromReminder.reminderId, 'completed', true);
            setPmtFromReminder(null);
          }
          setPmtEditing(undefined);
          load(true);
        }}
      />
    )}

    {/* Reminder completion confirmation dialog */}
    {reminderToComplete && createPortal(
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 1060, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', background: 'hsla(220, 30%, 4%, 0.72)', backdropFilter: 'blur(4px)', animation: 'fadeIn 0.18s ease-out' }}
        role="dialog" aria-modal="true" aria-label="Complete reminder"
      >
        <div className="glass-panel" style={{ width: '100%', maxWidth: '420px', padding: '1.75rem', borderRadius: '16px', animation: 'scaleUp 0.22s ease-out' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.6rem' }}>
            <CheckCircle2 size={20} style={{ color: 'var(--primary-light)', flexShrink: 0 }} />
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Record a Payment?</h2>
          </div>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', lineHeight: 1.6 }}>
            You're marking <strong style={{ color: 'var(--text-primary)' }}>"{reminderToComplete.title}"</strong> as complete.
          </p>
          {reminderToComplete.amount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 0.85rem', borderRadius: '8px', background: 'var(--surface-raised)', marginBottom: '1rem', fontSize: '0.88rem' }}>
              <IndianRupee size={14} style={{ color: 'var(--primary-light)' }} />
              <span style={{ color: 'var(--text-secondary)' }}>Amount:</span>
              <span style={{ fontWeight: 700, color: 'var(--primary-light)' }}>{inr(reminderToComplete.amount)}</span>
            </div>
          )}
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: 1.6 }}>
            Would you like to record this as a <strong>Payment Made</strong> to the supplier as well?
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <button
              className="btn btn-primary"
              onClick={() => {
                const r = reminderToComplete;
                setReminderToComplete(null);
                setPmtFromReminder({ reminderId: r.id, amount: r.amount });
                setPmtEditing(null);
              }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.65rem 1rem', fontSize: '0.9rem' }}
            >
              <IndianRupee size={15} /> Yes, Record Payment
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                const r = reminderToComplete;
                setReminderToComplete(null);
                void markReminderStatus(r.id, 'completed');
              }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.65rem 1rem', fontSize: '0.9rem' }}
            >
              <CheckCircle2 size={15} /> Just Mark Complete
            </button>
            <button
              onClick={() => setReminderToComplete(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '0.8rem', padding: '0.25rem', marginTop: '0.1rem' }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}

    {/* Payment Reminder add / edit modal */}
    {remForm && createPortal(
      <div
        onMouseDown={e => { if (e.currentTarget === e.target && !remSaving) { setRemForm(null); setRemEditId(null); } }}
        style={{ position: 'fixed', inset: 0, zIndex: 1050, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', background: 'hsla(220, 30%, 4%, 0.72)', backdropFilter: 'blur(4px)', animation: 'fadeIn 0.18s ease-out' }}
        role="dialog" aria-modal="true" aria-label={remEditId ? 'Edit Reminder' : 'Add Payment Reminder'}
      >
        <div className="glass-panel" style={{ width: '100%', maxWidth: '480px', padding: '1.75rem', position: 'relative', borderRadius: '16px', animation: 'scaleUp 0.22s ease-out' }}>
          <button onClick={() => { if (!remSaving) { setRemForm(null); setRemEditId(null); } }} className="btn-icon" aria-label="Close"
            style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}>
            <X size={20} />
          </button>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Bell size={18} className="primary-gradient-text" /> {remEditId ? 'Edit Reminder' : 'Add Payment Reminder'}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Title / Subject *</label>
              <input className="input-field" placeholder="e.g. Pay invoice #1234" value={remForm.title}
                onChange={e => setRemForm(f => f ? { ...f, title: e.target.value } : f)}
                autoFocus style={{ margin: 0, width: '100%' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#10b981', marginBottom: '0.3rem' }}>Payment Commitment Date *</label>
                <input className="input-field" type="date" value={remForm.commitmentDate}
                  onChange={e => setRemForm(f => f ? { ...f, commitmentDate: e.target.value } : f)}
                  style={{ margin: 0, width: '100%', borderColor: 'hsla(160,60%,40%,0.4)' }} />
                <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', marginTop: '0.2rem' }}>Date you commit to pay the supplier</div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Amount (₹)</label>
                <input className="input-field" type="number" placeholder="0.00" value={remForm.amount}
                  onChange={e => setRemForm(f => f ? { ...f, amount: e.target.value } : f)}
                  style={{ margin: 0, width: '100%' }} />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#f59e0b', marginBottom: '0.3rem' }}>Remind Me</label>
              <select className="input-field" value={remForm.reminderSchedule}
                onChange={e => setRemForm(f => f ? { ...f, reminderSchedule: e.target.value } : f)}
                style={{ margin: 0, width: '100%' }}>
                {REMINDER_SCHEDULE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {remForm.reminderSchedule === 'custom' ? (
                <div style={{ marginTop: '0.5rem' }}>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>Custom Reminder Date *</label>
                  <input className="input-field" type="date" value={remForm.reminderDate}
                    onChange={e => setRemForm(f => f ? { ...f, reminderDate: e.target.value } : f)}
                    style={{ margin: 0, width: '100%' }} />
                </div>
              ) : remForm.commitmentDate ? (
                <div style={{ marginTop: '0.35rem', fontSize: '0.72rem', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Bell size={11} style={{ color: '#f59e0b' }} />
                  Reminder will fire on: <strong style={{ color: '#f59e0b' }}>{fmtDate(computeReminderDate(remForm.commitmentDate, remForm.reminderSchedule, remForm.reminderDate))}</strong>
                </div>
              ) : null}
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Notes (optional)</label>
              <textarea className="input-field" placeholder="Any additional details…" value={remForm.notes}
                onChange={e => setRemForm(f => f ? { ...f, notes: e.target.value } : f)}
                rows={2} style={{ margin: 0, width: '100%', resize: 'vertical' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => { setRemForm(null); setRemEditId(null); }} disabled={remSaving}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSaveReminder}
              disabled={remSaving || !remForm.title.trim() || !remForm.commitmentDate || (remForm.reminderSchedule === 'custom' && !remForm.reminderDate)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              {remSaving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {remEditId ? 'Save Changes' : 'Add Reminder'}
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}

    {/* Delete Supplier Invoice confirmation */}
    {invToDelete && createPortal(
      <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', background: 'hsla(220, 30%, 4%, 0.72)', backdropFilter: 'blur(4px)', animation: 'fadeIn 0.18s ease-out' }}>
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
            <button className="btn" onClick={() => handleDeleteInvoice(invToDelete!)} disabled={deletingInv} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#ff4d4f', color: '#fff', border: 'none' }}>
              {deletingInv ? <><Loader2 size={15} className="animate-spin" /> Deleting…</> : <><Trash2 size={15} /> Delete Invoice</>}
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}

    {/* Delete Note confirmation */}
    {cmtToDelete && createPortal(
      <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', background: 'hsla(220, 30%, 4%, 0.72)', backdropFilter: 'blur(4px)', animation: 'fadeIn 0.18s ease-out' }}>
        <div className="glass-panel animate-slide-up" style={{ width: '100%', maxWidth: '440px', padding: '1.75rem', position: 'relative', borderRadius: '16px' }}>
          <button onClick={() => !deletingCmt && setCmtToDelete(null)} className="btn-icon" aria-label="Close" style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}><X size={20} /></button>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ff4d4f' }}>
            <AlertCircle size={20} /> Delete Note?
          </h2>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: 1.7 }}>
            <div style={{ padding: '0.6rem 0.75rem', background: 'var(--surface-raised)', borderRadius: '8px', fontStyle: 'italic', color: 'var(--text-primary)' }}>
              "{cmtToDelete.text}"
            </div>
            <div style={{ marginTop: '0.5rem' }}>
              {cmtToDelete.author} · {cmtToDelete.createdAt ? fmtDate(cmtToDelete.createdAt) : '—'}
            </div>
          </div>
          <div style={{ padding: '0.7rem 0.85rem', background: 'hsla(0,100%,50%,0.1)', color: '#ff4d4f', borderRadius: '8px', fontSize: '0.82rem', marginBottom: '1.25rem' }}>
            This will permanently delete this note. This action cannot be undone.
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button className="btn btn-secondary" onClick={() => setCmtToDelete(null)} disabled={deletingCmt}>Cancel</button>
            <button className="btn" onClick={() => handleDeleteComment(cmtToDelete!)} disabled={deletingCmt} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#ff4d4f', color: '#fff', border: 'none' }}>
              {deletingCmt ? <><Loader2 size={15} className="animate-spin" /> Deleting…</> : <><Trash2 size={15} /> Delete Note</>}
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}
  </>
  );
}
