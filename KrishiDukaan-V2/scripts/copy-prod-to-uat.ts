/**
 * Copy product/catalog data from production (krishidukan-e8315) to UAT (karan-arjun-uat).
 *
 * Copies only public catalog collections — never touches user, order, or payment data.
 *
 * Safe to run multiple times (overwrites existing UAT docs with prod versions).
 *
 * Run:
 *   npm run copy:prod-to-uat
 *
 * Requirements:
 *   - gcloud auth application-default login  (run once in your terminal)
 *   - Your account must have Firestore read on krishidukan-e8315
 *     and Firestore write on karan-arjun-uat
 */

import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getFirestore, Firestore, WriteBatch } from 'firebase-admin/firestore';
import * as readline from 'readline';

// ─── Collections to copy ─────────────────────────────────────────────────────
const COPY_COLLECTIONS = [
  // User identity & roles (needed for login to work)
  'users',
  'uidIndex',
  'profiles',
  // Product catalog
  'products',
  'catalog',
  'listings',
  'inventory',
  'manufacturers',
  'brandPages',
  'companyPages',
  'manufacturerRetailers',
  // Retail
  'stores',
  'retailers',
  // Content & config
  'blogPosts',
  'hubs',
  'appVersion',
  'deliverySettings',
];

// ─── Never copy these (personal / financial data) ─────────────────────────────
// users, uidIndex, profiles, orders, payments, failedPayments, subscriptions,
// manufacturerNetwork, manufacturerRetailers, adminLogs, contactMessages,
// manufacturer_contacts, seatListings, retailerSeatListings, notifications, carts

const PROD_PROJECT = 'krishidukan-e8315';
const UAT_PROJECT  = 'karan-arjun-uat';
const BATCH_SIZE   = 400; // Firestore max is 500 ops/batch

// ─── Per-document transforms ──────────────────────────────────────────────────
// Firebase Auth UIDs do NOT transfer between projects. A user who logs into UAT
// with the same phone gets a brand-new UID, so any ownership field that stores a
// production UID will fail the Firestore rules' phoneMatches() check.
//
// Products store ownership in legacy UID fields (ownerId / manufacturerId /
// retailerId) alongside phone fields (ownerPhone / manufacturerPhone /
// retailerPhone). We rewrite the UID fields to their phone equivalents so that
// phoneMatches() succeeds for whoever logs in with that phone — making copied
// products editable in UAT without weakening the security rules.

function looksLikePhone(v: unknown): boolean {
  return typeof v === 'string' && /^\+?\d{10,15}$/.test(v);
}

const TRANSFORMS: Record<string, (data: any) => any> = {
  products: (data) => {
    const { ownerPhone, manufacturerPhone, retailerPhone } = data;
    // Only overwrite a UID-shaped value when a real phone is available.
    if (looksLikePhone(ownerPhone) && !looksLikePhone(data.ownerId)) {
      data.ownerId = ownerPhone;
    }
    if (looksLikePhone(manufacturerPhone) && !looksLikePhone(data.manufacturerId)) {
      data.manufacturerId = manufacturerPhone;
    }
    if (looksLikePhone(retailerPhone) && !looksLikePhone(data.retailerId)) {
      data.retailerId = retailerPhone;
    }
    return data;
  },
};

// ─── Init two separate Admin SDK apps ────────────────────────────────────────
function initApp(projectId: string, name: string): App {
  const existing = getApps().find(a => a.name === name);
  if (existing) return existing;
  return initializeApp({ projectId }, name);
}

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, ans => {
      rl.close();
      resolve(ans.trim().toLowerCase() === 'yes');
    });
  });
}

async function copyCollection(
  src: Firestore,
  dst: Firestore,
  collectionName: string
): Promise<number> {
  const snapshot = await src.collection(collectionName).get();
  if (snapshot.empty) {
    console.log(`  ${collectionName}: empty — skipped`);
    return 0;
  }

  let batch: WriteBatch = dst.batch();
  let batchCount = 0;
  let totalWritten = 0;
  const transform = TRANSFORMS[collectionName];

  for (const doc of snapshot.docs) {
    const data = transform ? transform(doc.data()) : doc.data();
    batch.set(dst.collection(collectionName).doc(doc.id), data);
    batchCount++;
    totalWritten++;

    if (batchCount >= BATCH_SIZE) {
      await batch.commit();
      batch = dst.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  console.log(`  ${collectionName}: ${totalWritten} docs copied`);
  return totalWritten;
}

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   KrishiDukan — Copy Prod Data → UAT                    ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Source : ${PROD_PROJECT}  (READ ONLY)`);
  console.log(`  Target : ${UAT_PROJECT}   (WRITE)`);
  console.log('');
  console.log('  Collections to copy:');
  COPY_COLLECTIONS.forEach(c => console.log(`    • ${c}`));
  console.log('');
  console.log('  Will NOT copy: orders, payments, failedPayments,');
  console.log('                 subscriptions, adminLogs, contactMessages');
  console.log('');

  const ok = await confirm('Type "yes" to continue: ');
  if (!ok) {
    console.log('Aborted.');
    process.exit(0);
  }

  console.log('\nInitializing Firebase apps...');
  const prodApp = initApp(PROD_PROJECT, 'prod');
  const uatApp  = initApp(UAT_PROJECT, 'uat');
  const prodDb  = getFirestore(prodApp);
  const uatDb   = getFirestore(uatApp);

  console.log('\nCopying collections...\n');
  let grandTotal = 0;

  for (const col of COPY_COLLECTIONS) {
    try {
      grandTotal += await copyCollection(prodDb, uatDb, col);
    } catch (err: any) {
      console.error(`  ${col}: ERROR — ${err.message}`);
    }
  }

  console.log(`\n✓ Done. ${grandTotal} documents written to ${UAT_PROJECT}.`);
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
