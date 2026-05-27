import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore/lite";

const firebaseConfig = {
  apiKey: "AIzaSyDh_Y67TDJc2KLLJ8Wcc2JvEeHzmfVL778",
  projectId: "krishidukan-e8315",
  storageBucket: "krishidukan-e8315.firebasestorage.app",
  messagingSenderId: "650303885415",
  appId: "1:650303885415:web:7db7619260aa478b2b84c2",
};

// Uses firebase/firestore/lite (HTTP REST, no gRPC) so it works in Next.js
// server components without Application Default Credentials.
export function getClientDb() {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return getFirestore(app);
}
