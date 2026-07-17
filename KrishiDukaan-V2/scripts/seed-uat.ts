/**
 * Seed UAT Firestore (karan-arjun-uat) with representative test data.
 *
 * Creates:
 *   - 1 admin user
 *   - 1 test manufacturer + 3 products
 *   - 1 test retailer  + 2 products (retailer_inventory_copy)
 *   - 1 test consumer
 *
 * Run: npm run seed:uat
 *
 * Requires a UAT service account key. Download from:
 *   Firebase Console → karan-arjun-uat → Project Settings → Service Accounts
 * Then set:
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/uat-service-account.json
 * OR fill in FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY in .env.uat.local
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load UAT env vars
const uatEnvPath = path.resolve(process.cwd(), '.env.uat');
const uatLocalEnvPath = path.resolve(process.cwd(), '.env.uat.local');
dotenv.config({ path: uatLocalEnvPath }); // secrets override
dotenv.config({ path: uatEnvPath });      // public config

const projectId = process.env.FIREBASE_PROJECT_ID ?? 'karan-arjun-uat';
if (!projectId.includes('uat')) {
  console.error(`STOP: FIREBASE_PROJECT_ID="${projectId}" does not contain "uat".`);
  console.error('This script must only run against the UAT project. Aborting.');
  process.exit(1);
}

if (getApps().length === 0) {
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_PRIVATE_KEY;
  const privateKey = rawKey?.replace(/\\n/g, '\n');

  if (clientEmail && privateKey) {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    initializeApp({ projectId });
  } else {
    console.error('No credentials found. Set FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY in .env.uat.local');
    console.error('or set GOOGLE_APPLICATION_CREDENTIALS to the path of your UAT service account JSON.');
    process.exit(1);
  }
}

const db = getFirestore();
const now = Timestamp.now();

const MFG_PHONE = '+919876540001';
const MFG_UID   = 'uat-manufacturer-001';
const RETAILER_PHONE = '+919876540002';
const RETAILER_UID   = 'uat-retailer-001';
const CONSUMER_PHONE = '+919876540003';
const ADMIN_UID = 'uat-admin-001';

async function seedUsers() {
  console.log('  Seeding users...');
  const batch = db.batch();

  // uidIndex entries
  batch.set(db.doc(`uidIndex/${MFG_UID}`),      { phone: MFG_PHONE, createdAt: now });
  batch.set(db.doc(`uidIndex/${RETAILER_UID}`), { phone: RETAILER_PHONE, createdAt: now });
  batch.set(db.doc(`uidIndex/${ADMIN_UID}`),    { phone: ADMIN_UID, createdAt: now });

  // Admin
  batch.set(db.doc(`users/${ADMIN_UID}`), {
    uid: ADMIN_UID, phone: ADMIN_UID, name: 'UAT Admin',
    email: 'uat-admin@test.com', role: 'admin', isPaid: true,
    createdAt: now, updatedAt: now,
  });

  // Manufacturer
  batch.set(db.doc(`users/${MFG_PHONE}`), {
    uid: MFG_UID, phone: MFG_PHONE, name: 'UAT Test Manufacturer',
    email: 'uat-mfg@test.com', role: 'manufacturer', isPaid: true,
    productCount: 3, totalSeats: 5, createdAt: now, updatedAt: now,
  });

  // Retailer
  batch.set(db.doc(`users/${RETAILER_PHONE}`), {
    uid: RETAILER_UID, phone: RETAILER_PHONE, name: 'UAT Test Retailer',
    email: 'uat-retailer@test.com', role: 'retailer', isPaid: true,
    productCount: 2, totalSeats: 1, createdAt: now, updatedAt: now,
  });

  // Consumer
  batch.set(db.doc(`users/${CONSUMER_PHONE}`), {
    uid: 'uat-consumer-001', phone: CONSUMER_PHONE, name: 'UAT Test Farmer',
    email: 'uat-farmer@test.com', role: 'consumer', isPaid: false,
    createdAt: now, updatedAt: now,
  });

  await batch.commit();
}

async function seedManufacturer() {
  console.log('  Seeding manufacturer profile...');
  await db.doc(`manufacturers/${MFG_PHONE}`).set({
    uid: MFG_UID, userId: MFG_UID, phone: MFG_PHONE,
    ownerName: 'UAT Test Manufacturer', businessName: 'UAT AgriChem Pvt Ltd',
    address: 'Plot 1, Industrial Area, Pune', city: 'Pune', state: 'Maharashtra',
    pincode: '411001', active: true, createdAt: now, updatedAt: now,
  });
  // Company page
  await db.doc(`companyPages/${MFG_PHONE}`).set({
    id: MFG_PHONE, name: 'UAT AgriChem Pvt Ltd', tagline: 'Test manufacturer for UAT',
    about: 'This is a UAT test company. Not a real business.',
    location: 'Pune, Maharashtra', primaryColor: '#154212', accentColor: '#f57c00',
    phone: MFG_PHONE, email: 'uat-mfg@test.com', ownerPhone: MFG_PHONE,
    createdAt: now, updatedAt: now,
  });
}

async function seedRetailer() {
  console.log('  Seeding retailer profile...');
  await db.doc(`retailers/${RETAILER_PHONE}`).set({
    userId: RETAILER_UID, retailerId: RETAILER_UID, phone: RETAILER_PHONE,
    ownerName: 'UAT Test Retailer', shopName: 'UAT Krishi Store',
    address: 'Shop 5, Market Road, Nashik', city: 'Nashik', state: 'Maharashtra',
    pincode: '422001', active: true, onlineDelivery: true,
    location: { latitude: 19.9975, longitude: 73.7898 },
    createdAt: now, updatedAt: now,
  });
}

const PRODUCTS = [
  {
    id: 'uat-prod-001',
    name: 'UAT Urea 45kg',
    fullName: 'UAT Urea Fertilizer 45kg Bag',
    category: 'fertilizer',
    price: 350,
    description: 'Test urea product for UAT. Do not order.',
    image: 'https://placehold.co/400x400?text=UAT+Urea',
    stock: '100',
    sellMode: 'online_delivery',
    nitrogen: '46', phosphorus: null, potassium: null,
  },
  {
    id: 'uat-prod-002',
    name: 'UAT DAP 50kg',
    fullName: 'UAT Di-Ammonium Phosphate 50kg',
    category: 'fertilizer',
    price: 1350,
    description: 'Test DAP product for UAT. Do not order.',
    image: 'https://placehold.co/400x400?text=UAT+DAP',
    stock: '50',
    sellMode: 'online_delivery',
    nitrogen: '18', phosphorus: '46', potassium: null,
  },
  {
    id: 'uat-prod-003',
    name: 'UAT Pesticide Spray 1L',
    fullName: 'UAT Test Pesticide 1 Litre',
    category: 'pesticide',
    price: 480,
    description: 'Test pesticide for UAT. Do not order.',
    image: 'https://placehold.co/400x400?text=UAT+Pesticide',
    stock: '30',
    sellMode: 'offline_store_only',
    nitrogen: null, phosphorus: null, potassium: null,
  },
];

async function seedProducts() {
  console.log('  Seeding products...');
  for (const p of PRODUCTS) {
    const { id, ...data } = p;
    await db.doc(`products/${id}`).set({
      ...data,
      ownerId: MFG_UID,
      ownerType: 'manufacturer',
      manufacturerId: MFG_UID,
      manufacturerPhone: MFG_PHONE,
      source: 'manufacturer_inventory',
      isOnline: data.sellMode === 'online_delivery',
      isActive: true,
      store: 'UAT AgriChem Pvt Ltd',
      distance: 'Nearby',
      effectiveDiscountPct: 0,
      maxDiscountPct: 0,
      availability: [{
        storeId: MFG_UID,
        storePhone: MFG_PHONE,
        storeName: 'UAT AgriChem Pvt Ltd',
        stockLevel: data.stock,
        sellingPrice: data.price,
        isOnline: data.sellMode === 'online_delivery',
      }],
      createdAt: now,
      updatedAt: now,
    });
  }

  // Retailer inventory copies for first two products
  for (const p of PRODUCTS.slice(0, 2)) {
    const copyId = `uat-retailer-copy-${p.id}`;
    await db.doc(`products/${copyId}`).set({
      name: p.name,
      fullName: p.fullName,
      category: p.category,
      price: p.price + 20, // retailer markup
      description: p.description,
      image: p.image,
      stock: 'In Stock',
      sellMode: 'online_delivery',
      isOnline: true,
      isActive: true,
      retailerId: RETAILER_UID,
      retailerPhone: RETAILER_PHONE,
      ownerId: RETAILER_UID,
      source: 'retailer_inventory_copy',
      store: 'UAT Krishi Store',
      distance: 'Nearby',
      effectiveDiscountPct: 0,
      availability: [{
        storeId: RETAILER_UID,
        storePhone: RETAILER_PHONE,
        storeName: 'UAT Krishi Store',
        stockLevel: 'In Stock',
        sellingPrice: p.price + 20,
        isOnline: true,
      }],
      createdAt: now,
      updatedAt: now,
    });
  }
}

async function seedInventory() {
  console.log('  Seeding inventory entries...');
  for (const p of PRODUCTS) {
    await db.doc(`inventory/${MFG_PHONE}_${p.id}`).set({
      productId: p.id,
      ownerId: MFG_UID,
      ownerPhone: MFG_PHONE,
      ownerType: 'manufacturer',
      name: p.name,
      stock: p.stock,
      price: p.price,
      effectiveDiscountPct: 0,
      isActive: true,
      updatedAt: now,
    });
  }
}

async function main() {
  console.log('');
  console.log(`Seeding UAT project: ${projectId}`);
  console.log('─────────────────────────────────────');

  await seedUsers();
  await seedManufacturer();
  await seedRetailer();
  await seedProducts();
  await seedInventory();

  console.log('');
  console.log('✓ UAT seed complete.');
  console.log('');
  console.log('Test accounts (sign-in via Firebase Console → Authentication → Add user):');
  console.log(`  Admin:        uat-admin@test.com`);
  console.log(`  Manufacturer: uat-mfg@test.com`);
  console.log(`  Retailer:     uat-retailer@test.com`);
  console.log(`  Consumer:     uat-farmer@test.com`);
  console.log('');
  console.log('IMPORTANT: Create these Auth users in the UAT Firebase Console');
  console.log('and link them to the UIDs above, or use phone-auth with the test numbers.');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
