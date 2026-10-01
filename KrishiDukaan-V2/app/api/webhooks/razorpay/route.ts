import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import Razorpay from "razorpay";
import { recordFailureFromRazorpay } from "../../../lib/payment-attempts";
import {
  findOrdersForRazorpayOrder,
  recoverOrderFromCapturedPayment,
} from "../../../lib/order-recovery";

/**
 * Razorpay webhook — the server-to-server signal that closes the gaps our
 * own client-side reporting can never close. Two events, two gaps:
 *
 * payment.failed — Razorpay's dashboard was showing failed payments that
 * never appeared in Admin -> Payments, because that page only learned about
 * a failure if OUR app detected it and phoned home. A killed app, a dropped
 * connection, or an old app build all mean the failure is real on Razorpay's
 * side and invisible on ours.
 *
 * payment.captured — the mirror image, and the more expensive one: a payment
 * Razorpay captured (and whose seller Route transfer it already executed)
 * where the app never reached the step that writes our `orders` document.
 * The customer paid; on our side there was no order, no seller notification,
 * nothing — a real ₹1,311 order on 16 Sep 2026 went exactly this way. When
 * this event arrives and no order exists after a short grace period (so the
 * normal client path gets to finish first), the order is rebuilt server-side
 * from the paymentAttempts record. See app/lib/order-recovery.ts.
 *
 * Configure in Razorpay Dashboard -> Settings -> Webhooks:
 *   URL:    https://krishidukan.com/api/webhooks/razorpay
 *   Events: payment.failed, payment.captured
 *   Secret: put the same value in RAZORPAY_WEBHOOK_SECRET
 * (This is a DIFFERENT secret from RAZORPAY_KEY_SECRET — the webhook secret
 * is generated when the webhook is created in the Dashboard.)
 */

/**
 * How long to let the normal client path finish before rebuilding an order
 * ourselves. Razorpay fires payment.captured within seconds of capture, often
 * before the app has even received its own success callback — jumping in
 * immediately would race the client and produce two orders for one payment.
 */
const CAPTURE_GRACE_MS = 12_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function verifySignature(rawBody: Buffer, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[razorpay-webhook] RAZORPAY_WEBHOOK_SECRET is not configured");
    return false;
  }
  if (!signature) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Signature is computed over the EXACT raw bytes Razorpay sent — req.json()
  // would re-serialize and silently break verification (different key order/
  // whitespace), same reason the existing WA webhook reads arrayBuffer first.
  const rawBody = Buffer.from(await req.arrayBuffer());
  const signature = req.headers.get("x-razorpay-signature");

  if (!verifySignature(rawBody, signature)) {
    // A bad signature means the request cannot be trusted at all — this is
    // the one case worth rejecting outright rather than the 200-and-log-only
    // pattern below, since acknowledging a forged event would be wrong, not
    // just imperfect.
    console.error("[razorpay-webhook] signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody.toString());
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Every other failure mode below is answered 200. Razorpay retries a
  // non-2xx response for up to 24 hours; retrying will not fix a bug in our
  // own handling, and repeatedly re-processing the same event is pure noise.
  // The event is logged either way so nothing is silently lost.
  try {
    const eventName = String(event.event ?? "unknown");
    if (eventName !== "payment.failed" && eventName !== "payment.captured") {
      return NextResponse.json({ ok: true, ignored: eventName });
    }

    const payload = event.payload as Record<string, unknown> | undefined;
    const paymentEntity = (payload?.payment as Record<string, unknown> | undefined)?.entity as
      | Record<string, unknown>
      | undefined;
    if (!paymentEntity?.order_id) {
      console.error(`[razorpay-webhook] ${eventName} with no order_id, skipping`);
      return NextResponse.json({ ok: true, skipped: "no order_id" });
    }

    const orderId = String(paymentEntity.order_id);

    // ── payment.captured: make sure an order exists for this money ─────────
    if (eventName === "payment.captured") {
      const paymentId = String(paymentEntity.id ?? "");
      const amountPaise = Number(paymentEntity.amount ?? 0);

      // Cheap first look, then the grace wait only if needed. The recovery
      // call re-checks for itself before writing, so most captures find the
      // client already wrote the order and go no further.
      if ((await findOrdersForRazorpayOrder(orderId)).length === 0) {
        await sleep(CAPTURE_GRACE_MS);
      }

      const outcome = await recoverOrderFromCapturedPayment({
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        amountPaise,
      });

      if (outcome.action === "recovered") {
        console.warn(
          `[razorpay-webhook] RECOVERED order(s) for ${orderId} / ${paymentId}: ` +
            `${outcome.orderIds.join(", ")}` +
            (outcome.addressMissing ? " — ADDRESS MISSING, seller must contact customer" : ""),
        );
      }
      return NextResponse.json({ ok: true, ...outcome });
    }

    // ── payment.failed ───────────────────────────────────────────────────

    // Razorpay copies an order's notes onto its payments, so the common case
    // needs no extra call. Fall back to fetching the order directly only if
    // that didn't happen (older orders, or Razorpay account/API quirks).
    let notes = paymentEntity.notes as Record<string, unknown> | null | undefined;
    if (!notes || Object.keys(notes).length === 0) {
      try {
        const order = await razorpay.orders.fetch(orderId);
        notes = (order.notes as Record<string, unknown> | null) ?? null;
      } catch (e) {
        console.error("[razorpay-webhook] could not fetch order for notes:", e);
        notes = null;
      }
    }

    await recordFailureFromRazorpay(
      {
        id: String(paymentEntity.id ?? ""),
        order_id: orderId,
        amount: Number(paymentEntity.amount ?? 0),
        method: (paymentEntity.method as string | undefined) ?? null,
        contact: (paymentEntity.contact as string | undefined) ?? null,
        email: (paymentEntity.email as string | undefined) ?? null,
        error_code: (paymentEntity.error_code as string | undefined) ?? null,
        error_description: (paymentEntity.error_description as string | undefined) ?? null,
        error_reason: (paymentEntity.error_reason as string | undefined) ?? null,
        error_source: (paymentEntity.error_source as string | undefined) ?? null,
        error_step: (paymentEntity.error_step as string | undefined) ?? null,
        created_at: paymentEntity.created_at as number | undefined,
      },
      { id: orderId, notes },
      "razorpay_webhook",
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[razorpay-webhook] unhandled error:", e);
    return NextResponse.json({ ok: false, error: "logged, not retried" });
  }
}
