/**
 * Cleanup for the unwanted ADMIN-created "Arjuna" product and its retailer copies.
 *
 * Scope (STRICT — nothing else is ever touched):
 *   - the admin doc  products/wa12qD0fM15cJU8aYvzk  (source: "admin")
 *   - every seller COPY rooted at it
 *       (source in {manufacturer_assigned, admin_assigned} AND
 *        manufacturerProductId == ADMIN_DOC || originalProductId == ADMIN_DOC)
 *
 * Action = the project's established SOFT-DELETE (never a hard delete):
 *   - product doc            → isActive: false
 *   - its inventory doc(s)   → isAvailable: false      (matches adminRemoveAssignment)
 *   - its active seat listing→ status: "released"      (frees the consumed seat)
 *
 * PRESERVED (never written): the two legitimate manufacturer_inventory "Arjuna"
 * docs iPPifRMWbmq9VHxBC2tc and DnEE6Im3BqnUax7qASSU, and any product whose name
 * is not exactly "Arjuna" (e.g. the "Karan Arjun ..." line).
 *
 * Idempotent: a doc already in the target state is skipped and reported as such.
 * Every modified doc id is logged. Orders are only REPORTED, never modified.
 *
 * Usage:
 *   npx tsx scripts/cleanup-arjuna-admin-product.ts            # dry run (no writes)
 *   npx tsx scripts/cleanup-arjuna-admin-product.ts --apply    # writes the soft-delete
 *
 * Requires admin credentials (products writes are rules-gated):
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 *   (or Application Default Credentials in a Google env / `gcloud auth`).
 */
