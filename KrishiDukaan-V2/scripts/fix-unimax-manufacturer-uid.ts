/**
 * Repair the Unimax Agri Bio-Technologies manufacturer record.
 *
 * ROOT CAUSE (data, not code)
 * ---------------------------
 * manufacturers/+919637773785 stores its own PHONE in the `uid` and
 * `manufacturerId` fields instead of the account's real Firebase Auth UID.
 * Every one of the manufacturer's four canonical products correctly carries
 * manufacturerId == the real Auth UID (bApcqU2jIuOsxiMsxDI9JQFnjEz1), so:
 *   - /brand/[slug] queries products by mfrData.uid (= phone) → 0 products
 *   - ProductDetail "Manufactured by" looks up manufacturers where
 *     uid == product.manufacturerId (= real UID) → no match → brand name/link
 *     missing
 *   - the brand-page product count shows 0 instead of 4
 *
 * FIX: set manufacturers/{phone}.uid and .manufacturerId to the real Auth UID,
 * so the doc and its products agree — exactly how every working manufacturer is
 * stored. Optionally write uidIndex/{uid} → phone so future save paths resolve.
 * No product documents are touched. No application code is changed.
 *
 * This is a one-off data remediation for one known-bad record (same style as
 * scripts/fix-bhoskrushi-retailer.ts). It is NOT a runtime special-case.
 *
 * Usage:
 *   npx tsx scripts/fix-unimax-manufacturer-uid.ts            # DRY RUN
 *   npx tsx scripts/fix-unimax-manufacturer-uid.ts --apply    # write
 *
 * Requires admin credentials for krishidukan-e8315 (applicationDefault or
 * FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY).
 */
import { cert, getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// ── Verified against production (read-only) before writing ────────────────────
const PHONE = '+919637773785';                       // manufacturers/ doc id
const REAL_UID = 'bApcqU2jIuOsxiMsxDI9JQFnjEz1';      // real Auth UID the products use
const NAME_NEEDLE = 'unimax';                        // sanity-check businessName

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
  console.log(`MODE: ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes)'}\n`);

  // ── Guards: confirm we are repairing exactly the known-bad record ──────────
  const mfrSnap = await db.collection('manufacturers').doc(PHONE).get();
  if (!mfrSnap.exists) throw new Error(`Guard failed: manufacturers/${PHONE} does not exist. Aborting.`);
  const businessName = String(mfrSnap.get('businessName') ?? mfrSnap.get('ownerName') ?? '');
  if (!businessName.toLowerCase().includes(NAME_NEEDLE))
    throw new Error(`Guard failed: manufacturers/${PHONE} is "${businessName}", not a ${NAME_NEEDLE} record. Aborting.`);
  const currentUid = String(mfrSnap.get('uid') ?? '');
  if (currentUid === REAL_UID) {
    console.log(`Nothing to do: manufacturers/${PHONE}.uid is already ${REAL_UID}.`);
    process.exit(0);
  }
  if (currentUid !== PHONE)
    throw new Error(`Guard failed: expected uid == phone (${PHONE}); got "${currentUid}". The record is in an unexpected state — handle manually. Aborting.`);

  // Confirm the target UID is the one the manufacturer's OWN products use.
  const canonicalQ = await db.collection('products')
    .where('manufacturerId', '==', REAL_UID)
    .where('ownerType', '==', 'manufacturer')
    .where('isActive', '==', true)
    .get();
  const canonical = canonicalQ.docs.filter((d) => d.get('source') !== 'manufacturer_assigned');
  if (canonical.length === 0)
    throw new Error(`Guard failed: no active manufacturer-owned products reference ${REAL_UID}. Aborting.`);
  console.log(`Guards passed:`);
  console.log(`  manufacturers/${PHONE} "${businessName}"  uid: ${currentUid} → ${REAL_UID}`);
  console.log(`  ${canonical.length} canonical manufacturer-owned product(s) reference ${REAL_UID}:`);
  for (const d of canonical) console.log(`    products/${d.id} "${d.get('name')}" (source=${d.get('source')})`);
  console.log('');

  // ── Write: correct the manufacturer doc + (re)write uidIndex ───────────────
  const uidIndexSnap = await db.collection('uidIndex').doc(REAL_UID).get();
  const plan: string[] = [
    `UPDATE manufacturers/${PHONE}  { uid: "${REAL_UID}", manufacturerId: "${REAL_UID}" }`,
    `${uidIndexSnap.exists ? 'VERIFY' : 'SET   '} uidIndex/${REAL_UID}  { phone: "${PHONE}" }`,
  ];
  console.log('Planned writes:');
  for (const p of plan) console.log('  ' + p);

  if (!APPLY) {
    console.log('\nDRY RUN — no writes performed. Re-run with --apply to execute.');
    process.exit(0);
  }

  const batch = db.batch();
  batch.update(db.collection('manufacturers').doc(PHONE), {
    uid: REAL_UID,
    manufacturerId: REAL_UID,
    updatedAt: FieldValue.serverTimestamp(),
  });
  if (!uidIndexSnap.exists) {
    batch.set(db.collection('uidIndex').doc(REAL_UID), {
      phone: PHONE,
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  await batch.commit();

  // Audit trail (best-effort; mirrors platformAuditLogs convention).
  try {
    await db.collection('platformAuditLogs').add({
      action: 'manufacturer.uid.repair',
      target: `manufacturers/${PHONE}`,
      before: { uid: currentUid },
      after: { uid: REAL_UID },
      source: 'scripts/fix-unimax-manufacturer-uid.ts',
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.warn(`(audit log skipped: ${(e as Error).message})`);
  }

  console.log('\nAPPLIED. Re-run scripts/investigate-unimax.ts to verify resolution now returns 4 listable products.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
