import { initializeApp } from 'firebase/app';
import { getFirestore, doc, updateDoc } from 'firebase/firestore';

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

const STORE_UPDATES = [
  {
    id: 'karanarjun-karjat-132kv',
    name: 'Karan Arjun Krushi Seva Kendra - Karjat (132 KV)',
    location: { lat: 18.568057, lng: 74.996924 },
  },
  {
    id: 'karanarjun-nandgaon',
    name: 'Karan Arjun Krushi Seva Kendra - Nandgaon',
    location: { lat: 18.5911022, lng: 74.9256389 },
  },
];

async function fixStoreLocations() {
  for (const store of STORE_UPDATES) {
    const ref = doc(db, 'stores', store.id);
    await updateDoc(ref, { location: store.location });
    console.log(`✅ Updated ${store.name} → lat: ${store.location.lat}, lng: ${store.location.lng}`);
  }
  console.log('\nDone! Both stores now have correct GPS coordinates.');
}

fixStoreLocations().catch(console.error);
