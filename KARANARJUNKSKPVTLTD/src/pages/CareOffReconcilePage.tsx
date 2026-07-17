import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDocs, query, where, writeBatch, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection, getTenantDoc } from '../utils/tenantPath';
import { useToast } from '../contexts/ToastContext';
import { getCareOffEntries } from '../utils/nandgaonImport';
import { buildReconcilePlan, planSummary, type RetailerLite, type ReconcileAction } from '../utils/careOffReconcile';
import {
  ArrowLeft, Loader2, CheckCircle2, AlertTriangle, Save, RefreshCw, Link2, UserPlus,
} from 'lucide-react';

// The care-off orders the UNIMAX import created carry this sourceRef + a sourceInvoice (vchNo).
const UNIMAX_SOURCE_REF = 'UNIMAX_NANDGAON_LEDGER_IMPORT';
const SYNC_SOURCE_REF = 'CAREOFF_SYNC';

type Override = string | 'NEW'; // existing retailerId, or 'NEW' to create one

const CONF_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  high:   { bg: 'hsla(160,84%,39%,0.12)', color: '#10b981', label: 'High' },
  medium: { bg: 'hsla(38,92%,50%,0.12)',  color: '#f59e0b', label: 'Review' },
  low:    { bg: 'hsla(25,90%,55%,0.12)',  color: '#fb923c', label: 'Low' },
  none:   { bg: 'hsla(0,0%,50%,0.12)',    color: '#9ca3af', label: 'New' },
};

const inr = (n: number) => `₹${(n || 0).toLocaleString('en-IN')}`;

/** Outstanding a retailer owes us = unpaid care-off orders + unpaid sales orders. */
function computeOutstanding(orders: any[], salesOrders: any[]): number {
  const fromOrders = orders
    .filter(o => (o.paymentStatus || '').toLowerCase() !== 'paid')
    .reduce((s, o) => s + (Number(o.amount) || 0), 0);
  const fromSO = salesOrders
    .filter(so => (so.paymentStatus || '').toLowerCase() !== 'paid')
    .reduce((s, so) => s + Math.max(0, (Number(so.grandTotal) || 0) - (Number(so.amountPaid) || 0)), 0);
  return Math.round((fromOrders + fromSO) * 100) / 100;
}

function groupByRetailer(docs: { id: string; data: any }[]): Map<string, any[]> {
  const m = new Map<string, any[]>();
  for (const { data } of docs) {
    const rid = data.retailerId;
    if (!rid) continue;
    const arr = m.get(rid);
    if (arr) arr.push(data); else m.set(rid, [data]);
  }
  return m;
}

