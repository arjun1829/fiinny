import * as admin from "firebase-admin";
import { getDb } from "../firebase";
import type { MetaStatusEvent, WaNotification } from "../types";

const COLLECTION = "waNotifications";

/**
 * Defines the advancement order of the outgoing message lifecycle.
 * Higher = more advanced. We never move a status to a lower order value,
 * except "failed" which can occur at any stage (handled separately).
 */
const STATUS_ORDER: Record<string, number> = {
  pending:   0,
  sending:   1,
  sent:      2,
  delivered: 3,
  read:      4,
  cancelled: -1,
  failed:    -1, // handled separately — never used in order comparison
};

/** Converts Meta's Unix epoch string to a Firestore Timestamp. */
function toFirestoreTs(epochString: string): admin.firestore.Timestamp {
  const ms = parseInt(epochString, 10) * 1000;
  return admin.firestore.Timestamp.fromMillis(isNaN(ms) ? Date.now() : ms);
}

/**
 * Looks up the waNotifications doc whose `metaMessageId` matches `status.id`
 * and applies the appropriate Firestore update.
 *
 * Guarantees:
 * - Status never regresses (sent → delivered → read — never backwards),
 *   except "failed" which can be written at any stage.
 * - Duplicate webhook events are safely skipped (idempotent).
 * - Uses Meta's own event timestamp for lifecycle fields (sentAt, deliveredAt,
 *   readAt, failedAt) rather than serverTimestamp(), so timestamps reflect
 *   when the event actually happened on Meta's network, not when we processed it.
 * - Adds `updatedAt: serverTimestamp()` to every write for audit trails.
 */
export async function applyStatusUpdate(status: MetaStatusEvent): Promise<void> {
  const db = getDb();

  console.log(
    `[StatusUpdater] Received status="${status.status}" for metaId=${status.id} recipient=${status.recipient_id}`
  );

  const snap = await db
    .collection(COLLECTION)
    .where("metaMessageId", "==", status.id)
    .limit(1)
    .get();

  if (snap.empty) {
    // This is normal during the first few seconds after send — the queue writes
    // metaMessageId to Firestore after getting the API response, and the webhook
    // can arrive at the same instant. The event is lost in this case (benign).
    console.warn(
      `[StatusUpdater] No doc found for metaMessageId=${status.id} ` +
      `(status=${status.status}) — possible race with queue write; skipping`
    );
    return;
  }

  const docSnap = snap.docs[0]!;
  const current = docSnap.data() as WaNotification;
  const currentStatus = current.status;
  const currentOrder = STATUS_ORDER[currentStatus] ?? 0;
  const serverTs = admin.firestore.FieldValue.serverTimestamp();
  const eventTs  = toFirestoreTs(status.timestamp);

  let update: admin.firestore.UpdateData<Record<string, unknown>>;
  let logLine: string;

  switch (status.status) {
    case "sent": {
      // Meta "sent" = message reached WhatsApp network.
      // Primary use: heal a doc stuck at "sending" if the queue crashed after
      // the API call but before its own Firestore write.
      // Secondary use: fill sentAt if the queue write somehow missed it.
      if (currentOrder < STATUS_ORDER.sent) {
        // Heal stuck "sending"
        update  = { status: "sent", sentAt: eventTs, updatedAt: serverTs };
        logLine = `healed ${currentStatus} → sent`;
      } else if (!current.sentAt) {
        // Past "sent" already but sentAt field is missing — backfill only
        update  = { sentAt: eventTs, updatedAt: serverTs };
        logLine = "backfilled missing sentAt";
      } else {
        // Already at "sent" or beyond with sentAt present — true no-op
        console.log(
          `[StatusUpdater] Skip: ${docSnap.id} already at "${currentStatus}" with sentAt — ` +
          `duplicate or late "sent" webhook (metaId=${status.id})`
        );
        return;
      }
      break;
    }

    case "delivered": {
      // Idempotency: skip exact duplicates
      if (currentStatus === "delivered" && current.deliveredAt) {
        console.log(
          `[StatusUpdater] Skip: duplicate "delivered" for ${docSnap.id} (metaId=${status.id})`
        );
        return;
      }
      if (currentOrder > STATUS_ORDER.delivered) {
        // Already "read" — don't downgrade status, but backfill deliveredAt if missing
        if (current.deliveredAt) {
          console.log(
            `[StatusUpdater] Skip: ${docSnap.id} already "${currentStatus}" with deliveredAt — ` +
            `late "delivered" webhook (metaId=${status.id})`
          );
          return;
        }
        update  = { deliveredAt: eventTs, updatedAt: serverTs };
        logLine = `backfilled missing deliveredAt (already ${currentStatus})`;
      } else {
        update  = { status: "delivered", deliveredAt: eventTs, updatedAt: serverTs };
        logLine = `${currentStatus} → delivered`;
      }
      break;
    }

    case "read": {
      // Idempotency
      if (currentStatus === "read" && current.readAt) {
        console.log(
          `[StatusUpdater] Skip: duplicate "read" for ${docSnap.id} (metaId=${status.id})`
        );
        return;
      }
      update  = { status: "read", readAt: eventTs, updatedAt: serverTs };
      logLine = `${currentStatus} → read`;
      break;
    }

    case "failed": {
      // "failed" is always accepted — delivery failure can happen at any lifecycle stage.
      const firstError = status.errors?.[0];
      const lastError = firstError
        ? `[${firstError.code}] ${firstError.title}: ${firstError.message}` +
          (firstError.error_data ? ` — ${firstError.error_data.details}` : "")
        : "Unknown failure reported by Meta";

      update  = { status: "failed", failedAt: eventTs, lastError, updatedAt: serverTs };
      logLine = `${currentStatus} → failed: ${lastError}`;
      break;
    }

    default:
      console.log(
        `[StatusUpdater] Unknown status="${status.status}" for ${status.id} — ignoring`
      );
      return;
  }

  await docSnap.ref.update(update);
  console.log(
    `[StatusUpdater] ✓ ${docSnap.id} phone=${current.phone} — ${logLine} (metaId=${status.id})`
  );
}
