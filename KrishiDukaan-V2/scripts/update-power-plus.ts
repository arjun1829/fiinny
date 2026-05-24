/**
 * Updates Power Plus products with real bottle images + marketing copy
 * sourced from https://karanarjun-power-plus.web.app/
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

const app = initializeApp({
  apiKey: 'AIzaSyDh_Y67TDJc2KLLJ8Wcc2JvEeHzmfVL778',
  authDomain: 'krishidukan-e8315.firebaseapp.com',
  projectId: 'krishidukan-e8315',
  storageBucket: 'krishidukan-e8315.firebasestorage.app',
  messagingSenderId: '650303885415',
  appId: '1:650303885415:web:7db7619260aa478b2b84c2',
});
const db = getFirestore(app);

const BASE = '/product-images/Product_Images';
const SHARED_DESCRIPTION =
  'KaranArjun Power Plus™ — premium biostimulant trusted by 75,800+ farmers. Stimulates deep root growth, increases soil organic carbon, and uses advanced water-retention technology so crops survive and thrive through dry periods. Improves fruit colour, natural shine and weight — yielding premium market prices. Works on grapes, pomegranates, onions, tomatoes, cotton, and most field/horticulture crops. Apply via foliar spray for rapid uptake or via drip irrigation for sustained release.';

const PRODUCTS = [
  {
    id: 'karanarjun-power-plus-1000-ml',
    name: 'Power Plus',
    fullName: 'Power Plus 1 L',
    price: 500,
    size: '1000 ML',
    image: `${BASE}/bottle-1l-Photoroom.png`,
    description: `${SHARED_DESCRIPTION} 1 L pack — perfect for small-scale testing or specialized crop sections.`,
    availability: [
      { storeId: 'karanarjun-karjat-132kv', stockLevel: '100' },
      { storeId: 'karanarjun-nandgaon', stockLevel: '100' },
    ],
  },
  {
    id: 'karanarjun-power-plus-3000-ml',
    image: `${BASE}/bottle-3l-Photoroom.png`,
    description: `${SHARED_DESCRIPTION} 3 L formulation — most popular pack size for medium farms.`,
  },
  {
    id: 'karanarjun-power-plus-5000-ml',
    image: `${BASE}/bottle-5l-Photoroom.png`,
    description: `${SHARED_DESCRIPTION} 5 L bulk formulation — best value for large-scale orchards and field crops.`,
  },
];

async function run() {
  // 1 L is new — full create
  await setDoc(doc(db, 'products', PRODUCTS[0].id), {
    ...PRODUCTS[0],
    category: 'fertilizers',
    stock: 'In Stock',
    store: 'Karan Arjun Krushi Seva Kendra - Karjat',
    distance: 'Nearby',
    manufacturerId: 'karanarjun-mfg',
    isMaster: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  console.log(`Upserted ${PRODUCTS[0].id}`);

  // 3 L and 5 L — update image + description only
  for (const p of PRODUCTS.slice(1)) {
    await updateDoc(doc(db, 'products', p.id), {
      image: p.image,
      description: p.description,
      updatedAt: serverTimestamp(),
    });
    console.log(`Updated ${p.id}`);
  }

  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
