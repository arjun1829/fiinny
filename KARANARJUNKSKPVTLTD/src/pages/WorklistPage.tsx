import { useState, useEffect, useLayoutEffect, useMemo, useRef, Fragment } from 'react';
import { useHashTab } from '../hooks/useHashTab';
import { useNavigate } from 'react-router-dom';
import {
    Download, Store, Filter,
    Users, Building2, UserPlus, Calendar,
    Bell, ShoppingCart, Truck, Mail, MessageSquare, Wallet,
    X, Copy, CheckSquare, FileText, ChevronDown, ChevronRight, Phone, Clock, Columns3,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getDocs, orderBy, query, where, collection } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useFeaturePermissions } from '../hooks/useFeaturePermissions';
import { getTenantCollection } from '../utils/tenantPath';
import UdhariUploadModal from '../components/UdhariUploadModal';
import { type FinancialPeriod, getFinancialDateRange } from '../utils/financialPeriod';
import { useColumnLayout } from '../hooks/useColumnLayout';
import { computePromiseDate } from '../utils/paymentTerms';
import {
    HDR_COL_STYLE, SortLabel, ColumnTextFilter, ColumnNumFilter, ColumnMultiSelectFilter,
    EMPTY_NUM, isNumActive, matchNum, type NumFilter,
} from '../components/tableFilters';

// Import sub-pages directly (WorklistPage itself is lazy-loaded by App.tsx)
import PaymentRemindersPage from './PaymentRemindersPage';
import AllPaymentsPage from './AllPaymentsPage';
import OnlineOrdersPage from './OnlineOrdersPage';
import DispatchBoardPage from './DispatchBoardPage';
// TEMPORARILY DISABLED (2026-07-03): Worklist → Purchase Orders is incomplete/broken.
// Hidden until rebuilt — do not delete. Re-enable by restoring this import and the
// tab entry/render below. Unrelated to Supplier Ledger → Purchase Orders, which uses
// its own PurchaseOrderModal component and is unaffected by this change.
// import PurchaseOrdersPage from './PurchaseOrdersPage';
import B2BInvoiceWorklistPage from './B2BInvoiceWorklistPage';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A salesOrder that should still count toward a retailer's figures.
 *
 * Bills can be soft-deleted (`deleted: true`) or cancelled (`status:
 * 'cancelled'`) from Digital Khata. Both of those pages already exclude them —
 * DigitalKhataPage when it builds its entry list, and POSPage in
 * fetchLiveOutstanding — but this page did not, so a cancelled bill kept
 * inflating Total Sales, Total Invoice Value and outstanding here while
 * disappearing everywhere else. POS's own comment promises the invoice figure
 * cannot diverge from the Khata worklist balance; this keeps that true.
 */
const isLiveSalesOrder = (so: { status?: string; deleted?: boolean }): boolean =>
    !so.deleted && String(so.status ?? '').toLowerCase() !== 'cancelled';

interface Retailer {
    id: string;
    name?: string;
    location?: string;
    district?: string;
    taluka?: string;
    atPost?: string;
    number?: string;
    alternateNumber?: string;
    portfolioSize?: string;
    email?: string;
    bookName?: string;
    billBookPageNo?: string;
    createdAt?: { toMillis?: () => number };
    // Denormalized financial fields kept in sync by all invoice/payment mutations
    outstandingAmount?: number;
    totalSales?: number;
    totalPaid?: number;
    closestCreditDays?: number | null;
    computedOutstanding?: number;
    // Live per-retailer totals — same formula as WorklistDetailsPage's
    // computedTotalSales/computedTotalPaid (sum of live salesOrders / all payments).
    computedTotalSales?: number;
    computedTotalPaid?: number;
    assignedSalespersons?: string[];
    // Payment follow-up columns (derived / optional). lastPaymentDate and
    // lastBillDate are computed from the payment (paymentDate) and salesOrder
    // (invoiceDate — the ACTUAL bill date, never createdAt) entries already loaded.
    // promiseDate is DERIVED from the most recent still-outstanding invoice's actual
    // invoiceDate + its payment term (modeOfPayment) — never a manually stored field.
    // collectionPercent is read straight from the retailer doc if configured there.
    lastPaymentDate?: string;   // YYYY-MM-DD of most recent payment
    lastBillDate?: string;      // YYYY-MM-DD of most recent invoice/bill (invoiceDate)
    promiseDate?: string;       // derived from latest outstanding invoice's term
}

interface ReminderEntry {
    id: string;
    name: string;
    number?: string;
    email?: string;
    pendingAmount: number;
    pendingOrderCount: number;
    closestCreditDays: number | null;
}

// 'purchase-orders' removed from the union — TEMPORARILY DISABLED (2026-07-03), see note above.
// Tab IDs are URL-hash-safe slugs. Renames: tracking-info→tracking. The 'payments' hash now
// drives the global All Payments view; Payment Reminders moved to the 'reminders' hash.
type ModuleTab = 'partners' | 'invoices' | 'payments' | 'reminders' | 'tracking' | 'online-orders' /* | 'purchase-orders' */;
const VALID_TABS: readonly ModuleTab[] = ['partners', 'invoices', 'payments', 'reminders', 'tracking', 'online-orders'];

// ── Partners table column layout (resize / freeze / reorder / persistence) ──────
// Same Google-Sheets-style table system as the Stock Report / Product Master
// (useColumnLayout + tableFilters). 'select' (bulk checkbox) and 'expand' (detail
// chevron) are utility columns; 'select' is dropped for view-only roles.
type PartnerColKey =
    | 'select' | 'name' | 'contact' | 'district' | 'salesperson'
    | 'portfolio' | 'totalInvoice' | 'paymentReceived' | 'outstanding'
    | 'lastPayment' | 'lastBillDate' | 'promiseDate'
    | 'expand';

const PARTNER_ALL_KEYS: PartnerColKey[] = [
    'select', 'name', 'contact', 'district', 'salesperson',
    'portfolio', 'totalInvoice', 'paymentReceived', 'outstanding',
    'lastPayment', 'lastBillDate', 'promiseDate',
    'expand',
];

const PARTNER_LABELS: Record<PartnerColKey, string> = {
    select: 'Select', name: 'Retailer Name', contact: 'Contact', district: 'District',
    salesperson: 'Salesperson', portfolio: 'Portfolio', totalInvoice: 'Total Invoice Amount',
    paymentReceived: 'Payment Received', outstanding: 'Outstanding',
    lastPayment: 'Last Payment', lastBillDate: 'Last Bill Date', promiseDate: 'Promise Date',
    expand: 'Details',
};

const PARTNER_DEFAULT_WIDTHS: Record<PartnerColKey, number> = {
    select: 44, name: 240, contact: 150, district: 140, salesperson: 180,
    portfolio: 130, totalInvoice: 175, paymentReceived: 160, outstanding: 150,
    lastPayment: 140, lastBillDate: 140, promiseDate: 140,
    expand: 48,
};

const PARTNER_ALIGN: Record<PartnerColKey, 'left' | 'right' | 'center'> = {
    select: 'center', name: 'left', contact: 'left', district: 'left', salesperson: 'left',
    portfolio: 'left', totalInvoice: 'right', paymentReceived: 'right', outstanding: 'right',
    lastPayment: 'left', lastBillDate: 'left', promiseDate: 'left',
    expand: 'center',
};

// Columns that support click-to-sort, and the value each sorts on.
type PartnerSortKey =
    | 'name' | 'contact' | 'district' | 'salesperson'
    | 'portfolio' | 'totalInvoice' | 'paymentReceived' | 'outstanding'
    | 'lastPayment' | 'lastBillDate' | 'promiseDate';

// Sentinel value for the Salesperson checklist's "Unassigned" option.
const UNASSIGNED_SP = '__unassigned__';
const PORTFOLIO_RANK: Record<string, number> = { Small: 1, Medium: 2, Big: 3 };

// Partner Worklist's date filter — a subset of FinancialPeriod (no 'fy', which this
// filter doesn't expose) driving both the dropdown options and its trigger label.
const WORKLIST_DATE_FILTER_OPTIONS: [FinancialPeriod, string][] = [
    ['today',  'Today'],
    ['week',   'This Week'],
    ['month',  'This Month'],
    ['all',    'All Time'],
    ['custom', 'Custom Range'],
];
const WORKLIST_DATE_FILTER_LABELS: Record<FinancialPeriod, string> =
    Object.fromEntries(WORKLIST_DATE_FILTER_OPTIONS) as Record<FinancialPeriod, string>;

const MODULE_TABS: { id: ModuleTab; label: string; icon: React.ReactNode }[] = [
    { id: 'partners',      label: 'Partners',          icon: <Building2 size={16} /> },
    { id: 'invoices',      label: 'Invoices',          icon: <FileText size={16} /> },
    { id: 'payments',      label: 'Payments',          icon: <Wallet size={16} /> },
    { id: 'reminders',     label: 'Payment Reminders', icon: <Bell size={16} /> },
    { id: 'tracking',      label: 'Tracking Info',     icon: <Truck size={16} /> },
    { id: 'online-orders', label: 'Online Orders',     icon: <ShoppingCart size={16} /> },
    // TEMPORARILY DISABLED (2026-07-03): Purchase Orders tab hidden until rebuilt — do not delete.
    // { id: 'purchase-orders', label: 'Purchase Orders', icon: <ShoppingCart size={16} /> },
];

