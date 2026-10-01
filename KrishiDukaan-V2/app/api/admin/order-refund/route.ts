import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../lib/firebase-admin";
import { grossFor, type OrderLike } from "../../../dashboard/_lib/seller-earnings";
import { refundOrder } from "../../../lib/order-refund";

/**
 * Admin's general-purpose refund tool — works at any order status, supports a
 * partial amount (a damaged item in a multi-item order, say), and does NOT
 * change the order's status: an admin refund is a money correction, not a
 * lifecycle transition, so a delivered order stays "delivered" after a
 * partial refund rather than looking like it never happened.
 *
 * The two lifecycle-driven refund paths — a seller/admin rejecting a paid
 * order, and a customer cancelling one — live in app/api/orders/reject and
 * app/api/orders/cancel. All three share the actual Razorpay logic via
 * app/lib/order-refund.ts; this route is just admin auth + status-agnostic
 * dry-run preview on top of that shared core.
 */

type AdminAuthResult =
  | { ok: true; uid: string; response?: undefined }
  | { ok: false; uid?: undefined; response: NextResponse };

async function requireAdmin(req: NextRequest): Promise<AdminAuthResult> {
  const header = req.headers.get("Authorization") ?? "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!idToken) {
    return { ok: false, response: NextResponse.json({ error: "Missing authorization token" }, { status: 401 }) };
  }
  let uid: string;
  try {
    uid = (await getAdminAuth().verifyIdToken(idToken)).uid;
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Invalid authorization token" }, { status: 401 }) };
  }

  const db = getAdminDb();
  const [byUid, idx] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("uidIndex").doc(uid).get(),
  ]);
  let isAdmin = byUid.exists && byUid.data()?.role === "admin";
  if (!isAdmin && idx.exists) {
    const phone = idx.data()?.phone;
    if (phone) {
      const byPhone = await db.collection("users").doc(String(phone)).get();
      isAdmin = byPhone.exists && byPhone.data()?.role === "admin";
    }
  }
  if (!isAdmin) return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { ok: true, uid };
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const db = getAdminDb();

  try {
    const { orderId, amount, reason, dryRun } = (await req.json()) as {
      orderId?: string;
      /** Rupees. Omitted means a full refund of the order total. */
      amount?: number;
      reason?: string;
      dryRun?: boolean;
    };

    if (!orderId) {
      return NextResponse.json({ error: "orderId is required" }, { status: 400 });
    }
    const refundReason = (reason ?? "").trim();
    if (!refundReason) {
      // Recorded on the order and surfaced to support — a refund with no
      // stated reason is unauditable later.
      return NextResponse.json({ error: "A refund reason is required" }, { status: 400 });
    }

    if (dryRun) {
      const snap = await db.collection("orders").doc(orderId).get();
      if (!snap.exists) return NextResponse.json({ error: "Order not found" }, { status: 404 });
      const order = snap.data() as FirebaseFirestore.DocumentData;
      const payment = (order.payment ?? {}) as { transferId?: string };
      const orderTotal = grossFor({ id: orderId, ...(order as object) } as OrderLike);
      const refundAmount =
        typeof amount === "number" && amount > 0 ? Math.min(amount, orderTotal) : orderTotal;
      return NextResponse.json({
        dryRun: true,
        orderId,
        orderTotal,
        refundAmount,
        willReverseTransfer: Boolean(payment.transferId),
        transferId: payment.transferId ?? null,
      });
    }

    const result = await refundOrder({ orderId, amount, reason: refundReason });
    if (result.ok === false) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      ok: true,
      orderId: result.orderId,
      refundId: result.refundId,
      refundAmount: result.refundAmount,
      full: result.full,
      transferReversalId: result.transferReversalId,
    });
  } catch (error) {
    console.error("[order-refund] failed:", error);
    return NextResponse.json({ error: "Refund failed" }, { status: 500 });
  }
}
