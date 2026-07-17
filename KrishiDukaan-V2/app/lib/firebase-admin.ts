import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";

function initAdminApp(): App {
  if (getApps().length > 0) return getApps()[0]!;

  const projectId     = process.env.FIREBASE_PROJECT_ID   ?? "krishidukan-e8315";
  const clientEmail   = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey    = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
    ?? process.env.FIREBASE_STORAGE_BUCKET
    ?? `${projectId}.firebasestorage.app`;

  // Use service account key if all three vars are present (local dev + prod).
  // Falls back to ADC only when running on Google infrastructure (App Hosting / Cloud Run)
  // where ADC is injected by the platform.
  if (clientEmail && privateKey) {
    return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), storageBucket });
  }

  return initializeApp({ projectId, storageBucket });
}

let _adminDb:      ReturnType<typeof getFirestore> | null = null;
let _adminAuth:    ReturnType<typeof getAuth>      | null = null;
let _adminStorage: ReturnType<typeof getStorage>   | null = null;

export function getAdminDb() {
  if (!_adminDb)      { const app = initAdminApp(); _adminDb      = getFirestore(app); }
  return _adminDb;
}

export function getAdminAuth() {
  if (!_adminAuth)    { const app = initAdminApp(); _adminAuth    = getAuth(app); }
  return _adminAuth;
}

export function getAdminStorage() {
  if (!_adminStorage) { const app = initAdminApp(); _adminStorage = getStorage(app); }
  return _adminStorage;
}
