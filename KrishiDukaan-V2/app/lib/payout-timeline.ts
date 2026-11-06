/**
 * One order's money journey, step by step, for sellers and admins:
 *
 *   Order placed → Customer paid → Held by KrishiDukan → Delivered
 *     → Released to seller → In seller's bank
 *
 * Built only from the order document: its status history, payment, the
 * release the delivery trigger recorded (routeRelease) and Razorpay's
 * transfer status (payout, kept by functions/src/payouts/payout-status.ts).
 * Same rules as the app's mobile/lib/features/dashboard/data/payout_timeline.dart;
 * change them together.
 */

export type TimelineStatus = "done" | "current" | "upcoming" | "failed" | "skipped";

export type TimelineStep = {
  key: "placed" | "paid" | "held" | "delivered" | "released" | "settled" | "cancelled";
  label: string;
  status: TimelineStatus;
  at: Date | null;
  detail?: string;
};

export type PayoutTimeline = {
  steps: TimelineStep[];
  /** One line for lists: where the money is now. */
  headline: string;
  tone: "good" | "info" | "wait" | "warn" | "bad" | "muted";
  /** For admins: something only KrishiDukan can unblock. */
  needsAdmin: boolean;
};

export type TimelineOrder = {
  createdAt?: unknown;
  status?: string;
  total?: number;
  grandTotal?: number;
  statusHistory?: { status?: string; at?: unknown }[];
  payment?: {
    status?: string;
    amount?: number;
    paidAt?: unknown;
    razorpayPaymentId?: string;
    transferId?: string;
    transferredAt?: unknown;
    transferredNet?: number;
    refundedAmount?: number;
    refundedAt?: unknown;
    /** Automatic payout (pay-after-kyc) or payout run: last failure, claim, who paid. */
    payoutError?: string | null;
    payoutClaimed?: boolean;
    payoutVia?: string | null;
  };
  routeRelease?: { status?: string; releaseAt?: unknown; scheduledAt?: unknown; recordedAt?: unknown };
  payout?: {
    state?: string;
    via?: string;
    transferId?: string | null;
    amount?: number;
    onHoldUntil?: number | null;
    settlementId?: string | null;
    settledAt?: unknown;
    /** Razorpay's settlement time (ms) and bank reference. */
    settlementAt?: number | null;
    utr?: string | null;
  };
};

/** Days the payout run waits after delivery (PAYOUT_HOLD_DAYS in seller-earnings.ts). */
const RUN_HOLD_DAYS = 7;

export function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "number") return v > 0 ? new Date(v) : null;
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const t = v as { toDate?: () => Date; seconds?: number; _seconds?: number };
  if (typeof t.toDate === "function") return t.toDate();
  const s = t.seconds ?? t._seconds;
  return typeof s === "number" ? new Date(s * 1000) : null;
}

function lastStatusAt(order: TimelineOrder, status: string): Date | null {
  const h = Array.isArray(order.statusHistory) ? order.statusHistory : [];
  for (let i = h.length - 1; i >= 0; i--) if (h[i]?.status === status) return toDate(h[i]?.at);
  return null;
}

