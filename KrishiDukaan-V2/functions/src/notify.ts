import * as admin from "firebase-admin";

/**
 * Shared notification plumbing.
 *
 * These helpers were originally private to index.ts. They moved here when the
 * second wave of notification triggers (engagement grouping, digests, low
 * stock, profile and subscription reminders — see ./notifications/) needed the
 * same phone-variant resolution and the same "write a doc + push FCM" path.
 * index.ts re-uses them from here; behaviour is unchanged.
 */

// Lazy — index.ts owns admin.initializeApp() and runs it at import time, so
// this module must not touch admin.firestore() until a trigger actually fires.
function db(): admin.firestore.Firestore {
  return admin.firestore();
}

/** Phone variants to try when looking up users/{phone}: as-is, +91-prefixed,
 *  and 10-digit stripped — doc IDs exist in both formats. */
export function phoneVariants(phone: string): string[] {
  const v = new Set<string>();
  const p = phone.trim();
  if (!p) return [];
  v.add(p);
  if (p.startsWith("+91")) v.add(p.substring(3));
  else v.add(`+91${p}`);
  return Array.from(v);
}

/**
 * Writes a notifications/{id} doc for the recipient and sends an FCM push to
 * their saved token (users/{phone}.fcmToken). Never throws — notification
 * failures must not break the triggering write.
 */
/** True when [v] looks like an Indian phone (10–13 digits, optional +91). */
export function looksLikePhone(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const t = v.trim();
  const stripped = t.startsWith("+91") ? t.slice(3) : t;
  return /^\d{10,13}$/.test(stripped);
}

/**
 * Returns the first phone-like value from the candidates. Web and mobile
 * write phones into different fields (retailerPhone vs retailerId/ownerId,
 * some null) — and UID values must be skipped, so plain ?? chains don't work.
 */
export function firstPhone(...candidates: unknown[]): string {
  for (const c of candidates) {
    if (looksLikePhone(c)) return (c as string).trim();
  }
  return "";
}

export async function notify(
  recipientPhone: string,
  type: string,
  title: string,
  body: string,
  data: Record<string, string> = {}
): Promise<void> {
  const phone = (recipientPhone ?? "").trim();
  if (!phone) {
    console.warn(`[notify] skipped ${type} "${title}" — no recipient phone`);
    return;
  }

  try {
    await db().collection("notifications").add({
      recipientPhone: phone,
      // Store the alternate format too so the client query matches whichever
      // format its user doc uses.
      recipientPhones: phoneVariants(phone),
      type,
      title,
      body,
      data,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error(`[notify] doc write failed for ${phone}:`, err);
  }

  try {
    let token: string | null = null;
    for (const variant of phoneVariants(phone)) {
      const snap = await db().collection("users").doc(variant).get();
      const t = snap.exists
        ? (snap.data()?.fcmToken as string | undefined)
        : undefined;
      if (t) {
        token = t;
        break;
      }
    }
    if (!token) return;

    await admin.messaging().send({
      token,
      notification: { title, body },
      data: { type, ...data },
      android: { priority: "high" },
      // iOS: alert-priority delivery with the default sound. Without an apns
      // block a push still shows, but silently — easy to miss on an iPhone.
      apns: {
        headers: { "apns-priority": "10", "apns-push-type": "alert" },
        payload: { aps: { sound: "default" } },
      },
    });
  } catch (err) {
    console.error(`[notify] push failed for ${phone}:`, err);
  }
}

/** Resolves a seller's display name from manufacturers/users/retailers docs. */
export async function displayName(phone: string, fallback: string): Promise<string> {
  for (const variant of phoneVariants(phone)) {
    for (const col of ["manufacturers", "users", "retailers"]) {
      try {
        const snap = await db().collection(col).doc(variant).get();
        if (!snap.exists) continue;
        const d = snap.data() ?? {};
        const name = String(
          d.businessName ?? d.shopName ?? d.name ?? d.ownerName ?? ""
        ).trim();
        if (name) return name;
      } catch {
        /* keep trying other variants */
      }
    }
  }
  return fallback;
}
