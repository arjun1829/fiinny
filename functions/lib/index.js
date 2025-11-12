// functions/src/index.ts
// ---- Admin (modular) init ONCE ----
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
if (getApps().length === 0)
    initializeApp();
const db = getFirestore();
/** Helpers */
async function getPrefs(uid) {
    const doc = await db.doc(`users/${uid}/prefs/notifications`).get();
    return doc.exists ? doc.data() : { push_enabled: true };
}
function inQuietHours(prefs) {
    const q = prefs?.quiet_hours || {};
    const start = String(q.start || "22:00");
    const end = String(q.end || "08:00");
    const now = new Date(new Date().getTime() + 5.5 * 3600 * 1000); // IST
    const hh = String(now.getUTCHours()).padStart(2, "0");
    const mm = String(now.getUTCMinutes()).padStart(2, "0");
    const cur = `${hh}:${mm}`;
    if (start <= end)
        return cur >= start && cur <= end; // same-day window
    return cur >= start || cur <= end; // crosses midnight
}
async function sendOrFeed(opts) {
    const { uid, token, channelKey, title, body, deeplink, idempotencyKey } = opts;
    // idempotency
    const onceRef = db.doc(`users/${uid}/recent_notifs/${idempotencyKey}`);
    if ((await onceRef.get()).exists)
        return;
    await onceRef.set({ at: FieldValue.serverTimestamp() });
    const prefs = await getPrefs(uid);
    if (prefs?.push_enabled === false)
        return;
    if (prefs?.channels?.[channelKey] === false)
        return;
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
    if (!token || quiet)
        return;
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
export const onSharedExpenseCreated = onDocumentCreated({ document: "shared_expenses/{expenseId}", region: "asia-south1" }, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const d = snap.data();
    const amount = Math.round(Number(d.amount || 0));
    const amountDisplay = `₹${amount.toLocaleString('en-IN')}`;
    const payerName = String(d.payerName || "Someone").trim() || "Someone";
    const assignees = Array.isArray(d.assignees)
        ? d.assignees.map((x) => String(x || "").trim()).filter((x) => x.length > 0)
        : [];
    const payerUid = typeof d.payerUid === 'string' ? d.payerUid.trim() : '';
    const payerId = typeof d.payerId === 'string' ? d.payerId.trim() : '';
    const payerPhone = typeof d.payerPhone === 'string' ? d.payerPhone.trim() : '';
    const createdBy = typeof d.createdBy === 'string' ? d.createdBy.trim() : '';
    const createdByUid = typeof d.createdByUid === 'string' ? d.createdByUid.trim() : '';
    const createdById = typeof d.createdById === 'string' ? d.createdById.trim() : '';
    const ownerId = typeof d.ownerId === 'string' ? d.ownerId.trim() : '';
    const ownerUid = typeof d.ownerUid === 'string' ? d.ownerUid.trim() : '';
    const ownerPhone = typeof d.ownerPhone === 'string' ? d.ownerPhone.trim() : '';
    const skipIds = new Set();
    [
        payerUid,
        payerId,
        payerPhone,
        createdBy,
        createdByUid,
        createdById,
        ownerId,
        ownerUid,
        ownerPhone,
    ].forEach((val) => {
        if (val)
            skipIds.add(val);
    });
    const payerIdentifier = [payerPhone, payerId, payerUid].find((val) => val && val.length > 0) || '';
    const groupId = typeof d.groupId === 'string' ? d.groupId.trim() : '';
    let groupName = typeof d.groupName === 'string' ? d.groupName.trim() : '';
    if (groupId && !groupName) {
        try {
            const groupDoc = await db.doc(`groups/${groupId}`).get();
            const fetched = (groupDoc.data()?.name)?.trim();
            if (fetched) {
                groupName = fetched;
            }
        }
        catch (_) {
            // ignore fetch errors; fallback handled below
        }
    }
    for (const uid of assignees) {
        if (!uid || skipIds.has(uid))
            continue;
        const userDoc = await db.doc(`users/${uid}`).get();
        const token = userDoc.get("fcmToken");
        const title = groupId
            ? (groupName || 'Group expense')
            : `${payerName} added an expense`;
        const body = groupId
            ? `${payerName} added ${amountDisplay} in ${groupName || 'your group'}.`
            : `${payerName} added ${amountDisplay} with you.`;
        const deeplink = groupId
            ? `app://group-detail/${encodeURIComponent(groupId)}${groupName ? `?name=${encodeURIComponent(groupName)}` : ''}`
            : (payerIdentifier
                ? `app://friend-detail/${encodeURIComponent(payerIdentifier)}?name=${encodeURIComponent(payerName)}`
                : 'app://friends');
        await sendOrFeed({
            uid,
            token,
            channelKey: "realtime_expense",
            title,
            body,
            deeplink,
            idempotencyKey: `${uid}:expense:${snap.id}`,
        });
    }
});
/** 💬 New chat message → ping everyone except sender */
export const onChatMessageCreated = onDocumentCreated({ document: "chats/{threadId}/messages/{messageId}", region: "asia-south1" }, async (event) => {
    const { params, data } = event;
    const snap = data;
    if (!snap)
        return;
    const d = snap.data();
    const threadId = String(params?.threadId || "");
    const senderUid = String(d.senderUid || "");
    const senderName = String(d.senderName || "Someone");
    const text = String(d.text || "");
    const threadDoc = await db.doc(`chats/${threadId}`).get();
    const participants = Array.isArray(threadDoc.get("participants"))
        ? threadDoc.get("participants")
        : [];
    for (const uid of participants) {
        if (!uid || uid === senderUid)
            continue;
        const userDoc = await db.doc(`users/${uid}`).get();
        const token = userDoc.get("fcmToken");
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
});
// 🆕 Oracle LLM job consumer (ESM needs .js)
export { onIngestJobCreate } from "./oracleCategorizer.js";
