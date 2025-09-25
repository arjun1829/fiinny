// functions/src/index.ts

// ---- Admin (modular) init ONCE ----
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

if (getApps().length === 0) initializeApp();
const db = getFirestore();

/** Helpers */
async function getPrefs(uid: string) {
  const doc = await db.doc(`users/${uid}/prefs/notifications`).get();
  return doc.exists ? (doc.data() as any) : { push_enabled: true };
}

function inQuietHours(prefs: any): boolean {
  const q = prefs?.quiet_hours || {};
  const start = String(q.start || "22:00");
  const end = String(q.end || "08:00");
  const now = new Date(new Date().getTime() + 5.5 * 3600 * 1000); // IST
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mm = String(now.getUTCMinutes()).padStart(2, "0");
  const cur = `${hh}:${mm}`;
  if (start <= end) return cur >= start && cur <= end; // same-day window
  return cur >= start || cur <= end; // crosses midnight
}

async function sendOrFeed(opts: {
  uid: string;
  token?: string;
  channelKey: string;
  title: string;
  body: string;
  deeplink: string;
  idempotencyKey: string;
}) {
  const { uid, token, channelKey, title, body, deeplink, idempotencyKey } = opts;

  // idempotency
  const onceRef = db.doc(`users/${uid}/recent_notifs/${idempotencyKey}`);
  if ((await onceRef.get()).exists) return;
  await onceRef.set({ at: FieldValue.serverTimestamp() });

  const prefs = await getPrefs(uid);
  if (prefs?.push_enabled === false) return;
  if (prefs?.channels?.[channelKey] === false) return;

  const quiet = inQuietHours(prefs);

  // in-app feed always
  await db
    .collection("users")
    .doc(uid)
    .collection("notif_feed")
    .add({
      type: channelKey,
      title,
      body,
      deeplink,
      createdAt: FieldValue.serverTimestamp(),
      read: false,
    })
    .catch(() => null);

  // push (skip if quiet or no token)
  if (!token || quiet) return;

  await getMessaging()
    .send({
      token,
      notification: { title, body },
      data: { type: channelKey, deeplink },
      android: { priority: "high" },
      apns: { headers: { "apns-priority": "10" } },
    })
    .catch(() => null);
}

/** 🔔 When someone creates a shared expense that assigns me */
export const onSharedExpenseCreated = onDocumentCreated(
  { document: "shared_expenses/{expenseId}", region: "asia-south1" },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const d = snap.data() as any;

    const amount = Math.round(Number(d.amount || 0));
    const payerName = String(d.payerName || "Someone");
    const assignees: string[] = Array.isArray(d.assignees) ? d.assignees : [];
    const payerUid = String(d.payerUid || "");

    for (const uid of assignees) {
      if (!uid || uid === payerUid) continue;

      const userDoc = await db.doc(`users/${uid}`).get();
      const token = userDoc.get("fcmToken") as string | undefined;

      await sendOrFeed({
        uid,
        token,
        channelKey: "realtime_expense",
        title: "🧾 New shared expense",
        body: `${payerName} added ₹${amount} to you.`,
        deeplink: `app://expense/${snap.id}`,
        idempotencyKey: `${uid}:expense:${snap.id}`,
      });
    }
  }
);

/** 💬 New chat message → ping everyone except sender */
export const onChatMessageCreated = onDocumentCreated(
  { document: "chats/{threadId}/messages/{messageId}", region: "asia-south1" },
  async (event) => {
    const { params, data } = event;
    const snap = data;
    if (!snap) return;
    const d = snap.data() as any;
    const threadId = String(params?.threadId || "");
    const senderUid = String(d.senderUid || "");
    const senderName = String(d.senderName || "Someone");
    const text = String(d.text || "");

    const threadDoc = await db.doc(`chats/${threadId}`).get();
    const participants: string[] = Array.isArray(threadDoc.get("participants"))
      ? threadDoc.get("participants")
      : [];

    for (const uid of participants) {
      if (!uid || uid === senderUid) continue;
      const userDoc = await db.doc(`users/${uid}`).get();
      const token = userDoc.get("fcmToken") as string | undefined;

      await sendOrFeed({
        uid,
        token,
        channelKey: "realtime_chat",
        title: `💬 ${senderName}`,
        body: text.length > 60 ? `${text.substring(0, 57)}…` : text,
        deeplink: `app://chat/${threadId}`,
        idempotencyKey: `${uid}:chat:${threadId}:${snap.id}`,
      });
    }
  }
);

// 🆕 Oracle LLM job consumer (ESM needs .js)
export { onIngestJobCreate } from "./oracleCategorizer.js";
