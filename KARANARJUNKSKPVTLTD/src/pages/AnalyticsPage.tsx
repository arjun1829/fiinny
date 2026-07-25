import { useState, useEffect, useMemo } from 'react';
import { query, getDocs, limit, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection } from '../utils/tenantPath';
import {
    fetchSupplierLedgerCollections, poAmount, invAmount, pmtAmount,
    poDateVal, invDateVal, pmtDateVal, docDateMs,
    type RawSupplierCollections,
} from '../utils/supplierAnalytics';
import {
    Activity, IndianRupee, ShoppingCart, TrendingUp,
    Layers, BarChart3, Target, Zap, Truck, Building2, Receipt, Wallet, Package,
    Scale, Archive,
} from 'lucide-react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, PieChart, Pie, Cell, Legend, ComposedChart, Bar
} from 'recharts';

type TimeRange = 'today' | 'week' | 'month' | 'quarter' | 'all' | 'custom';

interface RawOrder {
    id: string;
    channel: 'B2B' | 'B2C' | 'Online';
    amount: number;
    createdAt: Date;
}

const CH_COLORS = { B2B: '#0ea5e9', B2C: '#f59e0b', Online: '#8b5cf6' };
const SUPPLIER_COLORS = { purchases: '#f97316', payments: '#10b981' };

const fmtINR = (n: number) => {
    if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1).replace(/\.0$/, '')}Cr`;
    if (n >= 1_00_000)    return `₹${(n / 1_00_000).toFixed(2).replace(/\.?0+$/, '')}L`;
    if (n >= 1_000)       return `₹${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
    return `₹${Math.round(n).toLocaleString('en-IN')}`;
};

