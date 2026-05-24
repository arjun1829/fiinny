import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc, deleteField } from 'firebase/firestore';

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

const BAD_COORDS = { lat: 13.73543, lng: 80.18472 };

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function isWrongCoord(loc: any): boolean {
  if (!loc) return false;
  const lat = loc.lat ?? loc.latitude;
  const lng = loc.lng ?? loc.longitude;
  return (
    Math.abs(lat - BAD_COORDS.lat) < 0.001 &&
    Math.abs(lng - BAD_COORDS.lng) < 0.001
  );
}

function extractAddressString(store: any): string {
  // Try plain string address first
  if (typeof store.address === 'string' && store.address.trim()) {
    return store.address.trim();
  }
  // Address stored as object
  if (typeof store.address === 'object' && store.address) {
    const a = store.address;
    return [a.street, a.line1, a.line2, a.village, a.taluka, a.district, a.city, a.state, a.pincode]
      .filter(Boolean).join(', ');
  }
  // Fall back to top-level city/state/pincode fields
  const parts = [
    store.shopName || store.ownerName,
    store.village || store.taluka,
    store.district || store.city,
    store.state,
    store.pincode,
    'India'
  ];
  return parts.filter(Boolean).join(', ');
}

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(address)}&limit=1&countrycodes=in`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'krishidukan-geocoder/1.0' } });
    const data = await res.json() as Array<{ lat: string; lon: string }>;
    if (data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {}
  return null;
}

async function main() {
  console.log('📦 Fetching retailers...');
  const snap = await getDocs(collection(db, 'retailers'));
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));

  // Print first doc structure for debugging
  if (all.length > 0) {
    const sample = all[0];
    console.log('\nSample retailer fields:', Object.keys(sample));
    console.log('address field type:', typeof sample.address, '→', JSON.stringify(sample.address)?.slice(0, 120));
    console.log('');
  }

  const toFix = all.filter(s => isWrongCoord(s.location));
  console.log(`Found ${toFix.length} retailers with wrong coordinates. Re-geocoding...\n`);

  let updated = 0, failed: string[] = [];

  for (const store of toFix) {
    const address = extractAddressString(store);
    process.stdout.write(`  🔍 ${store.shopName || store.ownerName || store.id} → "${address.slice(0, 80)}" ... `);

    const coords = await geocode(address);
    if (coords) {
      await updateDoc(doc(db, 'retailers', store.id), { location: coords });
      console.log(`${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)} ✅`);
      updated++;
    } else {
      // Try just district/state
      const fallback = [store.district || store.city, store.state, 'Maharashtra', 'India'].filter(Boolean).join(', ');
      process.stdout.write(`retry "${fallback}" ... `);
      const c2 = await geocode(fallback);
      if (c2) {
        await updateDoc(doc(db, 'retailers', store.id), { location: c2 });
        console.log(`${c2.lat.toFixed(5)}, ${c2.lng.toFixed(5)} ✅ (fallback)`);
        updated++;
      } else {
        console.log('❌');
        failed.push(store.id);
      }
    }
    await sleep(1100);
  }

  console.log(`\n✅ Fixed ${updated} retailers.`);
  if (failed.length) {
    console.log(`❌ Still failed: ${failed.join(', ')}`);
  }
}

main().catch(console.error);
