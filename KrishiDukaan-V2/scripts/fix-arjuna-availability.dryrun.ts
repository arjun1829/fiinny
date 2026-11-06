/**
 * READ-ONLY dry run. Computes the CORRECTED availability[] for product B
 * (wa12qD0fM15cJU8aYvzk) by rebuilding each store entry's sellingPrice + variants
 * from the authoritative source (that store's active manufacturer_assigned copy,
 * or B's own listing). Prints a before/after diff. Writes NOTHING.
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, getDoc, doc, getDocs, query, collection, where } from 'firebase/firestore';

const app = initializeApp({
  apiKey: 'AIzaSyDh_Y67TDJc2KLLJ8Wcc2JvEeHzmfVL778',
  authDomain: 'krishidukan-e8315.firebaseapp.com', projectId: 'krishidukan-e8315',
  storageBucket: 'krishidukan-e8315.firebasestorage.app',
  messagingSenderId: '650303885415', appId: '1:650303885415:web:7db7619260aa478b2b84c2',
});
const db = getFirestore(app);
const B = 'wa12qD0fM15cJU8aYvzk';

type V = { unit: string; price: number; stock?: number };

(async () => {
  const snap = await getDoc(doc(db, 'products', B));
  const data = snap.data() as any;
  const av: any[] = Array.isArray(data.availability) ? data.availability : [];

  // Authoritative per-store price/variants: B's own listing + active assigned copies.
  const bySource = new Map<string, { price: number; variants?: V[]; storeName?: string; src: string }>();
  const addKey = (k: string | undefined, val: any) => { if (k) bySource.set(String(k), val); };

  // B's own store (ownerPhone / manufacturerPhone).
  const ownSelf = { price: Number(data.price) || 0, variants: data.variants as V[] | undefined, storeName: data.store, src: 'B.self' };
  addKey(data.ownerPhone, ownSelf);
  addKey(data.manufacturerPhone, ownSelf);
  addKey(data.ownerId, ownSelf);

  const copies = await getDocs(query(collection(db, 'products'), where('manufacturerProductId', '==', B), where('isActive', '==', true)));
  copies.forEach((d) => {
    const c = d.data() as any;
    const val = { price: Number(c.price) || 0, variants: c.variants as V[] | undefined, storeName: c.store, src: `copy:${d.id}` };
    addKey(c.ownerPhone, val);
    addKey(c.retailerPhone, val);
    addKey(c.ownerId, val);
    addKey(c.retailerId, val);
  });

  console.log(`B.availability entries: ${av.length}  |  authoritative sources: ${bySource.size}\n`);

  let changed = 0, orphan = 0;
  const corrected = av.map((e) => {
    const keys = [e.storeId, e.storePhone].map((x) => (x ? String(x) : '')).filter(Boolean);
    let auth: ReturnType<typeof bySource.get> | undefined;
    for (const k of keys) { auth = bySource.get(k); if (auth) break; }

    const name = e.storeName || keys[0];
    if (!auth) {
      orphan++;
      console.log(`  ORPHAN (no active copy)  ${name}  sellingPrice=${e.sellingPrice} variants=${e.variants ? 'Y' : 'N'}  → base-fallback ${Number(data.price)||0}`);
      // Fallback: use B's base variants/price so the base size is correct, not stale.
      const next = { ...e, sellingPrice: Number(data.price) || e.sellingPrice, variants: (data.variants as V[]) ?? e.variants };
      if (next.sellingPrice !== e.sellingPrice || (!e.variants && next.variants)) changed++;
      return next;
    }

    const next = { ...e, sellingPrice: auth.price || e.sellingPrice, ...(auth.variants ? { variants: auth.variants } : {}) };
    const priceDiff = next.sellingPrice !== e.sellingPrice;
    const varDiff = !e.variants && !!auth.variants;
    if (priceDiff || varDiff) {
      changed++;
      console.log(`  FIX  ${name}  sellingPrice ${e.sellingPrice} → ${next.sellingPrice}  variants ${e.variants ? 'Y' : 'N'} → ${next.variants ? 'Y' : 'N'}  [${auth.src}]`);
    }
    return next;
  });

  console.log(`\nSummary: ${changed} entr${changed === 1 ? 'y' : 'ies'} would change (${orphan} orphan with no active copy).`);
  console.log('No writes performed (dry run).');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