export default function CareOffReconcilePage() {
  const { tenantId } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [retailers, setRetailers] = useState<RetailerLite[]>([]);
  const [existingByVch, setExistingByVch] = useState<Map<string, { id: string; retailerId?: string }>>(new Map());
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [applying, setApplying] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const entries = useMemo(() => getCareOffEntries(), []);

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const rSnap = await getDocs(getTenantCollection(db, tenantId, 'retailers'));
      setRetailers(rSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as RetailerLite)));

      const oSnap = await getDocs(query(getTenantCollection(db, tenantId, 'orders'), where('sourceRef', '==', UNIMAX_SOURCE_REF)));
      const map = new Map<string, { id: string; retailerId?: string }>();
      oSnap.docs.forEach(d => {
        const data = d.data() as any;
        if (data.sourceInvoice) map.set(data.sourceInvoice, { id: d.id, retailerId: data.retailerId });
      });
      setExistingByVch(map);
    } catch (e) {
      console.error(e);
      showToast('Failed to load reconciliation data', 'error');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [tenantId]);

  const plan = useMemo(() => buildReconcilePlan(entries, retailers), [entries, retailers]);
  const sortedRetailers = useMemo(() => [...retailers].sort((a, b) => (a.name || '').localeCompare(b.name || '')), [retailers]);

  const finalTarget = (a: ReconcileAction): Override => overrides[a.vchNo] ?? (a.proposedRetailerId ?? 'NEW');

  const liveSummary = useMemo(() => {
    let matched = 0, creating = 0, relink = 0;
    for (const a of plan) {
      const t = finalTarget(a);
      if (t === 'NEW') creating++; else matched++;
      const ex = existingByVch.get(a.vchNo);
      if (ex && ex.retailerId && t !== 'NEW' && ex.retailerId !== t) relink++;
    }
    return { ...planSummary(plan), matched, creating, relink };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, overrides, existingByVch]);

  const handleApply = async () => {
    if (!tenantId) return;
    setApplying(true); setConfirmOpen(false); setResult(null);
    try {
      const OPS = 450;
      let batch = writeBatch(db);
      let ops = 0;
      const flush = async () => { if (ops > 0) { await batch.commit(); batch = writeBatch(db); ops = 0; } };

      const affected = new Set<string>();
      const newRetailerByName = new Map<string, string>(); // normalized name → id
      const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

      // ── Phase 1: relink/create the care-off receivable for each line ──
      for (const a of plan) {
        const t = finalTarget(a);
        let retailerId: string;
        if (t === 'NEW') {
          const key = normName(a.shopName);
          let id = newRetailerByName.get(key);
          if (!id) {
            const ref = doc(getTenantCollection(db, tenantId, 'retailers'));
            batch.set(ref, {
              name: a.shopName, location: a.place, portfolioSize: 'Small',
              outstandingAmount: 0, sourceRef: SYNC_SOURCE_REF, createdAt: serverTimestamp(),
            });
            ops++; id = ref.id; newRetailerByName.set(key, id);
            if (ops >= OPS) await flush();
          }
          retailerId = id;
        } else {
          retailerId = t;
        }
        affected.add(retailerId);

        const existing = existingByVch.get(a.vchNo);
        if (existing) {
          if (existing.retailerId) affected.add(existing.retailerId); // old link recomputed too
          batch.update(getTenantDoc(db, tenantId, 'orders', existing.id), {
            retailerId, retailerName: a.shopName, amount: a.amount, careOffSynced: true,
          });
        } else {
          const ref = doc(getTenantCollection(db, tenantId, 'orders'));
          batch.set(ref, {
            retailerId, retailerName: a.shopName, productId: 'UNIMAX_CAREOFF',
            productName: `Care-off ${a.vchNo}`, quantity: 1, unit: 'N/A', amount: a.amount,
            paymentStatus: 'Unpaid', isDelivered: true, sourceInvoice: a.vchNo,
            sourceRef: UNIMAX_SOURCE_REF, careOffSynced: true, createdAt: serverTimestamp(),
          });
        }
        ops++;
        if (ops >= OPS) await flush();
      }
      await flush();

      // ── Phase 2: recompute outstanding for every retailer; drop orphan dups ──
      const [allOrders, allSO, allRetailers] = await Promise.all([
        getDocs(getTenantCollection(db, tenantId, 'orders')),
        getDocs(getTenantCollection(db, tenantId, 'salesOrders')),
        getDocs(getTenantCollection(db, tenantId, 'retailers')),
      ]);
      const ordersByR = groupByRetailer(allOrders.docs.map(d => ({ id: d.id, data: d.data() })));
      const soByR = groupByRetailer(allSO.docs.map(d => ({ id: d.id, data: d.data() })));

      let updated = 0, removed = 0;
      for (const rd of allRetailers.docs) {
        const r = rd.data() as any;
        const os = ordersByR.get(rd.id) ?? [];
        const sos = soByR.get(rd.id) ?? [];
        const isImportCreated = r.sourceRef === UNIMAX_SOURCE_REF || r.sourceRef === SYNC_SOURCE_REF;
        const hasManual = !!(r.number || r.gstin || r.atPost || r.taluka || r.district);

        if (isImportCreated && os.length === 0 && sos.length === 0 && !hasManual) {
          batch.delete(rd.ref); ops++; removed++;
        } else {
          const outstanding = computeOutstanding(os, sos);
          if ((Number(r.outstandingAmount) || 0) !== outstanding) {
            batch.update(rd.ref, { outstandingAmount: outstanding }); ops++; updated++;
          }
        }
        if (ops >= OPS) await flush();
      }
      await flush();

      setResult(`Done — ${plan.length} care-off lines synced · ${updated} retailer balances corrected · ${removed} duplicate retailers removed.`);
      showToast('Care-off sync applied', 'success');
      await load();
    } catch (e: any) {
      console.error(e);
      showToast('Apply failed: ' + (e.message || e), 'error');
    }
    setApplying(false);
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', flexDirection: 'column', gap: '1rem', color: 'var(--text-tertiary)' }}>
      <Loader2 size={32} className="animate-spin" /><div>Loading care-off lines & retailers…</div>
    </div>
  );

  return (
    <div className="animate-fade-in" style={{ maxWidth: '1100px', margin: '0 auto', padding: '1.5rem' }}>
      <button onClick={() => navigate('/supplier-ledger')} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.9rem', fontSize: '0.85rem', marginBottom: '1rem' }}>
        <ArrowLeft size={15} /> Back to Supplier Ledger
      </button>

      <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Link2 size={22} style={{ color: 'var(--primary-light)' }} /> Sync Manufacturer Care-Off → AR
      </h1>
      <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem', marginTop: '0.25rem', marginBottom: '1.25rem' }}>
        Each "Care Off" line is a sale the manufacturer made to a retailer on your behalf — it becomes a receivable on that
        retailer. Review every match below. <strong>Nothing is saved until you click Apply.</strong>
      </p>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {[
          { label: 'Care-off lines', value: liveSummary.total, color: 'var(--primary-light)' },
          { label: 'Matched to existing', value: liveSummary.matched, color: '#10b981' },
          { label: 'New retailers', value: liveSummary.creating, color: '#f59e0b' },
          { label: 'Will relink', value: liveSummary.relink, color: '#0ea5e9' },
          { label: 'Total AR', value: inr(liveSummary.totalAmount), color: '#ff4d4f' },
        ].map(c => (
          <div key={c.label} className="glass-panel" style={{ padding: '0.9rem 1rem', borderRadius: '12px' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)' }}>{c.label}</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {result && (
        <div className="glass-panel" style={{ padding: '1rem 1.25rem', borderRadius: '12px', marginBottom: '1.25rem', border: '1px solid hsla(160,84%,39%,0.3)', background: 'hsla(160,84%,39%,0.06)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <CheckCircle2 size={18} style={{ color: '#10b981' }} /> <span style={{ fontSize: '0.9rem' }}>{result}</span>
        </div>
      )}

      {/* Review table */}
      <div className="glass-panel" style={{ borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'var(--surface-raised)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                <th style={{ padding: '0.7rem 1rem', fontWeight: 700 }}>Invoice</th>
                <th style={{ padding: '0.7rem 1rem', fontWeight: 700 }}>Care-off shop</th>
                <th style={{ padding: '0.7rem 1rem', fontWeight: 700, textAlign: 'right' }}>Amount</th>
                <th style={{ padding: '0.7rem 1rem', fontWeight: 700 }}>Match</th>
                <th style={{ padding: '0.7rem 1rem', fontWeight: 700 }}>Link to retailer</th>
              </tr>
            </thead>
            <tbody>
              {plan.map(a => {
                const conf = CONF_STYLE[a.match.confidence];
                const t = finalTarget(a);
                return (
                  <tr key={a.vchNo} style={{ borderTop: '1px solid var(--surface-border)' }}>
                    <td style={{ padding: '0.6rem 1rem', whiteSpace: 'nowrap', color: 'var(--text-tertiary)' }}>{a.vchNo}</td>
                    <td style={{ padding: '0.6rem 1rem' }}>
                      <div style={{ fontWeight: 600 }}>{a.shopName}</div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)' }}>{a.place}</div>
                    </td>
                    <td style={{ padding: '0.6rem 1rem', textAlign: 'right', fontWeight: 700 }}>{inr(a.amount)}</td>
                    <td style={{ padding: '0.6rem 1rem', whiteSpace: 'nowrap' }}>
                      <span style={{ padding: '0.15rem 0.55rem', borderRadius: '999px', background: conf.bg, color: conf.color, fontSize: '0.72rem', fontWeight: 700 }}>
                        {conf.label}
                      </span>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '0.15rem' }}>{a.match.reason}</div>
                    </td>
                    <td style={{ padding: '0.6rem 1rem' }}>
                      <select
                        className="input-field"
                        style={{ margin: 0, minWidth: '220px', fontSize: '0.82rem', borderColor: t === 'NEW' ? 'hsla(38,92%,50%,0.5)' : undefined }}
                        value={t}
                        onChange={e => setOverrides(o => ({ ...o, [a.vchNo]: e.target.value as Override }))}
                      >
                        <option value="NEW">➕ Create new retailer</option>
                        {sortedRetailers.map(r => (
                          <option key={r.id} value={r.id}>
                            {r.name}{(r.location || r.atPost) ? ` · ${r.location || r.atPost}` : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Apply bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <AlertTriangle size={14} style={{ color: '#f59e0b' }} /> Applies to live data — review the matches above first.
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-secondary" onClick={load} disabled={applying} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <RefreshCw size={15} /> Reload
          </button>
          <button className="btn btn-primary" onClick={() => setConfirmOpen(true)} disabled={applying} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {applying ? <><Loader2 size={16} className="animate-spin" /> Applying…</> : <><Save size={16} /> Apply Sync</>}
          </button>
        </div>
      </div>

      {/* Confirm modal */}
      {confirmOpen && (
        <div className="modal-overlay animate-fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 100 }}>
          <div className="modal-content animate-slide-up glass-panel" style={{ width: '100%', maxWidth: '460px', padding: '2rem' }}>
            <h2 style={{ fontSize: '1.2rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <UserPlus size={18} className="primary-gradient-text" /> Apply care-off sync?
            </h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              This will link <strong>{liveSummary.matched}</strong> care-off receivables to existing retailers,
              create <strong>{liveSummary.creating}</strong> new retailer{liveSummary.creating === 1 ? '' : 's'},
              recompute outstanding balances, and remove duplicate retailers that end up with no orders.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button className="btn btn-secondary" onClick={() => setConfirmOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleApply} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle2 size={16} /> Yes, apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