// ─── Main Component ───────────────────────────────────────────────────────────

const TAB_PERM: Record<ModuleTab, string> = {
    'partners':      'worklist.partners.view',
    'invoices':      'worklist.invoices.view',
    'payments':      'worklist.payments.view',
    'reminders':     'worklist.reminders.view',
    'tracking':      'worklist.tracking.view',
    'online-orders': 'worklist.onlineOrders.view',
};

export default function WorklistPage() {
    const can = useFeaturePermissions();
    const [moduleTab, setModuleTab] = useHashTab<ModuleTab>(VALID_TABS, 'partners', 'fiinny-tab-worklist', tab => can(TAB_PERM[tab]));

    // Sub-tab visibility is driven SOLELY by the Feature Matrix (single source of
    // truth). Per-role denials (sales/retailer/analyst) now live in
    // DEFAULT_FEATURE_PERMISSIONS instead of hardcoded page guards.
    const visibleTabs = MODULE_TABS.filter(tab => can(TAB_PERM[tab.id]));

    // Guard: only render tab content for the currently permitted active tab.
    // Without this, direct URL navigation to a denied hash would still trigger
    // the content component because moduleTab === 'X' would be true even if the
    // tab is hidden from the tab bar.
    const activeAllowed = visibleTabs.some(t => t.id === moduleTab);

    useEffect(() => {
        if (!activeAllowed && visibleTabs.length > 0) setModuleTab(visibleTabs[0].id);
    }, [activeAllowed, visibleTabs, setModuleTab]);

    return (
        <div className="animate-fade-in" style={{ width: '100%' }}>
            {/* ── Tab Bar ── */}
            <div
            style={{
                position: 'sticky',
                top: 0,
                zIndex: 50,
                background: 'var(--surface-base)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                display: 'flex',
                gap: '0.25rem',
                borderBottom: '2px solid var(--surface-border)',
                overflowX: 'auto',
                scrollbarWidth: 'none',
                marginLeft: '-2rem',
                marginRight: '-2rem',
                paddingLeft: '2rem',
                paddingRight: '2rem',
                marginTop: '-2rem',
                paddingTop: '0.75rem',
                marginBottom: '1.75rem',
            }}
            >
                {visibleTabs.map(tab => {
                    const active = moduleTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setModuleTab(tab.id)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.65rem 1.25rem',
                                background: 'transparent',
                                border: 'none',
                                borderBottom: active
                                    ? '2px solid var(--primary-light)'
                                    : '2px solid transparent',
                                marginBottom: '-2px',
                                color: active ? 'var(--primary-light)' : 'var(--text-tertiary)',
                                fontWeight: active ? 700 : 400,
                                fontSize: '0.9rem',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                whiteSpace: 'nowrap',
                                transition: 'all 0.15s ease',
                                borderRadius: '0',
                            }}
                        >
                            <span style={{ opacity: active ? 1 : 0.6 }}>{tab.icon}</span>
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* ── Tab Content ── */}
            {activeAllowed && moduleTab === 'partners'      && <PartnersTab />}
            {activeAllowed && moduleTab === 'invoices'      && <B2BInvoiceWorklistPage />}
            {activeAllowed && moduleTab === 'payments'      && <AllPaymentsPage />}
            {activeAllowed && moduleTab === 'reminders'     && <PaymentRemindersPage />}
            {activeAllowed && moduleTab === 'tracking'      && <DispatchBoardPage />}
            {activeAllowed && moduleTab === 'online-orders' && <OnlineOrdersPage />}
            {/* TEMPORARILY DISABLED (2026-07-03): Purchase Orders tab content hidden until rebuilt — do not delete. */}
            {/* {moduleTab === 'purchase-orders' && <PurchaseOrdersPage />} */}
        </div>
    );
}

// ─── Partners Tab (former WorklistPage content) ───────────────────────────────

