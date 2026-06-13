/**
 * One-time migration: sync inventory.sellingPrice into
 *   1. The retailer's product copy (products/{copyId}.price)
 *   2. The canonical/original product's availability[].sellingPrice
 *
 * Run with:
 *   npx ts-node --project tsconfig.json scripts/sync-seller-prices.ts
 *
 * Safe to re-run: only writes when the price actually differs.
 */

import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
} from 'firebase/firestore';

const app = initializeApp({
  apiKey: 'AIzaSyDh_Y67TDJc2KLLJ8Wcc2JvEeHzmfVL778',
  authDomain: 'krishidukan-e8315.firebaseapp.com',
  projectId: 'krishidukan-e8315',
  storageBucket: 'krishidukan-e8315.firebasestorage.app',
  messagingSenderId: '650303885415',
  appId: '1:650303885415:web:7db7619260aa478b2b84c2',
});
const db = getFirestore(app);

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);

  const [invSnap, prodSnap] = await Promise.all([
    getDocs(collection(db, 'inventory')),
    getDocs(collection(db, 'products')),
  ]);

  // Index all products by ID for fast lookup
  const productById = new Map<string, Record<string, unknown>>();
  for (const d of prodSnap.docs) {
    productById.set(d.id, d.data() as Record<string, unknown>);
  }

  let copyPriceFixed = 0;
  let availabilityFixed = 0;
  let skipped = 0;

  for (const invDoc of invSnap.docs) {
    const inv = invDoc.data() as Record<string, unknown>;
    const sellingPrice = typeof inv.sellingPrice === 'number' ? inv.sellingPrice : 0;
    const copyId = typeof inv.productId === 'string' ? inv.productId : '';
    if (!copyId || sellingPrice <= 0) { skipped++; continue; }

    const copy = productById.get(copyId);
    if (!copy) { skipped++; continue; }

    const COPY_SOURCES = new Set(['retailer_inventory_copy', 'manufacturer_assigned', 'admin_assigned']);
    const isCopy = COPY_SOURCES.has(String(copy.source ?? ''));
    if (!isCopy) { skipped++; continue; }

    // ── Step 1: Update the retailer's product copy price ──────────────────────
    const currentCopyPrice = typeof copy.price === 'number' ? copy.price : 0;
    if (currentCopyPrice !== sellingPrice) {
      console.log(
        `[copy] ${copyId} "${copy.name}" price: ${currentCopyPrice} → ${sellingPrice}`,
      );
      if (!DRY_RUN) {
        await updateDoc(doc(db, 'products', copyId), {
          price: sellingPrice,
        });
      }
      copyPriceFixed++;
      // Update the in-memory index so canonical merges below see the new price
      productById.set(copyId, { ...copy, price: sellingPrice });
    }

    // ── Step 2: Update the canonical product's availability[].sellingPrice ────
    const rootId = String(
      (copy.manufacturerProductId ?? copy.originalProductId) ?? '',
    );
    if (!rootId || rootId === copyId) { continue; }

    const ownerPhone = String(inv.retailerPhone ?? inv.ownerPhone ?? '');
    const ownerId = String(inv.ownerId ?? inv.retailerId ?? inv.retailerDocId ?? '');

    const rootData = productById.get(rootId);
    if (!rootData) continue;

    const av = Array.isArray(rootData.availability)
      ? (rootData.availability as Record<string, unknown>[])
      : [];

    const entryIdx = av.findIndex((a) => {
      const sid = String(a.storeId ?? '');
      const sp = String(a.storePhone ?? '');
      return (
        (ownerId && (sid === ownerId || sp === ownerId)) ||
        (ownerPhone && (sp === ownerPhone || sid === ownerPhone))
      );
    });

    if (entryIdx === -1) {
      // No matching entry — nothing to update (entry may not have been created yet)
      continue;
    }

    const entry = av[entryIdx];
    const currentAvPrice = typeof entry.sellingPrice === 'number' ? entry.sellingPrice : 0;
    if (currentAvPrice === sellingPrice) continue;

    console.log(
      `[availability] root=${rootId} "${rootData.name}" seller=${ownerPhone || ownerId} price: ${currentAvPrice} → ${sellingPrice}`,
    );

    const updatedAv = av.map((a, i) =>
      i === entryIdx ? { ...a, sellingPrice } : a,
    );

    if (!DRY_RUN) {
      await updateDoc(doc(db, 'products', rootId), { availability: updatedAv });
    }

    // Update in-memory index so subsequent iterations see the updated availability
    productById.set(rootId, { ...rootData, availability: updatedAv });
    availabilityFixed++;
  }

  console.log('\n── Summary ──────────────────────────────────────');
  console.log(`Copy price fields updated:        ${copyPriceFixed}`);
  console.log(`Availability entries updated:     ${availabilityFixed}`);
  console.log(`Skipped (no copy/price/source):   ${skipped}`);
  if (DRY_RUN) console.log('\nRe-run without --dry-run to apply writes.');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
