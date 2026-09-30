import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { query, getDocs, orderBy, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection } from '../utils/tenantPath';
import {
    resolveSalesBill, PAYMENT_TYPE_LABEL,
    type SalesBillRow, type PaymentType, type RawSalesOrder,
} from '../utils/salesReport';
import {
    ReceiptText, Loader2, Search, X, Download,
    Calendar, Eye, Pencil, ChevronUp, ChevronDown, Filter,
    FileText, FileSpreadsheet, FileType,
} from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── Column config ──────────────────────────────────────────────────────────────

const COL_KEYS = [
    'sr', 'billNumber', 'date', 'channel', 'customer',
    'address', 'billAmount', 'paymentType', 'amountPaid', 'outstanding',
] as const;
type ColKey = typeof COL_KEYS[number];

const DEFAULT_WIDTHS: Record<ColKey, number> = {
    sr:           72,
    billNumber:   180,
    date:         110,
    channel:      120,
    customer:     220,
    address:      260,
    billAmount:   150,
    paymentType:  140,
    amountPaid:   150,
    outstanding:  170,
};

const MIN_COL_WIDTH = 50;

// Human-readable label per column — used by the right-click context menu.
const COL_LABELS: Record<ColKey, string> = {
    sr:          'Sr. No.',
    billNumber:  'Bill Number',
    date:        'Date',
    channel:     'Type',
    customer:    'Customer Name',
    address:     'Address',
    billAmount:  'Bill Amount',
    paymentType: 'Payment Type',
    amountPaid:  'Amount Paid',
    outstanding: 'Credit / Outstanding',
};

const LS_WIDTHS  = (tid: string) => `fiinny_salesr_widths_${tid}`;
const LS_FREEZE  = (tid: string) => `fiinny_salesr_freeze_${tid}`;
const LS_ORDER   = (tid: string) => `fiinny_salesr_order_${tid}`;

function loadWidths(tid: string): Record<ColKey, number> {
    try {
        const raw = localStorage.getItem(LS_WIDTHS(tid));
        if (!raw) return { ...DEFAULT_WIDTHS };
        const p = JSON.parse(raw);
        const w = { ...DEFAULT_WIDTHS };
        for (const k of COL_KEYS) {
            if (typeof p[k] === 'number' && p[k] >= MIN_COL_WIDTH) w[k] = p[k];
        }
        return w;
    } catch { return { ...DEFAULT_WIDTHS }; }
}

function loadFreeze(tid: string): number {
    try {
        const raw = localStorage.getItem(LS_FREEZE(tid));
        if (raw === null) return 0;
        const n = parseInt(raw, 10);
        return (!isNaN(n) && n >= 0 && n < COL_KEYS.length) ? n : 0;
    } catch { return 0; }
}

function loadOrder(tid: string): ColKey[] {
    try {
        const raw = localStorage.getItem(LS_ORDER(tid));
        if (!raw) return [...COL_KEYS];
        const saved: string[] = JSON.parse(raw);
        if (!Array.isArray(saved)) return [...COL_KEYS];
        const valid = saved.filter(k => (COL_KEYS as readonly string[]).includes(k)) as ColKey[];
        const missing = (COL_KEYS as readonly ColKey[]).filter(k => !valid.includes(k));
        return [...valid, ...missing];
    } catch { return [...COL_KEYS]; }
}

// ── Period helpers ─────────────────────────────────────────────────────────────

type Period = 'today' | 'this_week' | 'this_month' | 'all_time' | 'custom';

const PERIODS: { key: Period; label: string }[] = [
    { key: 'today',      label: 'Today' },
    { key: 'this_week',  label: 'This Week' },
    { key: 'this_month', label: 'This Month' },
    { key: 'all_time',   label: 'All Time' },
    { key: 'custom',     label: 'Custom Range' },
];

// Channel column filter — single-select over the two sale channels.
type ChannelSel = 'all' | 'b2b' | 'pos';
const CHANNEL_SEL_OPTS: { key: ChannelSel; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'b2b', label: 'B2B' },
    { key: 'pos', label: 'B2C' },
];

// Payment-type column filter.
type PaymentSel = 'all' | PaymentType;
const PAYMENT_SEL_OPTS: { key: PaymentSel; label: string }[] = [
    { key: 'all',     label: 'All' },
    { key: 'cash',    label: 'Cash' },
    { key: 'credit',  label: 'Credit' },
    { key: 'partial', label: 'Partial' },
];

function toStr(d: Date) { return d.toISOString().slice(0, 10); }

function periodRange(p: Period, cf: string, ct: string): [string, string] {
    const now = new Date();
    const t = toStr(now);
    switch (p) {
        case 'today':      return [t, t];
        case 'this_week':  { const d = new Date(now); d.setDate(d.getDate() - d.getDay()); return [toStr(d), t]; }
        case 'this_month': return [toStr(new Date(now.getFullYear(), now.getMonth(), 1)), t];
        case 'all_time':   return ['2000-01-01', t];
        case 'custom':     return cf && ct ? [cf, ct] : [t, t];
    }
}

// ── Formatting helpers ─────────────────────────────────────────────────────────

