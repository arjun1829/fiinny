
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, query, where, getDocs, limit } = require('firebase/firestore');

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

async function debugInvite(code) {
  console.log(`Searching for invite code: ${code}`);
  const q = query(collection(db, "manufacturerRetailers"), where("inviteCode", "==", code), limit(1));
  const snap = await getDocs(q);

  if (snap.empty) {
    console.log("Invite not found.");
    return;
  }

  const data = snap.docs[0].data();
  console.log("Invite Data:", JSON.stringify({
    id: snap.docs[0].id,
    status: data.status,
    retailerId: data.retailerId,
    retailerDocId: data.retailerDocId,
    claimable: data.claimable,
    manufacturerId: data.manufacturerId
  }, null, 2));

  if (data.retailerId) {
    console.log(`Checking user profile for UID: ${data.retailerId}`);
  }
}

debugInvite("TTQJKBBULP").catch(console.error);
