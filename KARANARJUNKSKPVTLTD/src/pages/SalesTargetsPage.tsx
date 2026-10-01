import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, ReceiptText, Wallet, ChevronLeft, ChevronRight, Trophy, Loader2, TrendingUp } from 'lucide-react';
import { doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection } from '../utils/tenantPath';
import { fmtINR } from '../utils/gstCalculator';

// ── Helpers ───────────────────────────────────────────────────────────────────
function toYM(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function prevMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return toYM(d);
}
function nextMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m, 1);
  return toYM(d);
}
function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}

function progressColor(pct: number): string {
  if (pct >= 100) return '#15803d';
  if (pct >= 76)  return '#22c55e';
  if (pct >= 51)  return '#f97316';
  if (pct >= 26)  return '#eab308';
  return '#ef4444';
}

// ── Circular Progress ─────────────────────────────────────────────────────────
function CircularProgress({ pct, color, size = 140 }: { pct: number; color: string; size?: number }) {
  const R = 52;
  const circ = 2 * Math.PI * R;
  const offset = circ * (1 - Math.min(pct, 100) / 100);
  return (
    <svg width={size} height={size} viewBox="0 0 130 130">
      <circle cx="65" cy="65" r={R} fill="none" stroke="var(--surface-raised)" strokeWidth="12" />
      <circle
        cx="65" cy="65" r={R} fill="none"
        stroke={color} strokeWidth="12"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 65 65)"
        style={{ transition: 'stroke-dashoffset 0.8s ease' }}
      />
    </svg>
  );
}

