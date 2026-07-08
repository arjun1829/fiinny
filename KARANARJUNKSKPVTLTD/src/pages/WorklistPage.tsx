import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Download, FileSpreadsheet, Store, Search, Filter, ArrowUpDown,
    ArrowUpRight, Users, Building2, UserPlus, TrendingUp, AlertCircle,
    CheckCircle2, Bell, ShoppingCart, Truck, Clock, Mail, MessageSquare,
    X, Copy, CheckSquare, FileText,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import Papa from 'papaparse';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection } from '../utils/tenantPath';
import UdhariUploadModal from '../components/UdhariUploadModal';
import { useSchema } from '../contexts/SchemaContext';
import DynamicTable from '../components/DynamicTable';

// Import sub-pages directly (WorklistPage itself is lazy-loaded by App.tsx)
import PaymentRemindersPage from './PaymentRemindersPage';
import OnlineOrdersPage from './OnlineOrdersPage';
import DispatchBoardPage from './DispatchBoardPage';
// TEMPORARILY DISABLED (2026-07-03): Worklist → Purchase Orders is incomplete/broken.
// Hidden until rebuilt — do not delete. Re-enable by restoring this import and the
// tab entry/render below. Unrelated to Supplier Ledger → Purchase Orders, which uses
// its own PurchaseOrderModal component and is unaffected by this change.
// import PurchaseOrdersPage from './PurchaseOrdersPage';
import B2BInvoiceWorklistPage from './B2BInvoiceWorklistPage';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Retailer {
    id: string;
    name?: string;
    location?: string;
    number?: string;
    alternateNumber?: string;
    portfolioSize?: string;
    email?: string;
    bookName?: string;
    billBookPageNo?: string;
    createdAt?: { toMillis?: () => number };
    totalSales?: number;
    totalPaid?: number;
    outstandingAmount?: number;
    hasPendingOrders?: boolean;
    closestCreditDays?: number | null;
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
type ModuleTab = 'partners' | 'invoices' | 'payment-reminders' | 'tracking-info' | 'online-orders' /* | 'purchase-orders' */;

const MODULE_TABS: { id: ModuleTab; label: string; icon: React.ReactNode }[] = [
    { id: 'partners',          label: 'Partners',          icon: <Building2 size={16} /> },
    { id: 'invoices',          label: 'Invoices',          icon: <FileText size={16} /> },
    { id: 'payment-reminders', label: 'Payment Reminders', icon: <Bell size={16} /> },
    { id: 'tracking-info',     label: 'Tracking Info',     icon: <Truck size={16} /> },
    { id: 'online-orders',     label: 'Online Orders',     icon: <ShoppingCart size={16} /> },
    // TEMPORARILY DISABLED (2026-07-03): Purchase Orders tab hidden until rebuilt — do not delete.
    // { id: 'purchase-orders',     label: 'Purchase Orders',     icon: <ShoppingCart size={16} /> },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function WorklistPage() {
    const [moduleTab, setModuleTab] = useState<ModuleTab>('partners');

    return (
        <div className="animate-fade-in" style={{ maxWidth: '1400px', margin: '0 auto' }}>
            {/* ── Tab Bar ── */}
            <div
            style={{
                position: 'sticky',
                top: '64px', // 👈 adjust based on your main navbar height
                zIndex: 50,
                background: 'var(--surface-base)', // 👈 IMPORTANT (avoid overlap issues)
                display: 'flex',
                gap: '0.25rem',
                marginBottom: '1.75rem',
                borderBottom: '2px solid var(--surface-border)',
                padding: '0.5rem 0 0 0',
                overflowX: 'auto',
            }}
            >
                {MODULE_TABS.map(tab => {
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
            {moduleTab === 'partners'          && <PartnersTab />}
            {moduleTab === 'invoices'          && <B2BInvoiceWorklistPage />}
            {moduleTab === 'payment-reminders' && <PaymentRemindersPage />}
            {moduleTab === 'tracking-info'     && <DispatchBoardPage />}
            {moduleTab === 'online-orders'     && <OnlineOrdersPage />}
            {/* TEMPORARILY DISABLED (2026-07-03): Purchase Orders tab content hidden until rebuilt — do not delete. */}
            {/* {moduleTab === 'purchase-orders'     && <PurchaseOrdersPage/>} */}
        </div>
    );
}

// ─── Partners Tab (former WorklistPage content) ───────────────────────────────

function PartnersTab() {
    const navigate = useNavigate();
    const { tenantId } = useAuth();
    const { t } = useTranslation();
    const { getSchema } = useSchema();
    const [retailers, setRetailers] = useState<Retailer[]>([]);
    const [loading, setLoading] = useState(true);
    const [showUdhariModal, setShowUdhariModal] = useState(false);

    const [searchTerm, setSearchTerm] = useState('');
    const [filterSize, setFilterSize] = useState('All');
    const [sortBy, setSortBy] = useState('newest');
    const [partnerView, setPartnerView] = useState<'active' | 'history'>('active');

    const paymentsFileRef = useRef<HTMLInputElement>(null);
    const followupsFileRef = useRef<HTMLInputElement>(null);
    const [uploadingCSV, setUploadingCSV] = useState(false);

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
                    const pending = snap.docs
                        .map(d => d.data() as { grandTotal?: number; amountPaid?: number; paymentStatus?: string })
                        .filter(so => so.paymentStatus?.toLowerCase() !== 'paid');
                    const pendingAmount = pending.reduce((sum, so) =>
                        sum + Math.max(0, (Number(so.grandTotal) || 0) - (Number(so.amountPaid) || 0)), 0);
                    return {
                        id: r.id,
                        name: r.name || '—',
                        number: r.number,
                        email: r.email,
                        pendingAmount,
                        pendingOrderCount: pending.length,
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
                // Fetch retailers, all orders, and all salesOrders in parallel — 3 reads
                // total instead of 2N+1 (previously one orders + one salesOrders query
                // per retailer). Same documents read, but in 3 round-trips, not hundreds.
                const [retailersSnap, ordersSnap, salesOrdersSnap] = await Promise.all([
                    getDocs(query(getTenantCollection(db, tenantId, 'retailers'), orderBy('createdAt', 'desc'))),
                    getDocs(getTenantCollection(db, tenantId, 'orders')),
                    getDocs(getTenantCollection(db, tenantId, 'salesOrders')),
                ]);

                // Group orders by retailerId so each retailer is an O(1) lookup.
                const ordersByRetailer = new Map<string, { isDelivered?: boolean }[]>();
                ordersSnap.docs.forEach(doc => {
                    const o = doc.data() as { retailerId?: string; isDelivered?: boolean };
                    if (!o.retailerId) return;
                    const arr = ordersByRetailer.get(o.retailerId);
                    if (arr) arr.push(o); else ordersByRetailer.set(o.retailerId, [o]);
                });

                // Group salesOrders by retailerId.
                const salesByRetailer = new Map<string, { status?: string; paymentStatus?: string; dueDate?: string }[]>();
                salesOrdersSnap.docs.forEach(doc => {
                    const so = doc.data() as { retailerId?: string; status?: string; paymentStatus?: string; dueDate?: string };
                    if (!so.retailerId) return;
                    const arr = salesByRetailer.get(so.retailerId);
                    if (arr) arr.push(so); else salesByRetailer.set(so.retailerId, [so]);
                });

                const today = new Date(); today.setHours(0, 0, 0, 0);

                const retailersWithStatus: Retailer[] = retailersSnap.docs
                    // Exclude B2C walk-in customers auto-created at the POS counter —
                    // they are not B2B partners and shouldn't appear in this worklist.
                    .filter(d => (d.data() as { channel?: string }).channel !== 'pos')
                    .map(doc => {
                    const r = { id: doc.id, ...doc.data() } as Retailer;
                    const orders = ordersByRetailer.get(r.id) ?? [];
                    const salesOrders = salesByRetailer.get(r.id) ?? [];

                    const hasPendingPos = orders.some(o => !o.isDelivered);
                    const hasPendingB2b = salesOrders.some(so => so.status === 'pending');
                    const isBrandNew = orders.length === 0 && salesOrders.length === 0;
                    const hasPending = isBrandNew || hasPendingPos || hasPendingB2b;

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

                    return { ...r, hasPendingOrders: hasPending, closestCreditDays };
                });

                setRetailers(retailersWithStatus);
            } catch (error) {
                console.error('Error fetching retailers: ', error);
            } finally {
                setLoading(false);
            }
        };
        fetchRetailers();
    }, [tenantId]);

    const processedRetailers = useMemo(() => {
        let result = [...retailers];
        if (partnerView === 'active') result = result.filter(r => r.hasPendingOrders);
        else result = result.filter(r => !r.hasPendingOrders);

        if (searchTerm) {
            const ls = searchTerm.toLowerCase();
            result = result.filter(r =>
                r.name?.toLowerCase().includes(ls) ||
                r.location?.toLowerCase().includes(ls) ||
                r.number?.includes(searchTerm)
            );
        }
        if (filterSize !== 'All') result = result.filter(r => r.portfolioSize === filterSize);

        result.sort((a, b) => {
            if (sortBy === 'a-z') return (a.name || '').localeCompare(b.name || '');
            if (sortBy === 'z-a') return (b.name || '').localeCompare(a.name || '');
            if (sortBy === 'credit-days-asc') {
                return (a.closestCreditDays ?? Infinity) - (b.closestCreditDays ?? Infinity);
            }
            const tA = a.createdAt?.toMillis?.() ?? 0;
            const tB = b.createdAt?.toMillis?.() ?? 0;
            return sortBy === 'oldest' ? tA - tB : tB - tA;
        });
        return result;
    }, [retailers, searchTerm, filterSize, sortBy, partnerView]);

    const handleExportCSV = () => {
        const schema = getSchema('retailers');
        if (!schema) return;
        const exportFields = schema.fields.filter(f => f.visibleInExport).sort((a, b) => a.order - b.order);
        const csvRows = processedRetailers.map(r =>
            exportFields.map(field => {
                const val = (r as unknown as Record<string, unknown>)[field.id];
                return `"${val !== undefined && val !== null ? val : ''}"`;
            }).join(',')
        );
        const csvContent = [exportFields.map(f => f.label).join(','), ...csvRows].join('\n');
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.setAttribute('href', URL.createObjectURL(blob));
        link.setAttribute('download', `karanarjun-worklist-${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const downloadTemplate = (type: 'payments' | 'followups') => {
        const csvContent = type === 'payments'
            ? 'Date,Stake holder,Amount,Payment Type,Pending Amount,Remarks\n2026-03-10,John Shop,5000,Cash,4000,Partial payment received\n'
            : 'KSK Name,Shop Owners,Shop Mobile Numbers,Products,Total Amount,Amount Paid,Delta Amount\nKaranArjun KSK,Doe Shop,9876543210,Fertilizer X,15000,5000,10000\n';
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.setAttribute('href', URL.createObjectURL(blob));
        link.setAttribute('download', type === 'payments' ? 'payments_import_template.csv' : 'amounts_followups_template.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleCSVUpload = (event: React.ChangeEvent<HTMLInputElement>, type: 'payments' | 'followups') => {
        const file = event.target.files?.[0];
        if (!file || !tenantId) return;
        setUploadingCSV(true);
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                try { alert(`Parsed ${results.data.length} ${type} records.`); }
                catch { alert('Error processing CSV.'); }
                finally {
                    setUploadingCSV(false);
                    if (type === 'payments' && paymentsFileRef.current) paymentsFileRef.current.value = '';
                    if (type === 'followups' && followupsFileRef.current) followupsFileRef.current.value = '';
                }
            }
        });
    };

    const handlePrintUdhari = () => {
        const schema = getSchema('retailers');
        if (!schema) return;
        const printWindow = window.open('', '_blank', 'width=800,height=800');
        if (!printWindow) return;
        const exportFields = schema.fields.filter(f => f.visibleInExport).sort((a, b) => a.order - b.order);
        const rows = processedRetailers.map(r =>
            `<tr>${exportFields.map(f => { const v = (r as unknown as Record<string, unknown>)[f.id]; return `<td style="padding:8px;border:1px solid #ddd">${v ?? ''}</td>`; }).join('')}</tr>`
        ).join('');
        printWindow.document.write(`<html><head><title>Partner Worklist</title>
            <style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse;font-size:13px}th{padding:10px;border:1px solid #ddd;background:#f8f9fa;text-align:left}@media print{button{display:none}}</style>
            </head><body><h2 style="text-align:center;margin:0">KaranArjun KSK - Partner Worklist</h2>
            <p style="text-align:center;color:#555;font-size:13px">Generated: ${new Date().toLocaleString()} | ${processedRetailers.length} records</p>
            <table><thead><tr>${exportFields.map(f => `<th>${f.label}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
            <script>setTimeout(()=>window.print(),400)</script></body></html>`);
        printWindow.document.close();
    };

    const kpi = useMemo(() => {
        const total = retailers.length;
        const active = retailers.filter(r => r.hasPendingOrders).length;
        return {
            total, active, cleared: total - active,
            big: retailers.filter(r => r.portfolioSize === 'Big').length,
            medium: retailers.filter(r => r.portfolioSize === 'Medium').length,
            small: retailers.filter(r => r.portfolioSize === 'Small').length,
        };
    }, [retailers]);

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 className="primary-gradient-text" style={{ fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
                        <Building2 size={28} /> Partner Worklist
                    </h1>
                    <p style={{ color: 'var(--text-secondary)' }}>B2B wholesale partners — orders, dues and follow-ups.</p>
                </div>
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <input type="file" accept=".csv" ref={paymentsFileRef} style={{ display: 'none' }} onChange={e => handleCSVUpload(e, 'payments')} />
                    <input type="file" accept=".csv" ref={followupsFileRef} style={{ display: 'none' }} onChange={e => handleCSVUpload(e, 'followups')} />
                    <button className="btn btn-secondary btn-sm tooltip" data-tooltip="Payments CSV Template" onClick={() => downloadTemplate('payments')}><Download size={13} /> T1</button>
                    <button className="btn btn-secondary btn-sm" disabled={uploadingCSV} onClick={() => paymentsFileRef.current?.click()}><FileSpreadsheet size={14} /> Payments</button>
                    <button className="btn btn-secondary btn-sm tooltip" data-tooltip="Followups CSV Template" onClick={() => downloadTemplate('followups')}><Download size={13} /> T2</button>
                    <button className="btn btn-secondary btn-sm" disabled={uploadingCSV} onClick={() => followupsFileRef.current?.click()}><FileSpreadsheet size={14} /> Followups</button>
                    <button className="btn btn-secondary" onClick={handlePrintUdhari} disabled={processedRetailers.length === 0}><Download size={16} /> Print</button>
                    <button className="btn btn-secondary" onClick={handleExportCSV} disabled={processedRetailers.length === 0}><Download size={16} /> {t('worklist.export_csv')}</button>
                    <button className="btn btn-primary" onClick={() => navigate('/onboarding')}><UserPlus size={16} /> {t('worklist.add_new')}</button>
                </div>
            </div>

            {/* KPI Cards */}
            {!loading && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                    {[
                        { label: 'Total Partners',    value: kpi.total,   icon: Users,        border: '#38bdf8', bg: 'rgba(56,189,248,0.07)' },
                        { label: 'Active / Pending',  value: kpi.active,  icon: AlertCircle,  border: '#f59e0b', bg: 'rgba(245,158,11,0.07)' },
                        { label: 'Cleared',           value: kpi.cleared, icon: CheckCircle2, border: '#10b981', bg: 'rgba(16,185,129,0.07)' },
                        { label: 'Big Distributors',  value: kpi.big,     icon: TrendingUp,   border: '#0ea5e9', bg: 'rgba(14,165,233,0.07)' },
                        { label: 'Medium Retailers',  value: kpi.medium,  icon: Store,        border: '#a78bfa', bg: 'rgba(167,139,250,0.07)' },
                        { label: 'Small Retailers',   value: kpi.small,   icon: Building2,    border: '#34d399', bg: 'rgba(52,211,153,0.07)' },
                    ].map(c => (
                        <div key={c.label} className="glass-panel" style={{ padding: '1rem 1.25rem', borderLeft: `4px solid ${c.border}`, background: c.bg }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>{c.label}</p>
                                    <h2 style={{ margin: 0, fontWeight: 800, fontSize: '1.75rem', color: c.border }}>{c.value}</h2>
                                </div>
                                <div style={{ background: `${c.border}22`, borderRadius: '10px', padding: '0.55rem', flexShrink: 0 }}>
                                    <c.icon size={18} color={c.border} />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Filters Bar */}
            <div className="glass-panel" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                    {([['active', 'Active'], ['history', 'Cleared']] as const).map(([val, label]) => (
                        <button key={val} onClick={() => setPartnerView(val)}
                            style={{ padding: '0.4rem 1rem', borderRadius: '20px', border: `1px solid ${partnerView === val ? 'var(--primary-light)' : 'var(--surface-border)'}`, background: partnerView === val ? 'var(--primary-light)' : 'transparent', color: partnerView === val ? '#fff' : 'var(--text-secondary)', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
                            {label}
                        </button>
                    ))}
                </div>
                <div style={{ flex: '1 1 240px', position: 'relative' }}>
                    <Search size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                    <input type="text" placeholder={t('worklist.search_worklist_placeholder')} className="input-field"
                        style={{ paddingLeft: '2.2rem', margin: 0, height: '38px' }} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--surface-base)', padding: '0.25rem 0.75rem', borderRadius: '10px', border: '1px solid var(--surface-border)' }}>
                    <Filter size={14} color="var(--text-secondary)" />
                    <select value={filterSize} onChange={e => setFilterSize(e.target.value)} style={{ background: 'transparent', color: 'var(--text-primary)', border: 'none', outline: 'none', padding: '0.35rem 0.25rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                        <option value="All">{t('worklist.all_sizes')}</option>
                        <option value="Big">{t('onboarding.big_distributor')}</option>
                        <option value="Medium">{t('onboarding.medium_retailer')}</option>
                        <option value="Small">{t('onboarding.small_retailer')}</option>
                    </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--surface-base)', padding: '0.25rem 0.75rem', borderRadius: '10px', border: '1px solid var(--surface-border)' }}>
                    <ArrowUpDown size={14} color="var(--text-secondary)" />
                    <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ background: 'transparent', color: 'var(--text-primary)', border: 'none', outline: 'none', padding: '0.35rem 0.25rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                        <option value="newest">{t('worklist.newest_first')}</option>
                        <option value="oldest">{t('worklist.oldest_first')}</option>
                        <option value="a-z">{t('worklist.name_az')}</option>
                        <option value="z-a">{t('worklist.name_za')}</option>
                        <option value="credit-days-asc">Closest Credit Days</option>
                    </select>
                </div>
                <span style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem', marginLeft: 'auto' }}>{processedRetailers.length} partners</span>
            </div>

            {/* Bulk Action Toolbar */}
            {selectedIds.size > 0 && (
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
                    <button
                        onClick={handleSendReminder}
                        disabled={loadingReminders}
                        style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.35rem 1rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.15)', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: loadingReminders ? 'wait' : 'pointer', fontFamily: 'inherit' }}
                    >
                        <Mail size={15} /> {loadingReminders ? 'Loading…' : 'Send Reminder Email'}
                    </button>
                </div>
            )}

            {/* List */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>{t('common.loading')}</div>
            ) : processedRetailers.length === 0 ? (
                <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-secondary)' }}>
                    <Store size={48} color="var(--surface-border)" style={{ margin: '0 auto 1rem auto', display: 'block' }} />
                    <h3>{t('worklist.no_retailers_found')}</h3>
                    <p>{t('worklist.no_retailers_found_desc')}</p>
                    <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => navigate('/onboarding')}>
                        <UserPlus size={16} /> Onboard a Partner
                    </button>
                </div>
            ) : (
                <div style={{ marginTop: '1rem' }}>
                    <DynamicTable
                        moduleId="retailers"
                        data={processedRetailers}
                        onRowClick={(row) => navigate(`/worklist/${row.id}`)}
                        selectedIds={selectedIds}
                        onSelectionChange={handleSelectionChange}
                        actionsRef={(row) => {
                            const cd = (row as Retailer).closestCreditDays ?? null;
                            const label = cd === null ? null
                                : cd === 0 ? 'Due Today'
                                : cd < 0 ? `Overdue ${Math.abs(cd)}d`
                                : `Due in ${cd}d`;
                            const color = cd === null ? '' : cd < 0 ? '#ef4444' : cd <= 3 ? '#f59e0b' : '#10b981';
                            return (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                    {label !== null ? (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '10px', background: `${color}18`, color, border: `1px solid ${color}44`, whiteSpace: 'nowrap' }}>
                                            <Clock size={11} /> {label}
                                        </span>
                                    ) : (
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>—</span>
                                    )}
                                    <ArrowUpRight size={20} color="var(--primary-light)" />
                                </div>
                            );
                        }}
                    />
                </div>
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
