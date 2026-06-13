import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const app = initializeApp({
  apiKey: 'AIzaSyDh_Y67TDJc2KLLJ8Wcc2JvEeHzmfVL778',
  authDomain: 'krishidukan-e8315.firebaseapp.com',
  projectId: 'krishidukan-e8315',
  storageBucket: 'krishidukan-e8315.firebasestorage.app',
  messagingSenderId: '650303885415',
  appId: '1:650303885415:web:7db7619260aa478b2b84c2',
});
const db = getFirestore(app);

(async () => {
  const snap = await getDocs(collection(db, 'products'));
  const all = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const fusilade = all.filter((p: any) =>
    String(p.name ?? '').toLowerCase().includes('fusilade')
  );

  // Count manufacturer_assigned copies pointing at each doc as manufacturerProductId
  const assignCountByProductId = new Map<string, number>();
  for (const p of all) {
    if (p.manufacturerProductId) {
      const k = p.manufacturerProductId as string;
      assignCountByProductId.set(k, (assignCountByProductId.get(k) ?? 0) + 1);
    }
  }

  const COPY_SOURCES = new Set(['retailer_inventory_copy', 'manufacturer_assigned', 'admin_assigned']);

  console.log(`\nFusilade docs (${fusilade.length} total):\n`);
  for (const p of fusilade) {
    const isCopy = COPY_SOURCES.has(p.source ?? '');
    const isCanonicalCandidate = !isCopy;
    const assignCount = assignCountByProductId.get(p.id) ?? 0;
    const hasImage = !!(p.image || (Array.isArray(p.images) && p.images.length));

    console.log(`ID:                   ${p.id}`);
    console.log(`Name:                 ${p.name}`);
    console.log(`isActive:             ${p.isActive !== false}`);
    console.log(`source:               ${p.source ?? '(none)'}`);
    console.log(`ownerId:              ${p.ownerId ?? '—'}`);
    console.log(`ownerType:            ${p.ownerType ?? '—'}`);
    console.log(`ownerPhone:           ${p.ownerPhone ?? p.retailerPhone ?? p.manufacturerPhone ?? '—'}`);
    console.log(`manufacturerId:       ${p.manufacturerId ?? '—'}`);
    console.log(`manufacturerProductId: ${p.manufacturerProductId ?? '—'}`);
    console.log(`originalProductId:    ${p.originalProductId ?? '—'}`);
    console.log(`retailerDocId:        ${p.retailerDocId ?? '—'}`);
    console.log(`price:                ₹${p.price ?? '—'}`);
    console.log(`hasImage:             ${hasImage}`);
    console.log(`IS COPY (excluded from raw dedup pool): ${isCopy}`);
    console.log(`IS CANONICAL CANDIDATE (enters dedup):  ${isCanonicalCandidate}`);
    console.log(`Copies pointing here (manufacturerProductId): ${assignCount}`);
    console.log('');
  }

  // ── fetchAllMarketplaceProducts results for "fusilade" ────────────────────
  const fusActive = fusilade.filter((p: any) => p.isActive !== false);
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`MARKETPLACE TAB (fetchAllMarketplaceProducts)`);
  console.log(`Query: products WHERE isActive == true  (no source/owner filter)`);
  console.log(`Client filter: p.ownerId !== manufacturerId && name.includes(searchQuery)`);
  console.log(`─`.repeat(60));
  console.log(`Total "fusilade" docs returned (before owner exclusion): ${fusActive.length}`);
  console.log(`Each of these appears as a separate row in the dropdown:\n`);
  for (const p of fusActive) {
    const isCopy = COPY_SOURCES.has(p.source ?? '');
    console.log(`  ${p.id}  src:${(p.source ?? '(none)').padEnd(28)} owner:${String(p.ownerId ?? '—').padEnd(26)} ₹${p.price}  isCopy:${isCopy}`);
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`YOUR PRODUCTS TAB (fetchManufacturerProducts)`);
  console.log(`Query: products WHERE ownerId == <manufacturerId> AND ownerType == manufacturer`);
  console.log(`Each manufacturer only sees their own docs — no cross-user duplicates in this tab`);
  console.log(`─`.repeat(60));

  process.exit(0);
})();
