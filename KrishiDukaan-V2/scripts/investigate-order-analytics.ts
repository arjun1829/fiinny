/**
 * READ-ONLY. Compares the admin Analytics → Orders source (platformDailyStats
 * rollup, bucketed by IST createdAt day) against the raw `orders` collection
 * for the last N days, to find where the two disagree. Writes NOTHING.
 *
 * Requires admin credentials for krishidukan-e8315 (applicationDefault or
 * FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY).
 *
 * Usage:  npx tsx scripts/investigate-order-analytics.ts [days=30]
 */
import { cert, getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

function initAdmin() {
  if (getApps().length) return;
  const projectId = process.env.FIREBASE_PROJECT_ID ?? 'krishidukan-e8315';
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (clientEmail && privateKey) initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  else initializeApp({ credential: applicationDefault(), projectId });
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const istDayKey = (ms: number) => new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
const DAYS = Number(process.argv[2] ?? 30);

function orderTotal(d: any): number {
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  return n(d.grandTotal) ?? n(d.total) ?? (n(d.subtotal) ?? 0) + (n(d.deliveryCharge) ?? 0) + (n(d.totalGst) ?? 0);
}
function millisOf(v: any): number {
  return v?.toMillis?.() ?? (v instanceof Date ? v.getTime() : typeof v === 'number' ? v : 0);
}

(async () => {
  initAdmin();
  const db = getFirestore();

  const now = new Date();
  const from = new Date(now.getTime() - (DAYS - 1) * 24 * 60 * 60 * 1000);
  from.setHours(0, 0, 0, 0);
  console.log(`Range: last ${DAYS} days, createdAt >= ${from.toISOString()}\n`);

  // ── raw orders (ground truth) ──
  const orderSnap = await db.collection('orders').where('createdAt', '>=', Timestamp.fromDate(from)).get();

  const rawByDay = new Map<string, { count: number; gmv: number; status: Record<string, number> }>();
  let rawTotal = 0, rawGmv = 0, noCreatedAt = 0;
  const statusTotals: Record<string, number> = {};
  for (const d of orderSnap.docs) {
    const o = d.data() as any;
    const ms = millisOf(o.createdAt);
    if (!ms) { noCreatedAt++; continue; }
    const k = istDayKey(ms);
    const b = rawByDay.get(k) ?? { count: 0, gmv: 0, status: {} };
    b.count += 1; b.gmv += orderTotal(o);
    const st = String(o.status ?? 'unknown');
    b.status[st] = (b.status[st] ?? 0) + 1;
    statusTotals[st] = (statusTotals[st] ?? 0) + 1;
    rawByDay.set(k, b);
    rawTotal += 1; rawGmv += orderTotal(o);
  }

  // ── platformDailyStats rollup (what analytics reads) ──
  const spanStart = istDayKey(from.getTime());
  const spanEnd = istDayKey(now.getTime());
  const rollupSnap = await db.collection('platformDailyStats').get();
  const rollupByDay = new Map<string, { count: number; gmv: number; status: Record<string, number> }>();
  const allKeys = new Set<string>(rawByDay.keys());
  for (const d of rollupSnap.docs) {
    if (d.id < spanStart || d.id > spanEnd) continue;
    allKeys.add(d.id);
    const data = d.data() as any;
    rollupByDay.set(d.id, {
      count: Number(data?.orders?.count ?? 0),
      gmv: Number(data?.orders?.gmv ?? 0),
      status: data?.orders?.status ?? {},
    });
  }

  let rollTotal = 0, rollGmv = 0;
  for (const v of rollupByDay.values()) { rollTotal += v.count; rollGmv += v.gmv; }

  console.log('Day         | raw cnt | roll cnt | raw gmv | roll gmv | bad');
  console.log('------------|---------|----------|---------|----------|----');
  for (const k of Array.from(allKeys).sort()) {
    const r = rawByDay.get(k) ?? { count: 0, gmv: 0, status: {} };
    const p = rollupByDay.get(k) ?? { count: 0, gmv: 0, status: {} };
    const bad = r.count !== p.count || Math.abs(r.gmv - p.gmv) > 1;
    console.log(
      `${k} | ${String(r.count).padStart(7)} | ${String(p.count).padStart(8)} | ${String(Math.round(r.gmv)).padStart(7)} | ${String(Math.round(p.gmv)).padStart(8)} | ${bad ? 'XXX' : ''}`,
    );
  }

  console.log('\n=== TOTALS (last ' + DAYS + ' days) ===');
  console.log(`raw orders (createdAt-bucketed): count=${rawTotal}  gmv=${Math.round(rawGmv)}`);
  console.log(`platformDailyStats rollup      : count=${rollTotal}  gmv=${Math.round(rollGmv)}`);
  console.log(`orders in range WITHOUT createdAt (excluded by both): ${noCreatedAt}`);
  console.log('raw status split:', statusTotals);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
