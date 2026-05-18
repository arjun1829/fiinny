import { getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Uses Application Default Credentials — no service account key file required.
// In production (Firebase App Hosting / Cloud Run), ADC is provided automatically by the platform.
// For local development, run: gcloud auth application-default login
function initAdminApp(): App {
  if (getApps().length > 0) return getApps()[0]!;
  return initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID ?? "krishidukan-e8315" });
}

let _adminDb: ReturnType<typeof getFirestore> | null = null;

export function getAdminDb() {
  if (!_adminDb) {
    const app = initAdminApp();
    _adminDb = getFirestore(app);
  }
  return _adminDb;
}
