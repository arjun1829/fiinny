import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { initializeApp, getApps } from "firebase-admin/app";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";

if (getApps().length === 0) initializeApp();
const db = getFirestore();
const fcm = getMessaging();

// --- Personality Engine ---
const COPY_ENGAGEMENT = {
    neutral: [
        "Check your transactions for today 🚀",
        "Keep your finances on track. Update your spendings.",
        "A clear mind starts with clear finances.",
    ],
    witty: [
        "Did your wallet lose weight today? 📉 Check transactions.",
        "Money talks. Yours is saying 'Track me!' 💸",
        "Don't let your budget ghost you. 👻",
        "Spending is easy. Tracking is... also easy with Fiinny. 😉",
    ],
    streak: [
        (n: number) => `🔥 ${n} Day Streak! Keep the fire burning!`,
        (n: number) => `You're on a roll! ${n} days in a row. 🚀`,
        (n: number) => `Don't break the chain! Day ${n} is here.`,
    ],
    morning: [
        "Rise and shine! ☀️ Any coffee spends to log?",
        "Good morning! Start the day with financial clarity.",
    ],
    evening: [
        "Wrapping up the day? 🌙 Log your daily total.",
        "Evening check-in: How did your budget do today?",
    ]
};

function getDailyMessage(streak: number): { title: string; body: string } {
    // 30% chance of Witty, 30% Streak (if > 2), 20% Time based, 20% Neutral
    const rand = Math.random();
    const hour = new Date().getHours() + 5.5; // Rough IST check (cloud is UTC)

    let templates = COPY_ENGAGEMENT.neutral;
    let prefix = "";

    if (streak > 2 && rand > 0.7) {
        // Streak oriented
        const tmpl: any = COPY_ENGAGEMENT.streak[Math.floor(Math.random() * COPY_ENGAGEMENT.streak.length)];
        return {
            title: "Streak Alert! 🔥",
            body: typeof tmpl === 'function' ? tmpl(streak) : tmpl,
        };
    } else if (rand > 0.4) {
        // Witty
        templates = COPY_ENGAGEMENT.witty;
        prefix = "Hey there! ";
    } else if (hour < 11) {
        templates = COPY_ENGAGEMENT.morning;
    } else if (hour > 19) {
        templates = COPY_ENGAGEMENT.evening;
    }

    const msg = templates[Math.floor(Math.random() * templates.length)];
    return {
        title: "Daily Check-in",
        body: prefix + msg,
    };
}

/**
 * DAILY ENGAGEMENT: "0 9 * * *" -> 9 AM Daily
 * Sends a personalized engagement notification.
 */
export const scheduledDailyEngagement = onSchedule(
    {
        schedule: "0 9 * * *",
        timeZone: "Asia/Kolkata",
        retryCount: 3,
    },
    async (event) => {
        logger.info("Starting daily engagement run");

        // 1. Get all users
        const snapshot = await db.collection("users").get();

        // We process individually to customize COPY (Streak based)
        const promises = snapshot.docs.map(async (doc) => {
            const data = doc.data();
            const token = data.fcmToken;
            if (!token) return;

            const streak = data.currentStreak || 0;
            const { title, body } = getDailyMessage(streak);

            try {
                await fcm.send({
                    token: token,
                    notification: { title, body },
                    android: {
                        notification: {
                            channelId: "fiinny_nudges",
                            clickAction: "FLUTTER_NOTIFICATION_CLICK",
                        },
                    },
                    data: {
                        type: "daily_engagement",
                        deeplink: "app://tx/today", // Opens Today's log
                    },
                });
            } catch (e) {
                logger.error(`Failed daily send to ${doc.id}`, e);
            }
        });

        await Promise.all(promises);
        logger.info(`Daily engagement run complete for ${snapshot.size} users.`);
    }
);

/**
 * MONTHLY SUMMARY: "0 10 1 * *" -> 10 AM on 1st of every month
 * Calculates generic stats for previous month and notifies.
 */
