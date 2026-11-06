import { NextRequest, NextResponse } from "next/server";
import { isStaffOf } from "../../../lib/shop-team-server";
import { getAdminAuth, getAdminDb } from "../../../lib/firebase-admin";
import {
  REVERTABLE_STATUSES,
  validRevertTargets,
  type OrderStatus,
  type StatusHistoryEntry,
} from "../../../../types/order";

/**
 * POST /api/orders/revert-status
 *
 * Steps a mistakenly-advanced order BACK to an earlier stage — the inverse of
 * the forward "Accept → Dispatch → Out for delivery → Delivered" flow. Only the
 * post-handover states (dispatched, out_for_delivery, delivered) can be
 * reverted; an order still in placed/accepted is undone with Reject/Cancel, not
 * a revert, and rejected/cancelled/reassigning are off the forward flow.
 *
 * WHY A SERVER ROUTE RATHER THAN A CLIENT STATUS WRITE
 * ----------------------------------------------------
 * A revert out of `delivered` is only safe while the seller's money is still
 * with the platform. Once Razorpay Route has SCHEDULED or RELEASED the transfer
 * (see functions/src/route-release.ts), flipping the order back to
 * out_for_delivery would leave the books saying "not delivered" while the money
 * is already on its way to the seller. That check needs the payout fields, which
 * are server-written and unreadable/untrusted on the client — so the whole
 * action runs here, with the Admin SDK, and refuses the unsafe case rather than
 * trying to claw money back.
 *
 * Side effects are deliberately NOT repeated: inventory is decremented only on
 * order CREATE (decrementStockOnOrder), the payout release only fires on the
 * transition INTO delivered (never out of it), and the customer WhatsApp update
 * is suppressed for backward transitions in notifyCustomerOnOrderStatus. So a
 * revert moves the status and records the audit trail, and nothing else.
 *
 * Callable by the order's own seller OR an admin, mirroring /api/orders/reject.
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
  const phone: string | null = idx.exists ? String(idx.data()?.phone ?? "") || null : null;
  if (!isAdmin && phone) {
    const byPhone = await db.collection("users").doc(phone).get();
    isAdmin = byPhone.exists && byPhone.data()?.role === "admin";
  }
  return { ok: true, uid, isAdmin };
}

/**
 * Whether this order's payout has moved far enough that a revert out of
 * `delivered` would desync the books from the money.
 *
 * Two levels, because they carry different risk:
 *   • `overridable: true`  — the payout is only SCHEDULED (held with an
 *     on_hold_until in the future). The money has NOT left yet, and re-delivering
 *     later cannot re-pay (releaseTransferOnDelivery is idempotent on
 *     routeRelease.transferId). An ADMIN may revert; the scheduled transfer is
 *     deliberately left untouched (business decision: revert the status only,
 *     never reach into the payment).
 *   • `overridable: false` — the money has already RELEASED / settled. Never
 *     reversed automatically, blocked for everyone.
 *
 * Returns null when the revert is financially safe for anyone.
 */
type PayoutBlock = { reason: string; overridable: boolean };

