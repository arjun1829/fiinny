/**
 * Starts following Razorpay transfer status for orders paid online before
 * trackPayoutOnOrderWrite was deployed: sets payout.nextCheckAt on each such
 * order, and syncPayoutStatus (every 15 minutes, 150 orders a run) then asks
 * Razorpay and writes the status. Orders already followed are left alone, so
 * it is safe to re-run. It never calls Razorpay itself and moves no money.
 *
 *   gcloud auth application-default login
 *   cd functions
 *   npx tsx scripts/backfill-payout-status.ts --project krishidukan-e8315             # preview
 *   npx tsx scripts/backfill-payout-status.ts --project krishidukan-e8315 --write     # apply
 *   ... --days 365   (default 120: how far back to look)
 *   ... --refresh-settled   instead: re-check settled orders that have no UTR /
 *                           settlement date yet (fills in the bank reference)
 */
import type * as admin from "firebase-admin";

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const project = arg("--project");
const write = args.includes("--write");
const days = Number(arg("--days") ?? 120);
const refreshSettled = args.includes("--refresh-settled");

if (!project || !Number.isFinite(days) || days <= 0) {
  console.error("Usage: npx tsx scripts/backfill-payout-status.ts --project <project-id> [--days 120] [--write]");
  process.exit(1);
}
process.env.FIREBASE_PROJECT_ID = project;

const PAGE = 1000;

async function main(): Promise<void> {
  const { getDb } = await import("../src/wa/firebase");
  const { Timestamp } = (await import("firebase-admin")).firestore;
  const db = getDb();
  const since = Timestamp.fromMillis(Date.now() - days * 86_400_000);

  const todo: admin.firestore.DocumentReference[] = [];
  let scanned = 0;
  let alreadyFollowed = 0;
  let last: admin.firestore.QueryDocumentSnapshot | undefined;
  if (refreshSettled) {
    const snap = await db.collection("orders").where("payout.state", "==", "settled").get();
    for (const d of snap.docs) {
      const p = d.get("payout") ?? {};
      if (p.utr && p.settlementAt) alreadyFollowed++;
      else todo.push(d.ref);
    }
    scanned = snap.size;
  }
  for (; !refreshSettled; ) {
    let q = db.collection("orders").where("createdAt", ">=", since).orderBy("createdAt").limit(PAGE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    for (const d of snap.docs) {
      const o = d.data();
      const paid = String(o.payment?.razorpayPaymentId ?? "").trim() || String(o.payment?.transferId ?? "").trim();
      if (!paid) continue;
      if (o.payout) alreadyFollowed++;
      else todo.push(d.ref);
    }
    scanned += snap.size;
    if (snap.size < PAGE) break;
    last = snap.docs[snap.docs.length - 1];
  }

  console.log(`${write ? "Writing" : "Preview (dry run)"} for project ${project}, orders since ${since.toDate().toISOString().slice(0, 10)}:`);
  console.table(
    refreshSettled
      ? { settledOrders: scanned, missingUtrToRecheck: todo.length, alreadyHaveUtr: alreadyFollowed }
      : { ordersScanned: scanned, paidOnlineToFollow: todo.length, alreadyFollowed },
  );
  if (!write) {
    console.log("Re-run with --write to apply.");
    return;
  }
  // Spread the first checks so each 15-minute run takes a fair share.
  const now = Date.now();
  for (let i = 0; i < todo.length; i += 400) {
    const batch = db.batch();
    todo.slice(i, i + 400).forEach((ref, j) => batch.set(ref, { payout: { nextCheckAt: now + Math.floor((i + j) / 150) * 15 * 60_000 } }, { merge: true }));
    await batch.commit();
  }
  console.log(`Following ${todo.length} orders; statuses fill in over the next ${Math.ceil(todo.length / 150) * 15} minutes.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
