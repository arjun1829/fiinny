/**
 * POST /api/payment/fee — the real payment-gateway charge on one order.
 *
 * The seller's payout is `order total − KrishiDukan platform fee − gateway fee`.
 * The platform fee used to be reported as a hardcoded 0 here, which was the API
 * end of the site-wide "0% commission" claim; it is now derived from
 * settings/route, the same document app/lib/route-split.ts splits the payment
 * with, so the figure shown to the seller is the figure actually deducted.
 *
 * "Actually deducted" is meant literally: a fee is reported only for an order
 * Razorpay really split. Seller onboarding onto Route is lazy, so most orders
 * still settle whole to the platform with nothing taken from the seller, and
 * quoting the configured rate on those would show a deduction that never
 * happened.
 *
 * Showing the gateway charge honestly needs Razorpay's ACTUAL fee, which is not
 * in the payment-success payload the client sees — it only appears on the
 * payment entity after capture. So it is fetched here with the key secret and
 * cached onto the order doc, which also gives reconciliation a stored number
 * rather than a recomputed guess.
 *
 * Authorisation: the caller must be the seller on that order (or an admin).
 * Fee data is business-sensitive and this route runs with the key secret, so
 * it verifies a Firebase ID token rather than trusting anything in the body.
 */
import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { getAdminDb, getAdminAuth } from "../../../lib/firebase-admin";
import { loadRouteConfig } from "../../../lib/route-server";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

/** Razorpay returns paise; the order docs store rupees. */
const toRupees = (paise: unknown): number =>
  typeof paise === "number" ? Math.round(paise) / 100 : 0;

/**
 * KrishiDukan's platform fee on one order, in rupees.
 *
 * Derived from the same rate and the same rounding rule computeSellerSplit()
 * uses, so the number the seller reads on the order matches the number deducted
 * from the transfer rather than being an independently-rounded second opinion.
 * A config read failure yields null — an honest "unavailable" beats a confident
 * wrong figure on a money screen.
 */
async function platformFeeFor(order: Record<string, any>): Promise<number | null> {
  const gross = Number(order.grandTotal ?? order.subtotal ?? 0);
  if (!Number.isFinite(gross) || gross <= 0) return null;
  try {
    const { commissionPercent } = await loadRouteConfig();
    if (commissionPercent <= 0) return 0;
    const grossPaise = Math.round(gross * 100);
    const feePaise = Math.ceil(
      (grossPaise * Math.round(commissionPercent * 100)) / 10_000,
    );
    return feePaise / 100;
  } catch (e) {
    console.error("[api/payment/fee] platform fee unavailable:", e);
    return null;
  }
}

/**
 * Whether this payment was actually split with Razorpay Route.
 *
 * Razorpay is the only honest source. The order document does not record the
 * split — create-cart-order returns the summary to the client but never stores
 * it — and re-deriving it from the seller's razorpayAccountId would be wrong
 * for exactly the orders that matter: a seller onboarded last week would have
 * every earlier order retro-labelled with a fee nobody took.
 *
 * A lookup failure returns false. Understating a deduction invites a question;
 * showing one that never happened looks like money quietly removed.
 */
async function orderWasRouted(paymentId: string): Promise<boolean> {
  try {
    const res = await razorpay.payments.fetchTransfer(paymentId);
    return (res?.items?.length ?? 0) > 0;
  } catch (e) {
    console.error("[api/payment/fee] transfer lookup failed:", e);
    return false;
  }
}

/**
 * The authoritative moment the money was captured, as an ISO string.
 *
 * The order doc's `payment.paidAt` is the first choice, but the mobile checkout
 * writes a paid payment block WITHOUT it, so those orders carry none. The
 * server-written `paymentAttempts/{razorpayOrderId}` doc is the authoritative
 * record of when the capture confirmed (set by markAttemptPaid) and is
 * admin-only, so a seller can only reach it through a route like this. Read
 * only — the order is never rewritten here, and the order's CREATE time is
 * deliberately never used as a stand-in: a wrong "paid at" is worse than none.
 */
