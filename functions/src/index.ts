// functions/src/index.ts

// ---- Admin (modular) init ONCE ----
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp, Query } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";

if (getApps().length === 0) initializeApp();
const db = getFirestore();

/* ----------------------------- Shared helpers ----------------------------- */

async function getPrefs(uid: string) {
  const doc = await db.doc(`users/${uid}/prefs/notifications`).get();
  return doc.exists ? (doc.data() as any) : { push_enabled: true };
}

function inQuietHours(prefs: any): boolean {
  const q = prefs?.quiet_hours || {};
  const start = String(q.start || "22:00");
  const end = String(q.end || "08:00");
  // TODO: if you store tz per-user, use it. For now, IST-ish behavior:
  const now = new Date(new Date().getTime() + 5.5 * 3600 * 1000);
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mm = String(now.getUTCMinutes()).padStart(2, "0");
  const cur = `${hh}:${mm}`;
  if (start <= end) return cur >= start && cur <= end;     // same-day window
  return cur >= start || cur <= end;                       // crosses midnight
}

function fmtDate(d: Date) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function hhmmToParts(hhmm?: string): { h: number; m: number } {
  const t = (hhmm || "09:00").split(":");
  const h = Math.max(0, Math.min(23, parseInt(t[0] || "9", 10) || 9));
  const m = Math.max(0, Math.min(59, parseInt(t[1] || "0", 10) || 0));
  return { h, m };
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

/* ----------------------- Existing (kept as-is) triggers -------------------- */

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

/* ----------------------- New: Cloud reminder pipeline ---------------------- */

/**
 * Compute the planned "fireAt" using:
 *  fireAt = (nextDueAt.date @ hh:mm) - daysBefore
 */
function computeFireAt(nextDueAt: Date, hhmm?: string, daysBefore?: number): Date {
  const { h, m } = hhmmToParts(hhmm);
  const base = new Date(nextDueAt.getFullYear(), nextDueAt.getMonth(), nextDueAt.getDate(), h, m, 0, 0);
  const fire = new Date(base.getTime() - (Math.max(0, daysBefore ?? 0) * 24 * 3600 * 1000));
  return fire;
}

/**
 * Scan a time window and send cloud push for reminders that should fire in it.
 * We use a collection group query on `recurring` but only act on the **owner side**
 * (the path pattern `users/{owner}/friends/{friend}/recurring/{id}`) to avoid
 * double-sending (items are mirrored).
 */
async function runReminderScan(windowStart: Date, windowEnd: Date) {
  const startTs = Timestamp.fromDate(windowStart);
  const endTs = Timestamp.fromDate(windowEnd);

  // Only active + with nextDueAt present (we still compute fireAt from notify config)
  const q: Query = db.collectionGroup("recurring")
    .where("rule.status", "==", "active")
    .where("nextDueAt", ">=", startTs) // coarse filter: some will have fireAt earlier if daysBefore>0
    .where("nextDueAt", "<", endTs);

  const snap = await q.get();

  for (const doc of snap.docs) {
    try {
      // ownerId & friendId from path segments: users/{owner}/friends/{friend}/recurring/{id}
      const path = doc.ref.path.split("/");
      // [users, {owner}, friends, {friend}, recurring, {id}]
      if (path.length < 6) continue;
      const owner = path[1];
      const friend = path[3];
      const id = path[5];

      // Read minimal fields
      const data = doc.data() as any;
      const title = String(data.title || "Reminder");
      const notify = (data.notify || {}) as any;
      const daysBefore = Number(notify.daysBefore ?? 0);
      const timeHHmm = String(notify.time || "09:00");
      const enable = Boolean(notify.enabled ?? true);
      const notifyBoth = Boolean(notify.both ?? true);

      if (!enable) continue;

      const nextDueAt: Date = (data.nextDueAt?.toDate?.() ?? null) || null;
      if (!nextDueAt) continue;

      // Compute when this reminder should actually fire
      const fireAt = computeFireAt(nextDueAt, timeHHmm, daysBefore);

      // Only act if fireAt is inside [windowStart, windowEnd)
      if (fireAt < windowStart || fireAt >= windowEnd) continue;

      // Build message
      const body = `Due on ${fmtDate(nextDueAt)}`;
      const deeplink = `app://friend/${friend}/recurring`;

      // Who to notify: owner (always) + friend if notifyBoth
      const targets = new Set<string>([owner]);
      if (notifyBoth) targets.add(friend);

      for (const uid of targets) {
        const userDoc = await db.doc(`users/${uid}`).get();
        const token = userDoc.get("fcmToken") as string | undefined;
        const idem = `recurring:${id}:${fmtDate(nextDueAt)}:${uid}`;

        await sendOrFeed({
          uid,
          token,
          channelKey: "nudge_reminder",
          title,
          body,
          deeplink,
          idempotencyKey: idem,
        });
      }
    } catch (e) {
      // keep going; never throw the whole run
      console.error("[reminders] failed doc:", doc.ref.path, e);
    }
  }
}

/**
 * HTTP endpoint to kick a windowed run (useful for Cloud Scheduler or manual).
 * Query params:
 *  - minMins (default: 0)   window start offset from now (minutes)
 *  - maxMins (default: 10)  window end offset from now (minutes)
 *
 * Example: /runReminderWindow?minMins=0&maxMins=5
 */
export const runReminderWindow = onRequest(
  { region: "asia-south1", timeoutSeconds: 240, cors: true },
  async (req, res) => {
    try {
      const now = new Date();
      const minMins = Math.max(0, parseInt(String(req.query.minMins ?? "0"), 10) || 0);
      const maxMins = Math.max(minMins + 1, parseInt(String(req.query.maxMins ?? "10"), 10) || 10);

      const windowStart = new Date(now.getTime() + minMins * 60_000);
      const windowEnd = new Date(now.getTime() + maxMins * 60_000);

      await runReminderScan(windowStart, windowEnd);

      res.status(200).json({ ok: true, windowStart: windowStart.toISOString(), windowEnd: windowEnd.toISOString() });
    } catch (e) {
      console.error("[runReminderWindow] error", e);
      res.status(500).json({ ok: false, error: String(e) });
    }
  }
);

/**
 * Cron every 5 minutes – scans [now, now+5m).
 * You can adjust cadence in package.json `gcp-scheduler` annotation if needed.
 */
export const remindersCron = onSchedule(
  {
    region: "asia-south1",
    schedule: "every 5 minutes",
    timeZone: "Asia/Kolkata",
    retryCount: 0,
  },
  async () => {
    const now = new Date();
    const start = now;
    const end = new Date(now.getTime() + 5 * 60_000);
    await runReminderScan(start, end);
  }
);
