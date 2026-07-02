import * as admin from "firebase-admin";
import { getDb } from "./firebase";
import { sendMessage, isClientReady } from "./whatsapp";
import type { WaNotification } from "./types";

const COLLECTION = "waNotifications";

/**
 * Atomically claims a single pending doc by flipping its status to
 * "processing" inside a transaction. Returns false if another worker already
 * claimed it (optimistic concurrency — no distributed lock needed).
 */
async function claimDoc(
  db: admin.firestore.Firestore,
  ref: admin.firestore.DocumentReference
): Promise<WaNotification | null> {
  return db.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    if (!snap.exists) return null;

    const n = snap.data() as WaNotification;
    if (n.status !== "pending") return null; // already claimed or finished

    txn.update(ref, {
      status: "processing",
      lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return n;
  });
}

export async function processPendingNotifications(batchSize = 10): Promise<void> {
  if (!isClientReady()) {
    console.log("[Queue] WhatsApp client not ready yet — skipping cycle");
    return;
  }

  const db = getDb();

  // Fetch candidates — only pending, not yet exhausted
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
    // Claim the doc; skip if another worker got there first
    const n = await claimDoc(db, doc.ref);
    if (!n) {
      console.log(`[Queue] Skipping ${doc.id} — already claimed`);
      continue;
    }

    const maxRetries = n.maxRetries ?? 3;
    const attempt = (n.retryCount ?? 0) + 1;

    try {
      await sendMessage(n.phone, n.message);
      await doc.ref.update({
        status: "sent",
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
        error: null,
      });
      console.log(`[Queue] Sent to ${n.phone} (${doc.id})`);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const exhausted = attempt >= maxRetries;
      await doc.ref.update({
        status: exhausted ? "failed" : "pending",
        retryCount: attempt,
        lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
        error,
      });
      console.error(
        `[Queue] ${exhausted ? "Permanently failed" : "Will retry"} — ${n.phone} (${doc.id}) attempt ${attempt}/${maxRetries}: ${error}`
      );
    }
  }
}
