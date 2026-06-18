import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore/lite";

const _projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "krishidukan-e8315";
const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY             ?? "AIzaSyDh_Y67TDJc2KLLJ8Wcc2JvEeHzmfVL778",
  projectId:         _projectId,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET      ?? `${_projectId}.firebasestorage.app`,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "650303885415",
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID              ?? "1:650303885415:web:7db7619260aa478b2b84c2",
};

// Uses firebase/firestore/lite (HTTP REST, no gRPC) so it works in Next.js
// server components without Application Default Credentials.
export function getClientDb() {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return getFirestore(app);
}
