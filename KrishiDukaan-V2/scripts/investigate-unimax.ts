/**
 * READ-ONLY investigation of "Unimax Agri Biotechnologies". Writes NOTHING.
 *
 * Confirms why the brand page / "Manufactured by" / product count break for
 * this manufacturer by dumping the manufacturer doc + every product that
 * references it (by any identifier), and comparing against a working brand.
 *
 * Usage:  npx tsx scripts/investigate-unimax.ts
 */
import { initializeApp } from 'firebase/app';
import {
  getFirestore, collection, getDocs, getDoc, doc, query, where,
} from 'firebase/firestore';

const app = initializeApp({
  apiKey: 'AIzaSyDh_Y67TDJc2KLLJ8Wcc2JvEeHzmfVL778',
  authDomain: 'krishidukan-e8315.firebaseapp.com', projectId: 'krishidukan-e8315',
  storageBucket: 'krishidukan-e8315.firebasestorage.app',
  messagingSenderId: '650303885415', appId: '1:650303885415:web:7db7619260aa478b2b84c2',
});
const db = getFirestore(app);

const NEEDLE = 'unimax';

function norm(s: unknown): string {
  return String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function pick(d: Record<string, unknown>, keys: string[]) {
  const o: Record<string, unknown> = {};
  for (const k of keys) if (d[k] !== undefined) o[k] = d[k];
  return o;
}

(async () => {
  // ── 1. Manufacturer docs matching Unimax ──────────────────────────────────
  console.log('=== manufacturers collection ===');
  const mfrSnap = await getDocs(collection(db, 'manufacturers'));
  const unimaxMfrs = mfrSnap.docs.filter((d) => {
    const r = d.data() as Record<string, unknown>;
    return norm(r.businessName).includes(NEEDLE) || norm(r.ownerName).includes(NEEDLE) ||
      norm(r.slug).includes(NEEDLE) || norm(d.id).includes(NEEDLE);
  });
  console.log(`total manufacturers: ${mfrSnap.size}; matching "${NEEDLE}": ${unimaxMfrs.length}`);
  const mfrUids = new Set<string>();
  const mfrPhones = new Set<string>();
  for (const d of unimaxMfrs) {
    const r = d.data() as Record<string, unknown>;
    console.log(`\n  manufacturers/${d.id}`);
    console.log('   ', JSON.stringify(pick(r, [
      'uid', 'manufacturerId', 'phone', 'phoneNumber', 'slug', 'businessName', 'ownerName',
      'ownerType', 'role', 'establishedYear',
    ])));
    if (r.uid) mfrUids.add(String(r.uid));
    if (r.manufacturerId) mfrUids.add(String(r.manufacturerId));
    mfrPhones.add(d.id);
    // brandPages under phone and uid
    for (const key of [d.id, String(r.uid ?? ''), String(r.manufacturerId ?? '')].filter(Boolean)) {
      const bp = await getDoc(doc(db, 'brandPages', key));
      console.log(`    brandPages/${key}: ${bp.exists() ? 'EXISTS' : 'missing'}`);
    }
    // uidIndex for its uid
    if (r.uid) {
      try {
        const ui = await getDoc(doc(db, 'uidIndex', String(r.uid)));
        console.log(`    uidIndex/${r.uid}: ${ui.exists() ? JSON.stringify(ui.data()) : 'missing'}`);
      } catch (e) {
        console.log(`    uidIndex/${r.uid}: <read denied: ${(e as Error).message}>`);
      }
    }
  }

  // ── 2. Products referencing Unimax by name OR by any mfr identifier ────────
  console.log('\n=== products collection ===');
  const prodSnap = await getDocs(collection(db, 'products'));
  console.log(`total products: ${prodSnap.size}`);
  const ids = [...mfrUids, ...mfrPhones];
  const matches = prodSnap.docs.filter((d) => {
    const r = d.data() as Record<string, unknown>;
    const nameHit = norm(r.name).includes(NEEDLE) || norm(r.manufacturerName).includes(NEEDLE) ||
      norm(r.brand).includes(NEEDLE) || norm(r.manufacturer).includes(NEEDLE);
    const idHit = ids.some((id) =>
      String(r.manufacturerId ?? '') === id || String(r.ownerId ?? '') === id ||
      String(r.manufacturerPhone ?? '') === id || String(r.ownerPhone ?? '') === id);
    return nameHit || idHit;
  });
  console.log(`products referencing Unimax (name or id): ${matches.length}`);
  for (const d of matches) {
    const r = d.data() as Record<string, unknown>;
    console.log(`\n  products/${d.id}  "${r.name}"`);
    console.log('   ', JSON.stringify(pick(r, [
      'manufacturerId', 'manufacturerPhone', 'manufacturerName',
      'ownerId', 'ownerPhone', 'ownerType', 'retailerId', 'retailerPhone',
      'source', 'isActive', 'slug',
    ])));
  }

  // ── 3. Simulate the brand-page product query & the "Manufactured by" lookup ─
  console.log('\n=== resolution simulation ===');
  for (const uid of mfrUids) {
    const byMfrIdActive = await getDocs(query(
      collection(db, 'products'),
      where('manufacturerId', '==', uid),
      where('isActive', '==', true),
    ));
    const byOwner = await getDocs(query(
      collection(db, 'products'),
      where('ownerId', '==', uid),
      where('ownerType', '==', 'manufacturer'),
    ));
    const mfrByUid = await getDocs(query(
      collection(db, 'manufacturers'), where('uid', '==', uid),
    ));
    console.log(`  uid=${uid}:`);
    console.log(`    brand-page products[manufacturerId==uid & active]: ${byMfrIdActive.size}`);
    console.log(`    brand-page products[ownerId==uid & ownerType==manufacturer]: ${byOwner.size}`);
    console.log(`    ManufacturedBy manufacturers[uid==uid]: ${mfrByUid.size} ${mfrByUid.empty ? '(=> section renders no brand info)' : ''}`);
  }
  for (const phone of mfrPhones) {
    const byMfrIdActive = await getDocs(query(
      collection(db, 'products'),
      where('manufacturerId', '==', phone),
      where('isActive', '==', true),
    ));
    console.log(`  phone=${phone}: products[manufacturerId==phone & active]: ${byMfrIdActive.size}`);
  }

  // ── 3b. Classify the Unimax products by identifier form & listability ──────
  const REAL_UID = 'bApcqU2jIuOsxiMsxDI9JQFnjEz1';
  const PHONE = '+919637773785';
  const COPY = new Set(['retailer_inventory_copy', 'manufacturer_assigned', 'admin_assigned']);
  const isListable = (r: Record<string, unknown>) =>
    r.isActive !== false && !COPY.has(String(r.source ?? '')) && !!r.name && !!r.image &&
    Number.isFinite(Number(r.price));
  const bucket: Record<string, { total: number; active: number; listable: number; byName: Set<string> }> = {};
  const canonical: { id: string; name: string; mfrId: string; ownerType: string; source: string; isActive: boolean }[] = [];
  for (const d of matches) {
    const r = d.data() as Record<string, unknown>;
    const mid = String(r.manufacturerId ?? '');
    const key = mid === REAL_UID ? 'manufacturerId==REAL_UID' : mid === PHONE ? 'manufacturerId==PHONE' : `other(${mid})`;
    bucket[key] ??= { total: 0, active: 0, listable: 0, byName: new Set() };
    bucket[key].total++;
    if (r.isActive !== false) bucket[key].active++;
    if (isListable(r)) { bucket[key].listable++; }
    bucket[key].byName.add(String(r.name ?? ''));
    if (isListable(r)) canonical.push({ id: d.id, name: String(r.name ?? ''), mfrId: mid, ownerType: String(r.ownerType ?? ''), source: String(r.source ?? ''), isActive: r.isActive !== false });
  }
  console.log('\n=== Unimax products bucketed by manufacturerId form ===');
  for (const [k, v] of Object.entries(bucket)) {
    console.log(`  ${k}: total=${v.total} active=${v.active} listable=${v.listable} names={${[...v.byName].join(', ')}}`);
  }
  console.log(`\n=== CANONICAL (isListable) Unimax products: ${canonical.length} ===`);
  for (const c of canonical) console.log(`  products/${c.id} "${c.name}" mfrId=${c.mfrId} ownerType=${c.ownerType} source=${c.source || '<none>'}`);

  // ── 4. Working manufacturers for contrast: is uid a real Auth UID? ─────────
  console.log('\n=== all manufacturers: doc-id (phone) vs uid field ===');
  for (const d of mfrSnap.docs) {
    const r = d.data() as Record<string, unknown>;
    const uid = String(r.uid ?? '');
    const uidIsPhone = uid === d.id || /^\+?\d{10,}$/.test(uid);
    console.log(`  ${d.id}  uid=${uid || '<none>'}  ${uidIsPhone ? '  <-- uid LOOKS LIKE A PHONE' : ''}  (${String(r.businessName ?? '')})`);
  }

  console.log('\nDone (read-only).');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
