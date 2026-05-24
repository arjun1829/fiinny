/**
 * Updates the `image` field on existing KaranArjun products in Firestore,
 * pointing them at the local files in public/product-images/Product_Images/.
 *
 * Run: npx tsx scripts/update-images.ts
 */
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

const BASE = '/product-images/Product_Images';
const enc = (s: string) => encodeURIComponent(s).replace(/%2F/g, '/');

// Map product (slug-of-name) -> image filename inside the folder.
// Where one product has multiple size variants, all variants share one image
// unless a size-specific one exists (NPK, Power Plus).
const FILE_BY_NAME: Record<string, string> = {
  'adama-2-4-d': 'Adama 2,4-D.jpg',
  aladdin: 'Aladin.jpg',
  alika: 'alika.jpg',
  alliance: 'alliance.jpg',
  'amaze-xl': 'amaze-xl.jpeg',
  'amistar-top': 'amistar-top.webp',
  ampligo: 'Ampligo.webp',
  biozyme: 'Biozyme.jpg',
  builder: 'Builder.png',
  'calaris-xtra': 'Calaris Xtra.jpeg',
  clavengo: 'clavengo.webp',
  cymbush: 'cymbush.jpg',
  decores: 'Decores.webp',
  evenso: 'Evenso.jpeg',
  'fertistar-05-35': 'fertistar.webp',
  filia: 'filia.webp',
  fusilade: 'Fusilade.jpg',
  fusion: 'Fusion.jpg',
  'glo-it': 'Glo-It.webp',
  'humi-gold': 'humi gold.png',
  humigrow: 'HUMIGROW.png',
  isabion: 'Isabion.jpg',
  kaneem: 'Kaneem.webp',
  karate: 'Karate.jpg',
  kazoo: 'Kazoo.jpg',
  microla: 'Microla.png',
  'nano-urea': 'Nano Urea.webp',
  'npk-15-15-15': 'NPK 151515.jpg',
  'npk-20-20-00': 'NPK 202000.png',
  rosentra: 'Rosentra.webp',
  silicon: 'Silicon.webp',
  sticker: 'Sticker.jpg',
  'sultan-505': 'Sultan 505.jpg',
  tizom: 'Tizom.jpeg',
  topas: 'Topas.jpg',
  'vibrance-integral': 'Vibrance Integral.webp',
};

// Size-specific overrides where the user supplied multiple images per product.
const FILE_BY_ID_OVERRIDE: Record<string, string> = {
  // NPK liquid (250 ML uses NPK.jpeg, 100 ML uses NPK1.webp)
  'karanarjun-npk-250-ml': 'NPK.jpeg',
  'karanarjun-npk-100-ml': 'NPK1.webp',
  // Power Plus — 3L uses Power Plus.png, 5L uses Power Plus1.png
  'karanarjun-power-plus-3000-ml': 'Power Plus.png',
  'karanarjun-power-plus-5000-ml': 'Power Plus1.png',
};

// Same row data as seed script — we just need the list of product IDs to update.
const ROWS = [
  ['Adama 2,4-D', '1000 ML'], ['Adama 2,4-D', '500 ML'],
  ['Aladdin', '250 ML'],
  ['Alika', '-'],
  ['Alliance', '100 ML'], ['Alliance', '250 ML'],
  ['Amaze XL', '250 ML'],
  ['Amistar Top', '100 ML'], ['Amistar Top', '200 ML'],
  ['Ampligo', '100 ML'],
  ['Biozyme', '500 ML'],
  ['Builder', '3000 ML'],
  ['Calaris Xtra', '14000 ML'], ['Calaris Xtra', '700 ML'],
  ['Clavengo', '1000 ML'], ['Clavengo', '500 ML'],
  ['Cymbush', '250 ML'],
  ['Decores', '250 ML'],
  ['Evenso', '100 ML'], ['Evenso', '250 ML'], ['Evenso', '500 ML'],
  ['Fertistar 05:35', '-'], ['Fertistar 05:35', '1000 ML'], ['Fertistar 05:35', '500 ML'],
  ['Filia', '250 ML'], ['Filia', '500 ML'],
  ['Fusilade', '250 ML'], ['Fusilade', '400 ML'],
  ['Fusion', '100 G'], ['Fusion', '250 G'],
  ['Glo-It', '100 ML'], ['Glo-It', '250 ML'],
  ['Humi Gold', '1 KG'], ['Humi Gold', '250 G'],
  ['Humigrow', '500 G'],
  ['Isabion', '1000 ML'], ['Isabion', '500 ML'],
  ['Kaneem', '250 ML'],
  ['Karate', '100 ML'], ['Karate', '250 ML'], ['Karate', '500 ML'],
  ['Kazoo', '1000 ML'], ['Kazoo', '250 ML'], ['Kazoo', '500 ML'],
  ['Microla', '1000 ML'],
  ['Nano Urea', '-'],
  ['NPK', '100 ML'], ['NPK', '250 ML'],
  ['NPK 15:15:15', '50 KG'],
  ['NPK 20:20:00', '50 KG'],
  ['Power Plus', '3000 ML'], ['Power Plus', '5000 ML'],
  ['Rosentra', '30 ML'], ['Rosentra', '80 ML'],
  ['Silicon', '250 G'],
  ['Sticker', '100 ML'], ['Sticker', '50 ML'],
  ['Sultan 505', '1000 ML'], ['Sultan 505', '250 ML'], ['Sultan 505', '500 ML'],
  ['Tizom', '-'],
  ['Topas', '100 ML'],
  ['Vibrance Integral', '-'], ['Vibrance Integral', '100 ML'],
] as const;

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function run() {
  let updated = 0;
  let missing = 0;
  for (const [name, size] of ROWS) {
    const nameSlug = slugify(name);
    const sizeSlug = size === '-' ? 'std' : slugify(size);
    const id = `karanarjun-${nameSlug}-${sizeSlug}`;
    const file = FILE_BY_ID_OVERRIDE[id] || FILE_BY_NAME[nameSlug];
    if (!file) {
      console.warn(`  ! no file mapped for ${id}`);
      missing++;
      continue;
    }
    const url = `${BASE}/${enc(file)}`;
    await updateDoc(doc(db, 'products', id), { image: url, updatedAt: serverTimestamp() });
    updated++;
    if (updated % 10 === 0) console.log(`  ...${updated}`);
  }
  console.log(`Updated ${updated} products. Missing mappings: ${missing}.`);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
