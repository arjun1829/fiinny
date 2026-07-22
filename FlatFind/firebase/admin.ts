import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Server-only — never import this file from a 'use client' component.
// Mirrors KrishiDukaan-v2's app/lib/firebase-admin.ts singleton pattern,
// scoped down to just Auth: FlatFind's Razorpay routes only need to verify
// the caller's ID token (no server-side Firestore reads like
// KrishiDukaan's create-cart-order does for price recomputation — FlatFind
// has one flat ₹499 plan, hardcoded in create-order/route.ts).
//
// Same two-path credential resolution as KrishiDukaan-v2: explicit
// service-account env vars when present (local dev + most hosts), falling
// back to Application Default Credentials when running on Google
// infrastructure (Cloud Run / App Hosting / Cloud Functions) where ADC is
// platform-injected and no service-account JSON is needed at all. Local
// dev without either configured will fail at first use (verifyIdToken
// call), not at import time — see the two API routes' try/catch around
// getAdminAuth() for how that surfaces to the client.
function initAdminApp(): App {
  if (getApps().length > 0) return getApps()[0]!;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (clientEmail && privateKey) {
    return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }

  return initializeApp({ projectId });
}

let _adminAuth: ReturnType<typeof getAuth> | null = null;

export function getAdminAuth() {
  if (!_adminAuth) {
    const app = initAdminApp();
    _adminAuth = getAuth(app);
  }
  return _adminAuth;
}
