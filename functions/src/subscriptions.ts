import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
// @ts-ignore: razorpay doesn't always have types easily available
import Razorpay from "razorpay";

const db = admin.firestore();

// Initialize Razorpay
// TODO: Make sure to set these in your .env file or Firebase secrets
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || "",
    key_secret: process.env.RAZORPAY_KEY_SECRET || "",
});

/**
 * Create a Razorpay Order (for One-time/Yearly) or use Subscription API (not implemented fully here yet).
 * For this simplified flow, we'll treat the Yearly plan as a standard "Order" and handle renewal manually or via recurring logic if needed.
 * But the user requirement mentions "Billing Cycle: Auto / One-time".
 * If Auto (Subscription), we need to create a Subscription in Razorpay.
 * If One-time, we create an Order.
 *
 * Params:
 * - planId: "premium" | "pro"
 * - cycle: "monthly" | "yearly"
 */
export const createPaymentOrder = onCall(
    { region: "asia-south1" },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "User must be logged in.");
        }

        const { plan, cycle } = request.data;
        if (!["premium", "pro"].includes(plan) || !["monthly", "yearly"].includes(cycle)) {
            throw new HttpsError("invalid-argument", "Invalid plan or cycle.");
        }

        const uid = request.auth.uid;

        // Base Pricing (In Paise)
        let amountInPaise = 0;
        if (plan === "premium") {
            amountInPaise = cycle === "yearly" ? 149900 : 19900;
        } else if (plan === "pro") {
            amountInPaise = cycle === "yearly" ? 299900 : 29900;
        }

        try {
            // Check for existing active subscription (Proration Logic)
            const userSubDoc = await db.collection("subscriptions").doc(uid).get();
            if (userSubDoc.exists) {
                const subData = userSubDoc.data();
                if (subData && subData.status === 'active' && subData.expiry_date) {
                    const now = admin.firestore.Timestamp.now();
                    const expiry = subData.expiry_date as admin.firestore.Timestamp;

                    // Only prorate if upgrading (e.g., Premium -> Pro) and current sub is not expired
                    // And we are not just renewing the same plan
                    if (expiry.toMillis() > now.toMillis() && subData.plan !== plan) {
                        // Check if it's an upgrade (Premium -> Pro)
                        // We technically allow Pro -> Premium downgrade but usually that's just a plan switch without refund, 
                        // or we can apply value. 
                        // User said: "if upgrade we will give costing after removing the balance amount"

                        const isUpgrade = (subData.plan === 'premium' && plan === 'pro');

                        if (isUpgrade) {
                            const remainingMillis = expiry.toMillis() - now.toMillis();
                            const remainingDays = remainingMillis / (1000 * 60 * 60 * 24);

                            // Calculate daily rate of CURRENT plan
                            let currentDailyRate = 0;
                            if (subData.plan === 'premium') {
                                currentDailyRate = subData.billing_cycle === 'yearly' ? (149900 / 365) : (19900 / 30);
                            } else if (subData.plan === 'pro') {
                                currentDailyRate = subData.billing_cycle === 'yearly' ? (299900 / 365) : (29900 / 30);
                            }

                            const creditAmount = Math.floor(remainingDays * currentDailyRate);

                            // Apply credit, but don't go below 0 (or minimum charge)
                            // Razorpay minimum is usually ₹1 (100 paise)
                            amountInPaise = Math.max(100, amountInPaise - creditAmount);

                            console.log(`Proration: User ${uid} has ${remainingDays.toFixed(1)} days left. Credit: ${creditAmount}. New Total: ${amountInPaise}`);
                        }
                    }
                }
            }

            const options = {
                amount: amountInPaise,
                currency: "INR",
                receipt: `receipt_${uid}_${Date.now()}`,
                notes: {
                    uid: uid,
                    plan: plan,
                    cycle: cycle,
                    type: "upgrade_or_new"
                },
            };

            const order = await razorpay.orders.create(options);

            return {
                order_id: order.id,
                key_id: process.env.RAZORPAY_KEY_ID,
                amount: amountInPaise,
            };
        } catch (error: any) {
            console.error("Razorpay Error:", error);
            throw new HttpsError("internal", error.message || "Failed to create order");
        }
    }
);

/**
 * Cancel Subscription
 * Actually just turns off auto-renew or marks as 'canceled' state 
 * so it won't prompt for renewal, but access remains until expiry.
 */
export const cancelSubscription = onCall(
    { region: "asia-south1" },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "User must be logged in.");
        }
        const uid = request.auth.uid;

        try {
            await db.collection("subscriptions").doc(uid).update({
                auto_renew: false,
                status: 'canceled_pending_expiry', // Custom status to show UI "Canceling"
                updated_at: admin.firestore.FieldValue.serverTimestamp()
            });
            return { success: true };
        } catch (error: any) {
            console.error("Cancel Error:", error);
            throw new HttpsError("internal", "Failed to cancel subscription.");
        }
    }
);

/**
 * Verify Razorpay Payment Signature
 *
 * Params:
 * - razorpay_payment_id
 * - razorpay_order_id
 * - razorpay_signature
 * - plan
 * - cycle
 */
export const verifyPaymentSignature = onCall(
    { region: "asia-south1" },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "User must be logged in.");
        }

        const {
            razorpay_payment_id,
            razorpay_order_id,
            razorpay_signature,
            plan,
            cycle,
        } = request.data;

        const secret = process.env.RAZORPAY_KEY_SECRET;
        if (!secret) {
            throw new HttpsError("failed-precondition", "Payment provider not configured.");
        }

        const generatedSignature = crypto
            .createHmac("sha256", secret)
            .update(razorpay_order_id + "|" + razorpay_payment_id)
            .digest("hex");

        if (generatedSignature !== razorpay_signature) {
            throw new HttpsError("permission-denied", "Invalid payment signature.");
        }

        // Payment Verified -> Activate Subscription
        const uid = request.auth.uid;
        const now = new Date();
        const purchaseDate = admin.firestore.Timestamp.fromDate(now);

        let expiryDate: admin.firestore.Timestamp;
        if (cycle === "yearly") {
            const d = new Date(now);
            d.setFullYear(d.getFullYear() + 1);
            expiryDate = admin.firestore.Timestamp.fromDate(d);
        } else {
            const d = new Date(now);
            d.setMonth(d.getMonth() + 1);
            expiryDate = admin.firestore.Timestamp.fromDate(d);
        }

        const subData = {
            user_id: uid,
            plan: plan,
            billing_cycle: cycle,
            status: "active",
            purchase_date: purchaseDate,
            activation_date: purchaseDate,
            expiry_date: expiryDate,
            razorpay_payment_id: razorpay_payment_id,
            razorpay_order_id: razorpay_order_id,
            auto_renew: false, // Set false for standard order flow
            last_verified_at: purchaseDate,
        };

        await db.collection("subscriptions").doc(uid).set(subData, { merge: true });

        return { success: true };
    }
);

/**
 * Razorpay Webhook (Optional for Order flow, Critical for Subscription flow)
 * Endpoint: /razorpayWebhook
 */
export const razorpayWebhook = onRequest(
    { region: "asia-south1" },
    async (req, res) => {
        // Validate webhook secret if you set one in Razorpay Dashboard
        // const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
        // ... validation logic ...

        // Handle events like payment.captured, subscription.charged, etc.
        const event = req.body.event;
        console.log("Received Webhook:", event);

        if (event === "payment.captured") {
            // maybe log it
        }

        res.json({ status: "ok" });
    }
);
