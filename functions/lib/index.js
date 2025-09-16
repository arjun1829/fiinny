// functions/src/index.ts
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { onSchedule } from "firebase-functions/v2/scheduler";
// Init admin SDK (modular)
initializeApp();
export const cronDaily = onSchedule({ schedule: "* * * * *", timeZone: "Asia/Kolkata", region: "asia-south1" }, async () => {
    const db = getFirestore();
    const users = await db.collection("users").get();
    const tasks = [];
    const today = new Date().toISOString().slice(0, 10);
    for (const u of users.docs) {
        const uid = u.id;
        const token = u.get("fcmToken");
        if (!token)
            continue;
        // read prefs
        const prefsDoc = await db.doc(`users/${uid}/prefs/notifications`).get();
        const prefs = prefsDoc.exists ? prefsDoc.data() : { push_enabled: true };
        if (prefs?.push_enabled === false)
            continue;
        if (prefs?.channels?.daily_reminder === false)
            continue;
        // idempotency
        const key = `${uid}:daily_reminder:${today}`;
        const onceRef = db.doc(`users/${uid}/recent_notifs/${key}`);
        if ((await onceRef.get()).exists)
            continue;
        await onceRef.set({ at: FieldValue.serverTimestamp() });
        // push
        tasks.push(getMessaging()
            .send({
            token,
            notification: {
                title: "👀 Did you check today?",
                body: "Review today’s expenses in 30s.",
            },
            data: { type: "daily_reminder", deeplink: "app://tx/today" },
            android: { priority: "high" },
            apns: { headers: { "apns-priority": "10" } },
        })
            .catch(() => null));
    }
    await Promise.allSettled(tasks);
});
//# sourceMappingURL=index.js.map