export const scheduledMonthlySummary = onSchedule(
    {
        schedule: "0 10 1 * *",
        timeZone: "Asia/Kolkata",
        retryCount: 3,
    },
    async (event) => {
        logger.info("Starting monthly summary run");

        // MVP: Iterate all users. Production: use PubSub fanout.
        const snapshot = await db.collection("users").get();

        // Determine previous month range
        const now = new Date();
        const firstDayPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);

        // Prepare batch promises
        const promises = snapshot.docs.map(async (userDoc) => {
            const data = userDoc.data();
            const token = data.fcmToken;
            if (!token) return;

            const uid = userDoc.id; // Phone or UUID

            // Simple Aggregation: Query expenses for prev month
            // Note: This is read-heavy. 
            const expenses = await db.collection(`users/${uid}/expenses`)
                .where("date", ">=", firstDayPrevMonth)
                .where("date", "<=", lastDayPrevMonth)
                .get();

            let total = 0;
            let topCat = "";
            const catMap: Record<string, number> = {};

            expenses.docs.forEach((d) => {
                const dData = d.data();
                const amt = dData.amount || 0;
                const cat = dData.category || "Uncategorized";
                total += amt;
                catMap[cat] = (catMap[cat] || 0) + amt;
            });

            if (total === 0) return; // Skip inactive users

            // Find top category
            let maxCatVal = -1;
            for (const [k, v] of Object.entries(catMap)) {
                if (v > maxCatVal) {
                    maxCatVal = v;
                    topCat = k;
                }
            }

            // Send personalized notification
            try {
                await fcm.send({
                    token: token,
                    notification: {
                        title: "Your Monthly Recap 📊",
                        body: `You spent ₹${Math.round(total)} last month. Top category: ${topCat}. Tap to see more.`,
                    },
                    android: {
                        notification: {
                            channelId: "fiinny_digests",
                        },
                    },
                    data: {
                        type: "monthly_summary",
                        deeplink: "app://analytics/monthly",
                    },
                });

                // Add to In-App Feed
                await db.collection(`users/${uid}/notif_feed`).add({
                    title: "Monthly Recap Ready",
                    body: `Total: ₹${Math.round(total)} | Top: ${topCat}`,
                    type: "summary",
                    createdAt: FieldValue.serverTimestamp(),
                    read: false,
                });

            } catch (e) {
                logger.error(`Failed to send monthly to ${uid}`, e);
            }
        });

        await Promise.all(promises);
        logger.info("Monthly summary run complete");
    }
);

/**
 * GROUP EXPENSE TRIGGER
 * Listens to `group_expenses/{expenseId}` and notifies participants.
 */
export const onGroupExpenseCreated = onDocumentCreated(
    {
        document: "group_expenses/{expenseId}",
        region: "asia-south1",
        retry: false,
    },
    async (event) => {
        const snap = event.data;
        if (!snap) return;

        const expense = snap.data();
        const groupId = expense.groupId;
        const payerId = expense.payerId; // Phone or UID
        const amount = expense.amount;
        const friendIds = expense.friendIds || []; // Participants

        if (!groupId || !payerId) return;

        // Identify recipients: everyone in friendIds EXCEPT payer
        // Also check if split details are available
        const recipients: string[] = friendIds.filter((id: string) => id !== payerId);

        // Also include custom split participants if any
        if (expense.customSplits) {
            Object.keys(expense.customSplits).forEach((id) => {
                if (id !== payerId && !recipients.includes(id)) {
                    recipients.push(id);
                }
            });
        }

        if (recipients.length === 0) return;

        // Resolve tokens for recipients
        // recipients are user IDs/Phones. Need to look up their User Docs to get fcmTokens.
        const tokens: string[] = [];
        const fetchPromises = recipients.map(async (uid: string) => {
            const uDoc = await db.collection("users").doc(uid).get();
            if (uDoc.exists) {
                const uData = uDoc.data();
                if (uData?.fcmToken) tokens.push(uData.fcmToken);
            }
        });
        await Promise.all(fetchPromises);

        if (tokens.length === 0) return;

        // Send Notification
        try {
            await fcm.sendEachForMulticast({
                tokens: tokens,
                notification: {
                    title: "New Group Expense 💸",
                    body: `${payerId} added an expense of ₹${amount}.`,
                },
                android: {
                    notification: {
                        channelId: "fiinny_default",
                        tag: `group_${groupId}`, // Collapse updates for same group
                    },
                },
                data: {
                    type: "group_expense",
                    groupId: groupId,
                    expenseId: event.params.expenseId,
                    deeplink: `app://group-detail/${groupId}`,
                },
            });
        } catch (e) {
            logger.error("Failed to send group expense notif", e);
        }
    }
);
