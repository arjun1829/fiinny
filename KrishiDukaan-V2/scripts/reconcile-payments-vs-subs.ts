/**
 * READ-ONLY. Matches gateway `payments` (status=success) to paid `subscriptions`
 * by razorpayPaymentId, to explain the count/amount gap between the two. Writes NOTHING.
 *   npx tsx scripts/reconcile-payments-vs-subs.ts
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

(async () => {
  initAdmin();
  const db = getFirestore();

  const [subSnap, paySnap] = await Promise.all([
    db.collection('subscriptions').get(),
    db.collection('payments').get(),
  ]);

  // paid subs keyed by razorpayPaymentId
  const paidSubByPid = new Map<string, any>();
  let paidNoPid = 0;
  for (const d of subSnap.docs) {
    const s = d.data() as any;
    const isPromo = s.isPromotional === true || s.promotionId;
    const isManual = s.activatedByAdmin === true;
    if (isPromo || isManual) continue; // gateway only
    const pid = s.razorpayPaymentId ? String(s.razorpayPaymentId) : '';
    if (!pid) { paidNoPid++; continue; }
    paidSubByPid.set(pid, s);
  }

  let successPayments = 0, matched = 0, orphanPay = 0, orphanAmt = 0;
  const orphans: Array<{ id: string; amount: number; pid: string; planName: string }> = [];
  for (const d of paySnap.docs) {
    const p = d.data() as any;
    if (String(p.status) !== 'success') continue;
    successPayments++;
    const pid = p.razorpayPaymentId ? String(p.razorpayPaymentId) : '';
    if (pid && paidSubByPid.has(pid)) { matched++; continue; }
    orphanPay++; orphanAmt += n(p.amount);
    orphans.push({ id: d.id, amount: n(p.amount), pid, planName: String(p.planName ?? p.planTier ?? '') });
  }

  console.log(`gateway payments (status=success): ${successPayments}`);
  console.log(`  matched to a paid subscription by paymentId: ${matched}`);
  console.log(`  NOT matched (orphan payment, no paid sub)  : ${orphanPay}  (amount ₹${Math.round(orphanAmt)})`);
  console.log(`paid subs with NO razorpayPaymentId (can't match): ${paidNoPid}`);
  console.log('\nOrphan gateway payments (payment exists, no matching paid subscription):');
  for (const o of orphans.slice(0, 40)) console.log(JSON.stringify(o));
  if (orphans.length > 40) console.log(`… and ${orphans.length - 40} more`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
