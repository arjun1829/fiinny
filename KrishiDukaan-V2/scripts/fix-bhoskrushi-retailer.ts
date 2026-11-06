/**
 * Fix the duplicate retailer phone-number collision for "Bose Agro Agency".
 *
 * BACKGROUND
 * ----------
 * The manufacturer "Karan Arjun Pvt Ltd." (manufacturers/+918658032751, uid
 * 1PMTenB3AGb5GtZjnpN6IBeVeQy1) added retailer "Bose Agro" to its network but
 * typed its OWN phone number, so createNetworkRetailer wrote
 *   retailers/+918658032751  "BHOSKRUSHI SEVA KENDRA RUICHATTISHI"
 * on top of the existing manufacturers/+918658032751. A single phone now lives
 * in BOTH collections, so the marketplace profile lookup can only resolve one —
 * the manufacturer's own products flickered to the retailer's name.
 *
 * The genuinely correct Bose account already exists (created a day later by a
 * different manufacturer):
 *   retailers/+917756978092  "BHOS AGRO AJENCY"
 *
 * This script MIGRATES everything attributed to the erroneous retailer record
 * (+918658032751, acting as a RETAILER) onto the correct account (+917756978092)
 * and then deletes the erroneous retailer doc — never touching the manufacturer.
 *
 * STRICT SAFETY
 * -------------
 *   • PRESERVED, never written: manufacturers/+918658032751, profiles/+918658032751,
 *     and every manufacturer-owned product (ownerType=='manufacturer' / source in
 *     {manufacturer_inventory, admin}). Only RETAILER-owned data moves.
 *   • Guards abort unless the three docs match their expected identity.
 *   • Orders are REPORTED ONLY, never modified (historical record).
 *   • Idempotent: anything already migrated/absent produces no op.
 *   • Dry-run by default. Pass --apply to write. Every change is logged + audited.
 *
 * Usage:
 *   npx tsx scripts/fix-bhoskrushi-retailer.ts            # dry run (no writes)
 *   npx tsx scripts/fix-bhoskrushi-retailer.ts --apply    # perform the migration
 *
 * Requires admin credentials (rules-gated collections):
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 *   (or Application Default Credentials / `gcloud auth application-default login`
 *   for project krishidukan-e8315).
 */
