import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDh_Y67TDJc2KLLJ8Wcc2JvEeHzmfVL778",
  authDomain: "krishidukan-e8315.firebaseapp.com",
  projectId: "krishidukan-e8315",
  storageBucket: "krishidukan-e8315.firebasestorage.app",
  messagingSenderId: "650303885415",
  appId: "1:650303885415:web:7db7619260aa478b2b84c2",
  measurementId: "G-7MEFGCD4EX"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  console.log('Firebase initialized');
  // Need to be authenticated to write...
}
run();
