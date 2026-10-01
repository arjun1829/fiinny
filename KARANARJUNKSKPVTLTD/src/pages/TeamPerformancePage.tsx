import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getDocs, getDoc, doc, query, where, collection } from 'firebase/firestore';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import {
  Users, Target, ReceiptText, Wallet, ChevronLeft, ChevronRight,
  Trophy, Loader2, TrendingUp, MapPin, Store, CheckCircle2,
  AlertCircle, ChevronDown, ChevronUp, Settings, UserCog,
} from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection } from '../utils/tenantPath';
import { fmtINR } from '../utils/gstCalculator';

// ── Helpers ───────────────────────────────────────────────────────────────────
function toYM(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function prevYM(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return toYM(new Date(y, m - 2, 1));
}
function nextYM(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return toYM(new Date(y, m, 1));
}
function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}
function pctOf(achieved: number, target: number): number {
  return target > 0 ? Math.round((achieved / target) * 100) : 0;
}
function progressColor(pct: number): string {
  if (pct >= 100) return '#15803d';
  if (pct >= 76) return '#22c55e';
  if (pct >= 51) return '#f97316';
  if (pct >= 26) return '#eab308';
  return '#ef4444';
}
function fmtK(v: number): string {
  if (v >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(1)}Cr`;
  if (v >= 1_00_000) return `₹${(v / 1_00_000).toFixed(1)}L`;
  if (v >= 1_000) return `₹${(v / 1_000).toFixed(0)}K`;
  return `₹${v}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface RetailerStat {
  id: string;
  name: string;
  location: string;
  district: string;
  invoiced: number;
  collected: number;
}

interface ExecStat {
  userId: string;
  name: string;
  email: string;
  districts: string[];
  invoiceTarget: number;
  paymentTarget: number;
  invoiceAchieved: number;
  paymentAchieved: number;
  retailers: RetailerStat[];
}

// ── Mini Progress Bar ─────────────────────────────────────────────────────────
function MiniBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ width: '100%', height: '5px', background: 'var(--surface-raised)', borderRadius: '3px', overflow: 'hidden', marginTop: '4px' }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, borderRadius: '3px', transition: 'width 0.6s ease' }} />
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({
  icon, label, value, sub, highlight,
}: { icon: React.ReactNode; label: string; value: string; sub?: string; highlight?: string }) {
  return (
    <div className="glass-panel" style={{ padding: '1.25rem 1.5rem', borderRadius: '16px', flex: '1 1 180px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-tertiary)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.65rem' }}>
        {icon}{label}
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: highlight || 'var(--text-primary)', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{sub}</div>}
    </div>
  );
}

// ── Custom Tooltip for Chart ──────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-panel" style={{ padding: '0.75rem 1rem', borderRadius: '10px', fontSize: '0.8rem' }}>
      <div style={{ fontWeight: 700, marginBottom: '0.4rem' }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color, display: 'flex', justifyContent: 'space-between', gap: '1.5rem' }}>
          <span>{p.name}</span><span style={{ fontWeight: 700 }}>{p.value}%</span>
        </div>
      ))}
    </div>
  );
}

