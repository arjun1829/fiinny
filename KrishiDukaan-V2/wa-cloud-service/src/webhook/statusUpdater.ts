import * as admin from "firebase-admin";
import { getDb } from "../firebase";
import type { MetaStatusEvent } from "../types";

const COLLECTION = "waNotifications";

/**
 * Maps a Meta status event to a Firestore partial update.
 * Only the fields relevant to that event are written — unrelated fields are untouched.
 */
function buildUpdate(
  status: MetaStatusEvent
): admin.firestore.UpdateData<Record<string, unknown>> | null {
  const ts = admin.firestore.FieldValue.serverTimestamp();

  switch (status.status) {
    case "sent":
      // Meta's "sent" webhook = message reached WhatsApp network.
      // We already write status:"sent" when the API call returns 200, so this
      // is a no-op for status. We use it to fill sentAt if it was somehow missed.
      return { sentAt: ts };

    case "delivered":
      return { status: "delivered", deliveredAt: ts };

    case "read":
      return { status: "read", readAt: ts };

    case "failed": {
      const firstError = status.errors?.[0];
      const lastError = firstError
        ? `[${firstError.code}] ${firstError.title}: ${firstError.message}${firstError.error_data ? ` — ${firstError.error_data.details}` : ""}`
        : "Unknown failure reported by Meta";

      return { status: "failed", failedAt: ts, lastError };
    }

    default:
      return null;
  }
}

/**
 * Locates the waNotifications doc whose metaMessageId matches the wamid
 * and applies the status update. Logs a warning if no doc is found
 * (can happen if the webhook fires before our write settles — benign).
 */
export async function applyStatusUpdate(status: MetaStatusEvent): Promise<void> {
  const db = getDb();

  const snap = await db
    .collection(COLLECTION)
    .where("metaMessageId", "==", status.id)
    .limit(1)
    .get();

  if (snap.empty) {
    console.warn(
      `[StatusUpdater] No doc found for metaMessageId=${status.id} (status=${status.status}) — skipping`
    );
    return;
  }

  const update = buildUpdate(status);
  if (!update) {
    console.log(
      `[StatusUpdater] No update needed for status="${status.status}" on ${status.id}`
    );
    return;
  }

  const docRef = snap.docs[0].ref;
  await docRef.update(update);

  console.log(
    `[StatusUpdater] ${snap.docs[0].id} → status="${status.status}" (metaId=${status.id})`
  );
}
