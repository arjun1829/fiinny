/**
 * Builds platformDailyStats/{YYYY-MM-DD} (the per-day totals Admin → Analytics
 * reads) from orders, subscriptions, paymentAttempts, users and products. Run
 * once after deploying the platformStatsOn* functions, before deploying the
 * website that reads the totals. Re-run any time to correct drift: each day
 * doc is rewritten with totals recomputed from the source docs.
 *
 *   gcloud auth application-default login
 *   cd functions
 *   npx tsx scripts/backfill-platform-daily-stats.ts --project krishidukan-e8315           # preview
 *   npx tsx scripts/backfill-platform-daily-stats.ts --project krishidukan-e8315 --write   # apply
 *
 * Reads every doc of those five collections once (about the cost of opening
 * the old analytics page with "All time" once).
 */
import type * as admin from "firebase-admin";

const args = process.argv.slice(2);
const projectIdx = args.indexOf("--project");
const project = projectIdx >= 0 ? args[projectIdx + 1] : undefined;
const write = args.includes("--write");

if (!project) {
  console.error("Usage: npx tsx scripts/backfill-platform-daily-stats.ts --project <project-id> [--write]");
  process.exit(1);
}
process.env.FIREBASE_PROJECT_ID = project;

const PAGE = 1000;
const BATCH = 400;

async function main(): Promise<void> {
  // Imported after FIREBASE_PROJECT_ID is set: getDb() reads it on first use.
  const { getDb } = await import("../src/wa/firebase");
  const stats = await import("../src/stats/platform-daily");
  const { addTo, millisOf } = await import("../src/stats/increments");
  type Contribution = import("../src/stats/increments").Contribution;
  const db = getDb();

  async function forEachDoc(collection: string, fn: (d: admin.firestore.DocumentData) => void): Promise<number> {
    let last: admin.firestore.QueryDocumentSnapshot | undefined;
    let n = 0;
    for (;;) {
      let q = db.collection(collection).orderBy("__name__").limit(PAGE);
      if (last) q = q.startAfter(last);
      const snap = await q.get();
      for (const d of snap.docs) fn(d.data());
      n += snap.size;
      if (snap.size < PAGE) return n;
      last = snap.docs[snap.docs.length - 1];
    }
  }

  const totals: Contribution = new Map();
  const add = (c: Contribution) => {
    for (const [path, fields] of Array.from(c)) for (const [f, v] of Object.entries(fields)) addTo(totals, path, f, v);
  };

  const scanned: Record<string, number> = {};
  scanned.orders = await forEachDoc("orders", (d) => add(stats.orderContribution(d)));
  // Subscription revenue is sourced from the payments ledger (success /
  // manual_admin / admin_granted), not from subscription docs.
  scanned.payments = await forEachDoc("payments", (d) => add(stats.paymentRevenueContribution(d)));
  scanned.paymentAttempts = await forEachDoc("paymentAttempts", (d) => add(stats.paymentContribution(d)));
  scanned.users = await forEachDoc("users", (d) => add(stats.userContribution(d)));
  scanned.products = await forEachDoc("products", (d) => add(stats.productContribution(d)));

  // A subscription is a renewal when its owner had an earlier one.
  const subs: admin.firestore.DocumentData[] = [];
  scanned.subscriptions = await forEachDoc("subscriptions", (d) => subs.push(d));
  subs.sort((a, b) => millisOf(a.createdAt) - millisOf(b.createdAt));
  const firstByOwner = new Map<string, number>();
  for (const d of subs) {
    const owner = stats.subscriptionOwner(d);
    const ms = millisOf(d.createdAt);
    const first = firstByOwner.get(owner);
    const renewal = !!owner && ms > 0 && first !== undefined && first < ms;
    if (owner && ms > 0 && first === undefined) firstByOwner.set(owner, ms);
    add(stats.subscriptionContribution(d, renewal));
  }

  // Nested objects, as the triggers' increments produce them.
  const docs = new Map<string, Record<string, unknown>>();
  for (const [path, fields] of Array.from(totals)) {
    const out: Record<string, unknown> = { date: path.split("/")[1] };
    for (const [field, value] of Object.entries(fields)) {
      const parts = field.split(".");
      let node = out;
      for (const p of parts.slice(0, -1)) node = (node[p] = (node[p] as Record<string, unknown>) ?? {}) as Record<string, unknown>;
      node[parts[parts.length - 1]] = Math.round(value * 100) / 100;
    }
    docs.set(path, out);
  }

  const existing = await db.collection(stats.PLATFORM_DAILY).listDocuments();
  const stale = existing.filter((ref) => !docs.has(ref.path));

  console.log(`${write ? "Writing" : "Preview (dry run)"} for project ${project}:`);
  console.table({ ...scanned, dayDocs: docs.size, staleDayDocsToDelete: stale.length });
  const recent = Array.from(docs.keys()).sort().slice(-3);
  for (const path of recent) console.log(path, JSON.stringify(docs.get(path)));

  if (!write) {
    console.log("Re-run with --write to apply.");
    return;
  }
  const { FieldValue } = (await import("firebase-admin")).firestore;
  const writes: Array<(b: admin.firestore.WriteBatch) => void> = [
    ...Array.from(docs).map(([path, data]) => (b: admin.firestore.WriteBatch) =>
      b.set(db.doc(path), { ...data, updatedAt: FieldValue.serverTimestamp() })),
    ...stale.map((ref) => (b: admin.firestore.WriteBatch) => b.delete(ref)),
  ];
  for (let i = 0; i < writes.length; i += BATCH) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + BATCH)) w(batch);
    await batch.commit();
  }
  console.log(`Wrote ${docs.size} day docs, deleted ${stale.length}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