import { cert, getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const ADMIN_DOC = 'wa12qD0fM15cJU8aYvzk';
const PRESERVE = new Set(['iPPifRMWbmq9VHxBC2tc', 'DnEE6Im3BqnUax7qASSU']);
const COPY_SOURCES = new Set(['manufacturer_assigned', 'admin_assigned']);
const APPLY = process.argv.includes('--apply');

function initAdmin() {
  if (getApps().length) return;
  const projectId = process.env.FIREBASE_PROJECT_ID ?? 'krishidukan-e8315';
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (clientEmail && privateKey) initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  else initializeApp({ credential: applicationDefault(), projectId });
}

type Mod = { collection: string; id: string; field: string; from: unknown; to: unknown };

(async () => {
  initAdmin();
  const db = getFirestore();
  const now = FieldValue.serverTimestamp();

  // 1. The admin doc. It may already be HARD-DELETED (the admin UI delete does
  //    exactly that), leaving its seller copies orphaned — those copies are the
  //    cleanup target either way. If it still exists, guard that it really is
  //    the admin-created Arjuna before we count it in.
  const adminSnap = await db.collection('products').doc(ADMIN_DOC).get();
  let adminExists = adminSnap.exists;
  let adminActive = false;
  if (adminExists) {
    const admin = adminSnap.data() as any;
    if (String(admin.name).toLowerCase().trim() !== 'arjuna' || admin.source !== 'admin') {
      throw new Error(`Guard failed: products/${ADMIN_DOC} is name="${admin.name}" source="${admin.source}" — expected name=Arjuna source=admin. Aborting.`);
    }
    adminActive = admin.isActive !== false;
    console.log(`Admin doc present: ${ADMIN_DOC}  name="${admin.name}"  source=${admin.source}  isActive=${adminActive}\n`);
  } else {
    console.log(`Admin doc ${ADMIN_DOC} already hard-deleted — cleaning up its orphaned seller copies.\n`);
  }

  // 2. Collect the copies rooted at the admin doc (both link fields).
  const copyIds = new Set<string>();
  const copyDocs: { id: string; data: any }[] = [];
  for (const field of ['manufacturerProductId', 'originalProductId']) {
    const qs = await db.collection('products').where(field, '==', ADMIN_DOC).get();
    qs.forEach((d) => {
      if (copyIds.has(d.id)) return;
      const data = d.data() as any;
      if (!COPY_SOURCES.has(String(data.source ?? ''))) return; // only seller copies
      if (PRESERVE.has(d.id)) return;                            // never a legitimate doc
      copyIds.add(d.id);
      copyDocs.push({ id: d.id, data });
    });
  }
  console.log(`Seller copies rooted at admin doc: ${copyDocs.length}`);
  const bySource = new Map<string, number>();
  copyDocs.forEach((c) => bySource.set(c.data.source, (bySource.get(c.data.source) ?? 0) + 1));
  console.log(`  by source: ${Array.from(bySource).map(([s, n]) => `${s}×${n}`).join(', ') || '—'}\n`);

  // Product targets for reference lookups: the copies always, plus the admin
  // doc only if it still exists (a deleted doc has no live references).
  const productTargets = [...(adminExists ? [ADMIN_DOC] : []), ...copyIds];
  const mods: Mod[] = [];
  const skipped: string[] = [];

  // Product docs → isActive:false (idempotent).
  if (!adminExists) skipped.push(`products/${ADMIN_DOC} (already hard-deleted)`);
  else if (adminActive) mods.push({ collection: 'products', id: ADMIN_DOC, field: 'isActive', from: true, to: false });
  else skipped.push(`products/${ADMIN_DOC} (already inactive)`);
  for (const c of copyDocs) {
    if (c.data.isActive !== false) mods.push({ collection: 'products', id: c.id, field: 'isActive', from: true, to: false });
    else skipped.push(`products/${c.id} (already inactive)`);
  }

  // Related inventory + seat listings for every target product (admin doc + copies).
  const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

  const invDocs: { ref: FirebaseFirestore.DocumentReference; avail: unknown }[] = [];
  for (const c of chunk(productTargets, 30)) {
    const qs = await db.collection('inventory').where('productId', 'in', c).get();
    qs.forEach((d) => invDocs.push({ ref: d.ref, avail: d.get('isAvailable') }));
  }
  for (const d of invDocs) {
    if (d.avail !== false) mods.push({ collection: 'inventory', id: d.ref.id, field: 'isAvailable', from: d.avail, to: false });
    else skipped.push(`inventory/${d.ref.id} (already unavailable)`);
  }

  const seatDocs: { ref: FirebaseFirestore.DocumentReference; status: unknown }[] = [];
  for (const c of chunk(productTargets, 30)) {
    const qs = await db.collection('retailerSeatListings').where('productId', 'in', c).get();
    qs.forEach((d) => seatDocs.push({ ref: d.ref, status: d.get('status') }));
  }
  for (const d of seatDocs) {
    if (d.status === 'active') mods.push({ collection: 'retailerSeatListings', id: d.ref.id, field: 'status', from: 'active', to: 'released' });
    else skipped.push(`retailerSeatListings/${d.ref.id} (status=${d.status})`);
  }

  // Orders — REPORT ONLY (historical, never modified). Scan orders whose line
  // items reference a target product id.
  let orderRefs = 0;
  try {
    const ordersSnap = await db.collection('orders').get();
    ordersSnap.forEach((o) => {
      const items = Array.isArray(o.get('items')) ? o.get('items') : [];
      const hit = items.some((it: any) => productTargets.includes(String(it.catalogId ?? it.listingId ?? it.productId ?? '')));
      if (hit) orderRefs++;
    });
  } catch (e: any) { console.log(`  (orders scan skipped: ${e?.message ?? e})`); }

  // ── Report ────────────────────────────────────────────────────────────────
  console.log('─'.repeat(70));
  console.log(`PLAN: ${mods.length} doc(s) to soft-delete, ${skipped.length} already in target state.`);
  console.log('─'.repeat(70));
  const byCol = new Map<string, Mod[]>();
  for (const m of mods) (byCol.get(m.collection) ?? byCol.set(m.collection, []).get(m.collection)!).push(m);
  for (const [col, list] of byCol) {
    console.log(`\n${col} (${list.length}):`);
    for (const m of list) console.log(`  ${m.id}  ${m.field}: ${m.from} → ${m.to}`);
  }
  console.log(`\nOrders referencing these products (REPORT ONLY, not modified): ${orderRefs}`);
  console.log(`\nPreserved (never touched): manufacturer_inventory ${Array.from(PRESERVE).join(', ')}`);
  if (skipped.length) console.log(`\nAlready in target state (${skipped.length}):\n  ${skipped.slice(0, 60).join('\n  ')}${skipped.length > 60 ? `\n  …+${skipped.length - 60} more` : ''}`);

  if (!mods.length) { console.log('\nNothing to do — already clean.'); process.exit(0); }
  if (!APPLY) { console.log('\nDry run — pass --apply to write the soft-delete.'); process.exit(0); }

  // ── Apply ───────────────────────────────────────────────────────────────────
  console.log('\nApplying…');
  for (const group of chunk(mods, 400)) {
    const batch = db.batch();
    for (const m of group) {
      const ref = db.collection(m.collection).doc(m.id);
      if (m.collection === 'products') batch.update(ref, { isActive: false, updatedAt: now });
      else if (m.collection === 'inventory') batch.update(ref, { isAvailable: false, updatedAt: now });
      else if (m.collection === 'retailerSeatListings') batch.update(ref, { status: 'released', releasedAt: now });
    }
    await batch.commit();
  }
  // Audit trail.
  await db.collection('adminLogs').add({
    action: 'cleanup_arjuna_admin_product',
    adminDoc: ADMIN_DOC,
    deactivatedProducts: productTargets.filter((id) => mods.some((m) => m.collection === 'products' && m.id === id)),
    inventoryDeactivated: mods.filter((m) => m.collection === 'inventory').map((m) => m.id),
    seatsReleased: mods.filter((m) => m.collection === 'retailerSeatListings').map((m) => m.id),
    performedBy: 'script:cleanup-arjuna-admin-product',
    createdAt: now,
  });
  console.log(`✔ Applied ${mods.length} soft-delete update(s). Logged to adminLogs.`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