function payoutBlock(order: FirebaseFirestore.DocumentData): PayoutBlock | null {
  const release = order.routeRelease as { status?: string; transferId?: string } | undefined;
  if (release?.transferId) {
    if (release.status === "scheduled") {
      return {
        overridable: true,
        reason:
          "This order's payout to the seller is already scheduled with Razorpay. Reverting it now would leave the order marked not-delivered while the money is on its way. Ask an admin to review the Route payout before changing the status.",
      };
    }
    return {
      overridable: false,
      reason:
        "This order's payout to the seller has already been released. The status can't be reverted — financial transactions are never reversed automatically.",
    };
  }
  const payout = order.payout as { state?: string } | undefined;
  if (payout?.state === "scheduled") {
    return {
      overridable: true,
      reason:
        "This order's payout is scheduled with Razorpay. Ask an admin to review the Route payout before reverting the status.",
    };
  }
  if (payout?.state && ["processing", "settled"].includes(payout.state)) {
    return {
      overridable: false,
      reason: `This order's payout is ${payout.state} with Razorpay. Reverting a delivered order whose money has already moved is blocked — review the payout first.`,
    };
  }
  return null;
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;

  const db = getAdminDb();

  try {
    const { orderId, toStatus, reason } = (await req.json()) as {
      orderId?: string;
      toStatus?: OrderStatus;
      reason?: string;
    };
    if (!orderId) return NextResponse.json({ error: "orderId is required" }, { status: 400 });
    if (!toStatus) return NextResponse.json({ error: "toStatus is required" }, { status: 400 });
    const revertReason = (reason ?? "").trim();
    if (!revertReason) {
      return NextResponse.json({ error: "A reason is required to revert an order." }, { status: 400 });
    }

    const orderRef = db.collection("orders").doc(orderId);
    const snap = await orderRef.get();
    if (!snap.exists) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    const order = snap.data() as FirebaseFirestore.DocumentData;

    // ── Authorization: the order's own seller, or an admin ──
    if (!auth.isAdmin) {
      const idx = await db.collection("uidIndex").doc(auth.uid).get();
      const callerPhone = idx.exists ? String(idx.data()?.phone ?? "") : "";
      const isOwner =
        (callerPhone && callerPhone === order.sellerPhone) || order.sellerId === auth.uid;
      // A shop helper with the Orders permission acts for the seller.
      if (!isOwner && !(await isStaffOf(callerPhone, order.sellerPhone, "orders"))) {
        return NextResponse.json({ error: "This is not your order." }, { status: 403 });
      }
    }

    const fromStatus = String(order.status ?? "") as OrderStatus;

    // ── Transition validity ──
    if (!REVERTABLE_STATUSES.includes(fromStatus)) {
      return NextResponse.json(
        { error: `A ${fromStatus || "new"} order cannot be reverted. Only dispatched, out-for-delivery and delivered orders can.` },
        { status: 409 },
      );
    }
    const targets = validRevertTargets(fromStatus);
    if (!targets.includes(toStatus)) {
      return NextResponse.json(
        { error: `Cannot revert a ${fromStatus} order to ${toStatus}.` },
        { status: 409 },
      );
    }

    // ── Financial safety (requirement: block unsafe reversals, never auto-reverse) ──
    // A SCHEDULED payout is overridable by an admin (the money hasn't left and a
    // later re-delivery can't re-pay — releaseTransferOnDelivery is idempotent).
    // The scheduled Razorpay transfer is intentionally NOT touched here; only the
    // order status is reverted. A RELEASED payout is blocked for everyone.
    const block = payoutBlock(order);
    const payoutOverride = Boolean(block?.overridable && auth.isAdmin);
    if (block && !payoutOverride) {
      return NextResponse.json({ error: block.reason }, { status: 409 });
    }

    const now = new Date().toISOString();
    const entry: StatusHistoryEntry = {
      status: toStatus,
      at: now,
      from: fromStatus,
      by: auth.uid,
      byRole: auth.isAdmin ? "admin" : "seller",
      reason: revertReason,
      revert: true,
      // Flag an admin who reverted past a scheduled payout, so the trail shows
      // the money was knowingly left to settle while the status went back.
      ...(payoutOverride ? { payoutScheduledOverride: true } : {}),
    };

    const batch = db.batch();
    batch.update(orderRef, {
      status: toStatus,
      statusHistory: [
        ...(Array.isArray(order.statusHistory) ? order.statusHistory : []),
        entry,
      ],
      updatedAt: now,
    });
    // Append to the existing admin/audit trail as well, so a status reversal is
    // visible alongside every other privileged action.
    batch.set(db.collection("adminLogs").doc(), {
      action: "order_status_revert",
      orderId,
      fromStatus,
      toStatus,
      reason: revertReason,
      performedBy: auth.uid,
      performedByRole: auth.isAdmin ? "admin" : "seller",
      // Record a scheduled-payout override explicitly: which transfer was left
      // to settle, so Finance can reconcile a reverted-but-paid order later.
      ...(payoutOverride
        ? {
            payoutScheduledOverride: true,
            routeTransferId: String((order.routeRelease as { transferId?: string } | undefined)?.transferId ?? ""),
          }
        : {}),
      createdAt: now,
    });
    await batch.commit();

    return NextResponse.json({ ok: true, orderId, fromStatus, toStatus });
  } catch (error) {
    console.error("[orders/revert-status] failed:", error);
    return NextResponse.json({ error: "Could not revert the order status." }, { status: 500 });
  }
}
