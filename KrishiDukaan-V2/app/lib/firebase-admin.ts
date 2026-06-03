import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

function initAdminApp(): App {
  if (getApps().length > 0) return getApps()[0]!;

  const projectId   = process.env.FIREBASE_PROJECT_ID   ?? "krishidukan-e8315";
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey  = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  // Use service account key if all three vars are present (local dev + prod).
  // Falls back to ADC only when running on Google infrastructure (App Hosting / Cloud Run)
  // where ADC is injected by the platform.
  if (clientEmail && privateKey) {
    return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }

  return initializeApp({ projectId });
}

let _adminDb:   ReturnType<typeof getFirestore> | null = null;
let _adminAuth: ReturnType<typeof getAuth>      | null = null;

export function getAdminDb() {
  if (!_adminDb)   { const app = initAdminApp(); _adminDb   = getFirestore(app); }
  return _adminDb;
}

export function getAdminAuth() {
  if (!_adminAuth) { const app = initAdminApp(); _adminAuth = getAuth(app); }
  return _adminAuth;
}
