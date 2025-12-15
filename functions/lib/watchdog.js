import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { initializeApp, getApps } from "firebase-admin/app";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
if (getApps().length === 0)
    initializeApp();
const db = getFirestore();
const fcm = getMessaging();
// --- Regex Logic Ported from Client (HiddenChargesCard.dart) ---
const FEE_WORDS = /\b(?:convenience\s*fee|conv\.?\s*fee|processing\s*fee|platform\s*fee|late\s*fee|penalt(?:y|ies)|surcharge|fuel\s*surcharge|gst|igst|cgst|sgst|markup)\b/i;
const FOREX_WORDS = /\b(forex|fx|cross.?currency|intl|international|overseas|markup)\b/i;
const FOREX_SYMBOLS = /(\$|usd|eur|€|gbp|£)/i;
/**
 * WATCHDOG: Real-time hidden charge detector.
 * Triggers when an expense is created.
 */
export const onExpenseCreatedWatchdog = onDocumentCreated({
    document: "users/{userPhone}/expenses/{expenseId}",
    region: "asia-south1",
    retry: true,
}, async (event) => {
    const userPhone = event.params.userPhone;
    const snap = event.data;
    if (!snap)
        return;
    const data = snap.data();
    const note = (data.note || "").toString();
    const tags = (data.tags || []);
    const amount = data.amount || 0;
    // 1. Detection Logic
    let alertType = null;
    let alertTitle = "";
    let alertBody = "";
    const isFee = FEE_WORDS.test(note) || tags.includes("fee");
    const isForex = FOREX_WORDS.test(note) || FOREX_SYMBOLS.test(note) || tags.includes("forex");
    if (isFee) {
        alertType = "HIDDEN_FEE";
        alertTitle = "⚠️ Hidden Fee Detected";
        alertBody = `We spotted a ₹${amount} charge that looks like a fee ("${note}").`;
    }
    else if (isForex) {
        alertType = "FOREX";
        alertTitle = "🌍 Forex Markup Alert";
        alertBody = `International spend detected: ₹${amount}. Watch out for ~3.5% markup!`;
    }
    if (!alertType)
        return; // No alert needed
    // 2. Fetch User FCM Token
    const userDoc = await db.collection("users").doc(userPhone).get();
    const token = userDoc.data()?.fcmToken;
    if (!token) {
        logger.warn(`No FCM token for user ${userPhone}, skipping Watchdog alert.`);
        return;
    }
    // 3. Send High Priority Notification
    try {
        await fcm.send({
            token: token,
            notification: {
                title: alertTitle,
                body: alertBody,
            },
            android: {
                priority: "high",
                notification: {
                    channelId: "fiinny_alerts", // Critical channel
                    tag: "watchdog_alert",
                    clickAction: "FLUTTER_NOTIFICATION_CLICK"
                }
            },
            data: {
                type: "watchdog_alert",
                expenseId: event.params.expenseId,
                alertType: alertType,
                deeplink: "app://tx/details"
            }
        });
        logger.info(`Watchdog sent ${alertType} alert to ${userPhone}`);
    }
    catch (e) {
        logger.error("Failed to send Watchdog alert", e);
    }
});
//# sourceMappingURL=watchdog.js.map