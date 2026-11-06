import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "../../../lib/firebase-admin";
import { refundOrder } from "../../../lib/order-refund";
import { finalizeReassignmentRefund } from "../../../lib/order-reassignment";

/**
 * POST /api/orders/cancel
 *
 * A customer cancelling their own order — full self-service refund, no admin
 * or seller involved. Distinct order status ("cancelled") from a seller's
 * "rejected": the two happen for different reasons and a seller shouldn't
 * read "the customer changed their mind" as "my product had a problem".
 *
 * Only allowed while the order is "placed" (no seller has accepted it yet)
 * or "reassigning" (the seller declined and no other seller has taken it).
 * Once a seller ACCEPTS, the customer can no longer cancel — business rule:
 * the seller has committed stock to the order. The seller can still reject
 * an accepted order (/api/orders/reject), which offers it to other sellers
 * first; a customer who needs to back out after acceptance goes through
 * support (admin's general refund tool covers it).
 *
 * The check and the cancel are atomic: the order is claimed as "cancelled"
 * in a transaction that requires it to still be "placed", so a seller
 * accepting at the same moment can't end up with an accepted order that was
 * also refunded. If the refund then fails the claim is undone.
 *
 * A bare Firestore write can't do this: firestore.rules deliberately does NOT
 * let a customer set `status` on their own order (only `payment`/`invoice`
 * diffs), specifically so a cancellation can never bypass the refund below —
 * this route is the only path to "cancelled".
 */

type AuthResult =
  | { ok: true; uid: string; response?: undefined }
  | { ok: false; uid?: undefined; response: NextResponse };

async function authenticate(req: NextRequest): Promise<AuthResult> {
  const header = req.headers.get("Authorization") ?? "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!idToken) {
    return { ok: false, response: NextResponse.json({ error: "Missing authorization token" }, { status: 401 }) };
  }
  try {
    const uid = (await getAdminAuth().verifyIdToken(idToken)).uid;
    return { ok: true, uid };
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Invalid authorization token" }, { status: 401 }) };
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;

  const db = getAdminDb();

  try {
    const { orderId, reason } = (await req.json()) as { orderId?: string; reason?: string };
    if (!orderId) return NextResponse.json({ error: "orderId is required" }, { status: 400 });

    const orderRef = db.collection("orders").doc(orderId);
    const snap = await orderRef.get();
    if (!snap.exists) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    const order = snap.data() as FirebaseFirestore.DocumentData;

    // Customer identity: customerId is the Firebase uid on every order this
    // app creates (web app/page.tsx, mobile order_repository.dart) — same
    // field firestore.rules checks for the customer-owned update clauses.
    if (order.customerId !== auth.uid) {
      return NextResponse.json({ error: "This is not your order." }, { status: 403 });
    }

    // While another seller is being found, cancelling goes through the same
    // locked exit as the 24h expiry — so a cancel can never race an accept
    // into "refunded AND reassigned".
    if (order.status === "reassigning") {
      const closed = await finalizeReassignmentRefund(orderId, {
        finalStatus: "cancelled",
        reason: (reason ?? "").trim() || "Cancelled by customer",
        trigger: "customer_cancel",
        customerUid: auth.uid,
      });
      if (closed.ok === false) {
        return NextResponse.json({ error: closed.error }, { status: closed.status });
      }
      return NextResponse.json({ ok: true, orderId, refunded: closed.refunded });
    }

    if (order.status !== "placed") {
      return NextResponse.json(
        {
          error:
            order.status === "rejected" || order.status === "cancelled"
              ? "This order has already been cancelled."
              : order.status === "accepted"
                ? "The seller has accepted this order, so it can no longer be cancelled here. Please contact the seller or support."
                : "This order is already on its way and can no longer be cancelled. Contact support.",
        },
        { status: 409 },
      );
    }

    const cancelReason = (reason ?? "").trim() || "Cancelled by customer";
    const now = new Date().toISOString();

    // Claim it: cancelled only if STILL placed at this instant.
    const claimed = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(orderRef);
      const d = fresh.data();
      if (!d || d.status !== "placed") return { ok: false as const, status: d?.status as string | undefined };
      tx.update(orderRef, {
        status: "cancelled",
        statusHistory: [
          ...(Array.isArray(d.statusHistory) ? d.statusHistory : []),
          { status: "cancelled", at: now },
        ],
        cancellationReason: cancelReason,
        cancelledBy: "customer",
        updatedAt: now,
      });
      return { ok: true as const, statusHistory: d.statusHistory, payment: d.payment };
    });
    if (claimed.ok === false) {
      return NextResponse.json(
        {
          error:
            claimed.status === "accepted"
              ? "The seller has just accepted this order, so it can no longer be cancelled here. Please contact the seller or support."
              : "This order can no longer be cancelled.",
        },
        { status: 409 },
      );
    }

    const payment = (claimed.payment ?? {}) as { razorpayPaymentId?: string; refundId?: string };
    let refund: Awaited<ReturnType<typeof refundOrder>> | null = null;

    if (payment.razorpayPaymentId && !payment.refundId) {
      refund = await refundOrder({ orderId, reason: cancelReason });
      if (refund.ok === false) {
        // Same rule as reject: no cancellation without the refund. Undo the
        // claim so the customer can retry (or the seller can proceed).
        await orderRef.update({
          status: "placed",
          statusHistory: Array.isArray(claimed.statusHistory) ? claimed.statusHistory : [],
          cancellationReason: FieldValue.delete(),
          cancelledBy: FieldValue.delete(),
          updatedAt: new Date().toISOString(),
        });
        return NextResponse.json(
          { error: "Could not process your refund. Please try again or contact support. " + refund.error },
          { status: refund.status },
        );
      }
    }

    return NextResponse.json({
      ok: true,
      orderId,
      refunded: Boolean(refund?.ok),
      refundId: refund?.ok ? refund.refundId : null,
      refundAmount: refund?.ok ? refund.refundAmount : null,
    });
  } catch (error) {
    console.error("[orders/cancel] failed:", error);
    return NextResponse.json({ error: "Could not cancel the order." }, { status: 500 });
  }
}
