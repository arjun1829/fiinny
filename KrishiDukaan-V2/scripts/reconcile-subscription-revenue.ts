/**
 * READ-ONLY. Reconciles subscription revenue three ways:
 *   (a) the `subscriptions` collection, classified paid / manual / promotional
 *   (b) the `platformDailyStats` rollup (subs.revenuePaid / revenueManual)
 *   (c) the `payments` collection (status: paid vs manual_admin vs admin_granted)
 * Writes NOTHING.
 *
 * Usage:  npx tsx scripts/reconcile-subscription-revenue.ts
 */
import { cert, getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function initAdmin() {
  if (getApps().length) return;
  const projectId = process.env.FIREBASE_PROJECT_ID ?? 'krishidukan-e8315';
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (clientEmail && privateKey) initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  else initializeApp({ credential: applicationDefault(), projectId });
}

const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

type Bucket = 'paid' | 'manual' | 'promotional';
function classify(s: any): Bucket {
  if (s.isPromotional === true || s.promotionId) return 'promotional';
  if (s.activatedByAdmin === true) return 'manual';
  return 'paid';
}

(async () => {
  initAdmin();
  const db = getFirestore();

  // ── (a) subscriptions, classified ──
  const subSnap = await db.collection('subscriptions').get();
  const agg: Record<Bucket, { count: number; amount: number; nonZeroAmount: number; seats: number }> = {
    paid: { count: 0, amount: 0, nonZeroAmount: 0, seats: 0 },
    manual: { count: 0, amount: 0, nonZeroAmount: 0, seats: 0 },
    promotional: { count: 0, amount: 0, nonZeroAmount: 0, seats: 0 },
  };
  const promoWithValue: Array<{ id: string; amountPaid: number; basePlanPrice: number; planName: string }> = [];
  const ambiguous: Array<{ id: string; reason: string }> = [];
  for (const d of subSnap.docs) {
    const s = d.data() as any;
    const b = classify(s);
    const amt = n(s.amountPaid);
    agg[b].count += 1;
    agg[b].amount += amt;
    if (amt > 0) agg[b].nonZeroAmount += amt;
    agg[b].seats += n(s.seatsPurchased);
    // Promotional that nonetheless carries a value = the exact leak the task warns about.
    if (b === 'promotional' && (amt > 0 || n(s.basePlanPrice) > 0)) {
      promoWithValue.push({ id: d.id, amountPaid: amt, basePlanPrice: n(s.basePlanPrice), planName: String(s.planName ?? '') });
    }
    // activatedByAdmin true but amountPaid 0 and NOT flagged promotional — a legit
    // free manual grant, or a legacy promo that predates the isPromotional flag?
    if (b === 'manual' && amt === 0 && !s.isPromotional && !s.promotionId) {
      ambiguous.push({ id: d.id, reason: `manual, amountPaid=0, planName="${String(s.planName ?? '')}", createdBy=${String(s.createdBy ?? '—')}` });
    }
  }

  // ── (b) rollup ──
  const rollSnap = await db.collection('platformDailyStats').get();
  let rollPaid = 0, rollManual = 0, rollCount = 0, rollSeats = 0, rollRenewals = 0;
  for (const d of rollSnap.docs) {
    const s = (d.data() as any)?.subs;
    if (!s) continue;
    rollPaid += n(s.revenuePaid); rollManual += n(s.revenueManual);
    rollCount += n(s.count); rollSeats += n(s.seats); rollRenewals += n(s.renewals);
  }

  // ── (c) payments ──
  const paySnap = await db.collection('payments').get();
  const payByStatus: Record<string, { count: number; amount: number }> = {};
  for (const d of paySnap.docs) {
    const p = d.data() as any;
    const st = String(p.status ?? 'unknown');
    payByStatus[st] = payByStatus[st] ?? { count: 0, amount: 0 };
    payByStatus[st].count += 1;
    payByStatus[st].amount += n(p.amount);
  }

  console.log('=== (a) subscriptions collection, classified ===');
  for (const b of ['paid', 'manual', 'promotional'] as Bucket[]) {
    const x = agg[b];
    console.log(`${b.padEnd(12)} count=${String(x.count).padStart(4)}  amountPaid sum=${Math.round(x.amount).toString().padStart(8)}  (nonzero=${Math.round(x.nonZeroAmount)})  seats=${x.seats}`);
  }
  const genuineRevenue = agg.paid.amount + agg.manual.amount;
  console.log(`\nGenuine revenue (paid + manual, EXCLUDING promotional) = ${Math.round(genuineRevenue)}`);
  console.log(`If promotional were wrongly included            = ${Math.round(genuineRevenue + agg.promotional.amount)}`);

  console.log('\n=== (b) platformDailyStats rollup (current: activatedByAdmin split, no promo exclusion) ===');
  console.log(`revenuePaid=${Math.round(rollPaid)}  revenueManual=${Math.round(rollManual)}  total=${Math.round(rollPaid + rollManual)}`);
  console.log(`subs.count=${rollCount}  subs.seats=${rollSeats}  subs.renewals=${rollRenewals}`);

  console.log('\n=== (c) payments collection by status ===');
  for (const [st, x] of Object.entries(payByStatus).sort()) {
    console.log(`${st.padEnd(16)} count=${String(x.count).padStart(4)}  amount sum=${Math.round(x.amount)}`);
  }

  console.log('\n=== LEAK CHECK: promotional subs carrying a value ===');
  if (promoWithValue.length === 0) console.log('none — all promotional subs have amountPaid=0 and basePlanPrice=0');
  else for (const p of promoWithValue) console.log(JSON.stringify(p));

  console.log(`\n=== AMBIGUOUS: manual activations with amountPaid=0, not flagged promotional (${ambiguous.length}) ===`);
  for (const a of ambiguous.slice(0, 40)) console.log(a.id, a.reason);
  if (ambiguous.length > 40) console.log(`… and ${ambiguous.length - 40} more`);

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
