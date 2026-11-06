/**
 * Builds sellerStats/{sellerKey} and sellerDailyStats/{sellerKey}_{date} (the
 * per-seller order totals the seller dashboard reads) from every order. Run
 * once after deploying sellerStatsOnOrderWrite, before deploying the website
 * that reads them. Re-run any time to correct drift: each doc is rewritten
 * from the orders.
 *
 *   gcloud auth application-default login
 *   cd functions
 *   npx tsx scripts/backfill-seller-stats.ts --project krishidukan-e8315           # preview
 *   npx tsx scripts/backfill-seller-stats.ts --project krishidukan-e8315 --write   # apply
 *
 * Reads every order once.
 */
import type * as admin from "firebase-admin";

const args = process.argv.slice(2);
const projectIdx = args.indexOf("--project");
const project = projectIdx >= 0 ? args[projectIdx + 1] : undefined;
const write = args.includes("--write");

if (!project) {
  console.error("Usage: npx tsx scripts/backfill-seller-stats.ts --project <project-id> [--write]");
  process.exit(1);
}
process.env.FIREBASE_PROJECT_ID = project;

const PAGE = 1000;
const BATCH = 400;

async function main(): Promise<void> {
  // Imported after FIREBASE_PROJECT_ID is set: getDb() reads it on first use.
  const { getDb } = await import("../src/wa/firebase");
  const seller = await import("../src/stats/seller-stats");
  const { addTo } = await import("../src/stats/increments");
  type Contribution = import("../src/stats/increments").Contribution;
  const db = getDb();

  const totals: Contribution = new Map();
  const ordersByPath = new Map<string, admin.firestore.DocumentData[]>();
  let scanned = 0;
  let last: admin.firestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    let q = db.collection("orders").orderBy("__name__").limit(PAGE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    for (const d of snap.docs) {
      const data = d.data();
      for (const [path, fields] of Array.from(seller.sellerContribution(data, d.id))) {
        for (const [f, v] of Object.entries(fields)) addTo(totals, path, f, v);
        const list = ordersByPath.get(path) ?? [];
        list.push(data);
        ordersByPath.set(path, list);
      }
    }
    scanned += snap.size;
    if (snap.size < PAGE) break;
    last = snap.docs[snap.docs.length - 1];
  }

  // Nested objects with the same plain fields the trigger writes.
  const docs = new Map<string, Record<string, unknown>>();
  for (const [path, fields] of Array.from(totals)) {
    const out = seller.sellerExtra(path, ordersByPath.get(path) ?? []);
    for (const [field, value] of Object.entries(fields)) {
      const parts = field.split(".");
      let node = out;
      for (const p of parts.slice(0, -1)) node = (node[p] = (node[p] as Record<string, unknown>) ?? {}) as Record<string, unknown>;
      node[parts[parts.length - 1]] = Math.round(value * 100) / 100;
    }
    docs.set(path, out);
  }

  const existing = [
    ...(await db.collection(seller.SELLER_STATS).listDocuments()),
    ...(await db.collection(seller.SELLER_DAILY).listDocuments()),
  ];
  const stale = existing.filter((ref) => !docs.has(ref.path));
  const sellers = Array.from(docs.keys()).filter((p) => p.startsWith(`${seller.SELLER_STATS}/`)).length;

  console.log(`${write ? "Writing" : "Preview (dry run)"} for project ${project}:`);
  console.table({ ordersScanned: scanned, sellers, dayDocs: docs.size - sellers, staleDocsToDelete: stale.length });

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
  console.log(`Wrote ${docs.size} docs, deleted ${stale.length}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
