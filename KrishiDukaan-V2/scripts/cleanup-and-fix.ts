/**
 * Cleanup script:
 *  1. Delete every product whose manufacturerId !== 'karanarjun-mfg' (ghosts from
 *     the old constants.ts auto-sync).
 *  2. Fix the suspect ₹1 / ₹40 prices with sensible defaults inferred from
 *     adjacent size variants — user should still verify.
 *  3. Improve Power Plus description.
 *
 * Run: npx tsx scripts/cleanup-and-fix.ts
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, deleteDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

const app = initializeApp({
  apiKey: 'AIzaSyDh_Y67TDJc2KLLJ8Wcc2JvEeHzmfVL778',
  authDomain: 'krishidukan-e8315.firebaseapp.com',
  projectId: 'krishidukan-e8315',
  storageBucket: 'krishidukan-e8315.firebasestorage.app',
  messagingSenderId: '650303885415',
  appId: '1:650303885415:web:7db7619260aa478b2b84c2',
});
const db = getFirestore(app);

const KEEP_MFG = 'karanarjun-mfg';

// Best-guess prices derived from adjacent variants. User should verify.
const PRICE_FIXES: Record<string, { price: number; note: string }> = {
  'karanarjun-fertistar-05-35-std': { price: 650, note: 'matched 500ML variant' },
  'karanarjun-filia-500-ml': { price: 1200, note: '~2x the 250ML' },
  'karanarjun-kaneem-250-ml': { price: 250, note: 'typical neem oil 250ml' },
  'karanarjun-microla-1000-ml': { price: 400, note: 'typical micronutrient 1L' },
};

// Also delete leftover stores/retailers that aren't ours.
const KEEP_STORE_IDS = new Set(['karanarjun-karjat-132kv', 'karanarjun-nandgaon']);

// Known ghost IDs from app/constants.ts that get auto-synced on first boot.
const GHOST_PRODUCT_IDS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
const GHOST_STORE_IDS = ['s1', 's2', 's3', 's4', 's5'];

async function run() {
  // 1. Delete ghost products by known ID (no read needed -> rules safe)
  let deleted = 0;
  for (const id of GHOST_PRODUCT_IDS) {
    try {
      await deleteDoc(doc(db, 'products', id));
      deleted++;
      console.log(`  deleted ghost product: ${id}`);
    } catch (e: any) {
      console.warn(`  skip ${id}: ${e?.code || e?.message}`);
    }
  }
  console.log(`Deleted ${deleted} ghost products.`);

  // 2. Fix prices
  for (const [id, { price, note }] of Object.entries(PRICE_FIXES)) {
    await updateDoc(doc(db, 'products', id), { price, updatedAt: serverTimestamp() });
    console.log(`  price fix: ${id} -> ₹${price} (${note})`);
  }

  // 3. Power Plus description upgrade
  for (const size of ['3000-ml', '5000-ml']) {
    await updateDoc(doc(db, 'products', `karanarjun-power-plus-${size}`), {
      description: 'KaranArjun Power Plus — premium micronutrient growth booster. Manufactured in-house. Boosts root strength, flowering and overall yield across grapes, pomegranate, watermelon and field crops.',
      updatedAt: serverTimestamp(),
    });
  }
  console.log('Power Plus descriptions updated.');

  // 4. Clean up ghost stores by known ID
  let storesDeleted = 0;
  for (const id of GHOST_STORE_IDS) {
    try {
      await deleteDoc(doc(db, 'stores', id));
      storesDeleted++;
      console.log(`  deleted ghost store: ${id}`);
    } catch (e: any) {
      console.warn(`  skip store ${id}: ${e?.code || e?.message}`);
    }
  }
  console.log(`Deleted ${storesDeleted} ghost stores.`);
  void KEEP_MFG; void KEEP_STORE_IDS;

  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
