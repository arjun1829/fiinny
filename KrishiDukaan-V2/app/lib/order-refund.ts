import Razorpay from "razorpay";
import { getAdminDb } from "./firebase-admin";
import { grossFor, type OrderLike } from "../dashboard/_lib/seller-earnings";
import { reverseOrderSellerTransfer } from "./route-transfers";

/**
 * Shared core for every refund path — admin's manual refund, a seller/admin
 * rejecting a paid order, and a customer cancelling one. One implementation
 * of the money-movement logic, called from three different auth contexts
 * (see app/api/admin/order-refund, app/api/orders/reject, app/api/orders/cancel).
 *
 * ORDER OF OPERATIONS MATTERS. If money has already been transferred to the
 * seller's linked account, it is no longer in the platform's balance —
 * refunding the customer first would either fail for insufficient balance or
 * leave the platform out of pocket by the full order value. So: reverse the
 * transfer, THEN refund. If the reversal fails, the refund is not attempted
 * and the caller is told why, rather than half-completing a two-legged money
 * movement.
 */

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export type RefundOutcome =
  | {
      ok: true;
      orderId: string;
      refundId: string;
      refundAmount: number;
      full: boolean;
      transferReversalId: string | null;
    }
  | { ok: false; status: number; error: string };

/**
 * Refunds an order via Razorpay, reversing the seller's Route transfer first
 * when one exists, and records the outcome on the order doc. Does NOT set
 * `status` — callers decide what status a refund implies (a rejected order,
 * a cancelled one, or a partial refund that leaves the order's status alone)
 * and apply that themselves alongside whatever else that transition needs.
 *
 * `amount` in rupees; omitted means a full refund of the order total.
 */
export async function refundOrder(params: {
  orderId: string;
  amount?: number;
  reason: string;
}): Promise<RefundOutcome> {
  const { orderId, amount, reason } = params;
  const db = getAdminDb();
  const orderRef = db.collection("orders").doc(orderId);
  const snap = await orderRef.get();
  if (!snap.exists) {
    return { ok: false, status: 404, error: "Order not found" };
  }

  const order = snap.data() as FirebaseFirestore.DocumentData;
  const payment = (order.payment ?? {}) as {
    razorpayPaymentId?: string;
    transferId?: string;
    refundId?: string;
  };

  if (payment.refundId) {
    return { ok: false, status: 409, error: `Already refunded (${payment.refundId}).` };
  }
  if (!payment.razorpayPaymentId) {
    return { ok: false, status: 400, error: "This order has no Razorpay payment to refund." };
  }

  const orderTotal = grossFor({ id: orderId, ...(order as object) } as OrderLike);
  const refundAmount =
    typeof amount === "number" && amount > 0
      ? Math.round(Math.min(amount, orderTotal) * 100) / 100
      : orderTotal;

  if (refundAmount <= 0) {
    return { ok: false, status: 400, error: "Nothing to refund on this order." };
  }

  // ── 1. Reverse the seller's transfer, if money already went out ─────────
  //
  // Two kinds of seller transfer can exist, and only one is recorded on the
  // order:
  //   - payment.transferId — a manual balance payout (api/admin/payout-transfer),
  //     only ever made after delivery.
  //   - a Route transfer on the payment itself — the HELD transfer checkout
  //     creates for a seller with a linked account, or the one written when an
  //     order is reassigned. Never recorded as payment.transferId, which is why
  //     rejecting or cancelling a linked seller's order used to refund the
  //     customer from the platform's own balance while the seller's transfer
  //     sat on hold untouched.
  let reversalId: string | null = null;
  if (!payment.transferId) {
    const route = await reverseOrderSellerTransfer(
      orderId,
      order,
      Math.round(refundAmount * 100),
    );
    if (route.ok === false) {
      // Same posture as the balance-payout reversal below: refunding while the
      // seller still holds the money leaves the platform short.
      return {
        ok: false,
        status: 502,
        error: route.error + " No refund was issued — resolve this before retrying.",
      };
    }
    reversalId = route.reversalId;
  } else {
    try {
      const reversal = (await razorpay.transfers.reverse(payment.transferId, {
        amount: Math.round(refundAmount * 100),
      } as never)) as { id: string };
      reversalId = reversal.id;
    } catch (e) {
      // Deliberately NOT falling through to the refund: refunding while the
      // seller still holds the money would leave the platform short by the
      // full amount, with no automated way to recover it.
      return {
        ok: false,
        status: 502,
        error:
          "Could not reverse the seller transfer, so no refund was issued. " +
          (e instanceof Error ? e.message : "Reversal failed.") +
          " Resolve this in the Razorpay Dashboard before retrying.",
      };
    }
  }

  // ── 2. Refund the customer ────────────────────────────────────────────
  let refundId: string;
  try {
    const refund = (await razorpay.payments.refund(payment.razorpayPaymentId, {
      amount: Math.round(refundAmount * 100),
      notes: { orderId, reason },
    } as never)) as { id: string };
    refundId = refund.id;
  } catch (e) {
    // The seller leg already reversed. Surfaced explicitly because the money
    // is now back with the platform but the customer has not been refunded —
    // someone has to finish this by hand.
    return {
      ok: false,
      status: 502,
      error:
        "The seller transfer was reversed but the customer refund failed" +
        (reversalId ? ` (reversal ${reversalId})` : "") +
        ": " +
        (e instanceof Error ? e.message : "Refund failed.") +
        " Complete the refund in the Razorpay Dashboard.",
    };
  }

  // ── 3. Record it ──────────────────────────────────────────────────────
  const isFull = refundAmount >= orderTotal - 0.009;
  const now = new Date().toISOString();
  await orderRef.update({
    "payment.refundId": refundId,
    "payment.refundedAmount": refundAmount,
    "payment.refundedAt": now,
    "payment.refundReason": reason,
    // A partial refund leaves payment.status as "paid" — money is still with
    // the platform for the rest of the order, which is not what "refunded"
    // should mean on this field.
    ...(isFull ? { "payment.status": "refunded" } : {}),
    ...(reversalId ? { "payment.transferReversalId": reversalId } : {}),
    updatedAt: now,
  });

  return { ok: true, orderId, refundId, refundAmount, full: isFull, transferReversalId: reversalId };
}
