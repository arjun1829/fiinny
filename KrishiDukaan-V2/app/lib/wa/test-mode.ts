/**
 * Environment gating for the WhatsApp template testing mode.
 *
 * The testing mode (payload preview, validation, mock send, and the optional
 * dedicated UAT live send) must be available in LOCAL DEVELOPMENT and on the
 * UAT project ONLY, and must be a hard no-op on the production deployment.
 *
 * Detection uses the existing environment configuration (the Firebase project
 * id — the same signal scripts/dev-uat.js and firebase-admin.ts rely on),
 * combined with NODE_ENV, rather than "is this localhost". That matters because
 * `npm run dev` runs locally AGAINST the production project; we still allow the
 * testing tools there (it is a developer machine), but the built-and-deployed
 * production site is always off.
 *
 * These helpers are isomorphic: NEXT_PUBLIC_FIREBASE_PROJECT_ID and NODE_ENV are
 * inlined into the client bundle, so the panel can hide itself with the exact
 * same verdict the backend enforces. Server-only FIREBASE_PROJECT_ID is
 * preferred when present (API routes), falling back to the public id (client).
 */

export const PRODUCTION_PROJECT_ID = "krishidukan-e8315";
export const UAT_PROJECT_ID = "karan-arjun-uat";

export function activeProjectId(): string {
  return (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    PRODUCTION_PROJECT_ID
  );
}

/**
 * True ONLY on the real production deployment: a production build
 * (NODE_ENV === "production") pointed at the production Firebase project.
 * Local `next dev` is development; the UAT project is not the production
 * project — both are therefore NOT a production deployment.
 */
export function isProductionDeployment(): boolean {
  return process.env.NODE_ENV === "production" && activeProjectId() === PRODUCTION_PROJECT_ID;
}

/** The testing mode is enabled everywhere except the production deployment. */
export function isWaTestingEnabled(): boolean {
  return !isProductionDeployment();
}

/** Short human label for logs / responses (never a secret). */
export function environmentLabel(): string {
  const project = activeProjectId();
  if (project === UAT_PROJECT_ID) return `uat (${project})`;
  if (project === PRODUCTION_PROJECT_ID) {
    return process.env.NODE_ENV === "production" ? `production (${project})` : `local→production (${project})`;
  }
  return `other (${project})`;
}

export type UatLiveSendConfig = {
  available: boolean;
  missing: string[];
  recipients: string[];
};

/**
 * Configuration for an ACTUAL (non-mock) test delivery. Reuses the existing WA
 * "test" credentials (WA_TEST_ACCESS_TOKEN / WA_TEST_PHONE_NUMBER_ID), which are
 * a dedicated test number — SEPARATE from the production credentials
 * (WA_ACCESS_TOKEN / WA_PHONE_NUMBER_ID) — and are restricted to the
 * WA_TEST_RECIPIENTS allowlist. This never falls back to production credentials:
 * if the test credentials are absent, live sending is simply unavailable.
 */
export function uatLiveSendConfig(): UatLiveSendConfig {
  const accessToken = process.env.WA_TEST_ACCESS_TOKEN;
  const phoneNumberId = process.env.WA_TEST_PHONE_NUMBER_ID;
  const recipients = (process.env.WA_TEST_RECIPIENTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const missing: string[] = [];
  if (!accessToken) missing.push("WA_TEST_ACCESS_TOKEN");
  if (!phoneNumberId) missing.push("WA_TEST_PHONE_NUMBER_ID");
  return { available: missing.length === 0, missing, recipients };
}