// ── Exec Card ─────────────────────────────────────────────────────────────────
function ExecCard({ exec }: { exec: ExecStat }) {
  const [expanded, setExpanded] = useState(false);
  const invPct = pctOf(exec.invoiceAchieved, exec.invoiceTarget);
  const pmtPct = pctOf(exec.paymentAchieved, exec.paymentTarget);
  const invColor = progressColor(invPct);
  const pmtColor = progressColor(pmtPct);

  const pendingRetailers = exec.retailers.filter(r => r.invoiced > 0 && r.collected === 0);
  const clearedRetailers = exec.retailers.filter(r => r.collected > 0);
  const totalAssigned = exec.retailers.length;

  const overallPct = pctOf(
    exec.invoiceAchieved + exec.paymentAchieved,
    (exec.invoiceTarget || 0) + (exec.paymentTarget || 0),
  );

  return (
    <div className="glass-panel" style={{ borderRadius: '16px', overflow: 'hidden', border: overallPct >= 100 ? '1.5px solid #15803d' : '1px solid var(--surface-border)' }}>
      {/* Header row */}
      <div
        style={{ padding: '1rem 1.25rem', display: 'grid', gridTemplateColumns: '1fr auto', gap: '1rem', alignItems: 'center', cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}
      >
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {/* Avatar */}
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: overallPct >= 100 ? 'hsla(142,70%,45%,0.15)' : 'var(--surface-raised)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {overallPct >= 100
              ? <Trophy size={20} color="#15803d" />
              : <UserCog size={20} color="var(--text-tertiary)" />}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {exec.name || exec.email}
              {overallPct >= 100 && <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.45rem', borderRadius: '8px', background: 'hsla(142,70%,45%,0.15)', color: '#15803d', fontWeight: 700 }}>TARGET MET</span>}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.15rem' }}>{exec.email}</div>
            {exec.districts.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.3rem', flexWrap: 'wrap' }}>
                <MapPin size={11} style={{ color: 'var(--text-tertiary)' }} />
                {exec.districts.map(d => (
                  <span key={d} style={{ fontSize: '0.68rem', padding: '0.1rem 0.45rem', borderRadius: '8px', background: 'hsla(152,60%,40%,0.1)', color: 'var(--primary-light)', fontWeight: 600, border: '1px solid hsla(152,60%,40%,0.2)' }}>{d}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right summary */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '1.25rem' }}>
            {/* Invoice */}
            <div style={{ textAlign: 'right', minWidth: '120px' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Invoice</div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: invColor }}>{invPct}% <span style={{ color: 'var(--text-tertiary)', fontWeight: 400, fontSize: '0.75rem' }}>({fmtK(exec.invoiceAchieved)} / {exec.invoiceTarget > 0 ? fmtK(exec.invoiceTarget) : '—'})</span></div>
              <MiniBar pct={invPct} color={invColor} />
            </div>
            {/* Payment */}
            <div style={{ textAlign: 'right', minWidth: '120px' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Payment</div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: pmtColor }}>{pmtPct}% <span style={{ color: 'var(--text-tertiary)', fontWeight: 400, fontSize: '0.75rem' }}>({fmtK(exec.paymentAchieved)} / {exec.paymentTarget > 0 ? fmtK(exec.paymentTarget) : '—'})</span></div>
              <MiniBar pct={pmtPct} color={pmtColor} />
            </div>
          </div>
          {/* Retailer counts */}
          <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.72rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--text-tertiary)' }}><Store size={11} /> {totalAssigned} retailers</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#ef4444' }}><AlertCircle size={11} /> {pendingRetailers.length} pending</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#15803d' }}><CheckCircle2 size={11} /> {clearedRetailers.length} cleared</span>
          </div>
          {/* Expand toggle */}
          <div style={{ color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem' }}>
            {expanded ? <><ChevronUp size={14} /> Hide retailers</> : <><ChevronDown size={14} /> View retailers</>}
          </div>
        </div>
      </div>

      {/* Expanded retailer drill-down */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--surface-border)', padding: '1rem 1.25rem' }}>
          {exec.retailers.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '1rem', fontSize: '0.85rem' }}>No retailers assigned to this executive.</div>
          ) : (
            <>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: '0.75rem' }}>Retailer-wise Performance</div>
              {/* Table header */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 130px 80px', gap: '0.5rem', padding: '0.35rem 0.75rem', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>
                <div>Retailer</div>
                <div style={{ textAlign: 'right' }}>Invoiced</div>
                <div style={{ textAlign: 'right' }}>Collected</div>
                <div style={{ textAlign: 'center' }}>Status</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {exec.retailers.map(r => {
                  const hasInvoice = r.invoiced > 0;
                  const hasPayment = r.collected > 0;
                  const statusColor = !hasInvoice ? 'var(--text-tertiary)' : hasPayment ? '#15803d' : '#ef4444';
                  const statusLabel = !hasInvoice ? 'Inactive' : hasPayment ? 'Cleared' : 'Pending';
                  return (
                    <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 130px 80px', gap: '0.5rem', padding: '0.5rem 0.75rem', background: 'var(--surface-base)', borderRadius: '8px', border: '1px solid var(--surface-border)', alignItems: 'center', fontSize: '0.82rem' }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{r.name}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>{r.location || r.district || '—'}</div>
                      </div>
                      <div style={{ textAlign: 'right', fontWeight: 600, color: hasInvoice ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                        {hasInvoice ? fmtINR(r.invoiced) : '—'}
                      </div>
                      <div style={{ textAlign: 'right', fontWeight: 600, color: hasPayment ? '#15803d' : 'var(--text-tertiary)' }}>
                        {hasPayment ? fmtINR(r.collected) : '—'}
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <span style={{ fontSize: '0.68rem', padding: '0.15rem 0.5rem', borderRadius: '8px', fontWeight: 700, background: !hasInvoice ? 'var(--surface-raised)' : hasPayment ? 'hsla(142,70%,45%,0.12)' : 'hsla(0,84%,60%,0.1)', color: statusColor, border: `1px solid ${statusColor}30` }}>
                          {statusLabel}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TeamPerformancePage() {
  const { tenantId, userRole } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState(toYM(new Date()));
  const [loading, setLoading] = useState(false);
  const [execStats, setExecStats] = useState<ExecStat[]>([]);

  const canGoNext = selectedMonth < toYM(new Date());

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    setLoading(true);
    setExecStats([]);

    (async () => {
      try {
        // 1. Fetch all users for this tenant, then filter for sales client-side.
        // Always use where('tenantId') so Firestore can verify the query is safe
        // under the tenant-scoped users rule (unconstrained collection scans are denied).
        const usersQ = query(collection(db, 'users'), where('tenantId', '==', tenantId));
        const usersSnap = await getDocs(usersQ);
        const salesUsers = usersSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as any))
          .filter((u: any) => u.role === 'sales');

        if (salesUsers.length === 0) {
          if (!cancelled) { setExecStats([]); setLoading(false); }
          return;
        }

        // 2. Fetch all retailers
        const retailersSnap = await getDocs(getTenantCollection(db, tenantId, 'retailers'));
        const allRetailers = retailersSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

        // 3. Resolve scoped retailer IDs per exec
        const execScopeMap: Record<string, Set<string>> = {};
        for (const u of salesUsers) {
          const districts: string[] = (u.assignedDistricts ?? []).map((d: string) => d.toLowerCase());
          const assigned: string[] = u.assignedRetailers ?? [];
          const scope = new Set<string>();
          allRetailers.forEach(r => {
            if (assigned.includes(r.id) || districts.includes((r.district || '').toLowerCase())) {
              scope.add(r.id);
            }
          });
          execScopeMap[u.id] = scope;
        }

        // 4. Fetch targets for all execs
        const targetMap: Record<string, { invoiceTarget: number; paymentTarget: number }> = {};
        await Promise.all(salesUsers.map(async (u: any) => {
          const snap = await getDoc(doc(db, 'tenants', tenantId, 'salesTargets', `${u.id}_${selectedMonth}`));
          if (snap.exists()) {
            const d = snap.data();
            targetMap[u.id] = { invoiceTarget: Number(d.invoiceTarget ?? 0), paymentTarget: Number(d.paymentTarget ?? 0) };
          } else {
            targetMap[u.id] = { invoiceTarget: 0, paymentTarget: 0 };
          }
        }));

        // 5. Fetch all salesOrders for the month and bucket by retailerId
        const soSnap = await getDocs(getTenantCollection(db, tenantId, 'salesOrders'));
        const retailerInvoiced: Record<string, number> = {};
        soSnap.docs.forEach(d => {
          const so = d.data();
          const invDate: string = so.invoiceDate || '';
          if (invDate.startsWith(selectedMonth)) {
            const rid: string = so.retailerId ?? '';
            if (rid) retailerInvoiced[rid] = (retailerInvoiced[rid] || 0) + Number(so.grandTotal ?? so.netAmount ?? so.totalAmount ?? 0);
          }
        });

        // 6. Fetch payments per-retailer (tenant-scoped, no collectionGroup).
        const allRetailerIds: string[] = allRetailers.map((r: any) => r.id);
        const pmtSnaps = await Promise.all(
          allRetailerIds.map((rId: string) =>
            getDocs(getTenantCollection(db, tenantId, 'retailers', rId, 'payments'))
          )
        );
        const retailerCollected: Record<string, number> = {};
        pmtSnaps.forEach((snap, idx) => {
          const rId = allRetailerIds[idx];
          snap.docs.forEach(pdoc => {
            const pmtDate: string = pdoc.data().paymentDate || '';
            if (pmtDate.startsWith(selectedMonth)) {
              retailerCollected[rId] = (retailerCollected[rId] || 0) + Number(pdoc.data().amount ?? 0);
            }
          });
        });

        // 7. Build exec stats
        const stats: ExecStat[] = salesUsers.map((u: any) => {
          const scope = execScopeMap[u.id];
          const scopedRetailers: RetailerStat[] = allRetailers
            .filter((r: any) => scope.has(r.id))
            .map((r: any) => ({
              id: r.id,
              name: r.name || '—',
              location: r.atPost || r.location || '',
              district: r.district || '',
              invoiced: retailerInvoiced[r.id] || 0,
              collected: retailerCollected[r.id] || 0,
            }));

          const invoiceAchieved = scopedRetailers.reduce((s, r) => s + r.invoiced, 0);
          const paymentAchieved = scopedRetailers.reduce((s, r) => s + r.collected, 0);

          return {
            userId: u.id,
            name: u.name || '',
            email: u.email || '',
            districts: u.assignedDistricts ?? [],
            invoiceTarget: targetMap[u.id]?.invoiceTarget ?? 0,
            paymentTarget: targetMap[u.id]?.paymentTarget ?? 0,
            invoiceAchieved,
            paymentAchieved,
            retailers: scopedRetailers,
          };
        });

        if (!cancelled) setExecStats(stats);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [tenantId, selectedMonth]);

  // ── Aggregates ──────────────────────────────────────────────────────────────
  const agg = useMemo(() => {
    const totalInvTarget = execStats.reduce((s, e) => s + e.invoiceTarget, 0);
    const totalInvAchieved = execStats.reduce((s, e) => s + e.invoiceAchieved, 0);
    const totalPmtTarget = execStats.reduce((s, e) => s + e.paymentTarget, 0);
    const totalPmtAchieved = execStats.reduce((s, e) => s + e.paymentAchieved, 0);
    const hitCount = execStats.filter(e => pctOf(e.invoiceAchieved, e.invoiceTarget) >= 100).length;
    return { totalInvTarget, totalInvAchieved, totalPmtTarget, totalPmtAchieved, hitCount };
  }, [execStats]);

  // ── Chart data ──────────────────────────────────────────────────────────────
  const chartData = useMemo(() =>
    execStats.map(e => ({
      name: e.name || e.email.split('@')[0],
      'Invoice %': pctOf(e.invoiceAchieved, e.invoiceTarget),
      'Payment %': pctOf(e.paymentAchieved, e.paymentTarget),
    })),
    [execStats],
  );

  if (userRole !== 'admin') {
    return (
      <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--danger)' }}>
        <AlertCircle size={48} style={{ margin: '0 auto 1rem auto' }} />
        <h2>Access Denied</h2>
        <p>This page is only accessible to Admins.</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-base)', padding: '1.5rem' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              <Users size={26} color="var(--primary-light)" /> Team Performance
            </h1>
            <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0', fontSize: '0.875rem' }}>
              Sales team dashboard — read-only monitoring and analytics
            </p>
          </div>
          <Link
            to="/admin"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1.1rem', fontSize: '0.875rem', background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderRadius: '10px', color: 'var(--text-secondary)', textDecoration: 'none', fontWeight: 500 }}
          >
            <Settings size={15} /> Manage Users & Targets
          </Link>
        </div>

        {/* Month Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', marginBottom: '2rem' }}>
          <button
            onClick={() => setSelectedMonth(prevYM(selectedMonth))}
            style={{ background: 'var(--surface-raised)', border: 'none', borderRadius: '8px', padding: '0.4rem 0.7rem', cursor: 'pointer', color: 'var(--text-primary)', display: 'flex', alignItems: 'center' }}
          ><ChevronLeft size={18} /></button>
          <div style={{ fontSize: '1.05rem', fontWeight: 700, minWidth: '160px', textAlign: 'center' }}>
            {fmtMonth(selectedMonth)}
          </div>
          <button
            onClick={() => setSelectedMonth(nextYM(selectedMonth))}
            disabled={!canGoNext}
            style={{ background: 'var(--surface-raised)', border: 'none', borderRadius: '8px', padding: '0.4rem 0.7rem', cursor: canGoNext ? 'pointer' : 'not-allowed', color: canGoNext ? 'var(--text-primary)' : 'var(--text-tertiary)', display: 'flex', alignItems: 'center', opacity: canGoNext ? 1 : 0.4 }}
          ><ChevronRight size={18} /></button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem' }}>
            <Loader2 size={36} className="animate-spin" style={{ color: 'var(--text-tertiary)' }} />
          </div>
        ) : execStats.length === 0 ? (
          <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)', borderRadius: '16px' }}>
            <Users size={40} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
            <div style={{ fontWeight: 600 }}>No sales executives found</div>
            <div style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
              Create users with the <strong>Sales</strong> role in <Link to="/admin" style={{ color: 'var(--primary-light)' }}>Manage Users</Link>.
            </div>
          </div>
        ) : (
          <>
            {/* ── KPI Cards ─────────────────────────────────────────────── */}
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
              <KpiCard
                icon={<ReceiptText size={13} />}
                label="Invoice Target"
                value={fmtK(agg.totalInvTarget)}
                sub={`Achieved: ${fmtK(agg.totalInvAchieved)} (${pctOf(agg.totalInvAchieved, agg.totalInvTarget)}%)`}
                highlight={pctOf(agg.totalInvAchieved, agg.totalInvTarget) >= 100 ? '#15803d' : undefined}
              />
              <KpiCard
                icon={<Wallet size={13} />}
                label="Payment Target"
                value={fmtK(agg.totalPmtTarget)}
                sub={`Collected: ${fmtK(agg.totalPmtAchieved)} (${pctOf(agg.totalPmtAchieved, agg.totalPmtTarget)}%)`}
                highlight={pctOf(agg.totalPmtAchieved, agg.totalPmtTarget) >= 100 ? '#15803d' : undefined}
              />
              <KpiCard
                icon={<TrendingUp size={13} />}
                label="Invoice Achievement"
                value={`${pctOf(agg.totalInvAchieved, agg.totalInvTarget)}%`}
                sub="Overall team invoice progress"
                highlight={progressColor(pctOf(agg.totalInvAchieved, agg.totalInvTarget))}
              />
              <KpiCard
                icon={<Trophy size={13} />}
                label="Targets Met"
                value={`${agg.hitCount} / ${execStats.length}`}
                sub="Executives who hit invoice target"
                highlight={agg.hitCount === execStats.length ? '#15803d' : undefined}
              />
            </div>

            {/* ── Aggregate Progress Bars ───────────────────────────────── */}
            <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '16px', marginBottom: '2rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: '1rem' }}>Overall Team Progress</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {[
                  { label: 'Invoice', achieved: agg.totalInvAchieved, target: agg.totalInvTarget },
                  { label: 'Payment Collection', achieved: agg.totalPmtAchieved, target: agg.totalPmtTarget },
                ].map(({ label, achieved, target }) => {
                  const p = pctOf(achieved, target);
                  const color = progressColor(p);
                  return (
                    <div key={label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', fontSize: '0.82rem' }}>
                        <span style={{ fontWeight: 600 }}>{label}</span>
                        <span style={{ color, fontWeight: 700 }}>{fmtK(achieved)} <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>of {target > 0 ? fmtK(target) : '—'}</span> ({p}%)</span>
                      </div>
                      <div style={{ height: '10px', background: 'var(--surface-raised)', borderRadius: '5px', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(p, 100)}%`, height: '100%', background: color, borderRadius: '5px', transition: 'width 0.8s ease' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Performance Chart ─────────────────────────────────────── */}
            {chartData.length > 0 && (
              <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '16px', marginBottom: '2rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: '1.25rem' }}>
                  Executive Achievement % — {fmtMonth(selectedMonth)}
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={chartData} margin={{ top: 8, right: 16, left: -8, bottom: 4 }} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} unit="%" domain={[0, Math.max(120, ...chartData.map(d => Math.max(d['Invoice %'], d['Payment %']))) + 10]} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsla(152,60%,40%,0.06)' }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '0.8rem', paddingTop: '0.5rem' }} />
                    <ReferenceLine y={100} stroke="#15803d" strokeDasharray="4 3" strokeWidth={1.5} label={{ value: 'Target', position: 'insideTopRight', fontSize: 10, fill: '#15803d' }} />
                    <Bar dataKey="Invoice %" fill="var(--primary-light)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    <Bar dataKey="Payment %" fill="hsla(45,93%,47%,0.85)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* ── Per-Executive Cards ───────────────────────────────────── */}
            <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: '0.75rem' }}>
              Individual Performance
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {execStats
                .slice()
                .sort((a, b) => pctOf(b.invoiceAchieved, b.invoiceTarget) - pctOf(a.invoiceAchieved, a.invoiceTarget))
                .map(exec => (
                  <ExecCard key={exec.userId} exec={exec} />
                ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
