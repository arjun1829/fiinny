const admin = require('firebase-admin');
admin.initializeApp({ projectId: "krishidukan-e8315" });
const db = admin.firestore();

async function main() {
  const mfrs = await db.collection('manufacturers').get();
  console.log('Manufacturers count:', mfrs.size);
  let foundRetailers = false;
  for (const doc of mfrs.docs) {
    const retailers = await db.collection('manufacturers').doc(doc.id).collection('retailers').get();
    if (retailers.size > 0) {
      foundRetailers = true;
      console.log(`\nManufacturer ${doc.id} has ${retailers.size} retailers in subcollection`);
      retailers.docs.forEach(r => {
        console.log(` - ${r.id}: status=${r.data().status}, onboardingStatus=${r.data().onboardingStatus}`);
      });
    }
  }
  if (!foundRetailers) {
    console.log('\nNo retailers found in any manufacturer subcollections!');
  }
}
main().catch(console.error);
