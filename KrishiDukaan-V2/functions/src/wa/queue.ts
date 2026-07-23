import * as admin from "firebase-admin";
import { getDb } from "./firebase";
import { getProvider } from "./provider";
import { resolveTemplateComponents } from "./templateResolver";
import type { WaNotification } from "./types";

const COLLECTION = "waNotifications";

const TEMPLATE_LANGUAGE = "mr";

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

    txn.update(ref, {
      status: "sending",
      claimedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastError: null,
    });
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
  const provider = getProvider();

  if (n.template !== "generic") {
    // Use pre-built components when provided, otherwise resolve from payload.
    // Callers that pre-compute components can pass them in; the resolver is the
    // fallback for docs written by queueWaNotification() without components.
    const components =
      n.templateComponents && n.templateComponents.length > 0
        ? n.templateComponents
        : resolveTemplateComponents(n.template, n.payload);

    const result = await provider.sendTemplateMessage(
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
  const result = await provider.sendTextMessage(n.phone, n.message);
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

/**
 * Sends a single notification by doc ID.
 * Called by the onDocumentCreated Firestore trigger which already knows the ID.
 * Uses the same claimDoc transaction — safe against at-least-once trigger delivery.
 */
export async function processSingleNotification(docId: string): Promise<void> {
  const db = getDb();
  const ref = db.collection(COLLECTION).doc(docId);

  const snap = await ref.get();
  if (!snap.exists) {
    console.log(`[Queue] Doc ${docId} does not exist — skipping`);
    return;
  }

  const n = await claimDoc(db, ref);
  if (!n) {
    console.log(`[Queue] Skipping ${docId} — already claimed or not pending`);
    return;
  }

  n.id = docId;

  const maxRetries = n.maxRetries ?? 3;
  const attempt = (n.retryCount ?? 0) + 1;

  try {
    const metaMessageId = await dispatchNotification(n);

    await ref.update({
      status: "sent",
      metaMessageId,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      retryCount: attempt,
      lastError: null,
    });

    console.log(
      `[Queue] Sent to ${n.phone} (${docId}) template="${n.template}" metaId=${metaMessageId}`
    );
  } catch (err) {
    const lastError = err instanceof Error ? err.message : String(err);
    const exhausted = attempt >= maxRetries;

    await ref.update({
      status: exhausted ? "failed" : "pending",
      retryCount: attempt,
      lastError,
      ...(exhausted
        ? { failedAt: admin.firestore.FieldValue.serverTimestamp() }
        : {}),
    });

    console.error(
      `[Queue] ${exhausted ? "Permanently failed" : "Will retry"} — ${n.phone} (${docId}) attempt ${attempt}/${maxRetries}: ${lastError}`
    );
  }
}

/**
 * Resets stuck and permanently-failed docs back to "pending" so the next
 * processPendingNotifications() call picks them up.
 *
 * Two cases handled:
 *   "sending" + claimedAt older than stuckMinutes  — trigger/function crashed mid-flight
 *   "failed"                                        — scheduler gives a fresh set of retries
 */
export async function resetStuckAndFailed(
  batchSize = 25,
  stuckMinutes = 5
): Promise<void> {
  const db  = getDb();
  const now = Date.now();
  const stuckCutoff = admin.firestore.Timestamp.fromMillis(
    now - stuckMinutes * 60 * 1000
  );

  // ── Stuck "sending" docs ────────────────────────────────────────────────────
  const stuckSnap = await db
    .collection(COLLECTION)
    .where("status", "==", "sending")
    .where("claimedAt", "<=", stuckCutoff)
    .limit(batchSize)
    .get();

  if (!stuckSnap.empty) {
    console.log(`[Queue] Resetting ${stuckSnap.size} stuck "sending" doc(s)`);
    const batch = db.batch();
    for (const doc of stuckSnap.docs) {
      batch.update(doc.ref, {
        status: "pending",
        lastError: "Reset by retry scheduler — was stuck in sending",
      });
    }
    await batch.commit();
  }

  // ── Permanently failed docs — give them a fresh set of retries ─────────────
  const failedSnap = await db
    .collection(COLLECTION)
    .where("status", "==", "failed")
    .limit(batchSize)
    .get();

  if (!failedSnap.empty) {
    console.log(`[Queue] Resetting ${failedSnap.size} failed doc(s) for retry`);
    const batch = db.batch();
    for (const doc of failedSnap.docs) {
      batch.update(doc.ref, {
        status: "pending",
        retryCount: 0,
        lastError: null,
      });
    }
    await batch.commit();
  }

  if (stuckSnap.empty && failedSnap.empty) {
    console.log("[Queue] No stuck or failed notifications to reset");
  }
}