// ── Target Card ───────────────────────────────────────────────────────────────
function TargetCard({
  icon, label, target, achieved, loading,
}: {
  icon: React.ReactNode;
  label: string;
  target: number;
  achieved: number;
  loading: boolean;
}) {
  const pct = target > 0 ? Math.round((achieved / target) * 100) : 0;
  const remaining = Math.max(0, target - achieved);
  const color = progressColor(pct);
  const hit = pct >= 100;

  return (
    <div
      className="glass-panel"
      style={{
        padding: '2rem',
        borderRadius: '20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.25rem',
        flex: '1 1 280px',
        border: hit ? `2px solid ${color}` : '1px solid var(--surface-border)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {hit && (
        <div style={{ position: 'absolute', top: '1rem', right: '1rem' }}>
          <Trophy size={22} color="#15803d" />
        </div>
      )}

      {/* Label + icon */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 600 }}>
        {icon}{label}
      </div>

      {/* Circular progress with % inside */}
      <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        {loading
          ? <Loader2 size={48} className="animate-spin" style={{ color: 'var(--text-tertiary)' }} />
          : <CircularProgress pct={pct} color={color} />
        }
        {!loading && (
          <div style={{ position: 'absolute', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color }}>{pct}%</div>
            {hit && <div style={{ fontSize: '0.7rem', color, fontWeight: 700 }}>DONE!</div>}
          </div>
        )}
      </div>

      {/* Stats grid */}
      {!loading && (
        <div style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.2rem' }}>Target</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{target > 0 ? fmtINR(target) : '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.2rem' }}>Achieved</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color }}>{fmtINR(achieved)}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.2rem' }}>Remaining</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: remaining > 0 ? '#ef4444' : '#15803d' }}>
              {remaining > 0 ? fmtINR(remaining) : '✓'}
            </div>
          </div>
        </div>
      )}

      {/* Progress bar */}
      {!loading && target > 0 && (
        <div style={{ width: '100%', height: '6px', background: 'var(--surface-raised)', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, borderRadius: '3px', transition: 'width 0.8s ease' }} />
        </div>
      )}

      {!loading && target === 0 && (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textAlign: 'center' }}>
          No target set for this month.
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SalesTargetsPage() {
  const { currentUser, tenantId } = useAuth();
  const navigate = useNavigate();
  const [selectedMonth, setSelectedMonth] = useState(toYM(new Date()));

  const [invoiceTarget, setInvoiceTarget] = useState(0);
  const [paymentTarget, setPaymentTarget] = useState(0);
  const [invoiceAchieved, setInvoiceAchieved] = useState(0);
  const [paymentAchieved, setPaymentAchieved] = useState(0);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [loadingAchieved, setLoadingAchieved] = useState(false);

  const userId = currentUser?.uid ?? '';

  // ── Fetch target for the selected month ──────────────────────────────────
  useEffect(() => {
    if (!tenantId || !userId) return;
    let cancelled = false;
    setLoadingTargets(true);
    setInvoiceTarget(0);
    setPaymentTarget(0);
    (async () => {
      try {
        const docRef = doc(db, 'tenants', tenantId, 'salesTargets', `${userId}_${selectedMonth}`);
        const snap = await getDoc(docRef);
        if (!cancelled && snap.exists()) {
          const d = snap.data();
          setInvoiceTarget(Number(d.invoiceTarget ?? 0));
          setPaymentTarget(Number(d.paymentTarget ?? 0));
        }
      } catch (e) { console.error(e); }
      finally { if (!cancelled) setLoadingTargets(false); }
    })();
    return () => { cancelled = true; };
  }, [tenantId, userId, selectedMonth]);

  // ── Fetch achievements for the selected month ─────────────────────────────
  useEffect(() => {
    if (!tenantId || !userId) return;
    let cancelled = false;
    setLoadingAchieved(true);
    setInvoiceAchieved(0);
    setPaymentAchieved(0);
    (async () => {
      try {
        // Get sales user's scope (districts + assigned retailers)
        const userSnap = await getDoc(doc(db, 'users', userId));
        const userData = userSnap.exists() ? userSnap.data() : {};
        const assignedDistricts: string[] = (userData.assignedDistricts ?? []).map((d: string) => d.toLowerCase());
        const assignedRetailers: string[] = userData.assignedRetailers ?? [];

        // Fetch all retailers to resolve district → retailerIds
        const retailersSnap = await getDocs(getTenantCollection(db, tenantId, 'retailers'));
        const scopedRetailerIds = new Set<string>();
        retailersSnap.docs.forEach(d => {
          const r = d.data();
          if (
            assignedRetailers.includes(d.id) ||
            assignedDistricts.includes((r.district || '').toLowerCase())
          ) {
            scopedRetailerIds.add(d.id);
          }
        });

        // salesOrders: filter by invoiceDate prefix (YYYY-MM)
        const soSnap = await getDocs(getTenantCollection(db, tenantId, 'salesOrders'));
        let invTotal = 0;
        soSnap.docs.forEach(d => {
          const so = d.data();
          const invDate: string = so.invoiceDate || '';
          if (invDate.startsWith(selectedMonth) && scopedRetailerIds.has(so.retailerId ?? '')) {
            invTotal += Number(so.grandTotal ?? so.netAmount ?? so.totalAmount ?? 0);
          }
        });

        // Fetch payments only for the sales user's scoped retailers (tenant-scoped, no collectionGroup).
        const scopedIds = Array.from(scopedRetailerIds);
        const pmtSnaps = await Promise.all(
          scopedIds.map(rId => getDocs(getTenantCollection(db, tenantId, 'retailers', rId, 'payments')))
        );
        let pmtTotal = 0;
        pmtSnaps.forEach((snap, idx) => {
          snap.docs.forEach(pdoc => {
            const pmtDate: string = pdoc.data().paymentDate || '';
            if (pmtDate.startsWith(selectedMonth)) {
              pmtTotal += Number(pdoc.data().amount ?? 0);
            }
          });
        });

        if (!cancelled) {
          setInvoiceAchieved(invTotal);
          setPaymentAchieved(pmtTotal);
        }
      } catch (e) { console.error(e); }
      finally { if (!cancelled) setLoadingAchieved(false); }
    })();
    return () => { cancelled = true; };
  }, [tenantId, userId, selectedMonth]);

  const canGoNext = selectedMonth < toYM(new Date());

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-base)', padding: '1.25rem' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              <Target size={26} color="var(--primary-light)" /> Sales Targets
            </h1>
            <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0', fontSize: '0.875rem' }}>
              {currentUser?.displayName || currentUser?.email?.split('@')[0] || 'My'} performance
            </p>
          </div>
          <button
            className="btn btn-secondary"
            onClick={() => navigate('/worklist')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1.1rem', fontSize: '0.875rem' }}
          >
            <ReceiptText size={16} /> Worklist
          </button>
        </div>

        {/* Month Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', marginBottom: '2rem' }}>
          <button
            onClick={() => setSelectedMonth(prevMonth(selectedMonth))}
            style={{ background: 'var(--surface-raised)', border: 'none', borderRadius: '8px', padding: '0.4rem 0.7rem', cursor: 'pointer', color: 'var(--text-primary)', display: 'flex', alignItems: 'center' }}
          ><ChevronLeft size={18} /></button>
          <div style={{ fontSize: '1.05rem', fontWeight: 700, minWidth: '160px', textAlign: 'center' }}>
            {fmtMonth(selectedMonth)}
          </div>
          <button
            onClick={() => setSelectedMonth(nextMonth(selectedMonth))}
            disabled={canGoNext ? false : true}
            style={{ background: 'var(--surface-raised)', border: 'none', borderRadius: '8px', padding: '0.4rem 0.7rem', cursor: canGoNext ? 'pointer' : 'not-allowed', color: canGoNext ? 'var(--text-primary)' : 'var(--text-tertiary)', display: 'flex', alignItems: 'center', opacity: canGoNext ? 1 : 0.4 }}
          ><ChevronRight size={18} /></button>
        </div>

        {/* Cards */}
        <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <TargetCard
            icon={<ReceiptText size={16} />}
            label="Invoice Target"
            target={invoiceTarget}
            achieved={invoiceAchieved}
            loading={loadingTargets || loadingAchieved}
          />
          <TargetCard
            icon={<Wallet size={16} />}
            label="Payment Received"
            target={paymentTarget}
            achieved={paymentAchieved}
            loading={loadingTargets || loadingAchieved}
          />
        </div>

        {/* Motivational footer */}
        <div style={{ textAlign: 'center', marginTop: '2rem', color: 'var(--text-tertiary)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
          <TrendingUp size={14} /> Keep pushing — every order counts.
        </div>
      </div>
    </div>
  );
}
