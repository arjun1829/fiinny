import { getAdminDb } from "./firebase-admin";

/**
 * Keeps an order's refund status in step with Razorpay, so the customer can
 * see where their money is (Orders on web and app).
 *
 * A Razorpay refund goes `pending` → `processed` (sent to the customer's
 * bank, with a bank reference — ARN for cards, RRN/UTR for UPI and net
 * banking) or `failed`. refundOrder() records the state at creation; this
 * applies every later change, from the refund.* webhook or an on-demand
 * check (POST /api/orders/refund-status).
 */

export type RazorpayRefundEntity = {
  id?: string;
  payment_id?: string;
  amount?: number;
  status?: string;
  created_at?: number;
  notes?: Record<string, unknown> | unknown[] | null;
  acquirer_data?: Record<string, unknown> | null;
};

export type RefundStatus = "pending" | "processed" | "failed";

export function refundStatusOf(entity: RazorpayRefundEntity): RefundStatus {
  const s = String(entity.status ?? "").toLowerCase();
  return s === "processed" || s === "failed" ? s : "pending";
}

/** The reference a customer can give their bank to trace the credit. */
export function bankReferenceOf(entity: RazorpayRefundEntity): string | null {
  const a = entity.acquirer_data ?? {};
  for (const key of ["arn", "rrn", "utr"]) {
    const v = String(a[key] ?? "").trim();
    if (v && v.toLowerCase() !== "null") return v;
  }
  return null;
}

/** Order fields describing this refund's current state (payment.* dot paths). */
export function refundFields(entity: RazorpayRefundEntity): Record<string, unknown> {
  const status = refundStatusOf(entity);
  const ref = bankReferenceOf(entity);
  const now = new Date().toISOString();
  return {
    "payment.refundStatus": status,
    "payment.refundCheckedAt": now,
    ...(status === "processed" ? { "payment.refundProcessedAt": now } : {}),
    ...(ref ? { "payment.refundArn": ref } : {}),
  };
}

const ORDER_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Applies a refund update from Razorpay to the order it belongs to. Found by
 * the orderId we put in the refund's notes, else by refund id. Returns the
 * order id updated, or null when no order matches (a refund made outside
 * KrishiDukan for a payment that covered several orders, say).
 */
export async function applyRazorpayRefund(entity: RazorpayRefundEntity): Promise<string | null> {
  const refundId = String(entity.id ?? "");
  if (!refundId) return null;
  const db = getAdminDb();
  const orders = db.collection("orders");

  const notes = entity.notes && !Array.isArray(entity.notes) ? entity.notes : {};
  const hinted = String((notes as Record<string, unknown>).orderId ?? "");
  let ref: FirebaseFirestore.DocumentReference | null = null;
  if (ORDER_ID_RE.test(hinted)) {
    const snap = await orders.doc(hinted).get();
    const pay = (snap.data()?.payment ?? {}) as { refundId?: string; razorpayPaymentId?: string };
    // Only trust the hint when the order really is this refund's / payment's.
    if (snap.exists && (pay.refundId === refundId || (!pay.refundId && pay.razorpayPaymentId === entity.payment_id))) {
      ref = snap.ref;
    }
  }
  if (!ref) {
    const byRefund = await orders.where("payment.refundId", "==", refundId).limit(1).get();
    if (!byRefund.empty) ref = byRefund.docs[0].ref;
  }
  if (!ref) return null;

  const snap = await ref.get();
  const current = String(snap.data()?.payment?.refundStatus ?? "");
  const next = refundStatusOf(entity);
  // Never move a settled refund back to pending (webhooks can arrive out of order).
  if (current === "processed" && next === "pending") return ref.id;

  const update: Record<string, unknown> = { ...refundFields(entity), updatedAt: new Date().toISOString() };
  if (!snap.data()?.payment?.refundId) {
    // A refund issued outside refundOrder (e.g. Razorpay Dashboard): record it too.
    update["payment.refundId"] = refundId;
    if (typeof entity.amount === "number") update["payment.refundedAmount"] = entity.amount / 100;
    if (typeof entity.created_at === "number") {
      update["payment.refundedAt"] = new Date(entity.created_at * 1000).toISOString();
    }
  }
  await ref.update(update);
  return ref.id;
}