const inr = (n: number) =>
  `₹${n.toLocaleString("en-IN", Number.isInteger(n) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtWhen = (d: Date) =>
  d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function payoutTimeline(
  order: TimelineOrder,
  opts: {
    audience?: "seller" | "admin";
    now?: Date;
    /** True while the seller's KYC isn't verified: unrouted money waits for it. */
    kycPending?: boolean;
  } = {},
): PayoutTimeline {
  const now = opts.now ?? new Date();
  const admin = opts.audience === "admin";
  const status = String(order.status ?? "").toLowerCase();
  const pay = order.payment ?? {};
  const payout = order.payout ?? {};
  const state = String(payout.state ?? "");
  const online = Boolean(pay.razorpayPaymentId || pay.transferId);
  const placedAt = toDate(order.createdAt);
  const deliveredAt = lastStatusAt(order, "delivered");
  const isDelivered = status === "delivered" || deliveredAt !== null;
  const cancelled = status === "cancelled" || status === "rejected" || status === "refunded" || pay.status === "refunded";
  const total = Number(order.total ?? order.grandTotal ?? pay.amount ?? 0) || 0;

  const steps: TimelineStep[] = [{ key: "placed", label: "Order placed", status: "done", at: placedAt }];

  // ── Not paid online: the customer pays the seller directly. ──
  if (!online) {
    steps.push({
      key: "paid",
      label: "Payment",
      status: "skipped",
      at: null,
      detail: "Not paid online. The customer pays you directly (cash or UPI on delivery).",
    });
    steps.push(
      cancelled
        ? { key: "cancelled", label: status === "rejected" ? "Order rejected" : "Order cancelled", status: "failed", at: lastStatusAt(order, status) }
        : { key: "delivered", label: "Delivered", status: isDelivered ? "done" : "current", at: deliveredAt },
    );
    return {
      steps,
      headline: cancelled ? "Cancelled" : "Paid directly by the customer",
      tone: "muted",
      needsAdmin: false,
    };
  }

  steps.push({
    key: "paid",
    label: "Customer paid online",
    status: "done",
    at: toDate(pay.paidAt) ?? placedAt,
    detail: total > 0 ? `${inr(total)} received by KrishiDukan through Razorpay.` : undefined,
  });

  // ── Money pulled back: refund / reassignment. ──
  if (cancelled || state === "reversed") {
    const refunded = Number(pay.refundedAmount ?? 0) || 0;
    steps.push({
      key: "cancelled",
      label: status === "rejected" ? "Order rejected, money refunded" : "Order cancelled, money refunded",
      status: "failed",
      at: toDate(pay.refundedAt) ?? lastStatusAt(order, status),
      detail: refunded > 0 ? `${inr(refunded)} returned to the customer. No payout for this order.` : "No payout for this order.",
    });
    return { steps, headline: "Refunded to customer", tone: "muted", needsAdmin: false };
  }

  const routed = Boolean(payout.transferId) && payout.via !== "balance";
  const amount = typeof payout.amount === "number" && payout.amount > 0 ? payout.amount : null;
  steps.push({
    key: "held",
    label: "Held safely by KrishiDukan",
    status: "done",
    at: toDate(pay.paidAt) ?? placedAt,
    detail: routed
      ? `${amount ? inr(amount) : "Your share"} is reserved for you in Razorpay (transfer ${payout.transferId}) until delivery.`
      : "Kept until the order is delivered, so the customer is protected.",
  });

  steps.push({
    key: "delivered",
    label: "Marked delivered",
    status: isDelivered ? "done" : "current",
    at: deliveredAt,
    detail: isDelivered ? undefined : admin ? "Waiting for the seller to mark it delivered." : "Mark the order delivered to release your money.",
  });

  // ── Release and settlement ──
  const releaseAt =
    (state === "scheduled" && payout.onHoldUntil ? new Date(payout.onHoldUntil) : null) ??
    toDate(order.routeRelease?.releaseAt);
  const settledAt = toDate(payout.settlementAt) ?? toDate(payout.settledAt);
  let released: TimelineStep;
  let settled: TimelineStep;
  let headline: string;
  let tone: PayoutTimeline["tone"];
  let needsAdmin = false;

  if (pay.transferId) {
    // Paid by KrishiDukan's payout run (a direct bank transfer).
    released = {
      key: "released",
      label: "Sent by KrishiDukan",
      status: "done",
      at: toDate(pay.transferredAt),
      detail: `Payout transfer ${pay.transferId}${pay.payoutVia === "after_kyc" ? ", sent automatically after KYC" : ""}.`,
    };
  } else if (state === "processing" || state === "settled") {
    released = { key: "released", label: "Released to you", status: "done", at: releaseAt ?? toDate(order.routeRelease?.recordedAt) };
  } else if (state === "failed") {
    released = { key: "released", label: "Transfer failed", status: "failed", at: null, detail: admin ? "Razorpay could not make the transfer. Check the seller's Route account." : "KrishiDukan support will contact you about this payment." };
    needsAdmin = true;
  } else if (!isDelivered) {
    released = { key: "released", label: "Released to you", status: "upcoming", at: null, detail: "24 hours after delivery." };
  } else if (releaseAt && releaseAt > now) {
    released = { key: "released", label: "Release scheduled", status: "current", at: releaseAt, detail: "Then Razorpay sends it to your bank, usually by the next working day." };
  } else if (releaseAt) {
    released = { key: "released", label: "Releasing now", status: "current", at: releaseAt, detail: "Released at the scheduled time; Razorpay is confirming." };
  } else if (routed || state === "on_hold") {
    released = {
      key: "released",
      label: "Waiting for release",
      status: "current",
      at: null,
      detail: admin
        ? "Delivered but still on hold and no release is scheduled. Release it from Seller payouts → Needs action."
        : "Your money is ready to be released. KrishiDukan releases it shortly.",
    };
    needsAdmin = true;
  } else if (opts.kycPending) {
    // Seller not on Route yet: the money stays with KrishiDukan and is sent
    // automatically once their KYC is verified (functions/src/payouts/pay-after-kyc.ts).
    released = {
      key: "released",
      label: admin ? "Waiting for seller's KYC" : "Waiting for your KYC",
      status: "current",
      at: null,
      detail: admin
        ? "Paid automatically once the seller's bank details and licence are verified."
        : "Your money is safe with KrishiDukan. Finish the 3 steps on the Payouts page and it is sent to your bank automatically.",
    };
  } else {
    // Seller not on Route: paid by the payout run some days after delivery.
    const due = deliveredAt ? new Date(deliveredAt.getTime() + RUN_HOLD_DAYS * 86_400_000) : null;
    released = {
      key: "released",
      label: "Waiting for payout",
      status: "current",
      at: due,
      detail: due
        ? `${due > now ? "Due" : "Was due"} ${fmtWhen(due)}. KrishiDukan sends it to your registered bank account.`
        : "KrishiDukan sends it to your registered bank account.",
    };
    needsAdmin = due !== null && due <= now;
    if (admin && pay.payoutClaimed) {
      // A payout run stopped between paying and writing it down: never paid
      // again automatically, so someone has to look.
      released.detail = "A payout was started but not confirmed. Check Razorpay for a transfer with this order id before paying it.";
      needsAdmin = true;
    } else if (admin && pay.payoutError) {
      released.detail = `Automatic payout failed: ${pay.payoutError}. It is tried again every 6 hours.`;
      needsAdmin = true;
    }
  }

  if (state === "settled") {
    settled = {
      key: "settled",
      label: "In your bank",
      status: "done",
      at: settledAt,
      detail: payout.utr
        ? `Bank reference (UTR) ${payout.utr}. Use it to find the money in your bank statement.`
        : payout.settlementId
          ? `Razorpay settlement ${payout.settlementId}. The bank reference (UTR) shows here once the bank confirms.`
          : undefined,
    };
    headline = settledAt ? `In your bank since ${fmtWhen(settledAt)}` : "In your bank";
    tone = "good";
  } else if (state === "processing" || (pay.transferId && state !== "failed")) {
    settled = { key: "settled", label: "In your bank", status: "current", at: null, detail: "Razorpay is sending it to your bank, usually by the next working day." };
    headline = "On the way to your bank";
    tone = "info";
  } else {
    settled = { key: "settled", label: "In your bank", status: "upcoming", at: null };
    if (state === "failed") {
      headline = "Transfer failed";
      tone = "bad";
    } else if (!isDelivered) {
      headline = "Waiting for delivery";
      tone = "wait";
    } else if (released.label === "Release scheduled" && releaseAt) {
      headline = `Releases ${fmtWhen(releaseAt)}`;
      tone = "wait";
    } else if (released.label === "Releasing now") {
      headline = "Releasing now";
      tone = "info";
    } else {
      const waitingKyc = released.label === "Waiting for your KYC" || released.label === "Waiting for seller's KYC";
      headline =
        released.label === "Waiting for payout"
          ? "Waiting for payout"
          : waitingKyc
            ? (admin ? released.label : "Finish KYC to get paid")
            : "Waiting for release";
      tone = needsAdmin || waitingKyc ? "warn" : "wait";
    }
  }

  if (admin) {
    // Same steps, in the third person.
    const third = (t?: string) => t?.replace(/to you\b/, "to seller").replace(/your (bank|registered bank account)/g, "the seller's $1").replace(/^Your share/, "Seller's share").replace(/for you\b/, "for the seller");
    for (const s of [...steps, released, settled]) {
      s.label = third(s.label)!;
      s.detail = third(s.detail);
    }
    settled.label = "In seller's bank";
    headline = third(headline)!;
  }
  steps.push(released, settled);
  return { steps, headline, tone, needsAdmin };
}
