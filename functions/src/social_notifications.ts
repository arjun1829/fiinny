import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { initializeApp, getApps } from "firebase-admin/app";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";

if (getApps().length === 0) initializeApp();
const db = getFirestore();
const fcm = getMessaging();

/**
 * 1. FRIEND MIRROR NOTIFICATION
 * Triggers when a 'shared' expense is mirrored to a friend's feed (creating a debt).
 * Listens to: users/{friendId}/expenses/{expenseId}
 * Metadata to look for: 'mirroredFrom' to distinguish from user's own expenses.
 */
export const onFriendExpenseMirrored = onDocumentCreated(
    {
        document: "users/{friendPhone}/expenses/{expenseId}",
        region: "asia-south1",
        retry: false,
    },
    async (event) => {
        const friendPhone = event.params.friendPhone;
        const snap = event.data;
        if (!snap) return;

        const data = snap.data();

        // Only trigger if this expense was Mirrored (created by someone else)
        if (!data.mirroredFrom) return;

        const createdBy = data.createdBy; // The friend who added the expense
        const amount = data.amount;
        const note = data.note || "Shared Expense";

        // Get Friend's Token
        const friendDoc = await db.collection("users").doc(friendPhone).get();
        const token = friendDoc.data()?.fcmToken;

        if (!token) return;

        try {
            await fcm.send({
                token: token,
                notification: {
                    title: `New Expense from ${createdBy}`,
                    body: `You owe ₹${amount} for "${note}".`,
                },
                android: {
                    notification: {
                        channelId: "fiinny_social",
                        tag: `friend_expense_${event.params.expenseId}`,
                        clickAction: "FLUTTER_NOTIFICATION_CLICK"
                    }
                },
                data: {
                    type: "friend_expense",
                    expenseId: event.params.expenseId,
                    deeplink: "app://friends", // Open Friend tab to settle
                }
            });
            logger.info(`Sent friend mirror notif to ${friendPhone}`);
        } catch (e) {
            logger.error("Failed to send friend mirror notif", e);
        }
    }
);

/**
 * 2. MONTHLY SETTLEMENT NUDGE
 * Runs on 1st of every month at 10 AM.
 * Checks if user owes money > ₹500 across all friends.
 */
export const scheduledSettlementNudge = onSchedule(
    {
        schedule: "0 10 1 * *", // 1st of month 10 AM
        timeZone: "Asia/Kolkata",
        retryCount: 3,
    },
    async (event) => {
        logger.info("Starting monthly settlement check");
        const snapshot = await db.collection("users").get();

        const promises = snapshot.docs.map(async (doc) => {
            const userPhone = doc.id;
            const data = doc.data();
            const token = data.fcmToken;
            if (!token) return;

            // Calculate Net Balance (Naive Check from 'friends' subcollection)
            // Real implementation might need aggregating expenses, but let's check 'friends' metadata if available
            // OR checks for 'debts' summary if we maintain it. 
            // For MVP: Let's assume we check 'recent' shared expenses or just send a generic "Check your balances" nudge.

            // Allow checking a 'friends' collection summary if it exists
            const friendsSnap = await db.collection(`users/${userPhone}/friends`).get();
            let totalOwed = 0;

            friendsSnap.docs.forEach(fDoc => {
                const fData = fDoc.data();
                // If 'netBalance' < 0 means I owe money (assuming negative is debt)
                if ((fData.netBalance || 0) < -500) {
                    totalOwed += Math.abs(fData.netBalance);
                }
            });

            if (totalOwed > 500) {
                try {
                    await fcm.send({
                        token: token,
                        notification: {
                            title: "Time to Settle Up? 💸",
                            body: `It's the 1st of the month! You have pending settlements. Clear them to start fresh.`,
                        },
                        data: {
                            type: "settle_nudge",
                            deeplink: "app://friends"
                        }
                    });
                } catch (e) {
                    logger.error(`Failed settlement nudge for ${userPhone}`, e);
                }
            }
        });

        await Promise.all(promises);
    }
);
