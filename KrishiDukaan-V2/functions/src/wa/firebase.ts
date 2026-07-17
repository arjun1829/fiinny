import * as admin from "firebase-admin";

let _db: admin.firestore.Firestore | null = null;

function initApp(): void {
  if (admin.apps.length) return;

  const projectId = process.env.FIREBASE_PROJECT_ID ?? "krishidukan-e8315";

  // Application Default Credentials — works in two ways:
  //   Local dev : gcloud auth application-default login (stored in ~/.config/gcloud/)
  //   Google Cloud: attached service account on Cloud Run / GCE (no config needed)
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId,
  });

  console.log("[Firebase] Initialised with Application Default Credentials");
}

export function getDb(): admin.firestore.Firestore {
  if (_db) return _db;
  initApp();
  _db = admin.firestore();
  return _db;
}