async function resolvePaidAtIso(
  db: ReturnType<typeof getAdminDb>,
  order: Record<string, any>,
): Promise<string | null> {
  const p = order.payment ?? {};
  if (typeof p.paidAt === "string" && p.paidAt.trim()) return p.paidAt;
  const rzpOrderId = String(p.razorpayOrderId ?? "").trim();
  if (!rzpOrderId) return null;
  try {
    const snap = await db.collection("paymentAttempts").doc(rzpOrderId).get();
    const v = snap.data()?.paidAt;
    const d: Date | null =
      v?.toDate?.() ?? (typeof v === "string" ? new Date(v) : v instanceof Date ? v : null);
    if (d && !Number.isNaN(d.getTime())) return d.toISOString();
  } catch (e) {
    console.error("[api/payment/fee] paidAt lookup failed:", e);
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!idToken) {
      return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
    }

    let decoded;
    try {
      decoded = await getAdminAuth().verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: "Invalid auth token" }, { status: 401 });
    }

    const { orderId } = (await req.json()) as { orderId?: string };
    if (!orderId) {
      return NextResponse.json({ error: "orderId is required" }, { status: 400 });
    }

    const db = getAdminDb();
    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const order = orderSnap.data() as Record<string, any>;
    const callerPhone = String(decoded.phone_number ?? "").trim();

    // Admins can see any order's fee; everyone else must own the sale.
    let isAdmin = false;
    try {
      const userSnap = await db.collection("users").doc(callerPhone || decoded.uid).get();
      isAdmin = String(userSnap.data()?.role ?? "") === "admin";
    } catch {
      /* non-fatal — falls back to the seller check below */
    }

    const isSeller =
      (callerPhone && String(order.sellerPhone ?? "") === callerPhone) ||
      String(order.sellerId ?? "") === decoded.uid ||
      (callerPhone && String(order.sellerId ?? "") === callerPhone);

    if (!isSeller && !isAdmin) {
      return NextResponse.json({ error: "Not your order" }, { status: 403 });
    }

    // Authoritative capture time, surfaced on every response so the seller's
    // Payments detail can show a real "Paid at" even for mobile orders whose
    // payment block carries none. Resolved before the fee branches so the
    // cached-fee short-circuit below still returns it.
    const paidAt = await resolvePaidAtIso(db, order);

    // Both figures are cached together, so an order cached before the platform
    // fee was reported this way falls through and is refreshed rather than
    // replaying the older number.
    if (
      typeof order.payment?.gatewayFee === "number" &&
      typeof order.payment?.platformFee === "number"
    ) {
      return NextResponse.json({
        gatewayFee: order.payment.gatewayFee,
        gatewayTax: order.payment.gatewayTax ?? 0,
        platformFee: order.payment.platformFee,
        paidAt,
        cached: true,
      });
    }

    const paymentId = String(order.payment?.razorpayPaymentId ?? "").trim();
    if (!paymentId) {
      // Legacy, cash-on-delivery or unpaid: nothing was captured and nothing
      // was split, so the platform fee on it is genuinely zero.
      return NextResponse.json({ gatewayFee: null, gatewayTax: null, platformFee: 0, paidAt });
    }

    // Paid after KYC or by the payout run: the commission that payout took.
    const paidSplit = order.payment?.payoutSplit as { commissionPaise?: number } | undefined;
    const platformFee = typeof paidSplit?.commissionPaise === "number"
      ? paidSplit.commissionPaise / 100
      : (await orderWasRouted(paymentId))
        ? await platformFeeFor(order)
        : 0;

    const payment = await razorpay.payments.fetch(paymentId);

    // Razorpay's capture time is the last-resort source when neither the order
    // nor the attempt doc carried one. `created_at` is epoch seconds.
    const paidAtResolved =
      paidAt ??
      (typeof payment.created_at === "number"
        ? new Date(payment.created_at * 1000).toISOString()
        : null);

    // `fee` is only populated once the payment is captured; a pending or
    // failed payment has none yet, and caching a 0 would be wrong.
    if (payment.fee == null) {
      return NextResponse.json({ gatewayFee: null, gatewayTax: null, platformFee, paidAt: paidAtResolved });
    }

    const gatewayFee = toRupees(payment.fee);
    const gatewayTax = toRupees(payment.tax);

    await orderRef.update({
      "payment.gatewayFee": gatewayFee,
      "payment.gatewayTax": gatewayTax,
      // null means the rate was unreadable, not that no fee applies. Caching it
      // would freeze "unavailable" onto the order permanently.
      ...(typeof platformFee === "number" ? { "payment.platformFee": platformFee } : {}),
      "payment.feeFetchedAt": new Date().toISOString(),
    });

    return NextResponse.json({ gatewayFee, gatewayTax, platformFee, paidAt: paidAtResolved, cached: false });
  } catch (error) {
    console.error("[api/payment/fee] failed:", error);
    return NextResponse.json({ error: "Could not fetch the payment fee" }, { status: 500 });
  }
}
