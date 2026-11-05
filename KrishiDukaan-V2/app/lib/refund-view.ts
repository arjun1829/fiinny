import { orderGrandTotal, type OrderDoc } from "../../types/order";

/**
 * What a customer should see about their money on a rejected / cancelled /
 * refunded order (My Orders). Pure, so web and its tests share it; the app
 * mirrors it in mobile/lib/features/orders/refund_stage.dart.
 *
 * Razorpay sends a normal refund to the customer's bank within a few days;
 * banks usually show it within 5–7 working days of the refund (UPI often
 * sooner). `expectedBy` is that 7-working-day mark.
 */
export const REFUND_WORKING_DAYS = 7;

export type RefundStage =
  /** Seller rejected; other sellers have until `until`, then it's refunded. */
  | { kind: "finding_seller"; amount: number; until: Date | null }
  /** Cancelled/rejected and paid online, but the refund isn't issued yet. */
  | { kind: "arranging"; amount: number }
  /** Refund issued; on its way to the bank. */
  | { kind: "initiated"; amount: number; refundId: string; refundedAt: Date | null; expectedBy: Date | null }
  /** Razorpay sent it to the bank; `reference` traces the credit. */
  | { kind: "processed"; amount: number; refundId: string; refundedAt: Date | null; processedAt: Date | null; expectedBy: Date | null; reference: string | null }
  /** Razorpay could not complete it — support has to step in. */
  | { kind: "failed"; amount: number; refundId: string };

export function toDate(v: unknown): Date | null {
  if (!v) return null;
  const withToDate = v as { toDate?: () => Date };
  if (typeof withToDate.toDate === "function") return withToDate.toDate();
  const secs = (v as { seconds?: number }).seconds;
  if (typeof secs === "number") return new Date(secs * 1000);
  const d = new Date(v as string | number);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `days` working days (Mon–Fri) after `from`. */
export function addWorkingDays(from: Date, days: number): Date {
  const d = new Date(from.getTime());
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) left -= 1;
  }
  return d;
}

export function refundStageFor(order: OrderDoc): RefundStage | null {
  const payment = order.payment;
  const paidOnline = Boolean(payment?.razorpayPaymentId);
  const amount = Number(payment?.refundedAmount) > 0 ? Number(payment!.refundedAmount) : orderGrandTotal(order);

  if (payment?.refundId) {
    const refundId = payment.refundId;
    if (payment.refundStatus === "failed") return { kind: "failed", amount, refundId };
    const refundedAt = toDate(payment.refundedAt);
    const expectedBy = refundedAt ? addWorkingDays(refundedAt, REFUND_WORKING_DAYS) : null;
    if (payment.refundStatus === "processed") {
      return {
        kind: "processed",
        amount,
        refundId,
        refundedAt,
        processedAt: toDate(payment.refundProcessedAt),
        expectedBy,
        reference: payment.refundArn ?? null,
      };
    }
    return { kind: "initiated", amount, refundId, refundedAt, expectedBy };
  }

  // Cash on delivery: no money was taken, so there is nothing to refund.
  if (!paidOnline) return null;
  if (order.status === "reassigning") {
    return { kind: "finding_seller", amount, until: toDate(order.reassignment?.expiresAt) };
  }
  if (order.status === "rejected" || order.status === "cancelled") return { kind: "arranging", amount };
  return null;
}

/** The stages where asking Razorpay again could change what we show. */
export function refundMayChange(stage: RefundStage | null): boolean {
  return stage?.kind === "initiated";
}
