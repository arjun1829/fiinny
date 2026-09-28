import { NextResponse } from 'next/server';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { markAttemptPaid } from '../../../lib/payment-attempts';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export async function POST(request: Request) {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = await request.json();

    const body = razorpay_order_id + '|' + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(body.toString())
      .digest('hex');

    const isAuthentic = expectedSignature === razorpay_signature;

    if (isAuthentic) {
      // Fetch the order so every figure the client goes on to record comes from
      // Razorpay rather than from the browser. `order.amount` is authoritative:
      // it is the sum the gateway actually captured, in paise.
      const order = await razorpay.orders.fetch(razorpay_order_id);
      const verifiedSeatCount = order.notes?.seatCount ? Number(order.notes.seatCount) : 1;
      const verifiedMonths = order.notes?.durationMonths
        ? Number(order.notes.durationMonths)
        : undefined;
      const amountPaid = Math.round(Number(order.amount) / 100);

      // The promo code the order was actually created with, read from the
      // gateway's own notes (stamped server-side in create-order). This is the
      // trusted value the client relays onto the subscription doc — it is NOT
      // the code typed into the checkout field, so it cannot be swapped after
      // the price was locked in. Empty string when no promo was used.
      const verifiedPromoCode = String(order.notes?.promoCode ?? '')
        .trim()
        .toUpperCase();

      // Closes out the attempt record. A valid signature is proof Razorpay
      // completed this payment, so this is the primary success path for both
      // web and mobile.
      await markAttemptPaid(razorpay_order_id, razorpay_payment_id ?? null);

      // Plan identity, also from the gateway's notes. Orders created before
      // Standard plans existed carry none: those were all per-listing
      // (Custom) purchases.
      const planTier = order.notes?.planTier === 'standard' ? 'standard' : 'custom';
      const planName = String(order.notes?.planName ?? '').trim() ||
        (planTier === 'standard' ? 'Standard' : 'Custom');

      return NextResponse.json({
        status: 'ok',
        seatCount: verifiedSeatCount,
        durationMonths: verifiedMonths,
        amountPaid,
        promoCode: verifiedPromoCode || null,
        planId: order.notes?.planId != null ? String(order.notes.planId) : null,
        planTier,
        planName,
      });
    } else {
      return NextResponse.json({ status: 'failed' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error verifying payment:', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
