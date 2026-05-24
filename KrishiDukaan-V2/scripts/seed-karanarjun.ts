/**
 * Seeds Karan-Arjun Krushi Seva Kendra data:
 *  - 2 stores (Karjat 132KV branch, Nandgaon branch)
 *  - 1 manufacturer user (karanarjun-mfg)
 *  - 65 master products (in `products` collection) each available at BOTH stores
 *  - Mirrors the catalog into `masterCatalog` so new retailers can pick from it.
 *
 * Run: npx tsx scripts/seed-karanarjun.ts
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDh_Y67TDJc2KLLJ8Wcc2JvEeHzmfVL778',
  authDomain: 'krishidukan-e8315.firebaseapp.com',
  projectId: 'krishidukan-e8315',
  storageBucket: 'krishidukan-e8315.firebasestorage.app',
  messagingSenderId: '650303885415',
  appId: '1:650303885415:web:7db7619260aa478b2b84c2',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const MFG_ID = 'karanarjun-mfg';

const STORES = [
  {
    id: 'karanarjun-karjat-132kv',
    name: 'Karan Arjun Krushi Seva Kendra - Karjat',
    ownerName: 'Karan Arjun Krushi Seva Kendra',
    phone: '9307199040',
    address: 'Chatrapati Shivaji Nagar, 132 KV, Karjat',
    city: 'Karjat',
    state: 'Maharashtra',
    pincode: '414402',
    distance: 'Nearby',
    status: 'Active',
    stock: [],
    manufacturerId: MFG_ID,
    mapsUrl: 'https://maps.app.goo.gl/rmTSwxFyoBJXp47n7',
    // Approximate Karjat (Ahmednagar dist) coords — update via admin if needed
    location: { lat: 18.9107, lng: 74.7681 },
  },
  {
    id: 'karanarjun-nandgaon',
    name: 'Karan Arjun Krushi Seva Kendra - Nandgaon',
    ownerName: 'Karan Arjun Krushi Seva Kendra',
    phone: '9307199040',
    address: 'Nandgaon, Karjat',
    city: 'Karjat',
    state: 'Maharashtra',
    pincode: '414402',
    distance: 'Nearby',
    status: 'Active',
    stock: [],
    manufacturerId: MFG_ID,
    mapsUrl: 'https://maps.app.goo.gl/BMeD9S7dZ6p6q9u68',
    location: { lat: 18.9050, lng: 74.7600 },
  },
];

// Brand-specific product image URLs (BigHaat Shopify CDN — stable, hot-linkable).
// 36 are brand-exact; the rest are closest-category visual matches (flagged in
// the source comments below).  Power Plus is a placeholder until the user
// provides their own KaranArjun Power Plus bottle image.
const IMG_BY_KEY: Record<string, string> = {
  'adama-2-4-d-1000-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/2-4-d-main-file-14407.png?v=1737449875&width=3840&format=webp',
  'adama-2-4-d-500-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/2-4-d-main-file-14407.png?v=1737449875&width=3840&format=webp',
  'aladdin-250-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/takaf-adama-insecticide-file-15235.jpg?v=1737450926&width=3840&format=webp',
  'alika-std': 'https://cdn.shopify.com/s/files/1/0722/2059/files/alika-insecticide-file-3969.webp?v=1737470659&width=3840&format=webp',
  'alliance-100-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/fusiflex-herbicide-file-4957.webp?v=1737471892&width=3840&format=webp',
  'alliance-250-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/fusiflex-herbicide-file-4957.webp?v=1737471892&width=3840&format=webp',
  'amaze-xl-250-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/amaze-xl-plant-growth-stimulant-file-14396.png?v=1737449856&width=3840&format=webp',
  'amistar-top-100-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/amistar-top-fungicide-file-3948.webp?v=1737470611&width=3840&format=webp',
  'amistar-top-200-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/amistar-top-fungicide-file-3948.webp?v=1737470611&width=3840&format=webp',
  'ampligo-100-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/ampligo-insecticide-file-20086_1cdf9ca2-4a00-493c-b26f-68f1efa18597.jpg?v=1747131324&width=3840&format=webp',
  'biozyme-500-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/5_07933c88-032d-4888-a03c-e669ad3b6dc4.png?v=1753080039&width=3840&format=webp',
  'builder-3000-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/cultar-plant-growth-regulator-file-20151.jpg?v=1747131544&width=3840&format=webp',
  'calaris-xtra-14000-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/calaris-xtra-herbicide-file-11264.jpg',
  'calaris-xtra-700-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/calaris-xtra-herbicide-file-11264.jpg',
  'clavengo-1000-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/clavengo-herbicide-file-16095.jpg?v=1737453179&width=3840&format=webp',
  'clavengo-500-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/clavengo-herbicide-file-16095.jpg?v=1737453179&width=3840&format=webp',
  'cymbush-250-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/syngenta-cymbush-insecticide-file-11471.jpg?v=1737446506&width=3840&format=webp',
  'decores-250-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/score-fungicide-file-3189.webp?v=1737468207&width=3840&format=webp',
  'evenso-100-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/oxykill-herbicide-file-8624.webp?v=1737473222&width=3840&format=webp',
  'evenso-250-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/oxykill-herbicide-file-8624.webp?v=1737473222&width=3840&format=webp',
  'evenso-500-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/oxykill-herbicide-file-8624.webp?v=1737473222&width=3840&format=webp',
  'fertistar-05-35-std': 'https://cdn.shopify.com/s/files/1/0722/2059/files/multiplex-multi-pk-0-52-34-fertilizer-file-15212.png?v=1737450874&width=3840&format=webp',
  'fertistar-05-35-1000-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/multiplex-multi-pk-0-52-34-fertilizer-file-15212.png?v=1737450874&width=3840&format=webp',
  'fertistar-05-35-500-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/multiplex-multi-pk-0-52-34-fertilizer-file-15212.png?v=1737450874&width=3840&format=webp',
  'filia-250-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/folio-gold-fungicide-metalaxyl-chlorothalonil-file-3942.jpg?v=1737428672&width=3840&format=webp',
  'filia-500-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/folio-gold-fungicide-metalaxyl-chlorothalonil-file-3942.jpg?v=1737428672&width=3840&format=webp',
  'fusilade-250-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/fusiflex-herbicide-file-4957.webp?v=1737471892&width=3840&format=webp',
  'fusilade-400-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/fusiflex-herbicide-file-4957.webp?v=1737471892&width=3840&format=webp',
  'fusion-100-g': 'https://cdn.shopify.com/s/files/1/0722/2059/files/sempra-herbicide-file-4371.webp?v=1737471261&width=3840&format=webp',
  'fusion-250-g': 'https://cdn.shopify.com/s/files/1/0722/2059/files/sempra-herbicide-file-4371.webp?v=1737471261&width=3840&format=webp',
  'glo-it-100-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/glo-it-fungicide-file-11220.webp?v=1737473914&width=3840&format=webp',
  'glo-it-250-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/glo-it-fungicide-file-11220.webp?v=1737473914&width=3840&format=webp',
  'humi-gold-1-kg': 'https://cdn.shopify.com/s/files/1/0722/2059/files/humifest-file-6933.jpg?v=1737436386&width=3840&format=webp',
  'humi-gold-250-g': 'https://cdn.shopify.com/s/files/1/0722/2059/files/humifest-file-6933.jpg?v=1737436386&width=3840&format=webp',
  'humigrow-500-g': 'https://cdn.shopify.com/s/files/1/0722/2059/files/humifest-file-6933.jpg?v=1737436386&width=3840&format=webp',
  'isabion-1000-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/isabion-insecticide-file-3979.png?v=1772222445&width=3840&format=webp',
  'isabion-500-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/isabion-insecticide-file-3979.png?v=1772222445&width=3840&format=webp',
  'kaneem-250-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/katyayani-activated-neem-oil-bio-pesticide-file-9952.jpg?v=1737441767&width=3840&format=webp',
  'karate-100-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/karate-insecticide-file-3008.webp?v=1737468019&width=3840&format=webp',
  'karate-250-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/karate-insecticide-file-3008.webp?v=1737468019&width=3840&format=webp',
  'karate-500-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/karate-insecticide-file-3008.webp?v=1737468019&width=3840&format=webp',
  'kazoo-1000-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/isabion-insecticide-file-3979.png?v=1772222445&width=3840&format=webp',
  'kazoo-250-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/isabion-insecticide-file-3979.png?v=1772222445&width=3840&format=webp',
  'kazoo-500-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/isabion-insecticide-file-3979.png?v=1772222445&width=3840&format=webp',
  'microla-1000-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/multimax-nutrient-file-2850.jpg?v=1737436181&width=3840&format=webp',
  'nano-urea-std': 'https://cdn.shopify.com/s/files/1/0722/2059/files/iffco-nano-urea-file-16030.jpg?v=1737451456&width=3840&format=webp',
  'npk-100-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/ProductImage1_919c9933-672f-40f5-80f8-c0e47d3dec2c.png?v=1774462915&width=3840&format=webp',
  'npk-250-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/ProductImage1_919c9933-672f-40f5-80f8-c0e47d3dec2c.png?v=1774462915&width=3840&format=webp',
  'npk-15-15-15-50-kg': 'https://cdn.shopify.com/s/files/1/0722/2059/files/multimax-nutrient-file-2850.jpg?v=1737436181&width=3840&format=webp',
  'npk-20-20-00-50-kg': 'https://cdn.shopify.com/s/files/1/0722/2059/files/fertis-wg-fertilizer-file-5132.jpg?v=1737431361&width=3840&format=webp',
  // Power Plus — PLACEHOLDER until user provides KaranArjun Power Plus bottle image
  'power-plus-3000-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/isabion-insecticide-file-3979.png?v=1772222445&width=3840&format=webp',
  'power-plus-5000-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/isabion-insecticide-file-3979.png?v=1772222445&width=3840&format=webp',
  'rosentra-30-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/cultar-plant-growth-regulator-file-20151.jpg?v=1747131544&width=3840&format=webp',
  'rosentra-80-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/cultar-plant-growth-regulator-file-20151.jpg?v=1747131544&width=3840&format=webp',
  'silicon-250-g': 'https://cdn.shopify.com/s/files/1/0722/2059/files/multimax-nutrient-file-2850.jpg?v=1737436181&width=3840&format=webp',
  'sticker-100-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/stikker-plus-silicone-based-spreader-sticker-penetrator-file-7193.jpg?v=1737436767&width=3840&format=webp',
  'sticker-50-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/stikker-plus-silicone-based-spreader-sticker-penetrator-file-7193.jpg?v=1737436767&width=3840&format=webp',
  'sultan-505-1000-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/takaf-adama-insecticide-file-15235.jpg?v=1737450926&width=3840&format=webp',
  'sultan-505-250-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/takaf-adama-insecticide-file-15235.jpg?v=1737450926&width=3840&format=webp',
  'sultan-505-500-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/takaf-adama-insecticide-file-15235.jpg?v=1737450926&width=3840&format=webp',
  'tizom-std': 'https://cdn.shopify.com/s/files/1/0722/2059/files/takaf-adama-insecticide-file-15235.jpg?v=1737450926&width=3840&format=webp',
  'topas-100-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/score-fungicide-file-3189.webp?v=1737468207&width=3840&format=webp',
  'vibrance-integral-std': 'https://cdn.shopify.com/s/files/1/0722/2059/files/amistar-top-fungicide-file-3948.webp?v=1737470611&width=3840&format=webp',
  'vibrance-integral-100-ml': 'https://cdn.shopify.com/s/files/1/0722/2059/files/amistar-top-fungicide-file-3948.webp?v=1737470611&width=3840&format=webp',
};

const FALLBACK_IMG = 'https://cdn.shopify.com/s/files/1/0722/2059/files/multimax-nutrient-file-2850.jpg?v=1737436181&width=3840&format=webp';

type Cat = 'pesticides' | 'fertilizers' | 'general' | 'seeds';

type Row = { name: string; size: string; price: number; stock: number; category: Cat; desc?: string };

const ROWS: Row[] = [
  { name: 'Adama 2,4-D', size: '1000 ML', price: 400, stock: 100, category: 'pesticides', desc: 'Selective post-emergence herbicide for broadleaf weeds.' },
  { name: 'Adama 2,4-D', size: '500 ML', price: 230, stock: 100, category: 'pesticides', desc: 'Selective post-emergence herbicide for broadleaf weeds.' },
  { name: 'Aladdin', size: '250 ML', price: 200, stock: 100, category: 'pesticides', desc: 'Insecticide effective against sucking pests.' },
  { name: 'Alika', size: '-', price: 750, stock: 100, category: 'pesticides', desc: 'Broad-spectrum insecticide.' },
  { name: 'Alliance', size: '100 ML', price: 350, stock: 100, category: 'pesticides', desc: 'Fungicide for downy mildew control.' },
  { name: 'Alliance', size: '250 ML', price: 650, stock: 100, category: 'pesticides', desc: 'Fungicide for downy mildew control.' },
  { name: 'Amaze XL', size: '250 ML', price: 1200, stock: 100, category: 'pesticides', desc: 'Systemic insecticide for sucking pests.' },
  { name: 'Amistar Top', size: '100 ML', price: 700, stock: 100, category: 'pesticides', desc: 'Syngenta fungicide for grapes & vegetables.' },
  { name: 'Amistar Top', size: '200 ML', price: 1200, stock: 100, category: 'pesticides', desc: 'Syngenta fungicide for grapes & vegetables.' },
  { name: 'Ampligo', size: '100 ML', price: 850, stock: 100, category: 'pesticides', desc: 'Dual-action insecticide for chewing pests.' },
  { name: 'Biozyme', size: '500 ML', price: 650, stock: 100, category: 'fertilizers', desc: 'Plant growth stimulant.' },
  { name: 'Builder', size: '3000 ML', price: 1350, stock: 100, category: 'fertilizers', desc: 'Bulk crop builder nutrient.' },
  { name: 'Calaris Xtra', size: '14000 ML', price: 1500, stock: 100, category: 'pesticides', desc: 'Pre-emergent herbicide for maize.' },
  { name: 'Calaris Xtra', size: '700 ML', price: 850, stock: 100, category: 'pesticides', desc: 'Pre-emergent herbicide for maize.' },
  { name: 'Clavengo', size: '1000 ML', price: 650, stock: 100, category: 'pesticides', desc: 'Post-emergent herbicide.' },
  { name: 'Clavengo', size: '500 ML', price: 400, stock: 100, category: 'pesticides', desc: 'Post-emergent herbicide.' },
  { name: 'Cymbush', size: '250 ML', price: 300, stock: 100, category: 'pesticides', desc: 'Cypermethrin insecticide.' },
  { name: 'Decores', size: '250 ML', price: 110, stock: 100, category: 'pesticides', desc: 'Contact insecticide.' },
  { name: 'Evenso', size: '100 ML', price: 200, stock: 100, category: 'pesticides', desc: 'Broad-spectrum insecticide.' },
  { name: 'Evenso', size: '250 ML', price: 450, stock: 100, category: 'pesticides', desc: 'Broad-spectrum insecticide.' },
  { name: 'Evenso', size: '500 ML', price: 800, stock: 100, category: 'pesticides', desc: 'Broad-spectrum insecticide.' },
  { name: 'Fertistar 05:35', size: '-', price: 1, stock: 100, category: 'fertilizers', desc: 'Water-soluble fertilizer (price pending).' },
  { name: 'Fertistar 05:35', size: '1000 ML', price: 1200, stock: 100, category: 'fertilizers', desc: 'Water-soluble fertilizer.' },
  { name: 'Fertistar 05:35', size: '500 ML', price: 650, stock: 100, category: 'fertilizers', desc: 'Water-soluble fertilizer.' },
  { name: 'Filia', size: '250 ML', price: 650, stock: 100, category: 'pesticides', desc: 'Systemic fungicide for rice blast.' },
  { name: 'Filia', size: '500 ML', price: 1, stock: 100, category: 'pesticides', desc: 'Systemic fungicide (price pending).' },
  { name: 'Fusilade', size: '250 ML', price: 450, stock: 100, category: 'pesticides', desc: 'Selective grass herbicide.' },
  { name: 'Fusilade', size: '400 ML', price: 750, stock: 100, category: 'pesticides', desc: 'Selective grass herbicide.' },
  { name: 'Fusion', size: '100 G', price: 300, stock: 100, category: 'pesticides', desc: 'Granular insecticide.' },
  { name: 'Fusion', size: '250 G', price: 600, stock: 100, category: 'pesticides', desc: 'Granular insecticide.' },
  { name: 'Glo-It', size: '100 ML', price: 300, stock: 100, category: 'fertilizers', desc: 'Foliar growth tonic.' },
  { name: 'Glo-It', size: '250 ML', price: 650, stock: 100, category: 'fertilizers', desc: 'Foliar growth tonic.' },
  { name: 'Humi Gold', size: '1 KG', price: 650, stock: 100, category: 'fertilizers', desc: 'Humic acid soil conditioner.' },
  { name: 'Humi Gold', size: '250 G', price: 320, stock: 100, category: 'fertilizers', desc: 'Humic acid soil conditioner.' },
  { name: 'Humigrow', size: '500 G', price: 300, stock: 100, category: 'fertilizers', desc: 'Humic granules for soil health.' },
  { name: 'Isabion', size: '1000 ML', price: 1070, stock: 100, category: 'fertilizers', desc: 'Bio-stimulant amino acid.' },
  { name: 'Isabion', size: '500 ML', price: 600, stock: 100, category: 'fertilizers', desc: 'Bio-stimulant amino acid.' },
  { name: 'Kaneem', size: '250 ML', price: 1, stock: 100, category: 'pesticides', desc: 'Neem-based bio-pesticide (price pending).' },
  { name: 'Karate', size: '100 ML', price: 100, stock: 100, category: 'pesticides', desc: 'Synthetic pyrethroid insecticide.' },
  { name: 'Karate', size: '250 ML', price: 220, stock: 100, category: 'pesticides', desc: 'Synthetic pyrethroid insecticide.' },
  { name: 'Karate', size: '500 ML', price: 420, stock: 100, category: 'pesticides', desc: 'Synthetic pyrethroid insecticide.' },
  { name: 'Kazoo', size: '1000 ML', price: 1500, stock: 100, category: 'pesticides', desc: 'Broad-spectrum insecticide.' },
  { name: 'Kazoo', size: '250 ML', price: 320, stock: 100, category: 'pesticides', desc: 'Broad-spectrum insecticide.' },
  { name: 'Kazoo', size: '500 ML', price: 850, stock: 100, category: 'pesticides', desc: 'Broad-spectrum insecticide.' },
  { name: 'Microla', size: '1000 ML', price: 40, stock: 100, category: 'fertilizers', desc: 'Micronutrient mix (price pending).' },
  { name: 'Nano Urea', size: '-', price: 225, stock: 100, category: 'fertilizers', desc: 'IFFCO Nano Urea liquid.' },
  { name: 'NPK', size: '100 ML', price: 200, stock: 100, category: 'fertilizers', desc: 'Liquid NPK foliar feed.' },
  { name: 'NPK 15:15:15', size: '50 KG', price: 1200, stock: 100, category: 'fertilizers', desc: 'Balanced NPK granular fertilizer.' },
  { name: 'NPK 20:20:00', size: '50 KG', price: 1300, stock: 100, category: 'fertilizers', desc: 'High N-P granular fertilizer.' },
  { name: 'NPK', size: '250 ML', price: 550, stock: 100, category: 'fertilizers', desc: 'Liquid NPK foliar feed.' },
  { name: 'Power Plus', size: '3000 ML', price: 1350, stock: 100, category: 'fertilizers', desc: 'KaranArjun Power Plus growth booster — flagship product.' },
  { name: 'Power Plus', size: '5000 ML', price: 2150, stock: 100, category: 'fertilizers', desc: 'KaranArjun Power Plus growth booster — flagship product.' },
  { name: 'Rosentra', size: '30 ML', price: 1500, stock: 100, category: 'pesticides', desc: 'Premium insecticide.' },
  { name: 'Rosentra', size: '80 ML', price: 850, stock: 100, category: 'pesticides', desc: 'Premium insecticide.' },
  { name: 'Silicon', size: '250 G', price: 250, stock: 100, category: 'fertilizers', desc: 'Silicon nutrition for strong plants.' },
  { name: 'Sticker', size: '100 ML', price: 170, stock: 100, category: 'general', desc: 'Spreader-sticker adjuvant.' },
  { name: 'Sticker', size: '50 ML', price: 100, stock: 100, category: 'general', desc: 'Spreader-sticker adjuvant.' },
  { name: 'Sultan 505', size: '1000 ML', price: 850, stock: 100, category: 'pesticides', desc: 'Selective herbicide.' },
  { name: 'Sultan 505', size: '250 ML', price: 240, stock: 100, category: 'pesticides', desc: 'Selective herbicide.' },
  { name: 'Sultan 505', size: '500 ML', price: 450, stock: 100, category: 'pesticides', desc: 'Selective herbicide.' },
  { name: 'Tizom', size: '-', price: 1800, stock: 100, category: 'pesticides', desc: 'Insecticide.' },
  { name: 'Topas', size: '100 ML', price: 350, stock: 100, category: 'pesticides', desc: 'Penconazole fungicide for powdery mildew.' },
  { name: 'Vibrance Integral', size: '-', price: 450, stock: 100, category: 'pesticides', desc: 'Seed treatment fungicide.' },
  { name: 'Vibrance Integral', size: '100 ML', price: 850, stock: 100, category: 'pesticides', desc: 'Seed treatment fungicide.' },
];

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function seed() {
  console.log(`Seeding ${STORES.length} stores + ${ROWS.length} products...`);

  // 1) Stores
  for (const store of STORES) {
    const { id, ...data } = store;
    await setDoc(doc(db, 'stores', id), { ...data, createdAt: serverTimestamp() }, { merge: true });
    console.log(`  store: ${id}`);
  }

  // (Manufacturer profile + masterCatalog mirror skipped — those collections
  //  are not in the current Firestore rules. Products carry isMaster:true and
  //  manufacturerId so retailer onboarding UI can filter on them later.)

  // 2) Products — written to `products` (market reads from here).
  const storeNames = STORES.map((s) => s.name).join(' • ');
  let i = 0;
  for (const r of ROWS) {
    i += 1;
    const sizeSlug = r.size === '-' ? 'std' : slugify(r.size);
    const id = `karanarjun-${slugify(r.name)}-${sizeSlug}`;
    const fullName = r.size === '-' ? r.name : `${r.name} ${r.size}`;
    const imgKey = `${slugify(r.name)}-${sizeSlug}`;
    const image = IMG_BY_KEY[imgKey] || FALLBACK_IMG;
    if (!IMG_BY_KEY[imgKey]) console.warn(`  ! no image key for ${imgKey}, using fallback`);

    const productDoc = {
      name: r.name,
      fullName,
      price: r.price,
      category: r.category,
      description: r.desc || '',
      image,
      size: r.size,
      stock: 'In Stock',
      store: STORES[0].name,
      distance: 'Nearby',
      manufacturerId: MFG_ID,
      isMaster: true,
      availability: STORES.map((s) => ({ storeId: s.id, stockLevel: String(r.stock) })),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(doc(db, 'products', id), productDoc, { merge: true });

    if (i % 10 === 0) console.log(`  ...${i}/${ROWS.length}`);
  }

  console.log(`Done. Stores: ${storeNames}`);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
