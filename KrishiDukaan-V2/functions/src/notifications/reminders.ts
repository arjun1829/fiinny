import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { firstPhone, notify } from "../notify";

const db = (): admin.firestore.Firestore => admin.firestore();

/** `YYYY-MM-DD` in IST — the once-per-day dedupe key for both reminders. */
function istDayKey(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

// ─── Incomplete profile ──────────────────────────────────────────────────────

const SELLER_ROLES = ["retailer", "manufacturer"];

/**
 * Fields the app's profile editor asks for. Kept in the same order the form
 * shows them so the reminder names the first thing the user will actually see.
 * Mirrors UserModel.isProfileComplete in the mobile app.
 */
function missingProfileFields(d: Record<string, unknown>): string[] {
  const has = (k: string) => String(d[k] ?? "").trim().length > 0;
  const missing: string[] = [];
  if (!has("name")) missing.push("your name");
  if (!has("businessName")) missing.push("business name");
  if (!has("city") && !has("address")) missing.push("store address");
  if (!has("pincode")) missing.push("pincode");
  return missing;
}

/**
 * Reminds sellers with an incomplete profile, at most once a day, until the
 * profile is complete. `profileReminderOn` on the user doc is the dedupe key,
 * so a retry or a second deploy on the same day cannot double-send.
 */
export const remindIncompleteProfiles = onSchedule(
  { schedule: "0 10 * * *", timeZone: "Asia/Kolkata", timeoutSeconds: 540 },
  async () => {
    const today = istDayKey();
    let sent = 0;

    for (const role of SELLER_ROLES) {
      const snap = await db().collection("users").where("role", "==", role).get();

      for (const doc of snap.docs) {
        const d = doc.data() as Record<string, unknown>;
        if (d.profileCompleted === true) continue;

        const missing = missingProfileFields(d);
        if (missing.length === 0) continue;
        if (String(d.profileReminderOn ?? "") === today) continue;

        const phone = String(d.phone ?? doc.id).trim();
        if (!phone) continue;

        const list =
          missing.length === 1
            ? missing[0]
            : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;

        try {
          await notify(
            phone,
            "profile_incomplete",
            "Complete your profile 📝",
            `Still missing: ${list}. A complete profile helps buyers find your store.`,
            { missing: missing.join("|") }
          );
          await doc.ref.update({ profileReminderOn: today });
          sent++;
        } catch (err) {
          logger.error(`[remindIncompleteProfiles] failed for ${phone}`, err);
        }
      }
    }

    logger.info(`[remindIncompleteProfiles] sent ${sent}`);
  }
);

// ─── Incomplete payout details ───────────────────────────────────────────────

/** Bank fields payoutAccounts/{phone} needs before a seller can be verified
 *  for payouts — see app/dashboard/payouts/page.tsx's own validation. */
const REQUIRED_BANK_FIELDS: Array<{ key: string; label: string }> = [
  { key: "accountHolderName", label: "account holder name" },
  { key: "accountNumber", label: "bank account number" },
  { key: "ifsc", label: "IFSC code" },
];

/** Required KYC doc types — mirrors app/dashboard/_components/kyc-documents.tsx
 *  and mobile's payouts_screen.dart _kDocSpecs (GST certificate excluded on
 *  purpose in both — it's the one optional doc). */
const REQUIRED_DOC_TYPES: Array<{ key: string; label: string }> = [
  { key: "pan_card", label: "PAN card" },
  { key: "cancelled_cheque", label: "cancelled cheque" },
  { key: "address_proof", label: "address proof" },
  { key: "owner_photo", label: "owner photo" },
  { key: "trade_license", label: "trade license" },
];

/** What's still missing before Razorpay can activate this seller for payouts. */
function missingPayoutItems(payout: Record<string, unknown>): string[] {
  const missing: string[] = [];
  for (const f of REQUIRED_BANK_FIELDS) {
    if (!String(payout[f.key] ?? "").trim()) missing.push(f.label);
  }
  const docs = (payout.documents ?? {}) as Record<string, unknown>;
  for (const d of REQUIRED_DOC_TYPES) {
    if (!docs[d.key]) missing.push(d.label);
  }
  return missing;
}

/**
 * Reminds a paid seller with incomplete payout details, at most once a day,
 * until everything required is on file. Only paid sellers are considered —
 * an unpaid account cannot reach the dashboard this points to at all
 * (canAccessDashboard = isSeller && isPaid), so reminding them would open a
 * screen they're paywalled out of.
 *
 * Skips a seller already verified (nothing missing that matters at that
 * point) — payoutAccounts.status stays authoritative even if a later profile
 * edit technically blanks a field, since re-verification is a support flow,
 * not something this reminder should nag about.
 */
export const remindIncompletePayoutDetails = onSchedule(
  { schedule: "30 10 * * *", timeZone: "Asia/Kolkata", timeoutSeconds: 540 },
  async () => {
    const today = istDayKey();
    let sent = 0;

    for (const role of SELLER_ROLES) {
      const snap = await db()
        .collection("users")
        .where("role", "==", role)
        .where("isPaid", "==", true)
        .get();

      for (const doc of snap.docs) {
        const d = doc.data() as Record<string, unknown>;
        const phone = String(d.phone ?? doc.id).trim();
        if (!phone) continue;
        if (String(d.payoutReminderOn ?? "") === today) continue;

        const payoutSnap = await db().collection("payoutAccounts").doc(phone).get();
        const payout = payoutSnap.exists ? (payoutSnap.data() as Record<string, unknown>) : {};
        if (payout.status === "verified") continue;

        const missing = missingPayoutItems(payout);
        if (missing.length === 0) continue;

        const list =
          missing.length === 1
            ? missing[0]
            : missing.length <= 3
            ? `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`
            : `${missing.slice(0, 2).join(", ")} and ${missing.length - 2} more`;

        try {
          await notify(
            phone,
            "payout_incomplete",
            "Finish setting up your payouts 💰",
            `Still needed: ${list}. We can't send you money until this is complete.`,
            { missing: missing.join("|") }
          );
          await doc.ref.update({ payoutReminderOn: today });
          sent++;
        } catch (err) {
          logger.error(`[remindIncompletePayoutDetails] failed for ${phone}`, err);
        }
      }
    }

    logger.info(`[remindIncompletePayoutDetails] sent ${sent}`);
  }
);

// ─── Subscription expiry ─────────────────────────────────────────────────────

/** Milestone reminders; below the smallest one it becomes a daily nudge. */
const MILESTONE_DAYS = [10, 5, 3];

/**
 * Duration in months, preferring an explicit field and falling back to the
 * start→expiry span. Admin-created subscriptions do not always store one.
 */
function durationMonths(d: Record<string, unknown>): number {
  for (const key of ["durationMonths", "planMonths", "months"]) {
    const v = d[key];
    if (typeof v === "number" && v > 0) return v;
  }
  const start = d.startDate as admin.firestore.Timestamp | undefined;
  const expiry = d.expiryDate as admin.firestore.Timestamp | undefined;
  if (start && expiry) {
    const days = (expiry.toMillis() - start.toMillis()) / (24 * 60 * 60 * 1000);
    const months = Math.round(days / 30);
    if (months > 0) return months;
  }
  return 1;
}

/**
 * Subscription expiry reminders at 10, 5 and 3 days out, then every day until
 * expiry. The notification carries the seller's current seat count and plan
 * length so the app can open the renewal screen pre-configured — the user only
 * has to pay.
 *
 * Separate from `remindExpiringSubscriptions` in index.ts, which sends the
 * WhatsApp message on its own (2-day) cadence and is left untouched.
 */
export const remindSubscriptionRenewal = onSchedule(
  { schedule: "0 11 * * *", timeZone: "Asia/Kolkata", timeoutSeconds: 540 },
  async () => {
    const today = istDayKey();
    const now = Date.now();
    const msPerDay = 24 * 60 * 60 * 1000;

    // Everything expiring within the widest milestone. Single range clause on
    // top of one equality — matches the existing subscriptions index.
    const horizon = admin.firestore.Timestamp.fromMillis(
      now + (Math.max(...MILESTONE_DAYS) + 1) * msPerDay
    );
    const snap = await db()
      .collection("subscriptions")
      .where("subscriptionStatus", "==", "active")
      .where("expiryDate", "<=", horizon)
      .get();

    let sent = 0;
    for (const doc of snap.docs) {
      const d = doc.data() as Record<string, unknown>;
      const expiry = d.expiryDate as admin.firestore.Timestamp | undefined;
      if (!expiry) continue;

      // Whole days remaining; already-expired docs are left to expireSubscriptions.
      const daysLeft = Math.ceil((expiry.toMillis() - now) / msPerDay);
      if (daysLeft < 0) continue;

      const isMilestone = MILESTONE_DAYS.includes(daysLeft);
      const isDailyNudge = daysLeft < Math.min(...MILESTONE_DAYS);
      if (!isMilestone && !isDailyNudge) continue;

      // One reminder per subscription per day, whichever branch matched.
      if (String(d.renewalRemindedOn ?? "") === today) continue;

      const ownerPhone = firstPhone(d.ownerPhone, d.ownerId);
      if (!ownerPhone) continue;

      const seats = Number(d.seatsPurchased) || 1;
      const months = durationMonths(d);

      const when =
        daysLeft === 0
          ? "today"
          : daysLeft === 1
          ? "tomorrow"
          : `in ${daysLeft} days`;

      try {
        await notify(
          ownerPhone,
          "subscription_expiry",
          daysLeft <= 1 ? "Your subscription expires today ⏳" : "Subscription expiring soon ⏳",
          `Your Krishi Dukan plan ends ${when}. Renew now to keep your dashboard and listings live.`,
          {
            subscriptionId: doc.id,
            daysLeft: String(daysLeft),
            seats: String(seats),
            months: String(months),
          }
        );
        await doc.ref.update({ renewalRemindedOn: today });
        sent++;
      } catch (err) {
        logger.error(`[remindSubscriptionRenewal] failed for ${ownerPhone}`, err);
      }
    }

    logger.info(`[remindSubscriptionRenewal] sent ${sent}`);
  }
);
