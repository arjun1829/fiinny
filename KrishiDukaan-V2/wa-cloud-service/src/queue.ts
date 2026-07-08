import * as admin from "firebase-admin";
import { getDb } from "./firebase";
import { sendTemplateMessage, sendTextMessage } from "./cloudApi";
import { resolveTemplateComponents } from "./templateResolver";
import type { WaNotification } from "./types";

const COLLECTION = "waNotifications";

// Language code for all templates. Change to "mr" when Marathi templates are
// approved under that locale in Meta Business Manager.
const TEMPLATE_LANGUAGE = process.env.WA_TEMPLATE_LANGUAGE ?? "en";

/**
 * Atomically claims a pending doc by setting status to "sending".
 * Returns null if another worker already claimed it (optimistic concurrency).
 */
async function claimDoc(
  db: admin.firestore.Firestore,
  ref: admin.firestore.DocumentReference
): Promise<WaNotification | null> {
  return db.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    if (!snap.exists) return null;

    const n = snap.data() as WaNotification;
    if (n.status !== "pending") return null;

    txn.update(ref, { status: "sending", lastError: null });
    return n;
  });
}

/**
 * Sends the notification via the Cloud API and returns the Meta message ID.
 *
 * Dispatch rules:
 *  - Named template (non-generic): sendTemplateMessage with resolved components
 *  - generic: sendTextMessage using the stored message text
 */
async function dispatchNotification(n: WaNotification): Promise<string> {
  if (n.template !== "generic") {
    // Use pre-built components when provided, otherwise resolve from payload.
    // Callers that pre-compute components can pass them in; the resolver is the
    // fallback for docs written by queueWaNotification() without components.
    const components =
      n.templateComponents && n.templateComponents.length > 0
        ? n.templateComponents
        : resolveTemplateComponents(n.template, n.payload);

    const result = await sendTemplateMessage(
      n.phone,
      n.template,
      TEMPLATE_LANGUAGE,
      components
    );
    return result.metaMessageId;
  }

  // Fallback: plain-text message for ad-hoc / bulk notifications
  if (!n.message) {
    throw new Error(
      `Notification ${n.id ?? "(no id)"} is type "generic" but has no message text`
    );
  }
  const result = await sendTextMessage(n.phone, n.message);
  return result.metaMessageId;
}

export async function processPendingNotifications(batchSize = 10): Promise<void> {
  const db = getDb();

  const snap = await db
    .collection(COLLECTION)
    .where("status", "==", "pending")
    .orderBy("retryCount", "asc")
    .orderBy("createdAt", "asc")
    .limit(batchSize)
    .get();

  if (snap.empty) {
    console.log("[Queue] No pending notifications");
    return;
  }

  console.log(`[Queue] Processing ${snap.size} notification(s)`);

  for (const doc of snap.docs) {
    const n = await claimDoc(db, doc.ref);
    if (!n) {
      console.log(`[Queue] Skipping ${doc.id} — already claimed`);
      continue;
    }

    // Attach doc ID so dispatchNotification can include it in error messages
    n.id = doc.id;

    const maxRetries = n.maxRetries ?? 3;
    const attempt = (n.retryCount ?? 0) + 1;

    try {
      const metaMessageId = await dispatchNotification(n);

      await doc.ref.update({
        status: "sent",
        metaMessageId,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        retryCount: attempt,
        lastError: null,
      });

      console.log(
        `[Queue] Sent to ${n.phone} (${doc.id}) template="${n.template}" metaId=${metaMessageId}`
      );
    } catch (err) {
      const lastError = err instanceof Error ? err.message : String(err);
      const exhausted = attempt >= maxRetries;

      await doc.ref.update({
        status: exhausted ? "failed" : "pending",
        retryCount: attempt,
        lastError,
        ...(exhausted
          ? { failedAt: admin.firestore.FieldValue.serverTimestamp() }
          : {}),
      });

      console.error(
        `[Queue] ${exhausted ? "Permanently failed" : "Will retry"} — ${n.phone} (${doc.id}) attempt ${attempt}/${maxRetries}: ${lastError}`
      );
    }
  }
}