export function AnalyticsPage() {
    const { tenantId, userRole } = useAuth();
    const [orders, setOrders] = useState<RawOrder[]>([]);
    const [supplierData, setSupplierData] = useState<RawSupplierCollections | null>(null);
    const [loading, setLoading] = useState(true);
    const [timeRange, setTimeRange] = useState<TimeRange>('month');
    const [chartType, setChartType] = useState<'stacked' | 'bar'>('stacked');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');

    // Position metrics — always all-time, not filtered by time range
    const [positionData, setPositionData] = useState<{
        supplierOutstanding: number;
        retailerOutstanding: number;
        inventoryValue: number;
    } | null>(null);
    const [positionLoading, setPositionLoading] = useState(true);

    useEffect(() => {
        if (!tenantId) return;
        const fetchAll = async () => {
            setLoading(true);
            try {
                const salesSnap = await getDocs(query(
                    getTenantCollection(db, tenantId, 'salesOrders'),
                    orderBy('createdAt', 'desc'), limit(500)
                ));
                const b2bOrders: RawOrder[] = [];
                const b2cOrders: RawOrder[] = [];
                salesSnap.docs.forEach(doc => {
                    const d = doc.data();
                    const isB2B = d.invoiceType === 'B2B_GST';
                    const amount = Number(d.grandTotal || d.netAmount || d.totalAmount || d.amount || 0);
                    const createdAt = d.createdAt?.toDate ? d.createdAt.toDate() : new Date(d.createdAt || Date.now());
                    const o: RawOrder = { id: doc.id, channel: isB2B ? 'B2B' : 'B2C', amount, createdAt };
                    if (isB2B) b2bOrders.push(o); else b2cOrders.push(o);
                });

                const onlineSnap = await getDocs(query(
                    getTenantCollection(db, tenantId, 'onlineOrders'),
                    orderBy('createdAt', 'desc'), limit(300)
                ));
                const onlineOrders: RawOrder[] = onlineSnap.docs.map(doc => {
                    const d = doc.data();
                    return {
                        id: doc.id, channel: 'Online' as const,
                        amount: Number(d.grandTotal || d.amount || 0),
                        createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : new Date(d.createdAt || Date.now())
                    };
                });
                setOrders([...b2bOrders, ...b2cOrders, ...onlineOrders]);

                // Supplier Ledger — read live from source collections (never the
                // cached suppliers.totalInvoiced/totalPaid fields) so Analytics can
                // never disagree with the Supplier Ledger detail page, even if a
                // write path somewhere hasn't refreshed that cache yet.
                setSupplierData(await fetchSupplierLedgerCollections(db, tenantId));
            } catch (e) {
                console.error('Analytics fetch error', e);
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
    }, [tenantId]);

    // Fetch position metrics independently — these are balance-sheet snapshots,
    // not affected by the time range filter.
    useEffect(() => {
        if (!tenantId) return;
        const fetchPosition = async () => {
            setPositionLoading(true);
            try {
                const [suppliersSnap, retailersSnap, productsSnap] = await Promise.all([
                    getDocs(getTenantCollection(db, tenantId, 'suppliers')),
                    getDocs(getTenantCollection(db, tenantId, 'retailers')),
                    getDocs(getTenantCollection(db, tenantId, 'products')),
                ]);

                const supplierOutstanding = suppliersSnap.docs.reduce((s, doc) => {
                    return s + Number(doc.data().outstandingBalance ?? 0);
                }, 0);

                // Retailer outstanding: Total Sales − Total Payments Received
                // Uses denormalized fields on each retailer doc (kept in sync by all invoice/payment mutations).
                const retailerOutstanding = retailersSnap.docs.reduce((s, doc) => {
                    const d = doc.data();
                    const sales = Number(d.totalSales ?? 0);
                    const paid = Number(d.totalPaid ?? 0);
                    return s + Math.max(0, sales - paid);
                }, 0);

                // Inventory value: Farmer Selling Price × Loose Pieces only
                const inventoryValue = productsSnap.docs.reduce((s, doc) => {
                    const d = doc.data();
                    const loose = Number(d.loosePieces ?? 0);
                    return s + loose * Number(d.sellingPrice ?? 0);
                }, 0);

                setPositionData({ supplierOutstanding, retailerOutstanding, inventoryValue });
            } catch (e) {
                console.error('Position fetch error', e);
            } finally {
                setPositionLoading(false);
            }
        };
        fetchPosition();
    }, [tenantId]);

    // ── Time range window — the one filtering engine every widget on this page uses ──
    const { rangeFrom, rangeTo } = useMemo(() => {
        if (timeRange === 'custom') {
            const from = customFrom ? new Date(customFrom) : new Date(0);
            const to   = customTo   ? new Date(customTo + 'T23:59:59') : new Date();
            return { rangeFrom: from, rangeTo: to };
        }
        const now = new Date();
        const cuts: Record<Exclude<TimeRange,'custom'>, Date> = {
            today:   new Date(now.getFullYear(), now.getMonth(), now.getDate()),
            week:    (() => { const d = new Date(now); d.setDate(now.getDate() - now.getDay()); d.setHours(0,0,0,0); return d; })(),
            month:   new Date(now.getFullYear(), now.getMonth(), 1),
            quarter: new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1),
            all:     new Date(0),
        };
        return { rangeFrom: cuts[timeRange as Exclude<TimeRange,'custom'>], rangeTo: now };
    }, [timeRange, customFrom, customTo]);

    const filteredOrders = useMemo(() => {
        return orders.filter(o => o.createdAt >= rangeFrom && o.createdAt <= rangeTo);
    }, [orders, rangeFrom, rangeTo]);

    // ── Compute metrics ──
    const metrics = useMemo(() => {
        let total = 0, b2b = 0, b2c = 0, online = 0;
        let b2bCnt = 0, b2cCnt = 0, onlineCnt = 0;
        filteredOrders.forEach(o => {
            total += o.amount;
            if (o.channel === 'B2B') { b2b += o.amount; b2bCnt++; }
            if (o.channel === 'B2C') { b2c += o.amount; b2cCnt++; }
            if (o.channel === 'Online') { online += o.amount; onlineCnt++; }
        });
        const cnt = filteredOrders.length;
        const avg = cnt > 0 ? total / cnt : 0;
        const maxRev = Math.max(b2b, b2c, online);
        const topChannel = maxRev > 0 ? (maxRev === b2b ? 'B2B' : maxRev === b2c ? 'B2C' : 'Online') : 'N/A';
        return { total, b2b, b2c, online, cnt, b2bCnt, b2cCnt, onlineCnt, avg, topChannel };
    }, [filteredOrders]);

    // ── Chart data ──
    const { areaData, pieData } = useMemo(() => {
        const pie = [
            { name: 'B2B', value: metrics.b2b },
            { name: 'B2C / POS', value: metrics.b2c },
            { name: 'Online', value: metrics.online },
        ].filter(d => d.value > 0);

        const dailyMap = new Map<string, { date: string; isoDate: string; B2B: number; B2C: number; Online: number }>();
        filteredOrders.forEach(o => {
            const isoDate = o.createdAt.toISOString().split('T')[0];
            const label = o.createdAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
            if (!dailyMap.has(isoDate)) dailyMap.set(isoDate, { date: label, isoDate, B2B: 0, B2C: 0, Online: 0 });
            const day = dailyMap.get(isoDate)!;
            day[o.channel] += o.amount;
        });

        const sorted = Array.from(dailyMap.values()).sort((a, b) => a.isoDate.localeCompare(b.isoDate));
        return { pieData: pie, areaData: sorted };
    }, [filteredOrders, metrics]);

    // ── Supplier metrics — same {rangeFrom, rangeTo} window as every other widget ──
    const supplierMetrics = useMemo(() => {
        const empty = {
            supplierCount: 0, totalPurchases: 0, totalInvoiceCount: 0, totalPOCount: 0,
            totalOutstanding: 0, totalPaid: 0, avgPurchaseValue: 0, avgOutstanding: 0,
            topSuppliers: [] as { name: string; purchases: number }[],
            topOutstanding: [] as { name: string; outstanding: number }[],
            recentSuppliers: [] as { name: string; createdAt: number }[],
            trend: [] as { date: string; isoDate: string; purchases: number; payments: number }[],
        };
        if (!supplierData) return empty;
        const { suppliers, purchaseOrders, payments, invoices } = supplierData;
        const inRange = (ms: number) => ms >= rangeFrom.getTime() && ms <= rangeTo.getTime();

        const posInRange = purchaseOrders.filter(po => inRange(docDateMs(poDateVal(po))));
        const invsInRange = invoices.filter(inv => inRange(docDateMs(invDateVal(inv))));
        const pmtsInRange = payments.filter(p => inRange(docDateMs(pmtDateVal(p))));

        const poTotal = posInRange.reduce((s, p) => s + poAmount(p), 0);
        const invTotal = invsInRange.reduce((s, i) => s + invAmount(i), 0);
        const totalPurchases = poTotal + invTotal;
        const totalPaid = pmtsInRange.reduce((s, p) => s + pmtAmount(p), 0);
        const totalOutstanding = totalPurchases - totalPaid;
        const totalInvoiceCount = invsInRange.length;
        const totalPOCount = posInRange.length;
        const purchaseDocCount = totalPOCount + totalInvoiceCount;
        const avgPurchaseValue = purchaseDocCount > 0 ? totalPurchases / purchaseDocCount : 0;

        // Per-supplier purchases/outstanding — computed from the same in-range docs
        // as the totals above, joined by supplierName/supplierId exactly like
        // supplierLedgerSync.ts, so a supplier's number here always matches their
        // own ledger detail page for the same range.
        const bySupplier = new Map<string, { name: string; purchases: number; paid: number }>();
        suppliers.forEach(s => bySupplier.set(s.id, { name: s.name, purchases: 0, paid: 0 }));
        posInRange.forEach(po => {
            const sup = suppliers.find(s => s.name === po.supplierName);
            if (!sup) return;
            bySupplier.get(sup.id)!.purchases += poAmount(po);
        });
        invsInRange.forEach(inv => {
            if (!inv.supplierId || !bySupplier.has(inv.supplierId)) return;
            bySupplier.get(inv.supplierId)!.purchases += invAmount(inv);
        });
        pmtsInRange.forEach(p => {
            const sup = suppliers.find(s => s.name === p.supplierName);
            if (!sup) return;
            bySupplier.get(sup.id)!.paid += pmtAmount(p);
        });

        const perSupplier = Array.from(bySupplier.values());
        const suppliersWithOutstanding = perSupplier.filter(s => s.purchases > 0 || s.paid > 0);
        const avgOutstanding = suppliersWithOutstanding.length > 0
            ? suppliersWithOutstanding.reduce((s, x) => s + (x.purchases - x.paid), 0) / suppliersWithOutstanding.length
            : 0;

        const topSuppliers = [...perSupplier]
            .filter(s => s.purchases > 0)
            .sort((a, b) => b.purchases - a.purchases)
            .slice(0, 5)
            .map(s => ({ name: s.name, purchases: s.purchases }));

        const topOutstanding = [...perSupplier]
            .map(s => ({ name: s.name, outstanding: s.purchases - s.paid }))
            .filter(s => s.outstanding > 0)
            .sort((a, b) => b.outstanding - a.outstanding)
            .slice(0, 5);

        const recentSuppliers = [...suppliers]
            .map(s => ({ name: s.name, createdAt: docDateMs(s.createdAt) }))
            .filter(s => s.createdAt > 0)
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, 5);

        // Purchase & Payment trend — same daily-bucket shape as the Channel Revenue Timeline.
        const dailyMap = new Map<string, { date: string; isoDate: string; purchases: number; payments: number }>();
        const bump = (ms: number, key: 'purchases' | 'payments', amount: number) => {
            if (!ms) return;
            const d = new Date(ms);
            const isoDate = d.toISOString().split('T')[0];
            const label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
            if (!dailyMap.has(isoDate)) dailyMap.set(isoDate, { date: label, isoDate, purchases: 0, payments: 0 });
            dailyMap.get(isoDate)![key] += amount;
        };
        posInRange.forEach(po => bump(docDateMs(poDateVal(po)), 'purchases', poAmount(po)));
        invsInRange.forEach(inv => bump(docDateMs(invDateVal(inv)), 'purchases', invAmount(inv)));
        pmtsInRange.forEach(p => bump(docDateMs(pmtDateVal(p)), 'payments', pmtAmount(p)));
        const trend = Array.from(dailyMap.values()).sort((a, b) => a.isoDate.localeCompare(b.isoDate));

        return {
            supplierCount: suppliers.length, totalPurchases, totalInvoiceCount, totalPOCount,
            totalOutstanding, totalPaid, avgPurchaseValue, avgOutstanding,
            topSuppliers, topOutstanding, recentSuppliers, trend,
        };
    }, [supplierData, rangeFrom, rangeTo]);

    if (userRole !== 'admin' && userRole !== 'analyst') {
        return <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--danger)' }}>Access Denied.</div>;
    }

    const netPosition = positionData
        ? positionData.retailerOutstanding + positionData.inventoryValue - positionData.supplierOutstanding
        : 0;

    const KpiCard = ({ label, value, sub, icon: Icon, border, bg }: any) => (
        <div className="glass-panel" style={{ padding: '1.25rem 1.5rem', borderLeft: `4px solid ${border}`, background: bg, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem' }}>{label}</p>
                    <h2 style={{ margin: 0, fontSize: 'clamp(1rem, 2.2vw, 1.45rem)', fontWeight: 800, color: border, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</h2>
                    {sub && <p style={{ margin: '0.2rem 0 0', color: 'var(--text-tertiary)', fontSize: '0.72rem' }}>{sub}</p>}
                </div>
                <div style={{ background: `${border}22`, borderRadius: '12px', padding: '0.65rem', flexShrink: 0 }}>
                    <Icon size={20} color={border} />
                </div>
            </div>
        </div>
    );

    const timeLabels: Record<TimeRange, string> = { today: 'Today', week: 'This Week', month: 'This Month', quarter: 'This Quarter', all: 'All Time', custom: 'Custom Range' };

    return (
        <div className="animate-fade-in" style={{ maxWidth: '1400px', margin: '0 auto' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 className="primary-gradient-text" style={{ fontSize: '2.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', letterSpacing: '-0.02em' }}>
                        <Activity size={32} /> Master Analytics
                    </h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Consolidated performance across B2B, B2C/POS, and Online Channels.</p>
                </div>
                {/* Time Range Pills + Custom picker */}
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    {(['today', 'week', 'month', 'quarter', 'all', 'custom'] as TimeRange[]).map(r => (
                        <button key={r} onClick={() => setTimeRange(r)}
                            style={{ padding: '0.35rem 0.9rem', borderRadius: '20px', border: `1px solid ${timeRange === r ? 'var(--primary-light)' : 'var(--surface-border)'}`, background: timeRange === r ? 'var(--primary-light)' : 'transparent', color: timeRange === r ? '#fff' : 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
                            {timeLabels[r]}
                        </button>
                    ))}
                    {timeRange === 'custom' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginLeft: '0.25rem' }}>
                            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                                className="input-field" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', width: '140px' }} />
                            <span style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>to</span>
                            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                                className="input-field" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', width: '140px' }} />
                        </div>
                    )}
                </div>
            </div>

            {/* ── Primary Position Metrics (always all-time, independent of time range) ── */}
            <div style={{ marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '0.8rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    <Scale size={16} /> Current Position &nbsp;<span style={{ fontWeight: 400, fontSize: '0.72rem', color: 'var(--text-tertiary)', textTransform: 'none', letterSpacing: 0 }}>Balance-sheet snapshot · All time</span>
                </h2>
                {positionLoading ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                        {[0, 1, 2, 3].map(i => (
                            <div key={i} className="glass-panel" style={{ padding: '1.25rem 1.5rem', height: '100px', opacity: 0.5, borderLeft: '4px solid var(--surface-border)' }} />
                        ))}
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                        <KpiCard
                            label="Supplier Outstanding"
                            value={fmtINR(positionData?.supplierOutstanding ?? 0)}
                            sub="Total payable to suppliers"
                            icon={Truck}
                            border="#ef4444"
                            bg="rgba(239,68,68,0.07)"
                        />
                        <KpiCard
                            label="Retailer Outstanding"
                            value={fmtINR(positionData?.retailerOutstanding ?? 0)}
                            sub="Total receivable from retailers"
                            icon={Building2}
                            border="#f97316"
                            bg="rgba(249,115,22,0.07)"
                        />
                        <KpiCard
                            label="Inventory Value"
                            value={fmtINR(positionData?.inventoryValue ?? 0)}
                            sub="Loose pcs × farmer selling price"
                            icon={Archive}
                            border="#8b5cf6"
                            bg="rgba(139,92,246,0.07)"
                        />
                        <KpiCard
                            label="Net Position"
                            value={fmtINR(netPosition)}
                            sub={netPosition >= 0 ? 'Healthy — assets exceed liabilities' : 'Liability exceeds assets'}
                            icon={Scale}
                            border={netPosition >= 0 ? '#10b981' : '#ef4444'}
                            bg={netPosition >= 0 ? 'rgba(16,185,129,0.07)' : 'rgba(239,68,68,0.07)'}
                        />
                    </div>
                )}
            </div>

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem', gap: '1rem', color: 'var(--text-tertiary)', alignItems: 'center' }}>
                    <Activity className="animate-spin" size={28} style={{ color: 'var(--primary-light)' }} />
                    Aggregating multi-channel data...
                </div>
            ) : (
                <>
                    {/* 8 KPI Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                        <KpiCard label="Total Blended Revenue" value={fmtINR(metrics.total)} sub={`${metrics.cnt} orders · ${timeLabels[timeRange]}`} icon={IndianRupee} border="#10b981" bg="rgba(16,185,129,0.07)" />
                        <KpiCard label="Avg Order Value" value={fmtINR(metrics.avg)} sub="blended across all channels" icon={TrendingUp} border="#f59e0b" bg="rgba(245,158,11,0.07)" />
                        <KpiCard label="B2B Revenue" value={fmtINR(metrics.b2b)} sub={`${metrics.b2bCnt} invoices`} icon={Target} border="#0ea5e9" bg="rgba(14,165,233,0.07)" />
                        <KpiCard label="B2C / POS Revenue" value={fmtINR(metrics.b2c)} sub={`${metrics.b2cCnt} bills`} icon={ShoppingCart} border="#f59e0b" bg="rgba(245,158,11,0.07)" />
                        <KpiCard label="Online Revenue" value={fmtINR(metrics.online)} sub={`${metrics.onlineCnt} orders`} icon={Zap} border="#8b5cf6" bg="rgba(139,92,246,0.07)" />
                        <KpiCard label="Total Orders" value={String(metrics.cnt)} sub="B2B + POS + Online" icon={BarChart3} border="#38bdf8" bg="rgba(56,189,248,0.07)" />
                        <KpiCard label="Top Channel" value={metrics.topChannel} sub="by revenue" icon={Layers} border="#a78bfa" bg="rgba(167,139,250,0.07)" />
                        <KpiCard label="B2B Share" value={metrics.total > 0 ? `${(metrics.b2b * 100 / metrics.total).toFixed(1)}%` : '—'} sub={`B2C ${metrics.total > 0 ? (metrics.b2c * 100 / metrics.total).toFixed(1) : 0}% · Online ${metrics.total > 0 ? (metrics.online * 100 / metrics.total).toFixed(1) : 0}%`} icon={Activity} border="#34d399" bg="rgba(52,211,153,0.07)" />
                    </div>

                    {/* Charts row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.5rem', marginBottom: '1.5rem', alignItems: 'start' }}>

                        {/* Main Chart */}
                        <div className="glass-panel" style={{ padding: '1.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <BarChart3 size={20} color="var(--primary-light)" /> Channel Revenue Timeline
                                </h3>
                                <div style={{ display: 'flex', gap: '0.4rem' }}>
                                    {(['stacked', 'bar'] as const).map(t => (
                                        <button key={t} onClick={() => setChartType(t)}
                                            style={{ padding: '0.25rem 0.7rem', borderRadius: '12px', border: `1px solid ${chartType === t ? 'var(--primary-light)' : 'var(--surface-border)'}`, background: chartType === t ? 'rgba(var(--primary-light-rgb,16,185,129),0.15)' : 'transparent', color: chartType === t ? 'var(--primary-light)' : 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                                            {t === 'stacked' ? 'Stacked Area' : 'Bar Chart'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div style={{ height: '380px' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    {chartType === 'stacked' ? (
                                        <AreaChart data={areaData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                                            <defs>
                                                {(['B2B', 'B2C', 'Online'] as const).map((ch, i) => (
                                                    <linearGradient key={ch} id={`grad${ch}`} x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor={Object.values(CH_COLORS)[i]} stopOpacity={0.4} />
                                                        <stop offset="95%" stopColor={Object.values(CH_COLORS)[i]} stopOpacity={0.05} />
                                                    </linearGradient>
                                                ))}
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
                                            <XAxis dataKey="date" stroke="var(--text-tertiary)" fontSize={11} tickLine={false} axisLine={false} />
                                            <YAxis stroke="var(--text-tertiary)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={fmtINR} />
                                            <Tooltip contentStyle={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderRadius: '10px', color: 'var(--text-primary)' }}
                                                formatter={(v: any, name: any) => [fmtINR(Number(v)), name]} />
                                            <Legend iconType="circle" wrapperStyle={{ fontSize: '0.82rem' }} />
                                            <Area type="monotone" dataKey="B2B" stackId="1" stroke={CH_COLORS.B2B} fill={`url(#gradB2B)`} strokeWidth={2} />
                                            <Area type="monotone" dataKey="B2C" stackId="1" stroke={CH_COLORS.B2C} fill={`url(#gradB2C)`} strokeWidth={2} />
                                            <Area type="monotone" dataKey="Online" stackId="1" stroke={CH_COLORS.Online} fill={`url(#gradOnline)`} strokeWidth={2} />
                                        </AreaChart>
                                    ) : (
                                        <ComposedChart data={areaData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
                                            <XAxis dataKey="date" stroke="var(--text-tertiary)" fontSize={11} tickLine={false} axisLine={false} />
                                            <YAxis stroke="var(--text-tertiary)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={fmtINR} />
                                            <Tooltip contentStyle={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderRadius: '10px', color: 'var(--text-primary)' }}
                                                formatter={(v: any, name: any) => [fmtINR(Number(v)), name]} />
                                            <Legend iconType="circle" wrapperStyle={{ fontSize: '0.82rem' }} />
                                            <Bar dataKey="B2B" stackId="a" fill={CH_COLORS.B2B} radius={[0,0,0,0]} />
                                            <Bar dataKey="B2C" stackId="a" fill={CH_COLORS.B2C} radius={[0,0,0,0]} />
                                            <Bar dataKey="Online" stackId="a" fill={CH_COLORS.Online} radius={[4,4,0,0]} />
                                        </ComposedChart>
                                    )}
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Donut Chart */}
                        <div className="glass-panel" style={{ padding: '1.5rem' }}>
                            <h3 style={{ margin: '0 0 1rem', fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Activity size={20} color="var(--primary-light)" /> Revenue Split
                            </h3>
                            {pieData.length > 0 ? (
                                <>
                                    <div style={{ height: '240px' }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={95} paddingAngle={4} dataKey="value" stroke="none">
                                                    {pieData.map((_, i) => <Cell key={i} fill={[CH_COLORS.B2B, CH_COLORS.B2C, CH_COLORS.Online][i % 3]} />)}
                                                </Pie>
                                                <Tooltip formatter={(v: any) => fmtINR(Number(v))} contentStyle={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderRadius: '10px', color: 'var(--text-primary)' }} />
                                                <Legend iconType="circle" wrapperStyle={{ fontSize: '0.8rem' }} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                    {/* Channel breakdown list */}
                                    <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {[
                                            { label: 'B2B', val: metrics.b2b, cnt: metrics.b2bCnt, color: CH_COLORS.B2B },
                                            { label: 'B2C / POS', val: metrics.b2c, cnt: metrics.b2cCnt, color: CH_COLORS.B2C },
                                            { label: 'Online', val: metrics.online, cnt: metrics.onlineCnt, color: CH_COLORS.Online },
                                        ].map(ch => (
                                            <div key={ch.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', borderRadius: '8px', background: `${ch.color}11`, borderLeft: `3px solid ${ch.color}` }}>
                                                <span style={{ fontWeight: 600, fontSize: '0.82rem', color: ch.color }}>{ch.label}</span>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{fmtINR(ch.val)}</div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>{ch.cnt} orders · {metrics.total > 0 ? (ch.val * 100 / metrics.total).toFixed(1) : '0.0'}%</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <div style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '3rem 0' }}>No data for selected range.</div>
                            )}
                        </div>
                    </div>

                    {/* Channel Comparison Table */}
                    <div className="glass-panel" style={{ padding: '1.5rem' }}>
                        <h3 style={{ margin: '0 0 1rem', fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Layers size={20} color="var(--primary-light)" /> Channel Comparison · {timeRange === 'custom' && customFrom && customTo ? `${customFrom} → ${customTo}` : timeLabels[timeRange]}
                        </h3>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--surface-border)', color: 'var(--text-secondary)' }}>
                                        {['Channel', 'Orders', 'Revenue', 'Avg Order', 'Revenue Share'].map(h => (
                                            <th key={h} style={{ padding: '0.75rem 1rem', fontWeight: 600, textAlign: h === 'Orders' || h === 'Revenue' || h === 'Avg Order' || h === 'Revenue Share' ? 'right' : 'left' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {[
                                        { label: 'B2B (Wholesale)', val: metrics.b2b, cnt: metrics.b2bCnt, color: CH_COLORS.B2B },
                                        { label: 'B2C / POS (Retail)', val: metrics.b2c, cnt: metrics.b2cCnt, color: CH_COLORS.B2C },
                                        { label: 'Online (D2C)', val: metrics.online, cnt: metrics.onlineCnt, color: CH_COLORS.Online },
                                    ].map(ch => {
                                        const pct = metrics.total > 0 ? (ch.val * 100 / metrics.total) : 0;
                                        const avg = ch.cnt > 0 ? ch.val / ch.cnt : 0;
                                        return (
                                            <tr key={ch.label} style={{ borderBottom: '1px solid var(--surface-border)' }}
                                                onMouseOver={e => (e.currentTarget.style.background = 'var(--surface-raised)')}
                                                onMouseOut={e => (e.currentTarget.style.background = 'transparent')}>
                                                <td style={{ padding: '1rem', fontWeight: 700, color: ch.color, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: ch.color, flexShrink: 0, display: 'inline-block' }} />
                                                    {ch.label}
                                                </td>
                                                <td style={{ padding: '1rem', textAlign: 'right', color: 'var(--text-secondary)' }}>{ch.cnt}</td>
                                                <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>{fmtINR(ch.val)}</td>
                                                <td style={{ padding: '1rem', textAlign: 'right', color: 'var(--text-secondary)' }}>{fmtINR(avg)}</td>
                                                <td style={{ padding: '1rem', textAlign: 'right' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                                        <div style={{ width: '80px', height: '6px', borderRadius: '99px', background: 'var(--surface-border)', overflow: 'hidden' }}>
                                                            <div style={{ width: `${pct}%`, height: '100%', background: ch.color, borderRadius: '99px' }} />
                                                        </div>
                                                        <span style={{ fontWeight: 700, color: ch.color, minWidth: '3rem' }}>{pct.toFixed(1)}%</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {/* Total row */}
                                    <tr style={{ borderTop: '2px solid var(--surface-border)', background: 'var(--surface-raised)' }}>
                                        <td style={{ padding: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>Total</td>
                                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 700 }}>{metrics.cnt}</td>
                                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 800, color: '#10b981', fontSize: '1rem' }}>{fmtINR(metrics.total)}</td>
                                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 700 }}>{fmtINR(metrics.avg)}</td>
                                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 700 }}>100.0%</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Supplier Ledger Analytics */}
                    <div style={{ marginTop: '2rem' }}>
                        <h2 style={{ fontSize: '1.3rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
                            <Truck size={22} color="var(--primary-light)" /> Supplier Ledger Analytics
                        </h2>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>Purchases, payables and payments across your supplier base · {timeLabels[timeRange]}.</p>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                            <KpiCard label="Total Suppliers" value={String(supplierMetrics.supplierCount)} sub="active in ledger" icon={Building2} border="#0ea5e9" bg="rgba(14,165,233,0.07)" />
                            <KpiCard label="Total Purchases" value={fmtINR(supplierMetrics.totalPurchases)} sub={`${supplierMetrics.totalPOCount} POs · ${supplierMetrics.totalInvoiceCount} invoices`} icon={Package} border="#f97316" bg="rgba(249,115,22,0.07)" />
                            <KpiCard label="Total Outstanding Payables" value={fmtINR(supplierMetrics.totalOutstanding)} sub={timeLabels[timeRange]} icon={IndianRupee} border="#ef4444" bg="rgba(239,68,68,0.07)" />
                            <KpiCard label="Total Payments Made" value={fmtINR(supplierMetrics.totalPaid)} sub={timeLabels[timeRange]} icon={Wallet} border="#10b981" bg="rgba(16,185,129,0.07)" />
                            <KpiCard label="Avg Purchase Value" value={fmtINR(supplierMetrics.avgPurchaseValue)} sub="per PO / invoice" icon={Receipt} border="#a78bfa" bg="rgba(167,139,250,0.07)" />
                            <KpiCard label="Avg Supplier Outstanding" value={fmtINR(supplierMetrics.avgOutstanding)} sub="across active suppliers" icon={TrendingUp} border="#f59e0b" bg="rgba(245,158,11,0.07)" />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.5rem', marginBottom: '1.5rem', alignItems: 'start' }}>

                            {/* Purchase & Payment Trend */}
                            <div className="glass-panel" style={{ padding: '1.5rem' }}>
                                <h3 style={{ margin: '0 0 1.25rem', fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <BarChart3 size={20} color="var(--primary-light)" /> Purchase &amp; Payment Trend
                                </h3>
                                {supplierMetrics.trend.length > 0 ? (
                                    <div style={{ height: '380px' }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ComposedChart data={supplierMetrics.trend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
                                                <XAxis dataKey="date" stroke="var(--text-tertiary)" fontSize={11} tickLine={false} axisLine={false} />
                                                <YAxis stroke="var(--text-tertiary)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={fmtINR} />
                                                <Tooltip contentStyle={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderRadius: '10px', color: 'var(--text-primary)' }}
                                                    formatter={(v, name) => [fmtINR(Number(v)), name]} />
                                                <Legend iconType="circle" wrapperStyle={{ fontSize: '0.82rem' }} />
                                                <Bar dataKey="purchases" name="Purchases" fill={SUPPLIER_COLORS.purchases} radius={[4,4,0,0]} />
                                                <Bar dataKey="payments" name="Payments" fill={SUPPLIER_COLORS.payments} radius={[4,4,0,0]} />
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    </div>
                                ) : (
                                    <div style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '3rem 0' }}>No supplier activity for selected range.</div>
                                )}
                            </div>

                            {/* Top Outstanding Suppliers */}
                            <div className="glass-panel" style={{ padding: '1.5rem' }}>
                                <h3 style={{ margin: '0 0 1rem', fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <IndianRupee size={20} color="var(--primary-light)" /> Top Outstanding Suppliers
                                </h3>
                                {supplierMetrics.topOutstanding.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {supplierMetrics.topOutstanding.map(s => (
                                            <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', borderRadius: '8px', background: 'rgba(239,68,68,0.07)', borderLeft: '3px solid #ef4444' }}>
                                                <span style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '0.5rem' }}>{s.name}</span>
                                                <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#ef4444', flexShrink: 0 }}>{fmtINR(s.outstanding)}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '3rem 0' }}>No outstanding payables.</div>
                                )}
                            </div>
                        </div>

                        {/* Top Suppliers by Purchase Value */}
                        <div className="glass-panel" style={{ padding: '1.5rem' }}>
                            <h3 style={{ margin: '0 0 1rem', fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Layers size={20} color="var(--primary-light)" /> Top Suppliers by Purchase Value · {timeRange === 'custom' && customFrom && customTo ? `${customFrom} → ${customTo}` : timeLabels[timeRange]}
                            </h3>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--surface-border)', color: 'var(--text-secondary)' }}>
                                            {['Supplier', 'Purchases', 'Contribution %'].map(h => (
                                                <th key={h} style={{ padding: '0.75rem 1rem', fontWeight: 600, textAlign: h === 'Supplier' ? 'left' : 'right' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {supplierMetrics.topSuppliers.length === 0 && (
                                            <tr><td colSpan={3} style={{ padding: '1rem', color: 'var(--text-tertiary)' }}>No purchases recorded for selected range.</td></tr>
                                        )}
                                        {supplierMetrics.topSuppliers.map(s => {
                                            const pct = supplierMetrics.totalPurchases > 0 ? (s.purchases * 100 / supplierMetrics.totalPurchases) : 0;
                                            return (
                                                <tr key={s.name} style={{ borderBottom: '1px solid var(--surface-border)' }}
                                                    onMouseOver={e => (e.currentTarget.style.background = 'var(--surface-raised)')}
                                                    onMouseOut={e => (e.currentTarget.style.background = 'transparent')}>
                                                    <td style={{ padding: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{s.name}</td>
                                                    <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>{fmtINR(s.purchases)}</td>
                                                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                                            <div style={{ width: '80px', height: '6px', borderRadius: '99px', background: 'var(--surface-border)', overflow: 'hidden' }}>
                                                                <div style={{ width: `${pct}%`, height: '100%', background: SUPPLIER_COLORS.purchases, borderRadius: '99px' }} />
                                                            </div>
                                                            <span style={{ fontWeight: 700, color: SUPPLIER_COLORS.purchases, minWidth: '3rem' }}>{pct.toFixed(1)}%</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            {supplierMetrics.recentSuppliers.length > 0 && (
                                <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--surface-border)' }}>
                                    <p style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: '0.5rem' }}>Recently Added Suppliers</p>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        {supplierMetrics.recentSuppliers.map(s => (
                                            <span key={s.name} style={{ fontSize: '0.78rem', fontWeight: 600, padding: '0.3rem 0.7rem', borderRadius: '99px', background: 'var(--surface-raised)', color: 'var(--text-secondary)' }}>{s.name}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
