import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { initializeApp, getApps } from "firebase-admin/app";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
if (getApps().length === 0)
    initializeApp();
const db = getFirestore();
/**
 * Updates the user's "currentStreak" and "lastLogDate" whenever a new expense is added.
 * This runs for ANY expense addition (manual, SMS, etc).
 */
export const onExpenseCreatedStreak = onDocumentCreated({
    document: "users/{userPhone}/expenses/{expenseId}",
    region: "asia-south1",
    retry: true, // Retry on failure to ensure streak accuracy
}, async (event) => {
    const userPhone = event.params.userPhone;
    const snap = event.data;
    if (!snap)
        return;
    // Use transaction to safely update streak
    const userRef = db.collection("users").doc(userPhone);
    await db.runTransaction(async (t) => {
        const userDoc = await t.get(userRef);
        if (!userDoc.exists)
            return; // Should exist, but safety first
        const data = userDoc.data() || {};
        const lastDateStr = data.lastLogDate; // "YYYY-MM-DD"
        const currentStreak = data.currentStreak || 0;
        const now = new Date();
        // Adjust to IST roughly or UTC, consistenly. Let's use UTC date string for simplicity 
        // or simplistic IST "en-IN".
        // Better: Store timestamp, but compare "Calendar Days".
        // Let's rely on a formatted YYYY-MM-DD string roughly in User's timezone. 
        // For MVP, valid "India" time:
        const todayStr = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }))
            .toISOString().split("T")[0];
        if (lastDateStr === todayStr) {
            // Already logged today, do nothing to streak
            return;
        }
        let newStreak = 1;
        if (lastDateStr) {
            const lastDate = new Date(lastDateStr);
            const todayDate = new Date(todayStr);
            const diffTime = Math.abs(todayDate.getTime() - lastDate.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays === 1) {
                // Consecutive day
                newStreak = currentStreak + 1;
            }
            else {
                // Streak broken (diffDays > 1)
                newStreak = 1;
            }
        }
        t.update(userRef, {
            currentStreak: newStreak,
            lastLogDate: todayStr,
            lastLogAt: FieldValue.serverTimestamp(),
        });
    });
});
//# sourceMappingURL=streaks.js.map