const fmtInr  = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtNum  = (n: number) => n.toLocaleString('en-IN');
const fmtDate = (s: string) => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}-${m}-${y}`; };
const firstOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };
const todayStr = () => new Date().toISOString().slice(0, 10);

const CHANNEL_CHIP: Record<'b2b' | 'pos', { label: string; bg: string; color: string }> = {
    b2b: { label: 'B2B', bg: 'hsla(263,70%,60%,0.12)', color: '#8b5cf6' },
    pos: { label: 'B2C', bg: 'hsla(217,91%,60%,0.12)', color: '#3b82f6' },
};

const PAYMENT_CHIP: Record<PaymentType, { bg: string; color: string }> = {
    cash:    { bg: 'hsla(152,60%,40%,0.12)', color: '#10b981' },
    partial: { bg: 'hsla(38,92%,50%,0.14)',  color: '#d97706' },
    credit:  { bg: 'hsla(0,84%,60%,0.14)',   color: '#ef4444' },
};

// ── Column sort / filter types ─────────────────────────────────────────────────

type SortCol   = 'billAmount' | 'amountPaid' | 'outstanding' | 'date';
type FilterCol = 'billNumber' | 'date' | 'customer' | 'address' | 'billAmount' | 'amountPaid' | 'outstanding';
type NumOp     = 'gt' | 'lt' | 'eq';
interface NumFilter { op: NumOp; value: string }

const NUM_OPS: { key: NumOp; label: string; title: string }[] = [
    { key: 'eq', label: '=', title: 'Equal to' },
    { key: 'gt', label: '>', title: 'Greater than' },
    { key: 'lt', label: '<', title: 'Less than' },
];

function matchNum(val: number, f: NumFilter): boolean {
    const n = parseFloat(f.value);
    if (isNaN(n)) return true;
    if (f.op === 'gt') return val > n;
    if (f.op === 'lt') return val < n;
    return val === n;
}
function isNumActive(f: NumFilter): boolean { return f.value !== '' && !isNaN(parseFloat(f.value)); }

// ── Component ─────────────────────────────────────────────────────────────────

export default function SalesReportPage() {
    const { tenantId } = useAuth();
    const navigate = useNavigate();

    // ── Period / date filters ─────────────────────────────────────────────────
    const [period, setPeriod]         = useState<Period>('this_month');
    const [customFrom, setCustomFrom] = useState(firstOfMonth());
    const [customTo, setCustomTo]     = useState(todayStr());
    const [dateFrom, setDateFrom]     = useState(firstOfMonth());
    const [dateTo, setDateTo]         = useState(todayStr());

    useEffect(() => {
        const [f, t] = periodRange(period, customFrom, customTo);
        setDateFrom(f);
        setDateTo(t);
    }, [period, customFrom, customTo]);

    // ── Channel + payment-type single-select filters ──────────────────────────
    const [channelSel, setChannelSel] = useState<ChannelSel>('all');
    const [paymentSel, setPaymentSel] = useState<PaymentSel>('all');

    // ── Column sort ───────────────────────────────────────────────────────────
    const [sortCol, setSortCol] = useState<SortCol | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

    const toggleSort = (col: SortCol) => {
        if (sortCol === col) { if (sortDir === 'asc') setSortDir('desc'); else setSortCol(null); }
        else { setSortCol(col); setSortDir('asc'); }
    };

    // ── Column filter state ───────────────────────────────────────────────────
    const [filterOpen, setFilterOpen]       = useState<FilterCol | null>(null);
    const [filterPopoverPos, setFilterPopoverPos] = useState<{ top: number; left: number } | null>(null);

    const [filterBill, setFilterBill]         = useState('');
    const [filterCustomer, setFilterCustomer] = useState('');
    const [filterAddress, setFilterAddress]   = useState('');
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo]     = useState('');
    const [fBillAmount, setFBillAmount]       = useState<NumFilter>({ op: 'eq', value: '' });
    const [fAmountPaid, setFAmountPaid]       = useState<NumFilter>({ op: 'eq', value: '' });
    const [fOutstanding, setFOutstanding]     = useState<NumFilter>({ op: 'eq', value: '' });

    const openFilter = (col: FilterCol, btn: HTMLElement) => {
        const rect = btn.getBoundingClientRect();
        setFilterPopoverPos({ top: rect.bottom + 6, left: rect.left });
        setFilterOpen(prev => prev === col ? null : col);
    };
    const clearFilter = (col: FilterCol) => {
        if (col === 'billNumber')  setFilterBill('');
        if (col === 'customer')    setFilterCustomer('');
        if (col === 'address')     setFilterAddress('');
        if (col === 'date')        { setFilterDateFrom(''); setFilterDateTo(''); }
        if (col === 'billAmount')  setFBillAmount({ op: 'eq', value: '' });
        if (col === 'amountPaid')  setFAmountPaid({ op: 'eq', value: '' });
        if (col === 'outstanding') setFOutstanding({ op: 'eq', value: '' });
    };
    const isFilterActive = (col: FilterCol): boolean => {
        if (col === 'billNumber')  return filterBill.trim() !== '';
        if (col === 'customer')    return filterCustomer.trim() !== '';
        if (col === 'address')     return filterAddress.trim() !== '';
        if (col === 'date')        return filterDateFrom !== '' || filterDateTo !== '';
        if (col === 'billAmount')  return isNumActive(fBillAmount);
        if (col === 'amountPaid')  return isNumActive(fAmountPaid);
        if (col === 'outstanding') return isNumActive(fOutstanding);
        return false;
    };
    const hasAnyColumnFilter = channelSel !== 'all' || paymentSel !== 'all'
        || (['billNumber','customer','address','date','billAmount','amountPaid','outstanding'] as FilterCol[]).some(isFilterActive);

    const clearAllFilters = () => {
        setChannelSel('all'); setPaymentSel('all');
        setFilterBill(''); setFilterCustomer(''); setFilterAddress('');
        setFilterDateFrom(''); setFilterDateTo('');
        setFBillAmount({ op: 'eq', value: '' }); setFAmountPaid({ op: 'eq', value: '' }); setFOutstanding({ op: 'eq', value: '' });
    };

    // ── Column widths + freeze + order (localStorage-persisted) ─────────────
    const [colWidths, setColWidths]       = useState<Record<ColKey, number>>({ ...DEFAULT_WIDTHS });
    const [freezeCount, setFreezeCount]   = useState(0);
    const [colOrder, setColOrder]         = useState<ColKey[]>([...COL_KEYS]);
    const [settingsLoaded, setSettingsLoaded] = useState(false);
    const [isResizing, setIsResizing]     = useState(false);

    // ── Column drag-to-reorder state ─────────────────────────────────────────
    const [dragFromKey, setDragFromKey]   = useState<ColKey | null>(null);
    const [dragOverKey, setDragOverKey]   = useState<ColKey | null>(null);

    // ── Export menu ───────────────────────────────────────────────────────────
    const [showExportMenu, setShowExportMenu] = useState(false);

    // ── Right-click column context menu ───────────────────────────────────────
    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; colIdx: number } | null>(null);

    const handleTableContextMenu = (e: React.MouseEvent) => {
        const th = (e.target as HTMLElement).closest('th');
        e.preventDefault();
        if (!th || th.closest('thead') === null) { setCtxMenu(null); return; }
        const colIdx = (th as HTMLTableCellElement).cellIndex;
        if (colIdx < 0 || colIdx >= colOrder.length) { setCtxMenu(null); return; }
        setCtxMenu({ x: e.clientX, y: e.clientY, colIdx });
    };

    const freezeUpTo = (colIdx: number) => { setFreezeCount(colIdx + 1); setCtxMenu(null); };
    const unfreezeAll = () => { setFreezeCount(0); setCtxMenu(null); };
    const resetColumnWidths = () => { setColWidths({ ...DEFAULT_WIDTHS }); setCtxMenu(null); };
    const resetColOrder = () => { setColOrder([...COL_KEYS]); setCtxMenu(null); };

    useEffect(() => {
        if (!ctxMenu) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCtxMenu(null); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [ctxMenu]);

    const headerRowRef = useRef<HTMLTableRowElement>(null);
    const [headerH, setHeaderH] = useState(0);

    const dragRef = useRef<{ key: ColKey; startX: number; startWidth: number; latest: number } | null>(null);
    const colElRefs = useRef<Partial<Record<ColKey, HTMLTableColElement>>>({});

    // Load settings once tenantId is available
    useEffect(() => {
        if (!tenantId) return;
        setColWidths(loadWidths(tenantId));
        setFreezeCount(loadFreeze(tenantId));
        setColOrder(loadOrder(tenantId));
        setSettingsLoaded(true);
    }, [tenantId]);

    useEffect(() => {
        if (!tenantId || !settingsLoaded) return;
        try { localStorage.setItem(LS_WIDTHS(tenantId), JSON.stringify(colWidths)); } catch {}
    }, [colWidths, tenantId, settingsLoaded]);

    useEffect(() => {
        if (!tenantId || !settingsLoaded) return;
        try { localStorage.setItem(LS_FREEZE(tenantId), String(freezeCount)); } catch {}
    }, [freezeCount, tenantId, settingsLoaded]);

    useEffect(() => {
        if (!tenantId || !settingsLoaded) return;
        try { localStorage.setItem(LS_ORDER(tenantId), JSON.stringify(colOrder)); } catch {}
    }, [colOrder, tenantId, settingsLoaded]);

    // Global mouse-move / mouse-up for column drag — attached once
    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!dragRef.current) return;
            const { key, startX, startWidth } = dragRef.current;
            const newW = Math.max(MIN_COL_WIDTH, startWidth + e.clientX - startX);
            dragRef.current.latest = newW;
            const col = colElRefs.current[key];
            if (col) col.style.width = `${newW}px`;
        };
        const onUp = () => {
            if (!dragRef.current) return;
            const { key, latest } = dragRef.current;
            dragRef.current = null;
            setIsResizing(false);
            setColWidths(prev => ({ ...prev, [key]: latest }));
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    }, []);

    const handleResizeStart = (e: React.MouseEvent, key: ColKey) => {
        e.preventDefault();
        e.stopPropagation();
        dragRef.current = { key, startX: e.clientX, startWidth: colWidths[key], latest: colWidths[key] };
        setIsResizing(true);
    };

    const frozenOffsets = useMemo(() => {
        let acc = 0;
        return colOrder.map(key => { const o = acc; acc += colWidths[key]; return o; });
    }, [colWidths, colOrder]);

    const totalTableWidth = useMemo(() => colOrder.reduce((s, k) => s + colWidths[k], 0), [colWidths, colOrder]);

    // ── Data ──────────────────────────────────────────────────────────────────
    const [bills, setBills]     = useState<SalesBillRow[]>([]);
    const [loading, setLoading] = useState(true);

    useLayoutEffect(() => {
        const measure = () => setHeaderH(headerRowRef.current?.offsetHeight ?? 0);
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, [colWidths, freezeCount, loading]);

    useEffect(() => {
        if (!tenantId) return;
        setLoading(true);

        // Tenant-scoped sales bills within the data range. Same query shape as
        // Stock Report — range filter on invoiceDate with a client-side fallback
        // for docs the composite index can't serve.
        const fetchSalesOrders = getDocs(
            query(getTenantCollection(db, tenantId, 'salesOrders'), where('invoiceDate', '>=', dateFrom), where('invoiceDate', '<=', dateTo), orderBy('invoiceDate', 'desc')),
        ).catch(() =>
            getDocs(query(getTenantCollection(db, tenantId, 'salesOrders'), orderBy('invoiceDate', 'desc')))
                .then(snap => ({ docs: snap.docs.filter(d => { const inv = (d.data() as any).invoiceDate || ''; return inv >= dateFrom && inv <= dateTo; }) }))
                .catch(() => ({ docs: [] as any[] })),
        );

        fetchSalesOrders.then(sSnap => {
            const rows: SalesBillRow[] = [];
            for (const doc of (sSnap as any).docs) {
                const row = resolveSalesBill(doc.id, doc.data() as RawSalesOrder);
                if (row) rows.push(row);
            }
            setBills(rows);
            setLoading(false);
        }).catch(e => { console.error(e); setLoading(false); });
    }, [tenantId, dateFrom, dateTo]);

    // ── Column filters + sort → displayRows ───────────────────────────────────
    const displayRows = useMemo((): SalesBillRow[] => {
        let rows = bills.filter(r => {
            if (channelSel !== 'all' && r.channel !== (channelSel === 'b2b' ? 'sale_b2b' : 'sale_pos')) return false;
            if (paymentSel !== 'all' && r.paymentType !== paymentSel) return false;
            if (filterBill.trim() && !r.billNumber.toLowerCase().includes(filterBill.trim().toLowerCase())) return false;
            if (filterCustomer.trim() && !r.customerName.toLowerCase().includes(filterCustomer.trim().toLowerCase())) return false;
            if (filterAddress.trim() && !r.address.toLowerCase().includes(filterAddress.trim().toLowerCase())) return false;
            if (filterDateFrom && r.date && r.date < filterDateFrom) return false;
            if (filterDateTo && r.date && r.date > filterDateTo) return false;
            if (isNumActive(fBillAmount) && !matchNum(r.billAmount, fBillAmount)) return false;
            if (isNumActive(fAmountPaid) && !matchNum(r.amountPaid, fAmountPaid)) return false;
            if (isNumActive(fOutstanding) && !matchNum(r.outstanding, fOutstanding)) return false;
            return true;
        });

        if (sortCol) {
            const getVal = (r: SalesBillRow): number => {
                switch (sortCol) {
                    case 'billAmount':  return r.billAmount;
                    case 'amountPaid':  return r.amountPaid;
                    case 'outstanding': return r.outstanding;
                    case 'date':        return r.date ? Date.parse(r.date) : 0;
                    default:            return 0;
                }
            };
            rows = [...rows].sort((a, b) => { const d = getVal(a) - getVal(b); return sortDir === 'asc' ? d : -d; });
        }
        return rows;
    }, [bills, sortCol, sortDir, channelSel, paymentSel, filterBill, filterCustomer, filterAddress, filterDateFrom, filterDateTo, fBillAmount, fAmountPaid, fOutstanding]);

    // ── Grand-total aggregates ────────────────────────────────────────────────
    const grandTotal = useMemo(() => {
        const customers = new Set<string>();
        let billAmount = 0, amountPaid = 0, outstanding = 0;
        for (const r of displayRows) {
            if (r.customerName) customers.add(r.customerName.trim().toLowerCase());
            billAmount += r.billAmount; amountPaid += r.amountPaid; outstanding += r.outstanding;
        }
        return { billCount: displayRows.length, customerCount: customers.size, billAmount, amountPaid, outstanding };
    }, [displayRows]);

    // ── All Data export — mirrors the on-screen Sales Report table exactly ──────
    const exportRows = () => displayRows.map((r, i) => ({
        'Sr. No.': i + 1,
        'Bill Number': r.billNumber,
        'Date': r.date ? fmtDate(r.date) : '',
        'Type': r.channel === 'sale_b2b' ? 'B2B' : 'B2C',
        'Customer Name': r.customerName,
        'Address': r.address,
        'Bill Amount': r.billAmount.toFixed(2),
        'Payment Type': PAYMENT_TYPE_LABEL[r.paymentType],
        'Amount Paid': r.amountPaid.toFixed(2),
        'Credit / Outstanding': r.outstanding.toFixed(2),
    }));

    // ── Customer Summary export — one row per customer, amounts rolled up ────────
    const customerSummaryRows = () => {
        const map = new Map<string, { name: string; bills: number; billAmount: number; amountPaid: number; outstanding: number }>();
        for (const r of displayRows) {
            const key = r.customerName.trim().toLowerCase() || '—';
            const cur = map.get(key) ?? { name: r.customerName || '—', bills: 0, billAmount: 0, amountPaid: 0, outstanding: 0 };
            cur.bills += 1; cur.billAmount += r.billAmount; cur.amountPaid += r.amountPaid; cur.outstanding += r.outstanding;
            map.set(key, cur);
        }
        const rows = [...map.values()].sort((a, b) => b.outstanding - a.outstanding);
        return rows.map((r, i) => ({
            'Sr. No.': i + 1,
            'Customer Name': r.name,
            'Bills': r.bills,
            'Total Bill Amount': r.billAmount.toFixed(2),
            'Total Amount Paid': r.amountPaid.toFixed(2),
            'Total Credit / Outstanding': r.outstanding.toFixed(2),
        }));
    };

    // ── Generic format writers — shared by both export groups ────────────────────
    type ExportRow = Record<string, string | number>;

    const exportCSV = (rows: ExportRow[], fileBase: string) => {
        const blob = new Blob(['﻿' + Papa.unparse(rows)], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${fileBase}.csv`; a.click(); URL.revokeObjectURL(a.href);
    };

    const exportExcel = (rows: ExportRow[], sheetName: string, fileBase: string) => {
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        XLSX.writeFile(wb, `${fileBase}.xlsx`);
    };

    const exportPDF = (rows: ExportRow[], title: string, fileBase: string) => {
        const doc = new jsPDF({ orientation: 'landscape' });
        doc.setFontSize(14);
        doc.text(title, 14, 15);
        doc.setFontSize(9);
        doc.text(`Data Range: ${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`, 14, 22);
        const head = rows.length ? [Object.keys(rows[0])] : [];
        const body = rows.map(r => Object.values(r));
        autoTable(doc, { head, body, startY: 28, styles: { fontSize: 7 }, headStyles: { fillColor: [99, 60, 180] } });
        doc.save(`${fileBase}.pdf`);
    };

    // ── Invoice actions ───────────────────────────────────────────────────────
    const viewInvoice = (r: SalesBillRow) => { if (!r.orderId) return; if (r.channel === 'sale_pos') navigate(`/pos?reprintOrderId=${r.orderId}`); else navigate(`/b2b-invoice?orderId=${r.orderId}`); };
    const editInvoice = (r: SalesBillRow) => { if (!r.orderId) return; navigate(r.channel === 'sale_pos' ? `/pos?orderId=${r.orderId}` : `/b2b-invoice?orderId=${r.orderId}`); };

    // ── Cell base styles ──────────────────────────────────────────────────────
    const numHead: React.CSSProperties = { padding: '0.6rem 0.7rem', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'top' };
    const numCell: React.CSSProperties = { padding: '0.55rem 0.7rem', textAlign: 'right', whiteSpace: 'nowrap' };
    const txtHead: React.CSSProperties = { padding: '0.6rem 0.7rem', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap', verticalAlign: 'top' };
    const txtCell: React.CSSProperties = { padding: '0.55rem 0.7rem', textAlign: 'left', whiteSpace: 'nowrap' };
    const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' };

    const FREEZE_SHADOW = '3px 0 6px -2px rgba(0,0,0,0.14)';

    const getThStyle = (colIdx: number, align: 'left' | 'right' = 'left'): React.CSSProperties => {
        const base = align === 'right' ? numHead : txtHead;
        const frozen = colIdx < freezeCount;
        const isLastFrozen = frozen && colIdx === freezeCount - 1;
        return {
            ...base,
            position: 'sticky',
            top: 0,
            zIndex: frozen ? 3 : 2,
            background: 'var(--surface-raised)',
            overflow: 'hidden',
            ...(frozen ? { left: frozenOffsets[colIdx] } : {}),
            ...(isLastFrozen ? { boxShadow: FREEZE_SHADOW } : {}),
        };
    };

    const getTdStyle = (colIdx: number, align: 'left' | 'right' = 'left', rowIdx: number = 0): React.CSSProperties => {
        const base = align === 'right' ? numCell : txtCell;
        const frozen = colIdx < freezeCount;
        const isLastFrozen = frozen && colIdx === freezeCount - 1;
        if (!frozen) return { ...base, overflow: 'hidden', textOverflow: 'ellipsis' };
        return {
            ...base,
            position: 'sticky',
            left: frozenOffsets[colIdx],
            zIndex: 1,
            background: rowIdx % 2 === 0 ? 'var(--bg-color, #fff)' : 'hsl(0,0%,98.5%)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            ...(isLastFrozen ? { boxShadow: FREEZE_SHADOW } : {}),
        };
    };

    const getGTdStyle = (colIdx: number, align: 'left' | 'right' = 'left'): React.CSSProperties => {
        const base = align === 'right' ? numCell : txtCell;
        const frozen = colIdx < freezeCount;
        const isLastFrozen = frozen && colIdx === freezeCount - 1;
        return {
            ...base,
            fontWeight: 800,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            ...(frozen ? { position: 'sticky', left: frozenOffsets[colIdx], zIndex: 3, background: 'var(--surface-raised)' } : {}),
            ...(isLastFrozen ? { boxShadow: FREEZE_SHADOW } : {}),
        };
    };

    const resizeHandle = (key: ColKey) => (
        <div
            style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '6px', cursor: 'col-resize', zIndex: 4, userSelect: 'none' }}
            onMouseDown={e => handleResizeStart(e, key)}
        />
    );

    const iconBtn: React.CSSProperties = { background: 'none', border: '1px solid var(--surface-border)', borderRadius: '6px', padding: '0.2rem', cursor: 'pointer', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center' };

    const ctxItemStyle: React.CSSProperties = { display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem 0.6rem', borderRadius: '6px', fontSize: '0.82rem', color: 'var(--text-primary)', font: 'inherit' };

    // ── Sort + filter header helpers ──────────────────────────────────────────
    const SortIndicator = ({ col }: { col: SortCol }) => {
        if (sortCol !== col) return <ChevronUp size={10} style={{ opacity: 0.25, marginLeft: '0.2rem', flexShrink: 0 }} />;
        return sortDir === 'asc'
            ? <ChevronUp   size={11} style={{ marginLeft: '0.2rem', color: 'var(--primary)', flexShrink: 0 }} />
            : <ChevronDown size={11} style={{ marginLeft: '0.2rem', color: 'var(--primary)', flexShrink: 0 }} />;
    };

    const FilterBtn = ({ col }: { col: FilterCol }) => {
        const active = isFilterActive(col);
        return (
            <button
                onMouseDown={e => { e.preventDefault(); openFilter(col, e.currentTarget); }}
                style={{ background: active ? 'hsla(263,70%,60%,0.15)' : 'none', border: 'none', cursor: 'pointer', padding: '0.1rem 0.2rem', borderRadius: '4px', color: active ? 'var(--primary)' : 'var(--text-tertiary)', display: 'inline-flex', alignItems: 'center', flexShrink: 0, opacity: active ? 1 : 0.5 }}
                title={active ? 'Filter active — click to edit' : 'Add filter'}
            >
                <Filter size={9} />
            </button>
        );
    };

    // Rendered as plain functions (not components) so inputs keep focus while typing.
    const hdrColStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: 0 };

    const inlineTextFilter = (value: string, onChange: (v: string) => void, placeholder: string) => (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', fontWeight: 400 }} onClick={e => e.stopPropagation()}>
            <Search size={11} style={{ position: 'absolute', left: '0.4rem', color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
            <input
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                className="input-field"
                style={{ margin: 0, width: '100%', minWidth: 0, padding: '0.25rem 1.4rem 0.25rem 1.5rem', fontSize: '0.75rem', fontWeight: 400 }}
            />
            {value && (
                <button onClick={() => onChange('')} title="Clear"
                    style={{ position: 'absolute', right: '0.3rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', padding: 0 }}>
                    <X size={11} />
                </button>
            )}
        </div>
    );

    const inlineNumFilter = (state: NumFilter, setState: (f: NumFilter) => void) => (
        <div style={{ display: 'flex', alignItems: 'stretch', fontWeight: 400, border: '1px solid var(--surface-border)', borderRadius: '8px', overflow: 'hidden', background: 'var(--surface-base)' }} onClick={e => e.stopPropagation()}>
            <select value={state.op} onChange={e => setState({ ...state, op: e.target.value as NumOp })}
                title="Comparison"
                style={{ margin: 0, width: '3rem', minWidth: '3rem', padding: '0.25rem 0.15rem', fontSize: '0.85rem', fontWeight: 800, textAlign: 'center', cursor: 'pointer', border: 'none', borderRight: '1px solid var(--surface-border)', background: 'transparent', color: 'var(--text-primary)', outline: 'none', flexShrink: 0 }}>
                {NUM_OPS.map(o => <option key={o.key} value={o.key} title={o.title}>{o.label}</option>)}
            </select>
            <input type="number" value={state.value} onChange={e => setState({ ...state, value: e.target.value })}
                placeholder="Value"
                style={{ margin: 0, width: '100%', minWidth: 0, padding: '0.25rem 0.4rem', fontSize: '0.75rem', fontWeight: 400, textAlign: 'right', border: 'none', background: 'transparent', color: 'var(--text-primary)', outline: 'none' }} />
        </div>
    );

    // ── Date-range filter panel (popover, opened from the Date header) ─
    const DateFilterPanel = () => (
        <div style={{ minWidth: '200px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                <span style={{ fontWeight: 700, fontSize: '0.78rem' }}>Date Range</span>
                {(filterDateFrom || filterDateTo) && <button onClick={() => clearFilter('date')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.7rem', color: 'var(--text-tertiary)', padding: 0 }}>Clear</button>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div>
                    <label style={{ ...labelStyle, marginBottom: '0.2rem' }}>From</label>
                    <input autoFocus type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} style={{ width: '100%', padding: '0.35rem 0.6rem', borderRadius: '8px', border: '1px solid var(--surface-border)', fontSize: '0.82rem', background: 'var(--surface-base)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
                </div>
                <div>
                    <label style={{ ...labelStyle, marginBottom: '0.2rem' }}>To</label>
                    <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} style={{ width: '100%', padding: '0.35rem 0.6rem', borderRadius: '8px', border: '1px solid var(--surface-border)', fontSize: '0.82rem', background: 'var(--surface-base)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
                </div>
            </div>
        </div>
    );

    const renderFilterContent = () => (filterOpen === 'date' ? <DateFilterPanel /> : null);

    // ── Dynamic column renderers (drive colOrder-based layout) ────────────────

    const renderHeaderTh = (key: ColKey, colIdx: number) => {
        const isDragOver = dragOverKey === key && dragFromKey !== key;
        const align: 'left'|'right' = ['sr','billAmount','amountPaid','outstanding'].includes(key) ? 'right' : 'left';
        const needsWrap = key === 'customer' || key === 'address' || key === 'paymentType' || key === 'channel';
        const thStyle: React.CSSProperties = {
            ...getThStyle(colIdx, align),
            ...(needsWrap ? { whiteSpace: 'normal', verticalAlign: 'top' } : {}),
            ...(isDragOver ? { borderLeft: '3px solid var(--primary)' } : {}),
            position: 'sticky' as const,
        };
        const dragProps = {
            draggable: !isResizing,
            onDragStart: () => setDragFromKey(key),
            onDragOver: (e: React.DragEvent) => { e.preventDefault(); if (key !== dragFromKey) setDragOverKey(key); },
            onDragLeave: () => setDragOverKey(null),
            onDrop: (e: React.DragEvent) => {
                e.preventDefault();
                if (dragFromKey && dragFromKey !== key) {
                    setColOrder(prev => {
                        const next = [...prev];
                        const fi = next.indexOf(dragFromKey); const ti = next.indexOf(key);
                        if (fi < 0 || ti < 0) return prev;
                        next.splice(fi, 1); next.splice(ti, 0, dragFromKey);
                        return next;
                    });
                }
                setDragFromKey(null); setDragOverKey(null);
            },
            onDragEnd: () => { setDragFromKey(null); setDragOverKey(null); },
        };

        let inner: React.ReactNode;
        switch (key) {
            case 'sr': inner = 'Sr. No.'; break;
            case 'billNumber': inner = (
                <div style={hdrColStyle}>
                    <span>Bill Number</span>
                    {inlineTextFilter(filterBill, setFilterBill, 'Search…')}
                </div>
            ); break;
            case 'date': inner = (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <span onClick={() => toggleSort('date')} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}>
                        Date <SortIndicator col="date" />
                    </span>
                    <FilterBtn col="date" />
                </div>
            ); break;
            case 'channel': inner = (
                <div style={hdrColStyle}>
                    <span>Type</span>
                    <select value={channelSel} onChange={e => setChannelSel(e.target.value as ChannelSel)}
                        className="input-field" style={{ margin: 0, width: '100%', minWidth: 0, padding: '0.25rem 0.4rem', fontSize: '0.75rem', fontWeight: 400 }}>
                        {CHANNEL_SEL_OPTS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                    </select>
                </div>
            ); break;
            case 'customer': inner = (
                <div style={hdrColStyle}>
                    <span>Customer Name</span>
                    {inlineTextFilter(filterCustomer, setFilterCustomer, 'Search…')}
                </div>
            ); break;
            case 'address': inner = (
                <div style={hdrColStyle}>
                    <span>Address</span>
                    {inlineTextFilter(filterAddress, setFilterAddress, 'Search…')}
                </div>
            ); break;
            case 'billAmount': inner = (
                <div style={hdrColStyle}>
                    <span onClick={() => toggleSort('billAmount')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', cursor: 'pointer', userSelect: 'none' }}>
                        Bill Amount <SortIndicator col="billAmount" />
                    </span>
                    {inlineNumFilter(fBillAmount, setFBillAmount)}
                </div>
            ); break;
            case 'paymentType': inner = (
                <div style={hdrColStyle}>
                    <span>Payment Type</span>
                    <select value={paymentSel} onChange={e => setPaymentSel(e.target.value as PaymentSel)}
                        className="input-field" style={{ margin: 0, width: '100%', minWidth: 0, padding: '0.25rem 0.4rem', fontSize: '0.75rem', fontWeight: 400 }}>
                        {PAYMENT_SEL_OPTS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                    </select>
                </div>
            ); break;
            case 'amountPaid': inner = (
                <div style={hdrColStyle}>
                    <span onClick={() => toggleSort('amountPaid')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', cursor: 'pointer', userSelect: 'none' }}>
                        Amount Paid <SortIndicator col="amountPaid" />
                    </span>
                    {inlineNumFilter(fAmountPaid, setFAmountPaid)}
                </div>
            ); break;
            case 'outstanding': inner = (
                <div style={hdrColStyle}>
                    <span onClick={() => toggleSort('outstanding')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', cursor: 'pointer', userSelect: 'none' }} title="Amount still on credit for this bill">
                        Credit / Outstanding <SortIndicator col="outstanding" />
                    </span>
                    {inlineNumFilter(fOutstanding, setFOutstanding)}
                </div>
            ); break;
            default: inner = key;
        }
        return (
            <th key={key} style={thStyle} {...dragProps}>
                {inner}
                {resizeHandle(key)}
            </th>
        );
    };

    const renderBodyTd = (key: ColKey, colIdx: number, r: SalesBillRow, rowIdx: number): React.ReactNode => {
        switch (key) {
            case 'sr':
                return <td key={key} style={{ ...getTdStyle(colIdx, 'right', rowIdx), color: 'var(--text-tertiary)' }}>{rowIdx + 1}</td>;
            case 'billNumber':
                return (
                    <td key={key} style={getTdStyle(colIdx, 'left', rowIdx)}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                            <button onClick={() => viewInvoice(r)} title="Open invoice" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontFamily: 'monospace', fontSize: '0.76rem', fontWeight: 600, color: 'var(--primary-light)' }}>
                                {r.billNumber}<Eye size={12} style={{ opacity: 0.8 }} />
                            </button>
                            <button onClick={() => viewInvoice(r)} title="Download / print" style={iconBtn}><Download size={12} /></button>
                            <button onClick={() => editInvoice(r)} title="Edit invoice" style={iconBtn}><Pencil size={12} /></button>
                        </span>
                    </td>
                );
            case 'date':
                return <td key={key} style={{ ...getTdStyle(colIdx, 'left', rowIdx), color: 'var(--text-secondary)' }}>{r.date ? fmtDate(r.date) : '—'}</td>;
            case 'channel': {
                const chip = CHANNEL_CHIP[r.channel === 'sale_b2b' ? 'b2b' : 'pos'];
                return (
                    <td key={key} style={getTdStyle(colIdx, 'left', rowIdx)}>
                        <span style={{ fontSize: '0.66rem', padding: '0.12rem 0.5rem', borderRadius: '999px', fontWeight: 700, background: chip.bg, color: chip.color, whiteSpace: 'nowrap' }}>{chip.label}</span>
                    </td>
                );
            }
            case 'customer':
                return <td key={key} style={{ ...getTdStyle(colIdx, 'left', rowIdx), fontWeight: 600, whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip', wordBreak: 'break-word' }}>{r.customerName || '—'}</td>;
            case 'address':
                return <td key={key} style={{ ...getTdStyle(colIdx, 'left', rowIdx), color: 'var(--text-secondary)', whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip', wordBreak: 'break-word' }}>{r.address || '—'}</td>;
            case 'billAmount':
                return <td key={key} style={{ ...getTdStyle(colIdx, 'right', rowIdx), fontWeight: 700, color: 'var(--text-primary)' }}>{fmtInr(r.billAmount)}</td>;
            case 'paymentType': {
                const chip = PAYMENT_CHIP[r.paymentType];
                return (
                    <td key={key} style={getTdStyle(colIdx, 'left', rowIdx)}>
                        <span style={{ fontSize: '0.66rem', padding: '0.12rem 0.55rem', borderRadius: '999px', fontWeight: 700, background: chip.bg, color: chip.color, whiteSpace: 'nowrap' }}>{PAYMENT_TYPE_LABEL[r.paymentType]}</span>
                    </td>
                );
            }
            case 'amountPaid':
                return <td key={key} style={{ ...getTdStyle(colIdx, 'right', rowIdx), color: r.amountPaid > 0 ? '#10b981' : 'var(--text-tertiary)', fontWeight: r.amountPaid > 0 ? 600 : 400 }}>{r.amountPaid > 0 ? fmtInr(r.amountPaid) : '—'}</td>;
            case 'outstanding':
                return <td key={key} style={{ ...getTdStyle(colIdx, 'right', rowIdx), color: r.outstanding > 0 ? '#ef4444' : 'var(--text-tertiary)', fontWeight: r.outstanding > 0 ? 700 : 400 }}>{r.outstanding > 0 ? fmtInr(r.outstanding) : '—'}</td>;
            default: return <td key={key} style={getTdStyle(colIdx, 'left', rowIdx)} />;
        }
    };

    const renderGrandTd = (key: ColKey, colIdx: number): React.ReactNode => {
        switch (key) {
            case 'sr':          return <td key={key} style={getGTdStyle(colIdx, 'right')}>Total</td>;
            case 'billNumber':  return <td key={key} style={getGTdStyle(colIdx, 'left')}>{fmtNum(grandTotal.billCount)} bill{grandTotal.billCount === 1 ? '' : 's'}</td>;
            case 'date':        return <td key={key} style={getGTdStyle(colIdx, 'left')} />;
            case 'channel':     return <td key={key} style={getGTdStyle(colIdx, 'left')} />;
            case 'customer':    return <td key={key} style={getGTdStyle(colIdx, 'left')}>{fmtNum(grandTotal.customerCount)} customer{grandTotal.customerCount === 1 ? '' : 's'}</td>;
            case 'address':     return <td key={key} style={getGTdStyle(colIdx, 'left')} />;
            case 'billAmount':  return <td key={key} style={getGTdStyle(colIdx, 'right')}>{fmtInr(grandTotal.billAmount)}</td>;
            case 'paymentType': return <td key={key} style={getGTdStyle(colIdx, 'left')} />;
            case 'amountPaid':  return <td key={key} style={{ ...getGTdStyle(colIdx, 'right'), color: '#10b981' }}>{fmtInr(grandTotal.amountPaid)}</td>;
            case 'outstanding': return <td key={key} style={{ ...getGTdStyle(colIdx, 'right'), color: '#ef4444' }}>{fmtInr(grandTotal.outstanding)}</td>;
            default:            return <td key={key} style={getGTdStyle(colIdx, 'left')} />;
        }
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div style={{ width: '100%' }}>

            {/* Full-screen capture div during column resize */}
            {isResizing && <div style={{ position: 'fixed', inset: 0, zIndex: 9999, cursor: 'col-resize' }} />}

            {/* Filter popover */}
            {filterOpen && filterPopoverPos && (
                <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 4000 }} onMouseDown={() => setFilterOpen(null)} />
                    <div style={{ position: 'fixed', top: filterPopoverPos.top, left: Math.min(filterPopoverPos.left, window.innerWidth - 220), zIndex: 4001, background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderRadius: '12px', padding: '0.85rem 1rem', boxShadow: '0 12px 40px rgba(0,0,0,0.22)' }} onMouseDown={e => e.stopPropagation()}>
                        {renderFilterContent()}
                    </div>
                </>
            )}

            {/* Right-click column context menu */}
            {ctxMenu && (
                <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 5000 }} onMouseDown={() => setCtxMenu(null)} onContextMenu={e => { e.preventDefault(); setCtxMenu(null); }} />
                    <div
                        role="menu"
                        style={{
                            position: 'fixed',
                            top: Math.min(ctxMenu.y, window.innerHeight - 130),
                            left: Math.min(ctxMenu.x, window.innerWidth - 230),
                            zIndex: 5001,
                            minWidth: '210px',
                            background: 'var(--surface-raised)',
                            border: '1px solid var(--surface-border)',
                            borderRadius: '10px',
                            padding: '0.35rem',
                            boxShadow: '0 12px 40px rgba(0,0,0,0.22)',
                        }}
                        onMouseDown={e => e.stopPropagation()}
                    >
                        <div style={{ padding: '0.25rem 0.6rem 0.4rem', fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 600, borderBottom: '1px solid var(--surface-border)', marginBottom: '0.25rem' }}>
                            {COL_LABELS[colOrder[ctxMenu.colIdx]]}
                        </div>
                        <button onClick={() => freezeUpTo(ctxMenu.colIdx)} style={ctxItemStyle}>
                            Freeze this column
                        </button>
                        {freezeCount > 0 && (
                            <button onClick={unfreezeAll} style={ctxItemStyle}>
                                Unfreeze columns
                            </button>
                        )}
                        <button onClick={resetColumnWidths} style={ctxItemStyle}>
                            Reset all column widths
                        </button>
                        <button onClick={resetColOrder} style={ctxItemStyle}>
                            Reset column order
                        </button>
                    </div>
                </>
            )}

            {/* Page header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 className="primary-gradient-text" style={{ fontSize: '1.6rem', display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.15rem' }}>
                        <ReceiptText size={26} /> Sales Report
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        All sales bills — customer, amount, payment type, paid &amp; credit outstanding across the selected data range.
                    </p>
                    <p style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', marginTop: '0.2rem' }}>
                        Data range: {fmtDate(dateFrom)} – {fmtDate(dateTo)}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    {hasAnyColumnFilter && (
                        <button
                            onClick={clearAllFilters}
                            className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--primary)' }}>
                            <X size={13} /> Clear Filters
                        </button>
                    )}
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                            <Calendar size={14} style={{ position: 'absolute', left: '0.5rem', color: 'var(--text-tertiary)', pointerEvents: 'none', zIndex: 1 }} />
                            <select value={period} onChange={e => setPeriod(e.target.value as Period)} className="input-field" style={{ margin: 0, minWidth: '160px', paddingLeft: '1.8rem' }} title="Data Range">
                                {PERIODS.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
                            </select>
                        </div>
                        {period === 'custom' && (
                            <>
                                <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ padding: '0.35rem 0.6rem', borderRadius: '8px', border: '1px solid var(--surface-border)', fontSize: '0.82rem', background: 'var(--surface-base)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>to</span>
                                <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ padding: '0.35rem 0.6rem', borderRadius: '8px', border: '1px solid var(--surface-border)', fontSize: '0.82rem', background: 'var(--surface-base)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
                            </>
                        )}
                    </div>
                    <div style={{ position: 'relative' }}>
                        <button onClick={() => setShowExportMenu(p => !p)} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                            <Download size={15} /> Export <ChevronDown size={13} />
                        </button>
                        {showExportMenu && (
                            <>
                                <div style={{ position: 'fixed', inset: 0, zIndex: 4990 }} onClick={() => setShowExportMenu(false)} />
                                <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 4991, background: 'var(--surface-solid)', border: '1px solid var(--surface-border)', borderRadius: '12px', padding: '0.55rem', width: '280px', boxShadow: '0 12px 34px rgba(0,0,0,0.28)' }}>
                                    {([
                                        { section: 'All Data',         rows: exportRows,           sheet: 'Sales Report',   title: 'Sales Report',                    fileBase: `sales_report_${dateFrom}_${dateTo}` },
                                        { section: 'Customer Summary', rows: customerSummaryRows,   sheet: 'Customer Summary', title: 'Sales Report — Customer Summary', fileBase: `sales_report_customer_summary_${dateFrom}_${dateTo}` },
                                    ] as const).map((group, gi) => (
                                        <div key={group.section} style={{ marginTop: gi > 0 ? '0.5rem' : 0, paddingTop: gi > 0 ? '0.5rem' : 0, borderTop: gi > 0 ? '1px solid var(--surface-border)' : 'none' }}>
                                            <div style={{ padding: '0 0.15rem 0.35rem', fontSize: '0.66rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{group.section}</div>
                                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                                {([
                                                    { label: 'PDF',   Icon: FileText,        run: () => exportPDF(group.rows(), group.title, group.fileBase) },
                                                    { label: 'Excel', Icon: FileSpreadsheet, run: () => exportExcel(group.rows(), group.sheet, group.fileBase) },
                                                    { label: 'CSV',   Icon: FileType,        run: () => exportCSV(group.rows(), group.fileBase) },
                                                ] as const).map(item => (
                                                    <button key={item.label}
                                                        onClick={() => { item.run(); setShowExportMenu(false); }}
                                                        title={`Export ${group.section} as ${item.label}`}
                                                        style={{ flex: '1 1 4.5rem', minWidth: '4.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', background: 'var(--surface-base)', border: '1px solid var(--surface-border)', cursor: 'pointer', padding: '0.5rem 0.4rem', borderRadius: '9px', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-primary)', font: 'inherit' }}
                                                        onMouseEnter={e => { e.currentTarget.style.background = 'hsla(263,70%,60%,0.12)'; e.currentTarget.style.borderColor = 'var(--primary)'; }}
                                                        onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-base)'; e.currentTarget.style.borderColor = 'var(--surface-border)'; }}>
                                                        <item.Icon size={16} />
                                                        {item.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Table hint bar */}
            <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', marginBottom: '0.75rem', padding: '0.4rem 1rem', fontSize: '0.72rem', color: 'var(--text-tertiary)', flexWrap: 'wrap' }}>
                <span>Drag column headers to reorder.</span>
                <span>Drag column edges to resize.</span>
                <span>Right-click a header to freeze or reset.</span>
                {freezeCount > 0 && (
                    <span style={{ marginLeft: 'auto', color: 'var(--primary)', fontWeight: 600 }}>
                        Frozen up to “{COL_LABELS[colOrder[freezeCount - 1]]}”
                    </span>
                )}
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '4rem' }}><Loader2 className="animate-spin" size={28} style={{ margin: '0 auto' }} /></div>
            ) : (
                <div className="glass-panel" style={{ borderRadius: '12px', overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto', maxHeight: '72vh', overflowY: 'auto' }} onContextMenu={handleTableContextMenu}>
                        <table style={{ width: totalTableWidth, tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: '0.82rem' }}>

                            <colgroup>
                                {colOrder.map(key => (
                                    <col key={key}
                                        ref={el => { if (el) colElRefs.current[key] = el; else delete colElRefs.current[key]; }}
                                        style={{ width: colWidths[key] }}
                                    />
                                ))}
                            </colgroup>

                            <thead>
                                <tr ref={headerRowRef} style={{ borderBottom: '2px solid var(--surface-border)', color: 'var(--text-secondary)' }}>
                                    {colOrder.map((key, colIdx) => renderHeaderTh(key, colIdx))}
                                </tr>
                                <tr style={{ position: 'sticky', top: headerH, zIndex: 2, background: 'var(--surface-raised)', fontWeight: 800, borderBottom: '2px solid var(--surface-border)' } as React.CSSProperties}>
                                    {colOrder.map((key, colIdx) => renderGrandTd(key, colIdx))}
                                </tr>
                            </thead>

                            <tbody>
                                {displayRows.length === 0 ? (
                                    <tr><td colSpan={colOrder.length} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>No sales bills found for this filter.</td></tr>
                                ) : displayRows.map((r, i) => (
                                    <tr key={r.orderId} style={{ borderBottom: '1px solid var(--surface-border)', background: i % 2 === 0 ? 'transparent' : 'hsla(0,0%,50%,0.03)' }}>
                                        {colOrder.map((key, colIdx) => renderBodyTd(key, colIdx, r, i))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
