import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDh_Y67TDJc2KLLJ8Wcc2JvEeHzmfVL778",
  authDomain: "krishidukan-e8315.firebaseapp.com",
  projectId: "krishidukan-e8315",
  storageBucket: "krishidukan-e8315.firebasestorage.app",
  messagingSenderId: "650303885415",
  appId: "1:650303885415:web:7db7619260aa478b2b84c2",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function sleep(ms: number) {
  return new Promise(res => setTimeout(res, ms));
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(address)}&limit=1&countrycodes=in`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'krishidukan-geocoder/1.0 (admin@krishidukan.com)' },
    });
    const data = await res.json() as Array<{ lat: string; lon: string }>;
    if (data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch (e) {
    console.error('  Geocode error:', e);
  }
  return null;
}

function hasValidLocation(store: any): boolean {
  const loc = store.location;
  if (!loc) return false;
  const lat = loc.lat ?? loc.latitude;
  const lng = loc.lng ?? loc.longitude;
  return typeof lat === 'number' && typeof lng === 'number' && lat !== 0 && lng !== 0;
}

function buildSearchAddress(store: any): string {
  // Try progressively simpler forms to get a geocode hit
  const parts: string[] = [];
  if (store.address) parts.push(store.address);
  if (store.city) parts.push(store.city);
  if (store.state) parts.push(store.state);
  if (store.pincode) parts.push(store.pincode);
  parts.push('India');
  return parts.filter(Boolean).join(', ');
}

async function geocodeCollection(collectionName: string) {
  console.log(`\n📦 Fetching "${collectionName}" collection...`);
  const snap = await getDocs(collection(db, collectionName));
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`   Found ${docs.length} documents.`);

  const missing = docs.filter(s => !hasValidLocation(s));
  const already = docs.length - missing.length;
  console.log(`   ✅ ${already} already have coordinates, ⚠️  ${missing.length} need geocoding.`);

  let updated = 0;
  let failed: string[] = [];

  for (const store of missing) {
    const address = buildSearchAddress(store);
    if (!address || address.trim() === 'India') {
      console.log(`  ⏭  ${store.id} — no address, skipping`);
      failed.push(store.id);
      continue;
    }

    process.stdout.write(`  🔍 ${(store as any).name || (store as any).shopName || store.id} → "${address}" ... `);
    const coords = await geocodeAddress(address);

    if (coords) {
      await updateDoc(doc(db, collectionName, store.id), { location: coords });
      console.log(`${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)} ✅`);
      updated++;
    } else {
      const fallback = [(store as any).city, (store as any).state, 'India'].filter(Boolean).join(', ');
      if (fallback !== 'India') {
        process.stdout.write(`retry "${fallback}" ... `);
        const coords2 = await geocodeAddress(fallback);
        if (coords2) {
          await updateDoc(doc(db, collectionName, store.id), { location: coords2 });
          console.log(`${coords2.lat.toFixed(5)}, ${coords2.lng.toFixed(5)} ✅ (fallback)`);
          updated++;
        } else {
          console.log('❌ not found');
          failed.push(store.id);
        }
      } else {
        console.log('❌ not found');
        failed.push(store.id);
      }
    }

    await sleep(1100); // Nominatim rate limit: 1 req/sec
  }

  console.log(`   → Updated ${updated}, failed ${failed.length}`);
  if (failed.length > 0) failed.forEach(id => console.log(`      ❌ ${id}`));
  return { updated, failed };
}

async function main() {
  const r1 = await geocodeCollection('stores');
  const r2 = await geocodeCollection('retailers');
  console.log(`\n🎉 Done! stores: +${r1.updated}, retailers: +${r2.updated}`);
}

main().catch(console.error);
