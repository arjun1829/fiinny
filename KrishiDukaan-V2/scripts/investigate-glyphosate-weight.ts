/**
 * READ-ONLY. Finds the "Bayer Roundup / Glyphosate 41% SL" product(s), prints
 * each variant's resolved weight, then for the 2-variant seller copy prints the
 * owner identity and the seller's deliverySettings + what each variant weight
 * resolves to against the slabs. Explains why the delivery slab is not applied.
 *
 * Usage:  npx tsx scripts/investigate-glyphosate-weight.ts
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';

function parseVariantWeightKg(variantUnit: string | undefined): number {
  if (!variantUnit) return 0;
  const s = variantUnit.trim();
  const kg = s.match(/^(\d+(?:\.\d+)?)\s*kg$/i);
  if (kg) return parseFloat(kg[1]);
  const g = s.match(/^(\d+(?:\.\d+)?)\s*g(?:m)?$/i);
  if (g) return parseFloat(g[1]) / 1000;
  const l = s.match(/^(\d+(?:\.\d+)?)\s*l(?:itre)?$/i);
  if (l) return parseFloat(l[1]);
  const ml = s.match(/^(\d+(?:\.\d+)?)\s*ml$/i);
  if (ml) return parseFloat(ml[1]) / 1000;
  return 0;
}
type Slab = { minKg: number; maxKg: number; charge: number };
function chargeFromSlabs(weightKg: number, slabs: Slab[]): number {
  const sorted = [...slabs].sort((a, b) => a.minKg - b.minKg);
  for (const slab of sorted) if (weightKg >= slab.minKg && weightKg < slab.maxKg) return slab.charge;
  if (sorted.length > 0) { const last = sorted[sorted.length - 1]; if (weightKg >= last.minKg) return last.charge; }
  return 0;
}

const app = initializeApp({
  apiKey: 'AIzaSyDh_Y67TDJc2KLLJ8Wcc2JvEeHzmfVL778',
  authDomain: 'krishidukan-e8315.firebaseapp.com', projectId: 'krishidukan-e8315',
  storageBucket: 'krishidukan-e8315.firebasestorage.app',
  messagingSenderId: '650303885415', appId: '1:650303885415:web:7db7619260aa478b2b84c2',
});
const db = getFirestore(app);

async function dumpDeliverySettings(id: string | undefined, label: string) {
  if (!id) { console.log(`   (no ${label} id)`); return; }
  const s = await getDoc(doc(db, 'deliverySettings', id));
  if (!s.exists()) { console.log(`   deliverySettings/${id} (${label}): DOES NOT EXIST`); return; }
  const d: any = s.data();
  console.log(`   deliverySettings/${id} (${label}):`);
  console.log(`      coverageType: ${d.coverageType ?? '—'}  sellerState: ${d.sellerState ?? '—'}`);
  console.log(`      weightSlabs:   ${JSON.stringify(d.weightSlabs ?? null)}`);
  console.log(`      inStateSlabs:  ${JSON.stringify(d.inStateSlabs ?? null)}`);
  console.log(`      outStateSlabs: ${JSON.stringify(d.outStateSlabs ?? null)}`);
  const legacy = Array.isArray(d.weightSlabs) ? d.weightSlabs : [];
  for (const w of [1, 5]) {
    console.log(`      chargeFromSlabs(${w}kg, weightSlabs) = ${chargeFromSlabs(w, legacy)}`);
  }
}

(async () => {
  const snap = await getDocs(collection(db, 'products'));
  const matches = snap.docs.filter((d) => {
    const n = String(d.data().name ?? '').toLowerCase();
    return n.includes('glyphosate') || n.includes('roundup');
  });

  for (const d of matches) {
    const data: any = d.data();
    const variants = Array.isArray(data.variants) ? data.variants : [];
    if (!(String(data.name).toLowerCase().includes('roundup') && variants.length === 2)) continue;
    console.log('═════════════════════════════════════════════');
    console.log(`PRODUCT ${d.id}  "${data.name}"`);
    console.log(`source: ${data.source}  isActive: ${data.isActive}  freeDelivery: ${data.freeDelivery ?? '—'}`);
    console.log('identity fields:');
    for (const k of ['ownerId','ownerPhone','ownerType','sellerId','sellerPhone','retailerId','retailerPhone','retailerDocId','manufacturerId','manufacturerPhone','assignedByAdmin']) {
      if (data[k] != null) console.log(`   ${k}: ${data[k]}`);
    }
    for (const v of variants) {
      const unit = v.unit ?? v.variantUnit ?? v.size ?? v.label;
      console.log(`   variant unit="${unit}" -> ${parseVariantWeightKg(unit)} kg  freeDelivery=${v.freeDelivery ?? '—'}`);
    }
    console.log('delivery settings lookups:');
    await dumpDeliverySettings(data.ownerPhone, 'ownerPhone');
    await dumpDeliverySettings(data.ownerId, 'ownerId');
    await dumpDeliverySettings(data.retailerPhone, 'retailerPhone');
    await dumpDeliverySettings(data.retailerId, 'retailerId');
    await dumpDeliverySettings(data.sellerPhone, 'sellerPhone');
    await dumpDeliverySettings(data.sellerId, 'sellerId');
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
