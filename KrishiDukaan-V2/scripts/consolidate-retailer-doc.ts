/**
 * ONE-OFF data fix: consolidate a split retailer account onto its canonical
 * uid-keyed doc, then delete the phone-keyed shadow that the dashboard profile
 * save can no longer update (Missing or insufficient permissions).
 *
 * The phone-keyed shadow was created by the online-delivery/GST enable flow
 * (which used a phone middle-fallback + the permissive `retailers` create rule)
 * while the full profile lives at retailers/{uid}. We carry the fields that are
 * unique to the shadow into retailers/{uid}, then remove the shadow.
 * gstin/onlineDelivery/onlineDeliveryTerms are already mirrored on
 * profiles/{phone} + users/{phone}, so the public Order button is unaffected.
 *
 * Usage:  npx tsx scripts/consolidate-retailer-doc.ts +917276769367 zRvQYQGf4OdipKoIunzLNl3tNsz2 [--apply]
 */
import { getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID ?? 'krishidukan-e8315';
if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

const phone = process.argv[2];
const uid = process.argv[3];
const apply = process.argv.includes('--apply');
if (!phone || !uid) throw new Error('Usage: consolidate-retailer-doc.ts <phone> <uid> [--apply]');

// Fields unique to the shadow that the canonical doc should carry.
const CARRY = ['gstin', 'gstRegistered', 'onlineDelivery', 'onlineDeliveryTerms', 'socialLinks', 'tagline'];

(async () => {
  const phoneRef = db.doc(`retailers/${phone}`);
  const uidRef = db.doc(`retailers/${uid}`);
  const [phoneSnap, uidSnap] = await Promise.all([phoneRef.get(), uidRef.get()]);

  if (!phoneSnap.exists) { console.log('No phone-keyed shadow doc — nothing to do.'); return; }
  if (!uidSnap.exists) { throw new Error(`Canonical retailers/${uid} does not exist — aborting.`); }

  const shadow = phoneSnap.data() as Record<string, unknown>;
  const canonical = uidSnap.data() as Record<string, unknown>;

  const merge: Record<string, unknown> = {};
  for (const k of CARRY) {
    if (shadow[k] !== undefined) merge[k] = shadow[k];
  }
  merge.updatedAt = FieldValue.serverTimestamp();

  console.log('Will merge into retailers/%s:', uid, JSON.stringify(Object.keys(merge)));
  console.log('  gstin now:', canonical.gstin, '-> ', (merge as any).gstin);
  console.log('  onlineDelivery now:', canonical.onlineDelivery, '-> ', (merge as any).onlineDelivery);
  console.log('Will DELETE retailers/%s (shadow).', phone);

  if (!apply) { console.log('\nDRY RUN — pass --apply to perform the merge + delete.'); return; }

  await uidRef.set(merge, { merge: true });
  await phoneRef.delete();
  console.log('\nDone. Merged shadow fields into canonical doc and deleted the shadow.');

  const after = await uidRef.get();
  console.log('retailers/%s now has gstin=%s onlineDelivery=%s',
    uid, (after.data() as any)?.gstin, (after.data() as any)?.onlineDelivery);
})().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
