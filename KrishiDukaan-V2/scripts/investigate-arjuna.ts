/**
 * READ-ONLY investigation of "Arjuna" products. Writes NOTHING.
 *
 * Reads the whole `products` collection (allow read: if true), filters every
 * doc whose normalized name contains "arjun", and prints:
 *   - each matching doc's identity + classification (canonical vs copy)
 *   - name-group duplicate analysis
 *   - the two previously-identified IDs, re-verified against live data
 *   - related references: inventory, retailerSeatListings, productReviews,
 *     marketplaceCards / cardMembers, and availability[] store entries
 *
 * Usage:  npx tsx scripts/investigate-arjuna.ts
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

const KNOWN = { admin: 'wa12qD0fM15cJU8aYvzk', manufacturer: 'iPPifRMWbmq9VHxBC2tc' };
// EXACT normalized name of the target product. "karan arjun ..." products are a
// different, legitimate product line and must NOT be swept in.
const EXACT = 'arjuna';

const COPY_SOURCES = new Set(['admin_assigned', 'manufacturer_assigned', 'retailer_inventory_copy']);

function ts(v: any): string {
  if (!v) return '—';
  if (typeof v?.toDate === 'function') return v.toDate().toISOString().replace('T', ' ').slice(0, 19);
  return String(v);
}
function tsMillis(v: any): number {
  if (v && typeof v.toMillis === 'function') return v.toMillis();
  return 0;
}

(async () => {
  console.log('Reading products collection (read-only)…\n');
  const snap = await getDocs(collection(db, 'products'));
  console.log(`Total product docs: ${snap.size}\n`);

  type Row = {
    id: string; name: string; normalized: string; source: string; isActive: boolean;
    ownerId: string; ownerPhone: string; ownerType: string;
    manufacturerId: string; manufacturerPhone: string;
    retailerId: string; retailerPhone: string; retailerDocId: string;
    manufacturerProductId: string; originalProductId: string;
    assignedByAdmin: string; price: number; hasImage: boolean;
    availabilityLen: number; variantsLen: number;
    createdAt: string; createdMs: number; updatedAt: string;
  };

  const rows: Row[] = [];
  const availabilityStores = new Map<string, any[]>(); // docId -> availability

  snap.forEach((d) => {
    const r = d.data() as Record<string, any>;
    const normalized = String(r.name ?? '').toLowerCase().trim();
    if (normalized !== EXACT) return;
    availabilityStores.set(d.id, Array.isArray(r.availability) ? r.availability : []);
    rows.push({
      id: d.id,
      name: String(r.name ?? ''),
      normalized,
      source: String(r.source ?? '(none)'),
      isActive: r.isActive !== false,
      ownerId: String(r.ownerId ?? ''),
      ownerPhone: String(r.ownerPhone ?? ''),
      ownerType: String(r.ownerType ?? ''),
      manufacturerId: String(r.manufacturerId ?? ''),
      manufacturerPhone: String(r.manufacturerPhone ?? ''),
      retailerId: String(r.retailerId ?? ''),
      retailerPhone: String(r.retailerPhone ?? ''),
      retailerDocId: String(r.retailerDocId ?? ''),
      manufacturerProductId: String(r.manufacturerProductId ?? ''),
      originalProductId: String(r.originalProductId ?? ''),
      assignedByAdmin: String(r.assignedByAdmin ?? ''),
      price: Number(r.price ?? 0),
      hasImage: !!(r.image || (Array.isArray(r.images) && r.images.length)),
      availabilityLen: Array.isArray(r.availability) ? r.availability.length : 0,
      variantsLen: Array.isArray(r.variants) ? r.variants.length : 0,
      createdAt: ts(r.createdAt),
      createdMs: tsMillis(r.createdAt),
      updatedAt: ts(r.updatedAt),
    });
  });

  rows.sort((a, b) => a.createdMs - b.createdMs);

  console.log('═'.repeat(100));
  console.log(`  MATCHING DOCS (normalized name == "${EXACT}") : ${rows.length}`);
  console.log('═'.repeat(100));
  for (const r of rows) {
    const cls = COPY_SOURCES.has(r.source) ? 'COPY' : 'CANONICAL?';
    const flags = [
      r.isActive ? 'ACTIVE' : 'INACTIVE',
      r.hasImage ? 'img' : 'NO-IMG',
    ].join(' ');
    console.log(`\n• ${r.id}  "${r.name}"  [${cls}]`);
    console.log(`    source=${r.source}  ${flags}  price=₹${r.price}  availability=${r.availabilityLen}  variants=${r.variantsLen}`);
    console.log(`    owner=${r.ownerId || '—'} (${r.ownerType || '—'})  ownerPhone=${r.ownerPhone || '—'}`);
    console.log(`    manufacturerId=${r.manufacturerId || '—'}  retailerId=${r.retailerId || '—'}  retailerDocId=${r.retailerDocId || '—'}`);
    console.log(`    manufacturerProductId=${r.manufacturerProductId || '—'}  originalProductId=${r.originalProductId || '—'}  assignedByAdmin=${r.assignedByAdmin || '—'}`);
    console.log(`    createdAt=${r.createdAt}  updatedAt=${r.updatedAt}`);
  }

  // Group by normalized name
  console.log('\n' + '═'.repeat(100));
  console.log('  NAME-GROUP SUMMARY');
  console.log('═'.repeat(100));
  const byName = new Map<string, Row[]>();
  for (const r of rows) { (byName.get(r.normalized) ?? byName.set(r.normalized, []).get(r.normalized)!).push(r); }
  for (const [name, list] of byName) {
    const srcCount = new Map<string, number>();
    list.forEach(r => srcCount.set(r.source, (srcCount.get(r.source) ?? 0) + 1));
    const canon = list.filter(r => !COPY_SOURCES.has(r.source));
    console.log(`\n  "${name}"  total=${list.length}  active=${list.filter(r => r.isActive).length}  canonical-candidates=${canon.length}`);
    console.log(`    sources: ${Array.from(srcCount.entries()).map(([s, n]) => `${s}×${n}`).join(', ')}`);
  }

  // Re-verify the two known IDs
  console.log('\n' + '═'.repeat(100));
  console.log('  RE-VERIFY PREVIOUSLY IDENTIFIED IDS');
  console.log('═'.repeat(100));
  for (const [label, id] of Object.entries(KNOWN)) {
    const ds = await getDoc(doc(db, 'products', id));
    if (!ds.exists()) { console.log(`\n  [${label}] ${id} → NOT FOUND (already deleted?)`); continue; }
    const r = ds.data() as Record<string, any>;
    console.log(`\n  [${label}] ${id}`);
    console.log(`    name="${r.name}"  source=${r.source}  isActive=${r.isActive !== false}  price=₹${r.price}`);
    console.log(`    availability entries=${Array.isArray(r.availability) ? r.availability.length : 0}  variants=${Array.isArray(r.variants) ? r.variants.length : 0}`);
    console.log(`    owner=${r.ownerId ?? '—'} manufacturerId=${r.manufacturerId ?? '—'} originalProductId=${r.originalProductId ?? '—'} manufacturerProductId=${r.manufacturerProductId ?? '—'}`);
  }

  // Related references for every matching id + the two known ids
  const ids = Array.from(new Set([...rows.map(r => r.id), KNOWN.admin, KNOWN.manufacturer]));

  console.log('\n' + '═'.repeat(100));
  console.log('  RELATED REFERENCES (copies / inventory / seats / reviews pointing at these ids)');
  console.log('═'.repeat(100));

  // chunk helper for 'in' queries (max 30)
  const chunk = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

  // Product copies referencing any matching id via originalProductId / manufacturerProductId
  for (const field of ['originalProductId', 'manufacturerProductId'] as const) {
    let total = 0;
    for (const c of chunk(ids, 30)) {
      const qs = await getDocs(query(collection(db, 'products'), where(field, 'in', c)));
      qs.forEach(d => {
        const x = d.data() as any;
        console.log(`  products.${field}: copy ${d.id} source=${x.source} active=${x.isActive !== false} owner=${x.ownerId} → root=${x[field]}`);
        total++;
      });
    }
    if (!total) console.log(`  products.${field}: (none)`);
  }

  // Auth-gated collections: products is world-readable but these are not, so an
  // unauthenticated run reports "requires auth" instead of aborting.
  const safeRefs = async (label: string, run: () => Promise<number>) => {
    try {
      const n = await run();
      if (!n) console.log(`  ${label}: (none)`);
    } catch (e: any) {
      if (e?.code === 'permission-denied') console.log(`  ${label}: (requires auth — not readable unauthenticated)`);
      else console.log(`  ${label}: ERROR ${e?.message ?? e}`);
    }
  };

  await safeRefs('inventory', async () => {
    let total = 0;
    for (const c of chunk(ids, 30)) {
      for (const field of ['productId', 'originalProductId', 'manufacturerProductId'] as const) {
        const qs = await getDocs(query(collection(db, 'inventory'), where(field, 'in', c)));
        qs.forEach(d => { const x = d.data() as any; console.log(`  inventory.${field}: ${d.id} owner=${x.ownerId} isAvailable=${x.isAvailable} → ${x[field]}`); total++; });
      }
    }
    return total;
  });

  await safeRefs('retailerSeatListings', async () => {
    let total = 0;
    for (const c of chunk(ids, 30)) {
      for (const field of ['productId', 'manufacturerProductId'] as const) {
        const qs = await getDocs(query(collection(db, 'retailerSeatListings'), where(field, 'in', c)));
        qs.forEach(d => { const x = d.data() as any; console.log(`  retailerSeatListings.${field}: ${d.id} status=${x.status} owner=${x.ownerId} → ${x[field]}`); total++; });
      }
    }
    return total;
  });

  await safeRefs('productReviews', async () => {
    let total = 0;
    for (const c of chunk(ids, 30)) {
      const qs = await getDocs(query(collection(db, 'productReviews'), where('catalogId', 'in', c)));
      qs.forEach(d => { const x = d.data() as any; console.log(`  productReviews: ${d.id} rating=${x.rating} → ${x.catalogId}`); total++; });
    }
    return total;
  });

  // marketplaceCards + cardMembers for nameKey 'arjuna' variations seen
  console.log('\n  marketplaceCards / cardMembers:');
  await safeRefs('cardMembers', async () => {
    let total = 0;
    for (const name of byName.keys()) {
      const cm = await getDocs(query(collection(db, 'cardMembers'), where('nameKey', '==', name)));
      console.log(`    nameKey="${name}": cardMembers=${cm.size}  memberIds=[${cm.docs.map(d => d.id).join(', ')}]`);
      total += cm.size;
    }
    return total;
  });

  // availability store-id breakdown for the admin doc
  console.log('\n  availability[] store breakdown for known docs:');
  for (const [label, id] of Object.entries(KNOWN)) {
    const av = availabilityStores.get(id);
    if (!av) continue;
    console.log(`    [${label}] ${id}: ${av.length} entries`);
    const onlineN = av.filter((e: any) => e.isOnline === true).length;
    console.log(`      online=${onlineN}  offline/unset=${av.length - onlineN}`);
  }

  console.log('\nDone. (read-only — no writes performed)\n');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