function PartnersTab() {
    const navigate = useNavigate();
    const { tenantId, userRole, assignedDistricts, assignedRetailers } = useAuth();
    const can = useFeaturePermissions();
    const isSales = userRole === 'sales';
    const isRetailer = userRole === 'retailer';
    const isViewOnly = isSales || isRetailer;
    const { t } = useTranslation();
    const [retailers, setRetailers] = useState<Retailer[]>([]);
    const [loading, setLoading] = useState(true);
    const [showUdhariModal, setShowUdhariModal] = useState(false);

    // Raw dated sales/payment entries per retailer — kept alongside `retailers`
    // (which carries the already-computed all-time financials) so the date
    // filter can recompute computedTotalSales/computedTotalPaid/computedOutstanding
    // for a range without a second Firestore read.
    const [sosByRetailer, setSosByRetailer] = useState<Map<string, { invoiceDate?: string; grandTotal?: number; netAmount?: number; totalAmount?: number }[]>>(new Map());
    const [pmtsByRetailer, setPmtsByRetailer] = useState<Map<string, { amount: number; paymentDate?: string }[]>>(new Map());
    const [financialPeriod, setFinancialPeriod] = useState<FinancialPeriod>('all');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');
    const [showDateDropdown, setShowDateDropdown] = useState(false);
    const dateDropdownRef = useRef<HTMLDivElement>(null);

    // Close the date filter dropdown on any click outside it.
    useEffect(() => {
        if (!showDateDropdown) return;
        const onDown = (e: MouseEvent) => {
            if (dateDropdownRef.current?.contains(e.target as Node)) return;
            setShowDateDropdown(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [showDateDropdown]);

    // Column-visibility ("Columns") dropdown.
    const [showColumnsDropdown, setShowColumnsDropdown] = useState(false);
    const columnsDropdownRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!showColumnsDropdown) return;
        const onDown = (e: MouseEvent) => {
            if (columnsDropdownRef.current?.contains(e.target as Node)) return;
            setShowColumnsDropdown(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [showColumnsDropdown]);

    const [partnerView, setPartnerView] = useState<'all' | 'active' | 'cleared'>('all');

    // ── Per-column filters (AND-combined, all recompute processedRetailers) ──────
    const [fName, setFName]                 = useState('');
    const [fContact, setFContact]           = useState('');
    const [fDistrict, setFDistrict]         = useState('');
    const [fSalespersons, setFSalespersons] = useState<string[]>([]); // [] = all
    const [fPortfolios, setFPortfolios]     = useState<string[]>([]); // [] = all
    const [fTotalInvoice, setFTotalInvoice] = useState<NumFilter>(EMPTY_NUM);
    const [fPayment, setFPayment]           = useState<NumFilter>(EMPTY_NUM);
    const [fOutstanding, setFOutstanding]   = useState<NumFilter>(EMPTY_NUM);
    const [fLastPayment, setFLastPayment]   = useState('');
    const [fLastBill, setFLastBill]         = useState('');
    const [fPromise, setFPromise]           = useState('');

    // ── Column sort (null = default fetch order, i.e. newest retailer first) ─────
    const [sortCol, setSortCol] = useState<PartnerSortKey | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const toggleSort = (col: PartnerSortKey) => {
        if (sortCol === col) { if (sortDir === 'asc') setSortDir('desc'); else setSortCol(null); }
        else { setSortCol(col); setSortDir(col === 'name' || col === 'contact' || col === 'district' || col === 'salesperson' || col === 'portfolio' || col === 'lastPayment' || col === 'lastBillDate' || col === 'promiseDate' ? 'asc' : 'desc'); }
    };

    // ── Payment follow-up helpers ────────────────────────────────────────────────
    // Formats a 'YYYY-MM-DD' date string; blank/invalid → "—".
    const fmtDate = (s?: string): string => {
        if (!s) return '—';
        const d = new Date(s);
        return isNaN(d.getTime())
            ? '—'
            : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
    };

    // ── Column layout: resize / freeze / reorder / localStorage persistence ──────
    // 'select' only exists for roles that can act on partners (bulk reminders).
    const activeColKeys = useMemo(
        () => PARTNER_ALL_KEYS.filter(k => k !== 'select' || !isViewOnly),
        [isViewOnly],
    );
    const layout = useColumnLayout<PartnerColKey>({
        keys: activeColKeys,
        insertMissingAtDefaultIndex: true,
        defaultWidths: PARTNER_DEFAULT_WIDTHS,
        labels: PARTNER_LABELS,
        storageKey: 'fiinny_partners',
        tenantId,
        minWidth: 44,
    });

    // Grand-total row sticks just below the (also sticky) header row.
    const headerRowRef = useRef<HTMLTableRowElement>(null);
    const [headerH, setHeaderH] = useState(0);


    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const toggleExpand = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setExpandedRows(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    };
    const [spTooltip, setSpTooltip] = useState<string | null>(null);

    // ── Selection & bulk correspondence ──────────────────────────────────────
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [showReminderModal, setShowReminderModal] = useState(false);
    const [reminderData, setReminderData] = useState<ReminderEntry[]>([]);
    const [loadingReminders, setLoadingReminders] = useState(false);

    const handleSelectionChange = (id: string, selected: boolean) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (selected) next.add(id); else next.delete(id);
            return next;
        });
    };

    const handleSelectAll = () =>
        setSelectedIds(new Set(processedRetailers.map(r => r.id)));

    const handleClearSelection = () => setSelectedIds(new Set());

    const handleSendReminder = async () => {
        if (!tenantId || selectedIds.size === 0) return;
        setLoadingReminders(true);
        try {
            const selected = processedRetailers.filter(r => selectedIds.has(r.id));
            const entries: ReminderEntry[] = await Promise.all(
                selected.map(async (r) => {
                    const q = query(
                        getTenantCollection(db, tenantId, 'salesOrders'),
                        where('retailerId', '==', r.id)
                    );
                    const snap = await getDocs(q);
                    const pendingOrderCount = snap.docs
                        .filter(d => {
                            const so = d.data() as { paymentStatus?: string; status?: string; deleted?: boolean };
                            return isLiveSalesOrder(so) && so.paymentStatus?.toLowerCase() !== 'paid';
                        })
                        .length;
                    // Use total outstanding (Total Sales − Total Payments Received).
                    // r.computedOutstanding already reflects all received payments,
                    // not just those linked to specific invoices.
                    const pendingAmount = r.computedOutstanding ?? 0;
                    return {
                        id: r.id,
                        name: r.name || '—',
                        number: r.number,
                        email: r.email,
                        pendingAmount,
                        pendingOrderCount,
                        closestCreditDays: r.closestCreditDays ?? null,
                    };
                })
            );
            setReminderData(entries);
            setShowReminderModal(true);
        } finally {
            setLoadingReminders(false);
        }
    };

    useEffect(() => {
        const fetchRetailers = async () => {
            if (!tenantId) return;
            try {
                // 3 parallel reads — retailers, salesOrders, and sales users.
                // Payments are fetched per-retailer in a second parallel step after
                // retailer IDs are known, eliminating the cross-tenant collectionGroup risk.
                const isMasterTenant = tenantId === 'master';
                const [retailersSnap, salesOrdersSnap, salesUsersSnap] = await Promise.all([
                    getDocs(query(getTenantCollection(db, tenantId, 'retailers'), orderBy('createdAt', 'desc'))),
                    getDocs(getTenantCollection(db, tenantId, 'salesOrders')),
                    getDocs(query(collection(db, 'users'), where('tenantId', '==', tenantId))),
                ]);

                // Derive the set of B2B retailer IDs (POS walk-ins and soft-deleted excluded)
                // to drive the per-retailer payment queries below.
                const b2bRetailerIds = retailersSnap.docs
                    .filter(d => {
                        const data = d.data() as { channel?: string; deleted?: boolean };
                        return data.channel !== 'pos' && !data.deleted;
                    })
                    .map(d => d.id);

                // Fetch payments for each B2B retailer in parallel — naturally scoped to
                // this tenant because getTenantCollection routes to the correct path prefix.
                const pmtSnaps = await Promise.all(
                    b2bRetailerIds.map(rId =>
                        getDocs(getTenantCollection(db, tenantId, 'retailers', rId, 'payments'))
                    )
                );

                // Build retailer → salesperson(s) reverse map from user assignments.
                // Each retailer may have multiple salespersons (district-wide + direct).
                const spByRetailerId = new Map<string, string[]>();
                const spByDistrict   = new Map<string, string[]>();
                salesUsersSnap.docs.forEach(udoc => {
                    const u = udoc.data();
                    if (u.role !== 'sales') return;
                    const spName: string = u.name || '—';
                    (u.assignedRetailers ?? []).forEach((rId: string) => {
                        const arr = spByRetailerId.get(rId) ?? [];
                        if (!arr.includes(spName)) arr.push(spName);
                        spByRetailerId.set(rId, arr);
                    });
                    (u.assignedDistricts ?? []).forEach((d: string) => {
                        const key = d.toLowerCase();
                        const arr = spByDistrict.get(key) ?? [];
                        if (!arr.includes(spName)) arr.push(spName);
                        spByDistrict.set(key, arr);
                    });
                });

                // Aggregate payment amounts per retailer from the per-retailer snapshots.
                // rId is known from the array index — no path parsing needed.
                const paymentsByRetailer = new Map<string, number>();
                const rawPmtsByRetailerMap = new Map<string, { amount: number; paymentDate?: string }[]>();
                pmtSnaps.forEach((snap, idx) => {
                    const rId = b2bRetailerIds[idx];
                    snap.docs.forEach(pdoc => {
                        const amt = Number(pdoc.data().amount ?? 0);
                        paymentsByRetailer.set(rId, (paymentsByRetailer.get(rId) ?? 0) + amt);
                        const pmtArr = rawPmtsByRetailerMap.get(rId) ?? [];
                        pmtArr.push({ amount: amt, paymentDate: pdoc.data().paymentDate });
                        rawPmtsByRetailerMap.set(rId, pmtArr);
                    });
                });

                // Group salesOrders by retailerId (include financial fields for outstanding calc).
                type SOEntry = { invoiceDate?: string; status?: string; paymentStatus?: string; modeOfPayment?: string; dueDate?: string; grandTotal?: number; netAmount?: number; totalAmount?: number; amountPaid?: number; deleted?: boolean };
                const salesByRetailer = new Map<string, SOEntry[]>();
                salesOrdersSnap.docs.forEach(doc => {
                    const so = doc.data() as { retailerId?: string } & SOEntry;
                    if (!so.retailerId) return;
                    // Filtered at the grouping step so every downstream figure —
                    // total sales, outstanding, due dates, invoice value — sees the
                    // same set of bills.
                    if (!isLiveSalesOrder(so)) return;
                    const arr = salesByRetailer.get(so.retailerId);
                    if (arr) arr.push(so); else salesByRetailer.set(so.retailerId, [so]);
                });

                const today = new Date(); today.setHours(0, 0, 0, 0);

                const retailersWithStatus: Retailer[] = retailersSnap.docs
                    // Exclude B2C walk-in customers auto-created at the POS counter —
                    // they are not B2B partners and shouldn't appear in this worklist.
                    // Also exclude soft-deleted retailers (deleted: true) — every other
                    // consumer of this collection (Manage Retailers, Recently Deleted)
                    // filters on the same flag; this fetch must match that contract.
                    .filter(d => {
                        const data = d.data() as { channel?: string; deleted?: boolean };
                        return data.channel !== 'pos' && !data.deleted;
                    })
                    .map(doc => {
                    const r = { id: doc.id, ...doc.data() } as Retailer;
                    const salesOrders = salesByRetailer.get(r.id) ?? [];

                    const pendingSOs = salesOrders.filter(so => so.paymentStatus?.toLowerCase() !== 'paid');
                    const dueDates = pendingSOs
                        .map(so => so.dueDate ? new Date(so.dueDate) : null)
                        .filter((d): d is Date => d !== null && !isNaN(d.getTime()));
                    const nearestDue = dueDates.length > 0
                        ? dueDates.sort((a, b) => a.getTime() - b.getTime())[0]
                        : null;
                    const closestCreditDays: number | null = nearestDue !== null
                        ? Math.round((nearestDue.getTime() - today.getTime()) / 864e5)
                        : null;

                    // EXACT same formula as WorklistDetailsPage (retailer profile page):
                    //   computedTotalSales = sum(salesOrder.grandTotal | netAmount | totalAmount)
                    //   computedTotalPaid  = sum(payments.amount) from payments subcollection
                    //   computedOutstanding = max(0, computedTotalSales - computedTotalPaid)
                    // Linked/unlinked status does not matter — every payment entry counts.
                    const soList = salesByRetailer.get(r.id) ?? [];
                    const soTotalSales = soList.reduce((s, so) => s + Number(so.grandTotal ?? so.netAmount ?? so.totalAmount ?? 0), 0);
                    const soTotalPaid  = paymentsByRetailer.get(r.id) ?? 0;
                    const computedOutstanding = Math.max(0, soTotalSales - soTotalPaid);

                    // Most recent bill/payment dates. invoiceDate is the ACTUAL bill date
                    // stored on the salesOrder — never the Firestore createdAt. Dates are
                    // 'YYYY-MM-DD' strings, so a plain string max yields the latest one.
                    const lastBillDate = soList.reduce(
                        (max, so) => (so.invoiceDate && so.invoiceDate > max ? so.invoiceDate : max), '');
                    const lastPaymentDate = (rawPmtsByRetailerMap.get(r.id) ?? []).reduce(
                        (max, p) => (p.paymentDate && p.paymentDate > max ? p.paymentDate : max), '');

                    // Promise Date — derived, never stored. Take the retailer's most
                    // recent invoice (by actual invoiceDate) that is NOT fully paid,
                    // then add its payment-term days (modeOfPayment) to that invoice
                    // date. Fully-paid invoices are ignored; no outstanding bills → ''.
                    // Matches the pendingSOs 'paid' check used elsewhere on this page.
                    const latestOutstanding = soList.reduce<SOEntry | null>((latest, so) => {
                        if (!so.invoiceDate) return latest;
                        if (String(so.paymentStatus ?? '').toLowerCase() === 'paid') return latest;
                        return (!latest || so.invoiceDate > (latest.invoiceDate ?? '')) ? so : latest;
                    }, null);
                    const promiseDate = latestOutstanding
                        ? computePromiseDate(latestOutstanding.invoiceDate, latestOutstanding.modeOfPayment)
                        : undefined;

                    // Merge direct assignments and district-based assignments, deduplicated.
                    // Direct assignments come first so they appear before district-based ones.
                    const directSPs  = spByRetailerId.get(r.id) ?? [];
                    const districtSPs = spByDistrict.get((r.district || '').toLowerCase()) ?? [];
                    const merged = [...directSPs];
                    districtSPs.forEach(sp => { if (!merged.includes(sp)) merged.push(sp); });
                    const assignedSalespersons = merged;
                    return {
                        ...r, closestCreditDays, computedOutstanding, assignedSalespersons,
                        computedTotalSales: soTotalSales, computedTotalPaid: soTotalPaid,
                        lastBillDate, lastPaymentDate, promiseDate,
                    };
                });

                // Sales users see retailers matching assignedDistricts OR assignedRetailers (union).
                // Retailer users see only their own shop (exactly one entry in assignedRetailers).
                if (userRole === 'sales') {
                    const lowerDistricts = assignedDistricts.map(d => d.toLowerCase());
                    const retailerIdSet = new Set(assignedRetailers);
                    if (lowerDistricts.length === 0 && retailerIdSet.size === 0) {
                        setRetailers([]); // no access configured
                    } else {
                        setRetailers(retailersWithStatus.filter(r =>
                            lowerDistricts.includes((r.district || '').toLowerCase()) ||
                            retailerIdSet.has(r.id)
                        ));
                    }
                } else if (userRole === 'retailer') {
                    const retailerIdSet = new Set(assignedRetailers);
                    setRetailers(retailerIdSet.size > 0
                        ? retailersWithStatus.filter(r => retailerIdSet.has(r.id))
                        : []
                    );
                } else {
                    setRetailers(retailersWithStatus);
                }
                setSosByRetailer(salesByRetailer);
                setPmtsByRetailer(rawPmtsByRetailerMap);
            } catch (error) {
                console.error('Error fetching retailers: ', error);
            } finally {
                setLoading(false);
            }
        };
        fetchRetailers();
    }, [tenantId, userRole, assignedDistricts.join('|'), assignedRetailers.join('|')]);

    // Recomputes each retailer's computedTotalSales/computedTotalPaid/computedOutstanding
    // scoped to the selected date range, using the exact same formula as the all-time
    // calculation above (sum of live salesOrders' grandTotal|netAmount|totalAmount,
    // sum of payments.amount) — just restricted to entries whose invoiceDate/paymentDate
    // falls inside the range. 'All Time' short-circuits to the already-computed values
    // so no retailer/financial data is recalculated unnecessarily.
    const dateFilteredRetailers = useMemo(() => {
        const range = getFinancialDateRange(financialPeriod, customFrom, customTo);
        if (!range) return retailers;
        const [from, to] = range;
        return retailers.map(r => {
            const soList = sosByRetailer.get(r.id) ?? [];
            const pmtList = pmtsByRetailer.get(r.id) ?? [];
            const totalSales = soList
                .filter(so => { const d = so.invoiceDate || ''; return d >= from && d <= to; })
                .reduce((s, so) => s + Number(so.grandTotal ?? so.netAmount ?? so.totalAmount ?? 0), 0);
            const totalPaid = pmtList
                .filter(p => { const d = p.paymentDate || ''; return d >= from && d <= to; })
                .reduce((s, p) => s + Number(p.amount ?? 0), 0);
            return {
                ...r,
                computedTotalSales: totalSales,
                computedTotalPaid: totalPaid,
                computedOutstanding: Math.max(0, totalSales - totalPaid),
            };
        });
    }, [retailers, sosByRetailer, pmtsByRetailer, financialPeriod, customFrom, customTo]);

    const processedRetailers = useMemo(() => {
        let result = [...dateFilteredRetailers];
        // Outstanding quick-filter — uses Total Sales − Amount Paid (matches profile page)
        if (partnerView === 'active')  result = result.filter(r => (r.computedOutstanding ?? 0) > 0);
        if (partnerView === 'cleared') result = result.filter(r => (r.computedOutstanding ?? 0) <= 0);

        // ── Per-column filters (AND-combined) ────────────────────────────────────
        if (fName.trim())     { const q = fName.trim().toLowerCase();     result = result.filter(r => (r.name || '').toLowerCase().includes(q)); }
        if (fContact.trim())  { const q = fContact.trim().toLowerCase();  result = result.filter(r => (r.number || '').toLowerCase().includes(q) || (r.alternateNumber || '').toLowerCase().includes(q)); }
        if (fDistrict.trim()) { const q = fDistrict.trim().toLowerCase(); result = result.filter(r => (r.district || '').toLowerCase().includes(q)); }

        if (fSalespersons.length > 0) {
            const wantUnassigned = fSalespersons.includes(UNASSIGNED_SP);
            const named = fSalespersons.filter(s => s !== UNASSIGNED_SP);
            result = result.filter(r => {
                const sps = r.assignedSalespersons ?? [];
                if (wantUnassigned && sps.length === 0) return true;
                return named.some(n => sps.includes(n));
            });
        }
        if (fPortfolios.length > 0) result = result.filter(r => fPortfolios.includes(r.portfolioSize || ''));

        if (isNumActive(fTotalInvoice)) result = result.filter(r => matchNum(r.computedTotalSales ?? 0, fTotalInvoice));
        if (isNumActive(fPayment))      result = result.filter(r => matchNum(r.computedTotalPaid ?? 0, fPayment));
        if (isNumActive(fOutstanding))  result = result.filter(r => matchNum(r.computedOutstanding ?? 0, fOutstanding));

        // ── Payment follow-up column filters ─────────────────────────────────────
        // Date filters match against the formatted label so "Jan"/"25" both work.
        if (fLastPayment.trim()) { const q = fLastPayment.trim().toLowerCase(); result = result.filter(r => fmtDate(r.lastPaymentDate).toLowerCase().includes(q)); }
        if (fLastBill.trim())    { const q = fLastBill.trim().toLowerCase();    result = result.filter(r => fmtDate(r.lastBillDate).toLowerCase().includes(q)); }
        if (fPromise.trim())     { const q = fPromise.trim().toLowerCase();     result = result.filter(r => fmtDate(r.promiseDate).toLowerCase().includes(q)); }

        // ── Column sort (null keeps default newest-first fetch order) ────────────
        if (sortCol) {
            const asc = sortDir === 'asc' ? 1 : -1;
            result.sort((a, b) => {
                switch (sortCol) {
                    case 'name':            return asc * (a.name || '').localeCompare(b.name || '');
                    case 'contact':         return asc * (a.number || '').localeCompare(b.number || '');
                    case 'district':        return asc * (a.district || '').localeCompare(b.district || '');
                    case 'salesperson':     return asc * (a.assignedSalespersons?.[0] || '').localeCompare(b.assignedSalespersons?.[0] || '');
                    case 'portfolio':       return asc * ((PORTFOLIO_RANK[a.portfolioSize || ''] ?? 0) - (PORTFOLIO_RANK[b.portfolioSize || ''] ?? 0));
                    case 'totalInvoice':    return asc * ((a.computedTotalSales ?? 0) - (b.computedTotalSales ?? 0));
                    case 'paymentReceived': return asc * ((a.computedTotalPaid ?? 0) - (b.computedTotalPaid ?? 0));
                    case 'outstanding':     return asc * ((a.computedOutstanding ?? 0) - (b.computedOutstanding ?? 0));
                    case 'lastPayment':     return asc * (a.lastPaymentDate || '').localeCompare(b.lastPaymentDate || '');
                    case 'lastBillDate':    return asc * (a.lastBillDate || '').localeCompare(b.lastBillDate || '');
                    case 'promiseDate':     return asc * (a.promiseDate || '').localeCompare(b.promiseDate || '');
                    default:                return 0;
                }
            });
        }
        return result;
    }, [dateFilteredRetailers, partnerView, fName, fContact, fDistrict, fSalespersons, fPortfolios, fTotalInvoice, fPayment, fOutstanding, fLastPayment, fLastBill, fPromise, sortCol, sortDir]);

    // Salesperson checklist options — distinct assigned names plus an Unassigned
    // bucket. Derived from the date-filtered set so the list reflects the range.
    const salespersonOptions = useMemo(() => {
        const set = new Set<string>();
        dateFilteredRetailers.forEach(r => (r.assignedSalespersons ?? []).forEach(sp => set.add(sp)));
        const named = [...set].sort((a, b) => a.localeCompare(b)).map(v => ({ value: v, label: v }));
        return [...named, { value: UNASSIGNED_SP, label: 'Unassigned' }];
    }, [dateFilteredRetailers]);

    // Portfolio checklist — fixed sizes (matches onboarding).
    const portfolioOptions = useMemo(
        () => [{ value: 'Small', label: 'Small' }, { value: 'Medium', label: 'Medium' }, { value: 'Big', label: 'Big' }],
        [],
    );

    const hasColumnFilter =
        fName.trim() !== '' || fContact.trim() !== '' || fDistrict.trim() !== '' ||
        fSalespersons.length > 0 || fPortfolios.length > 0 ||
        isNumActive(fTotalInvoice) || isNumActive(fPayment) || isNumActive(fOutstanding) ||
        fLastPayment.trim() !== '' || fLastBill.trim() !== '' || fPromise.trim() !== '';

    const clearAllFilters = () => {
        setFName(''); setFContact(''); setFDistrict('');
        setFSalespersons([]); setFPortfolios([]);
        setFTotalInvoice(EMPTY_NUM); setFPayment(EMPTY_NUM); setFOutstanding(EMPTY_NUM);
        setFLastPayment(''); setFLastBill(''); setFPromise('');
    };

    // Grand-total summary for the currently visible (filtered/searched) rows —
    // sorting does not affect it since it aggregates the whole processedRetailers
    // set regardless of order. Distinct counts normalize contact numbers by
    // stripping whitespace only (never altering the stored value).
    const worklistSummary = useMemo(() => {
        const distinctContacts = new Set(
            processedRetailers.map(r => (r.number || '').trim()).filter(Boolean)
        );
        const distinctSalespersons = new Set(
            processedRetailers.flatMap(r => r.assignedSalespersons ?? [])
        );
        const totalInvoiceAmount = processedRetailers.reduce((s, r) => s + (r.computedTotalSales ?? 0), 0);
        const totalPaymentReceived = processedRetailers.reduce((s, r) => s + (r.computedTotalPaid ?? 0), 0);
        const totalOutstanding = processedRetailers.reduce((s, r) => s + (r.computedOutstanding ?? 0), 0);
        return {
            retailerCount: processedRetailers.length,
            contactCount: distinctContacts.size,
            salespersonCount: distinctSalespersons.size,
            totalInvoiceAmount,
            totalPaymentReceived,
            totalOutstanding,
        };
    }, [processedRetailers]);

    // Escapes a value for CSV: wraps in quotes (and doubles any embedded quotes)
    // whenever it contains a comma, quote, or line break, per RFC 4180.
    const csvEscape = (val: string) =>
        /[",\n\r]/.test(val) ? `"${val.replace(/"/g, '""')}"` : val;

    // Exports exactly the rows/values currently shown in the table below \u2014 same
    // processedRetailers array (already filtered by Outstanding/Size/search/sort)
    // and the same per-cell values/formatting used in the <tbody> render.
    const handleExportCSV = () => {
        const headers = ['Retailer Name', 'Contact', 'District', 'Salesperson', 'Portfolio', 'Total Invoice Amount', 'Payment Received', 'Outstanding', 'Last Payment', 'Last Bill Date', 'Promise Date'];
        const csvRows = processedRetailers.map(r => {
            const outstanding = r.computedOutstanding ?? 0;
            const salesperson = (r.assignedSalespersons?.length ?? 0) > 0
                ? r.assignedSalespersons!.join('; ')
                : 'Unassigned';
            return [
                r.name || '\u2014',
                r.number || '\u2014',
                r.district || '\u2014',
                salesperson,
                r.portfolioSize || '\u2014',
                `\u20B9${(r.computedTotalSales ?? 0).toLocaleString('en-IN')}`,
                `\u20B9${(r.computedTotalPaid ?? 0).toLocaleString('en-IN')}`,
                `\u20B9${outstanding.toLocaleString('en-IN')}`,
                fmtDate(r.lastPaymentDate),
                fmtDate(r.lastBillDate),
                fmtDate(r.promiseDate),
            ].map(v => csvEscape(String(v))).join(',');
        });
        const csvContent = [headers.join(','), ...csvRows].join('\r\n');
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.setAttribute('href', URL.createObjectURL(blob));
        link.setAttribute('download', `karanarjun-worklist-${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Measure the header row so the grand-total row sticks directly beneath it.
    useLayoutEffect(() => {
        const measure = () => setHeaderH(headerRowRef.current?.offsetHeight ?? 0);
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, [layout.colWidths, layout.visibleOrder, layout.freezeCount, loading]);

    // ── Column renderers (colOrder-driven, like the Stock Report / Product Master) ─
    const renderHeaderTh = (key: PartnerColKey, colIdx: number) => {
        const align = PARTNER_ALIGN[key];
        const thBase: React.CSSProperties = {
            padding: '0.6rem 0.75rem', fontWeight: 600, fontSize: '0.78rem', textAlign: align,
            verticalAlign: 'top', overflow: 'hidden', color: 'var(--text-secondary)',
            position: 'sticky', top: 0, zIndex: 2, background: 'var(--surface-raised)',
            ...layout.stickyStyle(colIdx, { header: true, rowBg: 'var(--surface-raised)' }),
            ...(layout.isDragOver(key) ? { borderLeft: '3px solid var(--primary)' } : {}),
        };
        let inner: React.ReactNode;
        switch (key) {
            case 'select':
                inner = (
                    <input type="checkbox"
                        checked={selectedIds.size === processedRetailers.length && processedRetailers.length > 0}
                        onChange={e => e.target.checked ? handleSelectAll() : handleClearSelection()}
                        onClick={e => e.stopPropagation()}
                        style={{ cursor: 'pointer' }} />
                );
                break;
            case 'name': inner = (
                <div style={HDR_COL_STYLE}>
                    <SortLabel label="Retailer Name" active={sortCol === 'name'} dir={sortDir} onClick={() => toggleSort('name')} />
                    <ColumnTextFilter value={fName} onChange={setFName} placeholder="Search name…" />
                </div>
            ); break;
            case 'contact': inner = (
                <div style={HDR_COL_STYLE}>
                    <SortLabel label="Contact" active={sortCol === 'contact'} dir={sortDir} onClick={() => toggleSort('contact')} />
                    <ColumnTextFilter value={fContact} onChange={setFContact} placeholder="Search contact…" />
                </div>
            ); break;
            case 'district': inner = (
                <div style={HDR_COL_STYLE}>
                    <SortLabel label="District" active={sortCol === 'district'} dir={sortDir} onClick={() => toggleSort('district')} />
                    <ColumnTextFilter value={fDistrict} onChange={setFDistrict} placeholder="Search district…" />
                </div>
            ); break;
            case 'salesperson': inner = (
                <div style={HDR_COL_STYLE}>
                    <SortLabel label="Salesperson" active={sortCol === 'salesperson'} dir={sortDir} onClick={() => toggleSort('salesperson')} />
                    <ColumnMultiSelectFilter selected={fSalespersons} options={salespersonOptions} onChange={setFSalespersons} allLabel="All" />
                </div>
            ); break;
            case 'portfolio': inner = (
                <div style={HDR_COL_STYLE}>
                    <SortLabel label="Portfolio" active={sortCol === 'portfolio'} dir={sortDir} onClick={() => toggleSort('portfolio')} />
                    <ColumnMultiSelectFilter selected={fPortfolios} options={portfolioOptions} onChange={setFPortfolios} allLabel="All" />
                </div>
            ); break;
            case 'totalInvoice': inner = (
                <div style={HDR_COL_STYLE}>
                    <SortLabel label="Total Invoice Amount" align="right" active={sortCol === 'totalInvoice'} dir={sortDir} onClick={() => toggleSort('totalInvoice')} />
                    <ColumnNumFilter state={fTotalInvoice} onChange={setFTotalInvoice} />
                </div>
            ); break;
            case 'paymentReceived': inner = (
                <div style={HDR_COL_STYLE}>
                    <SortLabel label="Payment Received" align="right" active={sortCol === 'paymentReceived'} dir={sortDir} onClick={() => toggleSort('paymentReceived')} />
                    <ColumnNumFilter state={fPayment} onChange={setFPayment} />
                </div>
            ); break;
            case 'outstanding': inner = (
                <div style={HDR_COL_STYLE}>
                    <SortLabel label="Outstanding" align="right" active={sortCol === 'outstanding'} dir={sortDir} onClick={() => toggleSort('outstanding')} />
                    <ColumnNumFilter state={fOutstanding} onChange={setFOutstanding} />
                </div>
            ); break;
            case 'lastPayment': inner = (
                <div style={HDR_COL_STYLE}>
                    <SortLabel label="Last Payment" active={sortCol === 'lastPayment'} dir={sortDir} onClick={() => toggleSort('lastPayment')} />
                    <ColumnTextFilter value={fLastPayment} onChange={setFLastPayment} placeholder="Search date…" />
                </div>
            ); break;
            case 'lastBillDate': inner = (
                <div style={HDR_COL_STYLE}>
                    <SortLabel label="Last Bill Date" active={sortCol === 'lastBillDate'} dir={sortDir} onClick={() => toggleSort('lastBillDate')} />
                    <ColumnTextFilter value={fLastBill} onChange={setFLastBill} placeholder="Search date…" />
                </div>
            ); break;
            case 'promiseDate': inner = (
                <div style={HDR_COL_STYLE}>
                    <SortLabel label="Promise Date" active={sortCol === 'promiseDate'} dir={sortDir} onClick={() => toggleSort('promiseDate')} />
                    <ColumnTextFilter value={fPromise} onChange={setFPromise} placeholder="Search date…" />
                </div>
            ); break;
            case 'expand': inner = ''; break;
            default: inner = PARTNER_LABELS[key];
        }
        return (
            <th key={key} style={thBase} {...layout.getDragProps(key)}>
                {inner}
                {layout.resizeHandle(key)}
            </th>
        );
    };

    interface PartnerRowCtx { rowBg: string; isSelected: boolean; isExpanded: boolean }

    const renderBodyTd = (key: PartnerColKey, colIdx: number, r: Retailer, ctx: PartnerRowCtx): React.ReactNode => {
        const align = PARTNER_ALIGN[key];
        const tdBase: React.CSSProperties = {
            padding: '0.8rem 0.75rem', textAlign: align, overflow: 'hidden',
            ...layout.stickyStyle(colIdx, { rowBg: ctx.rowBg }),
        };
        const outstanding = r.computedOutstanding ?? 0;
        switch (key) {
            case 'select':
                return (
                    <td key={key} style={{ ...tdBase, padding: '0.8rem 0.5rem' }} onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={ctx.isSelected} onChange={e => handleSelectionChange(r.id, e.target.checked)} style={{ cursor: 'pointer' }} />
                    </td>
                );
            case 'name':
                return <td key={key} style={{ ...tdBase, whiteSpace: 'normal', wordBreak: 'break-word' }}><div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.name || '—'}</div></td>;
            case 'contact':
                return (
                    <td key={key} style={tdBase} onClick={e => e.stopPropagation()}>
                        {r.number
                            ? <a href={`tel:${r.number}`} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--primary-light)', textDecoration: 'none', fontSize: '0.83rem' }}><Phone size={12} />{r.number}</a>
                            : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                    </td>
                );
            case 'district':
                return <td key={key} style={{ ...tdBase, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{r.district || '—'}</td>;
            case 'salesperson':
                return (
                    <td key={key} style={{ ...tdBase, fontSize: '0.85rem', position: 'relative', overflow: 'visible' }}
                        onMouseEnter={() => (r.assignedSalespersons?.length ?? 0) > 1 && setSpTooltip(r.id)}
                        onMouseLeave={() => setSpTooltip(null)}>
                        {(r.assignedSalespersons?.length ?? 0) === 0 ? (
                            <span style={{ color: 'var(--text-tertiary)' }}>Unassigned</span>
                        ) : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                                <Users size={12} color="var(--primary-light)" />
                                {r.assignedSalespersons![0]}
                                {(r.assignedSalespersons!.length > 1) && (
                                    <span style={{ fontSize: '0.68rem', fontWeight: 700, background: 'rgba(14,165,233,0.12)', color: '#0ea5e9', padding: '0.1rem 0.4rem', borderRadius: '99px' }}>
                                        +{r.assignedSalespersons!.length - 1}
                                    </span>
                                )}
                            </span>
                        )}
                        {spTooltip === r.id && (r.assignedSalespersons?.length ?? 0) > 1 && (
                            <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 200, background: 'var(--surface-solid)', border: '1px solid var(--surface-border)', borderRadius: '8px', padding: '0.5rem 0.75rem', minWidth: '160px', boxShadow: '0 4px 16px rgba(0,0,0,0.18)', pointerEvents: 'none' }}>
                                <p style={{ margin: '0 0 0.3rem', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)' }}>Assigned Salespersons</p>
                                {r.assignedSalespersons!.map(sp => (
                                    <div key={sp} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.2rem 0', fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                                        <Users size={11} color="var(--primary-light)" />{sp}
                                    </div>
                                ))}
                            </div>
                        )}
                    </td>
                );
            case 'portfolio': {
                const psBadge = ({ 'Big': { bg: '#0ea5e922', color: '#0ea5e9' }, 'Medium': { bg: '#8b5cf622', color: '#8b5cf6' }, 'Small': { bg: '#10b98122', color: '#10b981' } } as Record<string, { bg: string; color: string }>)[r.portfolioSize || ''] || { bg: 'var(--surface-raised)', color: 'var(--text-tertiary)' };
                return (
                    <td key={key} style={tdBase}>
                        <span style={{ background: psBadge.bg, color: psBadge.color, padding: '0.15rem 0.55rem', borderRadius: '99px', fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            {r.portfolioSize || '—'}
                        </span>
                    </td>
                );
            }
            case 'totalInvoice':
                return <td key={key} style={{ ...tdBase, whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>₹{(r.computedTotalSales ?? 0).toLocaleString('en-IN')}</td>;
            case 'paymentReceived':
                return <td key={key} style={{ ...tdBase, whiteSpace: 'nowrap', color: '#10b981', fontWeight: 600 }}>₹{(r.computedTotalPaid ?? 0).toLocaleString('en-IN')}</td>;
            case 'outstanding':
                return (
                    <td key={key} style={{ ...tdBase, whiteSpace: 'nowrap' }}>
                        {outstanding > 0
                            ? <span style={{ color: '#ef4444', fontWeight: 700 }}>₹{outstanding.toLocaleString('en-IN')}</span>
                            : <span style={{ color: '#10b981', fontWeight: 700 }}>₹0</span>}
                    </td>
                );
            case 'lastPayment':
                return <td key={key} style={{ ...tdBase, whiteSpace: 'nowrap', color: r.lastPaymentDate ? 'var(--text-secondary)' : 'var(--text-tertiary)', fontSize: '0.83rem' }}>{fmtDate(r.lastPaymentDate)}</td>;
            case 'lastBillDate':
                return <td key={key} style={{ ...tdBase, whiteSpace: 'nowrap', color: r.lastBillDate ? 'var(--text-secondary)' : 'var(--text-tertiary)', fontSize: '0.83rem' }}>{fmtDate(r.lastBillDate)}</td>;
            case 'promiseDate':
                return <td key={key} style={{ ...tdBase, whiteSpace: 'nowrap', color: r.promiseDate ? 'var(--text-secondary)' : 'var(--text-tertiary)', fontSize: '0.83rem' }}>{fmtDate(r.promiseDate)}</td>;
            case 'expand':
                return (
                    <td key={key} style={{ ...tdBase, padding: '0.8rem 0.5rem' }} onClick={e => toggleExpand(r.id, e)}>
                        {ctx.isExpanded ? <ChevronDown size={15} color="var(--text-tertiary)" /> : <ChevronRight size={15} color="var(--text-tertiary)" />}
                    </td>
                );
            default: return <td key={key} style={tdBase} />;
        }
    };

    const renderGrandTd = (key: PartnerColKey, colIdx: number): React.ReactNode => {
        const align = PARTNER_ALIGN[key];
        const gBase: React.CSSProperties = {
            padding: '0.75rem 0.75rem', textAlign: align, whiteSpace: 'nowrap', fontWeight: 700,
            ...layout.stickyStyle(colIdx, { header: true, rowBg: 'var(--surface-raised)' }),
        };
        switch (key) {
            case 'select':          return <td key={key} style={{ ...gBase, padding: '0.75rem 0.5rem' }} />;
            case 'name':            return <td key={key} style={{ ...gBase, color: 'var(--text-primary)' }}>Total <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>({worklistSummary.retailerCount})</span></td>;
            case 'contact':         return <td key={key} style={{ ...gBase, color: 'var(--text-secondary)', fontWeight: 500 }}>{worklistSummary.contactCount}</td>;
            case 'district':        return <td key={key} style={gBase}>—</td>;
            case 'salesperson':     return <td key={key} style={{ ...gBase, color: 'var(--text-secondary)', fontWeight: 500 }}>{worklistSummary.salespersonCount}</td>;
            case 'portfolio':       return <td key={key} style={gBase}>—</td>;
            case 'totalInvoice':    return <td key={key} style={{ ...gBase, color: 'var(--text-primary)' }}>₹{worklistSummary.totalInvoiceAmount.toLocaleString('en-IN')}</td>;
            case 'paymentReceived': return <td key={key} style={{ ...gBase, color: '#10b981' }}>₹{worklistSummary.totalPaymentReceived.toLocaleString('en-IN')}</td>;
            case 'outstanding':     return <td key={key} style={{ ...gBase, color: worklistSummary.totalOutstanding > 0 ? '#ef4444' : '#10b981' }}>₹{worklistSummary.totalOutstanding.toLocaleString('en-IN')}</td>;
            // Date columns have no meaningful total — kept blank.
            case 'lastPayment':     return <td key={key} style={gBase}>—</td>;
            case 'lastBillDate':    return <td key={key} style={gBase}>—</td>;
            case 'promiseDate':     return <td key={key} style={gBase}>—</td>;
            case 'expand':          return <td key={key} style={{ ...gBase, padding: '0.75rem 0.5rem' }} />;
            default:                return <td key={key} style={gBase} />;
        }
    };

    return (
        <div>
            {/* Access filter indicator for sales users */}
            {userRole === 'sales' && (assignedDistricts.length > 0 || assignedRetailers.length > 0) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', padding: '0.55rem 1rem', marginBottom: '1rem', background: 'hsla(152,60%,40%,0.07)', borderRadius: '8px', border: '1px solid hsla(152,60%,40%,0.2)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    <Filter size={13} style={{ color: 'var(--primary-light)', flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, color: 'var(--primary-light)' }}>Access filter active:</span>
                    {assignedDistricts.map(d => (
                        <span key={d} style={{ padding: '0.15rem 0.55rem', borderRadius: '10px', background: 'hsla(152,60%,40%,0.15)', color: 'var(--primary-light)', fontWeight: 600, fontSize: '0.75rem' }}>{d}</span>
                    ))}
                    {assignedRetailers.length > 0 && (
                        <span style={{ padding: '0.15rem 0.55rem', borderRadius: '10px', background: 'hsla(38,92%,50%,0.12)', color: '#d97706', fontWeight: 600, fontSize: '0.75rem' }}>
                            +{assignedRetailers.length} specific retailer{assignedRetailers.length !== 1 ? 's' : ''}
                        </span>
                    )}
                </div>
            )}
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 className="primary-gradient-text" style={{ fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
                        <Building2 size={28} /> Partner Worklist
                    </h1>
                    <p style={{ color: 'var(--text-secondary)' }}>B2B wholesale partners — orders, dues and follow-ups.</p>
                </div>
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div ref={dateDropdownRef} style={{ position: 'relative' }}>
                        <button
                            className="btn btn-secondary"
                            onClick={() => setShowDateDropdown(v => !v)}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                            <Calendar size={16} /> {WORKLIST_DATE_FILTER_LABELS[financialPeriod] ?? 'This Month'}
                            <ChevronDown size={14} style={{ opacity: 0.7, transform: showDateDropdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                        </button>
                        {showDateDropdown && (
                            <div style={{ position: 'absolute', top: 'calc(100% + 0.4rem)', left: 0, zIndex: 200, background: 'var(--surface-solid)', border: '1px solid var(--surface-border)', borderRadius: '8px', padding: '0.4rem', minWidth: '180px', boxShadow: '0 4px 16px rgba(0,0,0,0.18)' }}>
                                {WORKLIST_DATE_FILTER_OPTIONS.map(([p, label]) => (
                                    <button
                                        key={p}
                                        onClick={() => { setFinancialPeriod(p); if (p !== 'custom') setShowDateDropdown(false); }}
                                        style={{
                                            display: 'block', width: '100%', textAlign: 'left', padding: '0.5rem 0.7rem', borderRadius: '6px', border: 'none',
                                            background: financialPeriod === p ? 'var(--primary-light)' : 'transparent',
                                            color: financialPeriod === p ? '#fff' : 'var(--text-secondary)',
                                            fontWeight: financialPeriod === p ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit',
                                        }}
                                    >
                                        {label}
                                    </button>
                                ))}
                                {financialPeriod === 'custom' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', padding: '0.5rem 0.7rem 0.2rem', borderTop: '1px solid var(--surface-border)', marginTop: '0.3rem' }}>
                                        <label style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>
                                            From
                                            <input type="date" value={customFrom} max={customTo || undefined}
                                                onChange={e => setCustomFrom(e.target.value)}
                                                className="input-field" style={{ display: 'block', width: '100%', height: '32px', padding: '0 0.5rem', fontSize: '0.82rem', marginTop: '0.2rem' }} />
                                        </label>
                                        <label style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>
                                            To
                                            <input type="date" value={customTo} min={customFrom || undefined}
                                                onChange={e => setCustomTo(e.target.value)}
                                                className="input-field" style={{ display: 'block', width: '100%', height: '32px', padding: '0 0.5rem', fontSize: '0.82rem', marginTop: '0.2rem' }} />
                                        </label>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    {can('worklist.partners.export') && (
                        <button className="btn btn-secondary" onClick={handleExportCSV} disabled={processedRetailers.length === 0}><Download size={16} /> {t('worklist.export_csv')}</button>
                    )}
                    {can('worklist.partners.create') && !isViewOnly && (
                        <button className="btn btn-primary" onClick={() => navigate('/onboarding')}><UserPlus size={16} /> {t('worklist.add_new')}</button>
                    )}
                </div>
            </div>

            {/* Filters Bar — the Outstanding quick-filter lives here; per-column
                search/filters (name, contact, district, salesperson, portfolio,
                amounts) now live in the table column headers, like Stock Report. */}
            <div className="glass-panel" style={{ padding: '0.85rem 1.25rem', marginBottom: '1.25rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--surface-base)', padding: '0.25rem 0.75rem', borderRadius: '10px', border: `1px solid ${partnerView !== 'all' ? 'var(--primary-light)' : 'var(--surface-border)'}` }}>
                    <Filter size={14} color={partnerView !== 'all' ? 'var(--primary-light)' : 'var(--text-secondary)'} />
                    <select
                        value={partnerView}
                        onChange={e => setPartnerView(e.target.value as 'all' | 'active' | 'cleared')}
                        style={{ background: 'transparent', color: partnerView !== 'all' ? 'var(--primary-light)' : 'var(--text-primary)', border: 'none', outline: 'none', padding: '0.35rem 0.25rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: partnerView !== 'all' ? 700 : 400 }}
                    >
                        <option value="all">Outstanding: All</option>
                        <option value="active">Outstanding: Active</option>
                        <option value="cleared">Outstanding: Cleared</option>
                    </select>
                </div>
                {hasColumnFilter && (
                    <button onClick={clearAllFilters} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: 'var(--primary)' }}>
                        <X size={14} /> Clear Filters
                    </button>
                )}
                <span style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem', marginLeft: 'auto' }}>{processedRetailers.length} partners</span>
            </div>

            {/* Bulk Action Toolbar — hidden in view-only mode */}
            {!isViewOnly && selectedIds.size > 0 && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap',
                    padding: '0.6rem 1rem', marginBottom: '0.75rem',
                    background: 'var(--primary-light)', borderRadius: '8px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                }}>
                    <CheckSquare size={16} color="#fff" />
                    <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.88rem' }}>
                        {selectedIds.size} partner{selectedIds.size !== 1 ? 's' : ''} selected
                    </span>
                    <div style={{ display: 'flex', gap: '0.45rem', marginLeft: '0.25rem' }}>
                        <button
                            onClick={handleSelectAll}
                            style={{ padding: '0.3rem 0.8rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.5)', background: 'transparent', color: '#fff', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit' }}
                        >
                            Select All ({processedRetailers.length})
                        </button>
                        <button
                            onClick={handleClearSelection}
                            style={{ padding: '0.3rem 0.8rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.5)', background: 'transparent', color: '#fff', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                        >
                            <X size={13} /> Clear
                        </button>
                    </div>
                    {can('worklist.partners.sendReminder') && (
                        <button
                            onClick={handleSendReminder}
                            disabled={loadingReminders}
                            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.35rem 1rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.15)', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: loadingReminders ? 'wait' : 'pointer', fontFamily: 'inherit' }}
                        >
                            <Mail size={15} /> {loadingReminders ? 'Loading…' : 'Send Reminder Email'}
                        </button>
                    )}
                </div>
            )}

            {/* List */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>{t('common.loading')}</div>
            ) : retailers.length === 0 ? (
                // Genuinely empty — no partners exist yet. When partners DO exist but a
                // filter/search matches nothing, we keep the table (with its header,
                // filter inputs and grand-total row) and show a compact in-body message.
                <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-secondary)' }}>
                    <Store size={48} color="var(--surface-border)" style={{ margin: '0 auto 1rem auto', display: 'block' }} />
                    <h3>{t('worklist.no_retailers_found')}</h3>
                    <p>{t('worklist.no_retailers_found_desc')}</p>
                    {!isViewOnly && (
                        <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => navigate('/onboarding')}>
                            <UserPlus size={16} /> Onboard a Partner
                        </button>
                    )}
                </div>
            ) : (
                <>
                    {/* Table customization hint (mirrors Stock Report / Product Master). */}
                    <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', marginBottom: '0.6rem', fontSize: '0.72rem', color: 'var(--text-tertiary)', flexWrap: 'wrap' }}>
                        <span>Drag column headers to reorder.</span>
                        <span>Drag column edges to resize.</span>
                        <span>Right-click a header to freeze or reset.</span>
                        {layout.freezeCount > 0 && (
                            <span style={{ color: 'var(--primary)', fontWeight: 600 }}>
                                Frozen up to “{PARTNER_LABELS[layout.visibleOrder[layout.freezeCount - 1]]}”
                            </span>
                        )}

                        {/* Column visibility control */}
                        <div ref={columnsDropdownRef} style={{ position: 'relative', marginLeft: 'auto' }}>
                            <button
                                onClick={() => setShowColumnsDropdown(v => !v)}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.7rem', borderRadius: '6px', border: '1px solid var(--surface-border)', background: 'var(--surface-raised)', color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                            >
                                <Columns3 size={14} /> Columns
                                {layout.hidden.size > 0 && (
                                    <span style={{ fontSize: '0.65rem', color: 'var(--primary)', fontWeight: 700 }}>({layout.hidden.size} hidden)</span>
                                )}
                                <ChevronDown size={13} />
                            </button>
                            {showColumnsDropdown && (
                                <div
                                    role="menu"
                                    style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 5001, minWidth: '220px', background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderRadius: '10px', padding: '0.4rem', boxShadow: '0 12px 40px rgba(0,0,0,0.22)' }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.2rem 0.5rem 0.4rem', borderBottom: '1px solid var(--surface-border)', marginBottom: '0.25rem' }}>
                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Columns</span>
                                        {layout.hidden.size > 0 && (
                                            <button
                                                onClick={layout.showAllColumns}
                                                style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
                                            >
                                                Show all
                                            </button>
                                        )}
                                    </div>
                                    {layout.colOrder
                                        .filter(key => key !== 'select' && key !== 'expand')
                                        .map(key => (
                                            <label
                                                key={key}
                                                style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', padding: '0.35rem 0.5rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-primary)' }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={!layout.isHidden(key)}
                                                    onChange={() => layout.toggleColumn(key)}
                                                    style={{ width: '0.95rem', height: '0.95rem', cursor: 'pointer', accentColor: 'var(--primary-light)' }}
                                                />
                                                {PARTNER_LABELS[key]}
                                            </label>
                                        ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Full-screen capture div during column resize — prevents cursor flicker */}
                    {layout.isResizing && <div style={{ position: 'fixed', inset: 0, zIndex: 9999, cursor: 'col-resize' }} />}

                    {/* Right-click column context menu (freeze / reset widths / reset order) */}
                    {layout.ContextMenu()}

                    <div className="glass-panel" style={{ overflow: 'hidden', marginTop: '0.5rem' }}>
                        <div style={{ overflowX: 'auto', maxHeight: '72vh', overflowY: 'auto' }} onContextMenu={layout.handleTableContextMenu}>
                            <table style={{ width: layout.totalTableWidth, tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                                <colgroup>
                                    {layout.visibleOrder.map(key => (
                                        <col key={key} ref={layout.registerColEl(key)} style={{ width: layout.colWidths[key] }} />
                                    ))}
                                </colgroup>
                                <thead>
                                    <tr ref={headerRowRef} style={{ borderBottom: '2px solid var(--surface-border)', background: 'var(--surface-raised)' }}>
                                        {layout.visibleOrder.map((key, colIdx) => renderHeaderTh(key, colIdx))}
                                    </tr>
                                    <tr style={{ position: 'sticky', top: headerH, zIndex: 3, background: 'var(--surface-raised)', fontWeight: 700, borderBottom: '2px solid var(--surface-border)' } as React.CSSProperties}>
                                        {layout.visibleOrder.map((key, colIdx) => renderGrandTd(key, colIdx))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {processedRetailers.length === 0 && (
                                        <tr>
                                            <td colSpan={layout.visibleOrder.length} style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                                <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.25rem' }}>No matching results</div>
                                                <div style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>Try adjusting or clearing your filters.</div>
                                            </td>
                                        </tr>
                                    )}
                                    {processedRetailers.map(r => {
                                        const outstanding = r.computedOutstanding ?? 0;
                                        const isSelected = selectedIds.has(r.id);
                                        const isExpanded = expandedRows.has(r.id);
                                        const isHighRisk = outstanding > 100000;
                                        const rowBg = isHighRisk
                                            ? (isSelected ? 'hsla(0,84%,55%,0.16)' : 'hsla(0,84%,55%,0.09)')
                                            : (isSelected ? 'hsla(210,100%,70%,0.07)' : 'transparent');
                                        const rowBgHover = isHighRisk
                                            ? 'hsla(0,84%,55%,0.2)'
                                            : (isSelected ? 'hsla(210,100%,70%,0.1)' : 'var(--surface-raised)');
                                        // Frozen cells need an opaque background so scrolled content
                                        // doesn't show through the sticky column.
                                        const stickyBg = rowBg === 'transparent' ? 'var(--surface-base)' : rowBg;
                                        return (
                                            <Fragment key={r.id}>
                                                <tr
                                                    onClick={() => can('worklist.retailerProfile.view') && navigate(`/worklist/${r.id}`)}
                                                    style={{ borderBottom: '1px solid var(--surface-border)', cursor: can('worklist.retailerProfile.view') ? 'pointer' : 'default', background: rowBg, transition: 'background 0.12s' }}
                                                    onMouseEnter={e => { e.currentTarget.style.background = rowBgHover; }}
                                                    onMouseLeave={e => { e.currentTarget.style.background = rowBg; }}
                                                >
                                                    {layout.visibleOrder.map((key, colIdx) => renderBodyTd(key, colIdx, r, { rowBg: stickyBg, isSelected, isExpanded }))}
                                                </tr>
                                                {isExpanded && (
                                                    <tr style={{ borderBottom: '1px solid var(--surface-border)', background: 'var(--surface-raised)' }}>
                                                        <td colSpan={layout.visibleOrder.length} style={{ padding: '0.5rem 1rem 0.65rem 3.5rem' }}>
                                                            <div style={{ display: 'flex', gap: '2rem', fontSize: '0.82rem' }}>
                                                                <div>
                                                                    <div style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}>Taluka</div>
                                                                    <div style={{ fontWeight: 500, color: 'var(--text-secondary)', marginTop: '0.1rem' }}>{r.taluka || '—'}</div>
                                                                </div>
                                                                <div>
                                                                    <div style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}>Village / At Post</div>
                                                                    <div style={{ fontWeight: 500, color: 'var(--text-secondary)', marginTop: '0.1rem' }}>{r.atPost || '—'}</div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            <UdhariUploadModal isOpen={showUdhariModal} onClose={() => setShowUdhariModal(false)} onSuccess={() => window.location.reload()} />

            {showReminderModal && (
                <ReminderModal
                    entries={reminderData}
                    onClose={() => setShowReminderModal(false)}
                />
            )}
        </div>
    );
}

// ─── Reminder Modal ───────────────────────────────────────────────────────────

function ReminderModal({ entries, onClose }: { entries: ReminderEntry[]; onClose: () => void }) {
    const generateText = (e: ReminderEntry) => {
        const cd = e.closestCreditDays;
        const dueLine = cd == null ? ''
            : cd === 0 ? ' Your payment is due today.'
            : cd < 0 ? ` Your payment is overdue by ${Math.abs(cd)} day${Math.abs(cd) !== 1 ? 's' : ''}.`
            : ` Payment due in ${cd} day${cd !== 1 ? 's' : ''}.`;
        return `Dear ${e.name},\n\nThis is a payment reminder from KaranArjun KSK.\n\nYou have ${e.pendingOrderCount} pending order${e.pendingOrderCount !== 1 ? 's' : ''} with a total outstanding of ₹${e.pendingAmount.toLocaleString('en-IN')}.${dueLine}\n\nPlease arrange payment at the earliest convenience.\n\nRegards,\nKaranArjun KSK`;
    };

    const copy = (text: string) =>
        navigator.clipboard.writeText(text).catch(() => {});

    const copyAll = () =>
        copy(entries.map(generateText).join('\n\n---\n\n'));

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 1000,
                background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '1rem',
            }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div style={{
                background: 'var(--surface-base)', borderRadius: '14px',
                border: '1px solid var(--surface-border)',
                width: '100%', maxWidth: '720px',
                maxHeight: '85vh', display: 'flex', flexDirection: 'column',
                boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.1rem 1.5rem', borderBottom: '1px solid var(--surface-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <Mail size={18} color="var(--primary-light)" />
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                            Payment Reminder — {entries.length} Partner{entries.length !== 1 ? 's' : ''}
                        </h3>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button
                            onClick={copyAll}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.85rem', borderRadius: '6px', border: '1px solid var(--surface-border)', background: 'var(--surface-raised)', color: 'var(--text-secondary)', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit' }}
                        >
                            <Copy size={13} /> Copy All
                        </button>
                        <button
                            onClick={onClose}
                            style={{ display: 'flex', alignItems: 'center', padding: '0.35rem', borderRadius: '6px', border: '1px solid var(--surface-border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* Partner list */}
                <div style={{ overflowY: 'auto', padding: '1rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {entries.length === 0 ? (
                        <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '2rem 0' }}>No pending orders found for selected partners.</p>
                    ) : entries.map(e => (
                        <div key={e.id} style={{ border: '1px solid var(--surface-border)', borderRadius: '10px', overflow: 'hidden' }}>
                            {/* Partner header row */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: 'var(--surface-raised)', flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 700, fontSize: '0.92rem', flex: 1 }}>{e.name}</span>
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                    {e.pendingOrderCount} order{e.pendingOrderCount !== 1 ? 's' : ''}
                                </span>
                                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#ef4444' }}>
                                    ₹{e.pendingAmount.toLocaleString('en-IN')} due
                                </span>
                                {e.closestCreditDays != null && (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '8px', background: e.closestCreditDays <= 7 ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)', color: e.closestCreditDays <= 7 ? '#ef4444' : '#f59e0b' }}>
                                        <Clock size={11} /> {e.closestCreditDays}d
                                    </span>
                                )}
                            </div>

                            {/* Message preview */}
                            <textarea
                                readOnly
                                value={generateText(e)}
                                rows={6}
                                style={{ width: '100%', boxSizing: 'border-box', padding: '0.75rem 1rem', background: 'var(--surface-base)', color: 'var(--text-primary)', border: 'none', borderTop: '1px solid var(--surface-border)', resize: 'vertical', fontFamily: 'inherit', fontSize: '0.82rem', lineHeight: 1.6, outline: 'none' }}
                            />

                            {/* Actions */}
                            <div style={{ display: 'flex', gap: '0.5rem', padding: '0.6rem 1rem', background: 'var(--surface-raised)', borderTop: '1px solid var(--surface-border)', flexWrap: 'wrap' }}>
                                <button
                                    onClick={() => copy(generateText(e))}
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.75rem', borderRadius: '6px', border: '1px solid var(--surface-border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit' }}
                                >
                                    <Copy size={12} /> Copy
                                </button>
                                {e.number && (
                                    <a
                                        href={`https://wa.me/91${e.number.replace(/\D/g, '')}?text=${encodeURIComponent(generateText(e))}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.75rem', borderRadius: '6px', border: '1px solid #25d36644', background: 'rgba(37,211,102,0.08)', color: '#25d366', fontSize: '0.78rem', textDecoration: 'none', fontWeight: 600 }}
                                    >
                                        <MessageSquare size={12} /> WhatsApp
                                    </a>
                                )}
                                {e.email && (
                                    <a
                                        href={`mailto:${e.email}?subject=${encodeURIComponent('Payment Reminder — KaranArjun KSK')}&body=${encodeURIComponent(generateText(e))}`}
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.75rem', borderRadius: '6px', border: '1px solid var(--primary-light)44', background: 'rgba(99,179,237,0.08)', color: 'var(--primary-light)', fontSize: '0.78rem', textDecoration: 'none', fontWeight: 600 }}
                                    >
                                        <Mail size={12} /> Email
                                    </a>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
