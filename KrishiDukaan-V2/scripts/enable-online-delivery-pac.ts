/**
 * Enable account-level online delivery for "P.A.C Sheti Udyog Bhandar" so the
 * shop appears in Admin → Orders → Route Order's seller list.
 *
 *   retailers/+919511829723  →  onlineDelivery: true
 *
 * WHY: Route Order's fallback list is `retailers/manufacturers where
 * onlineDelivery == true`. This shop's doc had no onlineDelivery flag, so it was
 * excluded. This sets ONLY that flag (+ updatedAt). It does NOT touch GST, the
 * Razorpay Route account, products, or anything else — so the shop will show as
 * routable but `onRoute:false` until Razorpay onboarding is completed separately.
 *
 * SAFETY
 *   • Guard: aborts unless the doc exists and is the expected P.A.C retailer.
 *   • Idempotent: a no-op if onlineDelivery is already true.
 *   • Dry-run by default. Pass --apply to write.
 *
 * Usage:
 *   npx tsx scripts/enable-online-delivery-pac.ts            # dry run
 *   npx tsx scripts/enable-online-delivery-pac.ts --apply    # write
 *
 * Requires admin credentials (rules-gated write):
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 *   (or Application Default Credentials for project krishidukan-e8315).
 */
import { cert, getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const DOC_ID = '+919511829723';
const EXPECT_NAME_NEEDLE = 'p.a.c';
const APPLY = process.argv.includes('--apply');

function initAdmin() {
  if (getApps().length) return;
  const projectId = process.env.FIREBASE_PROJECT_ID ?? 'krishidukan-e8315';
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (clientEmail && privateKey) initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  else initializeApp({ credential: applicationDefault(), projectId });
}

(async () => {
  initAdmin();
  const db = getFirestore();
  const ref = db.collection('retailers').doc(DOC_ID);
  const snap = await ref.get();

  if (!snap.exists) {
    console.error(`ABORT: retailers/${DOC_ID} does not exist.`);
    process.exit(1);
  }
  const d = snap.data() as Record<string, unknown>;
  const name = String(d.shopName ?? d.businessName ?? d.name ?? '');
  if (!name.toLowerCase().includes(EXPECT_NAME_NEEDLE)) {
    console.error(`ABORT: identity guard failed — expected a "${EXPECT_NAME_NEEDLE}" shop, found "${name}".`);
    process.exit(1);
  }

  console.log(`Target : retailers/${DOC_ID} — ${name}`);
  console.log(`Current: onlineDelivery = ${JSON.stringify(d.onlineDelivery)}`);

  if (d.onlineDelivery === true) {
    console.log('Already onlineDelivery:true — nothing to do (idempotent no-op).');
    process.exit(0);
  }

  if (!APPLY) {
    console.log('\nDRY RUN — would set onlineDelivery:true (+ updatedAt). Re-run with --apply to write.');
    process.exit(0);
  }

  await ref.update({ onlineDelivery: true, updatedAt: FieldValue.serverTimestamp() });
  const after = (await ref.get()).data() as Record<string, unknown>;
  console.log(`\nAPPLIED ✓ onlineDelivery is now ${JSON.stringify(after.onlineDelivery)}.`);
  process.exit(0);
})().catch((e) => {
  console.error('FAILED:', e?.message ?? e);
  process.exit(1);
});
