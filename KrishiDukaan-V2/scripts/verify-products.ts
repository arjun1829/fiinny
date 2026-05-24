import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const app = initializeApp({
  apiKey: 'AIzaSyDh_Y67TDJc2KLLJ8Wcc2JvEeHzmfVL778',
  authDomain: 'krishidukan-e8315.firebaseapp.com',
  projectId: 'krishidukan-e8315',
  storageBucket: 'krishidukan-e8315.firebasestorage.app',
  messagingSenderId: '650303885415',
  appId: '1:650303885415:web:7db7619260aa478b2b84c2',
});
const db = getFirestore(app);

(async () => {
  const p = await getDocs(collection(db, 'products'));
  const s = await getDocs(collection(db, 'stores'));
  const ka = p.docs.filter((d) => (d.data() as any).manufacturerId === 'karanarjun-mfg');
  console.log(`products total: ${p.size}`);
  console.log(`products w/ manufacturerId=karanarjun-mfg: ${ka.length}`);
  console.log(`stores total: ${s.size}`);
  console.log('sample product:', ka[0]?.id, ka[0]?.data().name, ka[0]?.data().price);
  process.exit(0);
})();
