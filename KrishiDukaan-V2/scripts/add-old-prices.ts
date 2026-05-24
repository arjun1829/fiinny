/** Adds oldPrice (strikethrough MRP) to a curated set of products for that "deal" feel. */
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, updateDoc, serverTimestamp } from 'firebase/firestore';

const app = initializeApp({
  apiKey: 'AIzaSyDh_Y67TDJc2KLLJ8Wcc2JvEeHzmfVL778',
  authDomain: 'krishidukan-e8315.firebaseapp.com',
  projectId: 'krishidukan-e8315',
  storageBucket: 'krishidukan-e8315.firebasestorage.app',
  messagingSenderId: '650303885415',
  appId: '1:650303885415:web:7db7619260aa478b2b84c2',
});
const db = getFirestore(app);

const FIXES: Record<string, number> = {
  'karanarjun-power-plus-1000-ml': 600,
  'karanarjun-power-plus-3000-ml': 1500,
  'karanarjun-power-plus-5000-ml': 2400,
  'karanarjun-karate-100-ml': 120,
  'karanarjun-amistar-top-100-ml': 800,
  'karanarjun-npk-15-15-15-50-kg': 1350,
  'karanarjun-isabion-1000-ml': 1200,
  'karanarjun-humi-gold-1-kg': 750,
  'karanarjun-sticker-100-ml': 200,
  'karanarjun-nano-urea-std': 250,
};

(async () => {
  for (const [id, oldPrice] of Object.entries(FIXES)) {
    await updateDoc(doc(db, 'products', id), { oldPrice, updatedAt: serverTimestamp() });
    console.log(`  ${id} -> oldPrice ₹${oldPrice}`);
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
