import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../lib/firebase-admin";
import { refundOrder } from "../../../lib/order-refund";
import { startReassignment } from "../../../lib/order-reassignment";

/**
 * POST /api/orders/reject
 *
 * Rejects an order AND refunds it in one step, when it was paid for online.
 * Previously "Reject" was a bare client-side Firestore status write
 * (app/firebase.ts updateOrderStatus) — the customer's money just stayed with
 * the platform with no way to get it back short of a manual Razorpay Dashboard
 * refund. That gap is exactly what this route closes: reject and refund
 * happen as one action, so there's no way to reject a paid order and forget
 * the money.
 *
 * Allowed only from "placed" or "accepted" — matches NEXT_ACTIONS in
 * app/dashboard/orders/page.tsx. Once dispatched the parcel has physically
 * left the seller, so a reject at that point is out of scope here (an admin
 * can still use /api/admin/order-refund for that case).
 *
 * Callable by the order's own seller OR an admin — sellers act on their own
 * orders (they're the one who knows a product is actually out of stock);
 * admin acts on a seller's behalf for a customer who called support instead.
 */

type AuthResult =
  | { ok: true; uid: string; isAdmin: boolean; response?: undefined }
  | { ok: false; uid?: undefined; isAdmin?: undefined; response: NextResponse };

async function authenticate(req: NextRequest): Promise<AuthResult> {
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
  let phone: string | null = idx.exists ? String(idx.data()?.phone ?? "") || null : null;
  if (!isAdmin && phone) {
    const byPhone = await db.collection("users").doc(phone).get();
    isAdmin = byPhone.exists && byPhone.data()?.role === "admin";
  }
  return { ok: true, uid, isAdmin };
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;

  const db = getAdminDb();

  try {
    const { orderId, reason } = (await req.json()) as { orderId?: string; reason?: string };
    if (!orderId) return NextResponse.json({ error: "orderId is required" }, { status: 400 });
    const rejectReason = (reason ?? "").trim();
    if (!rejectReason) {
      return NextResponse.json({ error: "A reason is required." }, { status: 400 });
    }

    const orderRef = db.collection("orders").doc(orderId);
    const snap = await orderRef.get();
    if (!snap.exists) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    const order = snap.data() as FirebaseFirestore.DocumentData;

    if (!auth.isAdmin) {
      // Seller identity is keyed by phone (current schema) OR uid (legacy) —
      // same dual check every seller-scoped query in this codebase uses.
      const idx = await db.collection("uidIndex").doc(auth.uid).get();
      const callerPhone = idx.exists ? String(idx.data()?.phone ?? "") : "";
      const isOwner =
        (callerPhone && callerPhone === order.sellerPhone) || order.sellerId === auth.uid;
      if (!isOwner) {
        return NextResponse.json({ error: "This is not your order." }, { status: 403 });
      }
    }

    if (order.status !== "placed" && order.status !== "accepted") {
      return NextResponse.json(
        { error: `Cannot reject an order that is already ${order.status}.` },
        { status: 409 },
      );
    }

    // First rejection → offer the order to every other seller who sells all of
    // it online, for 24h, before refunding (lib/order-reassignment.ts). One
    // round only: an order that was already reassigned once is refunded now.
    if (!order.reassignment) {
      const start = await startReassignment({
        orderId,
        order,
        reason: rejectReason,
        rejectedByUid: auth.uid,
      });
      if (start.ok === false) {
        return NextResponse.json({ error: start.error }, { status: start.status });
      }
      if (start.reassigning) {
        return NextResponse.json({
          ok: true,
          orderId,
          reassigning: true,
          candidates: start.candidates,
          refunded: false,
        });
      }
      // No eligible sellers: fall through to the immediate refund below.
    }

    const payment = (order.payment ?? {}) as { razorpayPaymentId?: string; refundId?: string };
    let refund: Awaited<ReturnType<typeof refundOrder>> | null = null;

    if (payment.razorpayPaymentId && !payment.refundId) {
      refund = await refundOrder({ orderId, reason: `Order rejected: ${rejectReason}` });
      if (refund.ok === false) {
        // Do NOT mark the order rejected if the refund failed — an order
        // that says "rejected" but never paid the customer back is worse
        // than one still sitting in "placed" waiting for a retry.
        return NextResponse.json({ error: refund.error }, { status: refund.status });
      }
    }

    const now = new Date().toISOString();
    await orderRef.update({
      status: "rejected",
      statusHistory: [
        ...(Array.isArray(order.statusHistory) ? order.statusHistory : []),
        { status: "rejected", at: now },
      ],
      rejectionReason: rejectReason,
      updatedAt: now,
    });

    return NextResponse.json({
      ok: true,
      orderId,
      refunded: Boolean(refund?.ok),
      refundId: refund?.ok ? refund.refundId : null,
      refundAmount: refund?.ok ? refund.refundAmount : null,
    });
  } catch (error) {
    console.error("[orders/reject] failed:", error);
    return NextResponse.json({ error: "Could not reject the order." }, { status: 500 });
  }
}
