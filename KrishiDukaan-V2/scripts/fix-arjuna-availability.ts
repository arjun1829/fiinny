/**
 * Repairs the stale `sellingPrice: 1311` entries on product B's availability[]
 * (wa12qD0fM15cJU8aYvzk). For each entry, resets sellingPrice + variants from the
 * authoritative source: that store's active manufacturer_assigned copy, or B's own
 * listing, or (orphan) B's base price/variants. It ONLY touches entries whose
 * sellingPrice or variants are stale — all other fields are preserved verbatim.
 *
 * Canonical product A (iPPif…) and every seller copy are left untouched; this
 * writes a single updateDoc to products/wa12q…'s availability array.
 *
 * Usage:
 *   npx tsx scripts/fix-arjuna-availability.ts            # dry run (no writes)
 *   npx tsx scripts/fix-arjuna-availability.ts --apply    # writes the fix
 *
 * Requires admin credentials (products writes are rules-gated):
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 *   (or run in a Google env with Application Default Credentials).
 */
import { cert, getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const B = 'wa12qD0fM15cJU8aYvzk';
const APPLY = process.argv.includes('--apply');

type V = { unit: string; price: number; stock?: number };

function initAdmin() {
  if (getApps().length) return;
  const projectId = process.env.FIREBASE_PROJECT_ID ?? 'krishidukan-e8315';
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (clientEmail && privateKey) {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  } else {
    initializeApp({ credential: applicationDefault(), projectId });
  }
}

(async () => {
  initAdmin();
  const db = getFirestore();

  const ref = db.collection('products').doc(B);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`products/${B} not found`);
  const data = snap.data() as any;
  const av: any[] = Array.isArray(data.availability) ? data.availability : [];

  // Authoritative per-store price/variants.
  const bySource = new Map<string, { price: number; variants?: V[]; src: string }>();
  const addKey = (k: string | undefined, v: any) => { if (k) bySource.set(String(k), v); };
  const ownSelf = { price: Number(data.price) || 0, variants: data.variants as V[] | undefined, src: 'B.self' };
  addKey(data.ownerPhone, ownSelf); addKey(data.manufacturerPhone, ownSelf); addKey(data.ownerId, ownSelf);

  const copies = await db.collection('products')
    .where('manufacturerProductId', '==', B).where('isActive', '==', true).get();
  copies.forEach((d) => {
    const c = d.data() as any;
    const v = { price: Number(c.price) || 0, variants: c.variants as V[] | undefined, src: `copy:${d.id}` };
    addKey(c.ownerPhone, v); addKey(c.retailerPhone, v); addKey(c.ownerId, v); addKey(c.retailerId, v);
  });

  const baseVariants = data.variants as V[] | undefined;
  const basePrice = Number(data.price) || 0;

  let changed = 0;
  const corrected = av.map((e) => {
    const keys = [e.storeId, e.storePhone].map((x) => (x ? String(x) : '')).filter(Boolean);
    let auth: { price: number; variants?: V[]; src: string } | undefined;
    for (const k of keys) { auth = bySource.get(k); if (auth) break; }

    const targetPrice = auth?.price || basePrice;
    const targetVariants = auth?.variants ?? baseVariants;

    const priceStale = typeof targetPrice === 'number' && targetPrice > 0 && e.sellingPrice !== targetPrice;
    const variantsMissing = !Array.isArray(e.variants) && Array.isArray(targetVariants);
    if (!priceStale && !variantsMissing) return e;

    changed++;
    const label = e.storeName || keys[0];
    console.log(`  FIX ${label}: sellingPrice ${e.sellingPrice} → ${targetPrice}` +
      `${variantsMissing ? ' (+variants)' : ''} [${auth?.src ?? 'base-fallback'}]`);
    return {
      ...e,
      ...(priceStale ? { sellingPrice: targetPrice } : {}),
      ...(variantsMissing ? { variants: targetVariants } : {}),
    };
  });

  console.log(`\n${changed} entr${changed === 1 ? 'y' : 'ies'} to update of ${av.length}.`);
  if (!changed) { console.log('Nothing to do.'); process.exit(0); }

  if (!APPLY) { console.log('Dry run — pass --apply to write.'); process.exit(0); }

  await ref.update({ availability: corrected });
  console.log(`✔ Wrote corrected availability[] to products/${B}.`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
