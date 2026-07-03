import * as admin from 'firebase-admin';
admin.initializeApp({ projectId: "krishidukan-e8315" });
const db = admin.firestore();
async function checkDealers() {
  const mfrs = await db.collection('manufacturers').get();
  console.log(`Found ${mfrs.size} manufacturers.`);
  let count = 0;
  for (const doc of mfrs.docs) {
    const dealers = await db.collection('manufacturers').doc(doc.id).collection('dealers').get();
    const retailers = await db.collection('manufacturers').doc(doc.id).collection('retailers').get();
    if (dealers.size > 0) console.log(`Manufacturer ${doc.id} has ${dealers.size} dealers`);
    if (retailers.size > 0) console.log(`Manufacturer ${doc.id} has ${retailers.size} retailers`);
    count += dealers.size + retailers.size;
  }
  if (count === 0) {
    console.log('No dealers/retailers found in subcollections.');
    // Check root
    const rootDealers = await db.collection('dealers').limit(1).get();
    console.log('Root dealers size:', rootDealers.size);
    const rootRet = await db.collection('retailers').limit(1).get();
    console.log('Root retailers size:', rootRet.size);
    if (rootRet.size > 0) console.log('Sample retailer:', rootRet.docs[0].data());
  }
}
checkDealers().catch(console.error);