import { cert, getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { DocumentReference } from 'firebase-admin/firestore';

// ── Identities (verified against production, read-only, before writing) ───────
const WRONG_PHONE = '+918658032751';           // erroneous retailer doc id
const RIGHT_PHONE = '+917756978092';           // correct Bose Agro retailer doc id
const MFR_UID = '1PMTenB3AGb5GtZjnpN6IBeVeQy1'; // Karan Arjun manufacturer uid (preserve)
const WRONG_NAME = 'BHOSKRUSHI SEVA KENDRA RUICHATTISHI';
const RIGHT_NAME = 'BHOS AGRO AJENCY';
const MFR_NAME = 'Karan Arjun Pvt Ltd.';
// A retailer copy is any product owned by WRONG_PHONE that is NOT a manufacturer
// catalogue doc. These sources are the manufacturer's own and must be preserved.
const MFR_SOURCES = new Set(['manufacturer_inventory', 'admin']);

const APPLY = process.argv.includes('--apply');

function initAdmin() {
  if (getApps().length) return;
  const projectId = process.env.FIREBASE_PROJECT_ID ?? 'krishidukan-e8315';
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (clientEmail && privateKey) initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  else initializeApp({ credential: applicationDefault(), projectId });
}

const chunk = <T,>(a: T[], n: number) =>
  Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

// Declarative op — dry-run prints `label`; apply executes against the batch.
type Op =
  | { kind: 'update'; ref: DocumentReference; data: Record<string, unknown>; label: string }
  | { kind: 'set'; ref: DocumentReference; data: Record<string, unknown>; merge: boolean; label: string }
  | { kind: 'delete'; ref: DocumentReference; label: string };

(async () => {
  initAdmin();
  const db = getFirestore();
  const now = FieldValue.serverTimestamp();
  const ops: Op[] = [];
  const reportOnly: string[] = [];
  const mirrorMoves: { mPhone: string }[] = [];

  console.log(`MODE: ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes)'}\n`);

  // ── 0. Identity guards ──────────────────────────────────────────────────────
  const [mfrSnap, wrongSnap, rightSnap] = await Promise.all([
    db.collection('manufacturers').doc(WRONG_PHONE).get(),
    db.collection('retailers').doc(WRONG_PHONE).get(),
    db.collection('retailers').doc(RIGHT_PHONE).get(),
  ]);
  const mfrName = String(mfrSnap.get('shopName') ?? mfrSnap.get('businessName') ?? mfrSnap.get('ownerName') ?? mfrSnap.get('name') ?? '');
  if (!mfrSnap.exists || mfrSnap.get('uid') !== MFR_UID || mfrName !== MFR_NAME)
    throw new Error(`Guard failed: manufacturers/${WRONG_PHONE} is not the expected "${MFR_NAME}" (uid ${MFR_UID}); got uid=${mfrSnap.get('uid')} name="${mfrName}". Aborting — nothing written.`);
  if (!wrongSnap.exists || String(wrongSnap.get('shopName')) !== WRONG_NAME)
    throw new Error(`Guard failed: retailers/${WRONG_PHONE} is not the expected erroneous "${WRONG_NAME}". Aborting.`);
  if (wrongSnap.get('uid'))
    throw new Error(`Guard failed: retailers/${WRONG_PHONE} has a claimed uid (${wrongSnap.get('uid')}). A claimed account must be handled manually. Aborting.`);
  if (!rightSnap.exists)
    throw new Error(`Guard failed: correct account retailers/${RIGHT_PHONE} does not exist. Cannot migrate to a missing target. Aborting.`);
  console.log('Guards passed:');
  console.log(`  PRESERVE  manufacturers/${WRONG_PHONE}  "${MFR_NAME}"`);
  console.log(`  MIGRATE   retailers/${WRONG_PHONE}      "${WRONG_NAME}"  (unclaimed) → retailers/${RIGHT_PHONE} "${RIGHT_NAME}"\n`);

  // ── 1. Product copies owned by the erroneous retailer (RETAILER-owned only) ──
  // A copy whose root already has an active RIGHT-owned copy is a duplicate →
  // soft-deleted instead of migrated (avoids two listings for one retailer+root).
  const copyQ = await db.collection('products').where('ownerPhone', '==', WRONG_PHONE).get();
  let migrateCopyN = 0, dupCopyN = 0;
  const preservedMfr: string[] = [];
  for (const d of copyQ.docs) {
    const x = d.data() as any;
    if (x.ownerType === 'manufacturer' || MFR_SOURCES.has(String(x.source ?? ''))) {
      preservedMfr.push(`${d.id} "${x.name}" (${x.source})`);
      continue; // manufacturer's own product — NEVER touch
    }
    const root = String(x.manufacturerProductId || x.originalProductId || '');
    let dupe = false;
    if (root) {
      for (const field of ['manufacturerProductId', 'originalProductId'] as const) {
        const q = await db.collection('products')
          .where(field, '==', root).where('ownerPhone', '==', RIGHT_PHONE).get();
        if (q.docs.some((r) => r.get('isActive') !== false)) { dupe = true; break; }
      }
    }
    if (dupe) {
      dupCopyN++;
      if (d.get('isActive') !== false)
        ops.push({ kind: 'update', ref: d.ref, data: { isActive: false, updatedAt: now },
          label: `products/${d.id} "${x.name}"  DUPLICATE on target → isActive:false` });
    } else {
      migrateCopyN++;
      ops.push({ kind: 'update', ref: d.ref,
        data: { ownerId: RIGHT_PHONE, ownerPhone: RIGHT_PHONE, retailerPhone: RIGHT_PHONE, store: RIGHT_NAME, updatedAt: now },
        label: `products/${d.id} "${x.name}"  owner/retailer → ${RIGHT_PHONE}, store → "${RIGHT_NAME}"` });
    }
  }

  // ── 2. availability[] entries pointing at the erroneous retailer ─────────────
  // Full scan: fix any entry matching WRONG_PHONE *and* the retailer's name (so a
  // manufacturer self-entry that happens to share the phone is never touched).
  // If the array already has a RIGHT entry, drop the WRONG one instead of duping.
  const allProducts = await db.collection('products').get();
  let availFixed = 0, availDropped = 0, availProducts = 0;
  for (const d of allProducts.docs) {
    const av = d.get('availability');
    if (!Array.isArray(av) || av.length === 0) continue;
    const hasRight = av.some((a: any) => a?.storeId === RIGHT_PHONE || a?.storePhone === RIGHT_PHONE);
    let changed = false;
    const next: any[] = [];
    for (const a of av) {
      const isWrong = (a?.storeId === WRONG_PHONE || a?.storePhone === WRONG_PHONE)
        && String(a?.storeName ?? '') === WRONG_NAME;
      if (!isWrong) { next.push(a); continue; }
      changed = true;
      if (hasRight) { availDropped++; continue; } // already present on target → drop dup
      next.push({ ...a, storeId: RIGHT_PHONE, storePhone: RIGHT_PHONE, storeName: RIGHT_NAME });
      availFixed++;
    }
    if (changed) {
      availProducts++;
      ops.push({ kind: 'update', ref: d.ref, data: { availability: next, updatedAt: now },
        label: `products/${d.id} availability[] → ${RIGHT_PHONE}` });
    }
  }

  // ── 3. inventory owned by the erroneous retailer (RETAILER-owned only) ──────
  // CRITICAL: ownerPhone on inventory also holds the MANUFACTURER's phone for the
  // manufacturer's own stock (same collision). Discriminate by ownerType — only
  // ownerType=='retailer' docs (ownerId == the phone) belong to this retailer.
  const invIds = new Set<string>();
  let invPreservedMfr = 0;
  const invQ = await db.collection('inventory').where('ownerPhone', '==', WRONG_PHONE).get();
  invQ.forEach((d) => {
    if (d.get('ownerType') === 'manufacturer' || d.get('ownerId') === MFR_UID) { invPreservedMfr++; return; }
    if (d.get('ownerType') !== 'retailer') { invPreservedMfr++; return; } // be strict: skip anything not clearly retailer
    if (invIds.has(d.id)) return;
    invIds.add(d.id);
    const data: Record<string, unknown> = { ownerId: RIGHT_PHONE, ownerPhone: RIGHT_PHONE, updatedAt: now };
    if (d.get('retailerPhone') !== undefined) data.retailerPhone = RIGHT_PHONE;
    ops.push({ kind: 'update', ref: d.ref, data, label: `inventory/${d.id}  owner → ${RIGHT_PHONE}` });
  });

  // ── 4. retailerSeatListings for the erroneous retailer (retailer-keyed only) ─
  // CRITICAL: ownerPhone/manufacturerPhone here is the MANUFACTURER that bought
  // the seat — matching those would sweep in every seat Karan Arjun owns for its
  // whole network (hundreds). The retailer's own seat rows are keyed ONLY by
  // retailerDocId / retailerPhone. Never match owner/manufacturer fields.
  const seatIds = new Set<string>();
  for (const field of ['retailerDocId', 'retailerPhone'] as const) {
    const q = await db.collection('retailerSeatListings').where(field, '==', WRONG_PHONE).get().catch(() => null);
    q?.forEach((d) => {
      if (seatIds.has(d.id)) return;
      seatIds.add(d.id);
      ops.push({ kind: 'update', ref: d.ref, data: { retailerDocId: RIGHT_PHONE, retailerPhone: RIGHT_PHONE, updatedAt: now },
        label: `retailerSeatListings/${d.id} (status=${d.get('status')}, mfr=${d.get('manufacturerId')})  retailer → ${RIGHT_PHONE}` });
    });
  }

  // ── 5. manufacturerRetailers link rows + manufacturer-side subcollection mirror
  // Only migrate rows that are THIS retailer (shopName == the erroneous name).
  // An unrelated/ambiguous row (e.g. revoked "retailer2") is reported, not touched.
  const linkIds = new Set<string>();
  const linkSkipped: string[] = [];
  const seenLink = new Set<string>();
  for (const field of ['retailerDocId', 'retailerPhone'] as const) {
    const q = await db.collection('manufacturerRetailers').where(field, '==', WRONG_PHONE).get().catch(() => null);
    q?.forEach((d) => {
      if (seenLink.has(d.id)) return;
      seenLink.add(d.id);
      if (String(d.get('shopName') ?? '') !== WRONG_NAME) {
        linkSkipped.push(`manufacturerRetailers/${d.id} (shopName="${d.get('shopName')}", status=${d.get('status')}, mfr=${d.get('manufacturerId')}) — NOT migrated`);
        return;
      }
      linkIds.add(d.id);
      ops.push({ kind: 'update', ref: d.ref, data: { retailerDocId: RIGHT_PHONE, retailerPhone: RIGHT_PHONE, updatedAt: now },
        label: `manufacturerRetailers/${d.id} (mfr=${d.get('manufacturerId')})  retailer → ${RIGHT_PHONE}` });
      // Move the manufacturer-side mirror manufacturers/{mPhone}/retailers/{rPhone}.
      const mPhone = String(d.get('manufacturerPhone') ?? '');
      if (mPhone) {
        reportOnly.push(`mirror to move: manufacturers/${mPhone}/retailers/${WRONG_PHONE} → …/${RIGHT_PHONE}`);
        mirrorMoves.push({ mPhone });
      }
    });
  }

  // ── 6a. manufacturer-side mirror docs manufacturers/{mPhone}/retailers/{rPhone}
  for (const { mPhone } of mirrorMoves) {
    const src = db.doc(`manufacturers/${mPhone}/retailers/${WRONG_PHONE}`);
    const srcSnap = await src.get().catch(() => null);
    if (!srcSnap?.exists) continue;
    ops.push({ kind: 'set', merge: true, ref: db.doc(`manufacturers/${mPhone}/retailers/${RIGHT_PHONE}`),
      data: { ...(srcSnap.data() as Record<string, unknown>), phone: RIGHT_PHONE, updatedAt: now },
      label: `manufacturers/${mPhone}/retailers/${RIGHT_PHONE}  ← move mirror from ${WRONG_PHONE}` });
    ops.push({ kind: 'delete', ref: src, label: `manufacturers/${mPhone}/retailers/${WRONG_PHONE}  DELETE (source mirror)` });
  }

  // ── 6b. retailers/{WRONG}/products subcollection mirror → move to RIGHT ──────
  const mirrorSnap = await db.collection('retailers').doc(WRONG_PHONE).collection('products').get().catch(() => null);
  const mirrorDocs = mirrorSnap?.docs ?? [];
  for (const m of mirrorDocs) {
    ops.push({ kind: 'set', merge: true, ref: db.collection('retailers').doc(RIGHT_PHONE).collection('products').doc(m.id),
      data: { ...(m.data() as Record<string, unknown>), updatedAt: now },
      label: `retailers/${RIGHT_PHONE}/products/${m.id}  ← copy from ${WRONG_PHONE}` });
    ops.push({ kind: 'delete', ref: m.ref, label: `retailers/${WRONG_PHONE}/products/${m.id}  DELETE (source mirror)` });
  }

  // ── 7. Orders — REPORT ONLY (never modified) ────────────────────────────────
  let orderHits = 0;
  try {
    const ordersSnap = await db.collection('orders').get();
    ordersSnap.forEach((o) => {
      const top = String(o.get('retailerPhone') ?? o.get('storePhone') ?? '');
      const items = Array.isArray(o.get('items')) ? o.get('items') : [];
      const itemHit = items.some((it: any) => String(it.storePhone ?? it.sellerPhone ?? '') === WRONG_PHONE);
      if (top === WRONG_PHONE || itemHit) { orderHits++; reportOnly.push(`orders/${o.id} references ${WRONG_PHONE}`); }
    });
  } catch (e: any) { reportOnly.push(`orders scan skipped: ${e?.message ?? e}`); }

  // ── 8. Delete the erroneous retailer profile doc (after its data has moved) ──
  ops.push({ kind: 'delete', ref: db.collection('retailers').doc(WRONG_PHONE),
    label: `retailers/${WRONG_PHONE}  DELETE (erroneous duplicate profile)` });

  // ── Report ──────────────────────────────────────────────────────────────────
  console.log('─'.repeat(78));
  console.log('MIGRATION PLAN');
  console.log('─'.repeat(78));
  console.log(`product copies: migrate ${migrateCopyN}, soft-delete duplicates ${dupCopyN}, preserved manufacturer docs ${preservedMfr.length}`);
  console.log(`availability[]: ${availFixed} entries re-pointed, ${availDropped} dropped-as-dup across ${availProducts} products`);
  console.log(`inventory: migrate ${invIds.size} (retailer-owned), preserved manufacturer inventory ${invPreservedMfr}`);
  console.log(`seatListings (retailer-keyed only): ${seatIds.size}   manufacturerRetailers migrated: ${linkIds.size} (${linkSkipped.length} skipped)   mfr-side mirrors: ${mirrorMoves.length}   retailer subcollection: ${mirrorDocs.length}`);
  console.log(`orders referencing ${WRONG_PHONE} (REPORT ONLY): ${orderHits}`);
  if (linkSkipped.length) linkSkipped.forEach((s) => console.log(`  ${s}`));
  console.log('\nPreserved manufacturer products (never touched):');
  preservedMfr.slice(0, 40).forEach((p) => console.log(`  ${p}`));
  if (preservedMfr.length > 40) console.log(`  …+${preservedMfr.length - 40} more`);
  console.log(`\nWrites queued (${ops.length}):`);
  ops.forEach((o) => console.log(`  • ${o.label}`));
  if (reportOnly.length) { console.log('\nReport-only (not modified):'); reportOnly.slice(0, 40).forEach((r) => console.log(`  ${r}`)); }

  if (!APPLY) { console.log('\nDRY RUN — re-run with --apply to perform the migration.'); process.exit(0); }

  // ── Apply ───────────────────────────────────────────────────────────────────
  console.log('\nApplying…');
  for (const group of chunk(ops, 400)) {
    const batch = db.batch();
    for (const op of group) {
      if (op.kind === 'update') batch.update(op.ref, op.data);
      else if (op.kind === 'set') batch.set(op.ref, op.data, { merge: op.merge });
      else batch.delete(op.ref);
    }
    await batch.commit();
  }
  await db.collection('adminLogs').add({
    action: 'fix_bhoskrushi_retailer_phone_collision',
    wrongPhone: WRONG_PHONE, rightPhone: RIGHT_PHONE, manufacturerUid: MFR_UID,
    migratedCopies: migrateCopyN, softDeletedDuplicateCopies: dupCopyN,
    availabilityEntriesFixed: availFixed, availabilityEntriesDropped: availDropped,
    inventory: [...invIds], seatListings: [...seatIds], manufacturerRetailers: [...linkIds],
    subcollectionMirror: mirrorDocs.map((m) => m.id), ordersReferenced: orderHits,
    performedBy: 'script:fix-bhoskrushi-retailer', createdAt: now,
  });
  console.log(`\n✔ Applied ${ops.length} write(s). Logged to adminLogs.`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
