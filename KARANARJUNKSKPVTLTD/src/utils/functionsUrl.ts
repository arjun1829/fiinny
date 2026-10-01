// Builds the canonical HTTPS URL for a deployed 1st-gen Cloud Function
// (`onRequest`), derived from the ACTIVE Firebase project id + the fixed region.
// The frontend calls these deployed functions DIRECTLY — no Firebase Hosting
// rewrite, no Vite proxy. Because the project id comes from the active Firebase
// env (`.env.local` for `npm run dev` = production, `.env.uat` for
// `npm run dev:uat`), the URL automatically targets the correct project.
//
// Reaching these functions from the browser requires the `allUsers` Cloud
// Functions Invoker binding (org-policy exception). Request-level auth is still
// enforced INSIDE each function by verifying the Firebase ID token the caller
// sends as `Authorization: Bearer <token>` — being reachable does not grant
// access.

// All SaaS/admin HTTP functions are deployed to this region (see functions/src).
const FUNCTIONS_REGION = 'asia-south1';

/**
 * Return the direct HTTPS URL for a deployed Cloud Function by name.
 *
 * Example: functionUrl('createSaaSOrder')
 *   → https://asia-south1-finny-erp-uat.cloudfunctions.net/createSaaSOrder
 */
export function functionUrl(name: string): string {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error(
      'VITE_FIREBASE_PROJECT_ID is not set; cannot build Cloud Function URL',
    );
  }
  // Opt-in local emulator override (off by default). Kept in parity with the
  // emulator wiring in src/firebase.ts.
  if (import.meta.env.VITE_USE_EMULATOR === 'true') {
    return `http://localhost:5001/${projectId}/${FUNCTIONS_REGION}/${name}`;
  }
  return `https://${FUNCTIONS_REGION}-${projectId}.cloudfunctions.net/${name}`;
}
