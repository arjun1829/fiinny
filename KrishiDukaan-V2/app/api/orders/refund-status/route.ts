import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { getAdminAuth, getAdminDb } from "../../../lib/firebase-admin";
import { applyRazorpayRefund, type RazorpayRefundEntity } from "../../../lib/refund-sync";

/**
 * POST /api/orders/refund-status  { orderId }
 *
 * Refreshes a customer's refund status from Razorpay, for My Orders on web
 * and app. The refund.* webhook normally keeps it current; this covers the
 * time before that webhook is configured, or a missed event. Only the
 * order's own customer may call it, only while the refund is still pending,
 * and Razorpay is asked at most once every few minutes per order —
 * otherwise the stored status is returned as is.
 */

const RECHECK_MS = 5 * 60 * 1000;

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

function refundView(payment: Record<string, unknown> | undefined) {
  const p = payment ?? {};
  return {
    refundId: p.refundId ?? null,
    refundedAmount: p.refundedAmount ?? null,
    refundedAt: p.refundedAt ?? null,
    refundStatus: p.refundStatus ?? null,
    refundProcessedAt: p.refundProcessedAt ?? null,
    refundArn: p.refundArn ?? null,
  };
}

export async function POST(req: NextRequest) {
  const header = req.headers.get("Authorization") ?? "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!idToken) return NextResponse.json({ error: "Missing authorization token" }, { status: 401 });
  let uid: string;
  try {
    uid = (await getAdminAuth().verifyIdToken(idToken)).uid;
  } catch {
    return NextResponse.json({ error: "Invalid authorization token" }, { status: 401 });
  }

  let orderId = "";
  try {
    orderId = String(((await req.json()) as { orderId?: string }).orderId ?? "");
  } catch {
    /* handled below */
  }
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(orderId)) {
    return NextResponse.json({ error: "orderId is required" }, { status: 400 });
  }

  const ref = getAdminDb().collection("orders").doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const order = snap.data() as FirebaseFirestore.DocumentData;
  // Same ownership rule as /api/orders/cancel: customerId is the buyer's uid.
  if (order.customerId !== uid) return NextResponse.json({ error: "This is not your order." }, { status: 403 });

  const payment = (order.payment ?? {}) as Record<string, unknown>;
  const refundId = String(payment.refundId ?? "");
  const status = String(payment.refundStatus ?? "");
  const checkedAt = Date.parse(String(payment.refundCheckedAt ?? "")) || 0;
  const settled = status === "processed" || status === "failed";

  if (!refundId || settled || Date.now() - checkedAt < RECHECK_MS) {
    return NextResponse.json({ ok: true, ...refundView(payment) });
  }

  try {
    const entity = (await razorpay.refunds.fetch(refundId)) as unknown as RazorpayRefundEntity;
    await applyRazorpayRefund({ ...entity, notes: { orderId } });
  } catch (e) {
    // Razorpay unreachable: show what we have; record the attempt so a
    // flood of page loads doesn't keep hammering it.
    console.error("[orders/refund-status] Razorpay fetch failed", orderId, e);
    await ref.update({ "payment.refundCheckedAt": new Date().toISOString() }).catch(() => {});
    return NextResponse.json({ ok: true, ...refundView(payment) });
  }
  const fresh = await ref.get();
  return NextResponse.json({ ok: true, ...refundView(fresh.data()?.payment) });
}
