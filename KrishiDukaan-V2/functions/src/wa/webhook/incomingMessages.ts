import * as admin from "firebase-admin";
import { getDb } from "../firebase";
import type { MetaMessageEvent, MetaWebhookContact } from "../types";

const COLLECTION = "waIncomingMessages";

function extractText(msg: MetaMessageEvent): string | null {
  if (msg.text?.body) return msg.text.body;
  if (msg.image?.caption) return msg.image.caption;
  if (msg.video?.caption) return msg.video.caption;
  if (msg.document?.caption) return msg.document.caption;
  if (msg.button?.text) return msg.button.text;
  return null;
}

/**
 * Persists an incoming customer message to Firestore.
 * Uses the Meta message ID as the document ID to make writes idempotent
 * (replaying the same webhook won't create duplicate documents).
 */
export async function saveIncomingMessage(
  msg: MetaMessageEvent,
  contacts: MetaWebhookContact[]
): Promise<void> {
  const db = getDb();

  const sender = contacts.find((c) => c.wa_id === msg.from);
  const waId = sender?.wa_id ?? msg.from;

  // Meta sends timestamp as a Unix epoch string
  const metaTimestamp = new Date(parseInt(msg.timestamp, 10) * 1000);

  const docData = {
    phone: msg.from,
    waId,
    messageId: msg.id,
    messageType: msg.type,
    messageText: extractText(msg),
    timestamp: admin.firestore.Timestamp.fromDate(metaTimestamp),
    receivedAt: admin.firestore.FieldValue.serverTimestamp(),
    rawPayload: msg as unknown as Record<string, unknown>,
  };

  // Set (not add) so re-delivery of the same webhook is idempotent
  await db.collection(COLLECTION).doc(msg.id).set(docData, { merge: false });

  console.log(
    `[IncomingMessages] Saved ${msg.type} message from ${msg.from} (${msg.id})`
  );
}
