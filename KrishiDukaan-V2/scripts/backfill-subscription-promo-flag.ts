/**
 * Backfills `isPromotional: false` onto GENUINE (non-promotional) subscription
 * docs so the /admin/subscriptions status filters (All/Active/Unpaid/Revoked)
 * can query them server-side (Firestore can't match a missing field).
 *
 * A doc is promotional iff `isPromotional === true` OR it has a `promotionId`;
 * everything else is genuine and gets `isPromotional: false`. Docs already
 * carrying an `isPromotional` boolean are left untouched (idempotent). No other
 * field is changed; revenue, status, dates and workflows are untouched.
 *
 * Requires admin credentials for krishidukan-e8315 (applicationDefault or
 * FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY).
 *
 *   npx tsx scripts/backfill-subscription-promo-flag.ts            # preview
 *   npx tsx scripts/backfill-subscription-promo-flag.ts --apply    # write
 */
import { cert, getApps, initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const APPLY = process.argv.includes("--apply");

function initAdmin() {
  if (getApps().length) return;
  const projectId = process.env.FIREBASE_PROJECT_ID ?? "krishidukan-e8315";
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (clientEmail && privateKey) initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  else initializeApp({ credential: applicationDefault(), projectId });
}

(async () => {
  initAdmin();
  const db = getFirestore();
  const snap = await db.collection("subscriptions").get();

  let promotional = 0, alreadyFlagged = 0;
  const toFix: string[] = [];
  for (const d of snap.docs) {
    const s = d.data() as Record<string, unknown>;
    if (s.isPromotional === true || s.promotionId) { promotional++; continue; }
    if (s.isPromotional === false) { alreadyFlagged++; continue; }
    toFix.push(d.id); // genuine, missing the flag
  }

  console.log(`subscriptions total        : ${snap.size}`);
  console.log(`promotional (left as-is)   : ${promotional}`);
  console.log(`already isPromotional=false: ${alreadyFlagged}`);
  console.log(`genuine to set false       : ${toFix.length}`);

  if (!APPLY) {
    console.log("\nPreview only. Re-run with --apply to write.");
    process.exit(0);
  }

  const BATCH = 400;
  for (let i = 0; i < toFix.length; i += BATCH) {
    const batch = db.batch();
    for (const id of toFix.slice(i, i + BATCH)) {
      batch.set(
        db.collection("subscriptions").doc(id),
        { isPromotional: false, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }
    await batch.commit();
  }
  console.log(`\nWrote isPromotional=false to ${toFix.length} genuine subscriptions.`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
