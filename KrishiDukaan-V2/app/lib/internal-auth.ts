import { getAdminDb } from "./firebase-admin";

/**
 * Whether a request carries our server-to-server secret (`x-cron-secret`).
 *
 * The scheduling / trigger Cloud Functions read the same server-only
 * `_serverConfig/cron` document (functions/src/notifications/reassignment.ts,
 * expirySecret()) so both sides always hold one value; CRON_SECRET is still
 * accepted for manual runs. The document is deny-all in firestore.rules.
 */
export async function isInternalRequest(request: Request): Promise<boolean> {
  const secret = request.headers.get("x-cron-secret");
  if (!secret) return false;
  if (process.env.CRON_SECRET && secret === process.env.CRON_SECRET) return true;
  try {
    const shared = (await getAdminDb().collection("_serverConfig").doc("cron").get())
      .data()?.reassignmentExpirySecret;
    return typeof shared === "string" && shared.length >= 32 && secret === shared;
  } catch {
    return false;
  }
}
