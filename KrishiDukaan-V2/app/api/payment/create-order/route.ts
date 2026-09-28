import { NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { getAdminAuth, getAdminDb } from '../../../lib/firebase-admin';
import { recordAttempt } from '../../../lib/payment-attempts';
import {
  DEFAULT_DURATIONS,
  PRICING_DOC_PATH,
  applyDiscount,
  billableSeats,
  computeAmount,
  evaluatePromo,
  isPlanAllowed,
  normalizeSeatCount,
  parseDurations,
  planFor,
  planKey,
  planNameFor,
  tierOf,
  type DurationPrice,
} from '../../../lib/pricing';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

/**
 * Live pricing ladder from settings/pricing, or the built-in defaults.
 *
 * The client never gets to say what anything costs — it sends a seat count and a
 * duration, and the amount is computed here. That property is unchanged by
 * moving the table into Firestore; only the source of the numbers moved.
 *
 * A read failure falls back to DEFAULT_DURATIONS rather than throwing, so a
 * missing or corrupt settings doc degrades to the previously hardcoded prices
 * instead of taking checkout down.
 */
async function loadDurations(): Promise<DurationPrice[]> {
  try {
    const snap = await getAdminDb()
      .collection(PRICING_DOC_PATH.collection)
      .doc(PRICING_DOC_PATH.doc)
      .get();
    if (!snap.exists) return DEFAULT_DURATIONS;
    return parseDurations(snap.data()) ?? DEFAULT_DURATIONS;
  } catch (e) {
    console.error('[create-order] pricing read failed, using defaults:', e);
    return DEFAULT_DURATIONS;
  }
}

/**
 * The account role behind this request, from a verified Firebase ID token.
 *
 * Deliberately NOT taken from the request body. The body already carries a
 * `userId`, but anyone can put anyone's uid in a body — and since the plan a
 * seller is allowed to buy now depends on their role, trusting that field would
 * let a manufacturer claim a retailer's uid, get the retailer bundle price, and
 * then write the subscription against their own account.
 *
 * Returns null when there is no usable token. Callers must treat null as
 * "unknown role", which isPlanAllowed() denies on any restricted plan — so an
 * older client that sends no token can still buy the open per-listing plans and
 * simply cannot buy a role-restricted one.
 */
async function resolveCallerRole(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return null;

  try {
    const decoded = await getAdminAuth().verifyIdToken(authHeader.slice(7));
    const adminDb = getAdminDb();

    // Same uid → uidIndex → phone resolution the rest of the codebase uses:
    // accounts are keyed by phone, with uid-keyed docs for admin-created ones.
    const [byUid, idx] = await Promise.all([
      adminDb.collection('users').doc(decoded.uid).get(),
      adminDb.collection('uidIndex').doc(decoded.uid).get(),
    ]);
    if (byUid.exists && byUid.data()?.role) return String(byUid.data()!.role);

    const phone = idx.exists ? String(idx.data()?.phone ?? '') : '';
    if (phone) {
      const byPhone = await adminDb.collection('users').doc(phone).get();
      if (byPhone.exists && byPhone.data()?.role) return String(byPhone.data()!.role);
    }
  } catch (e) {
    console.error('[create-order] role resolution failed:', e);
  }
  return null;
}

/**
 * Resolve a promo code to a discount percentage, checking all applicability
 * conditions (active, date range, applicable plans, seat limits).
 *
 * Returns { discountPercent } on success or { discountPercent: 0, error } when
 * a code was provided but is not valid. The caller returns 422 in that case so
 * the client can show the exact reason rather than silently charging full price.
 *
 * The env-var fallback is kept for any promo currently configured that way;
 * Firestore wins when both define the same code.
 */
async function resolveDiscount(
  rawCode: unknown,
  seatCount: number,
  months: number,
): Promise<{ discountPercent: number; error?: string }> {
  const code = String(rawCode ?? '').trim().toUpperCase();
  if (!code) return { discountPercent: 0 };

  try {
    const snap = await getAdminDb()
      .collection('promoCodes')
      .where('code', '==', code)
      .limit(1)
      .get();

    if (!snap.empty) {
      // Same rule set (and same messages) the checkout UI validated against, so
      // a discount the seller was shown cannot be refused here — or vice versa.
      // evaluatePromo already returns { discountPercent, error? } — the exact
      // shape this function contracts — so the result passes straight through.
      const { discountPercent, error } = evaluatePromo(snap.docs[0]!.data(), {
        months,
        seatCount,
      });
      return { discountPercent, ...(error ? { error } : {}) };
    }
  } catch (e) {
    console.error('[create-order] promo read failed:', e);
    // On a read failure, let the order proceed without a discount rather than
    // blocking the payment — better to under-discount than to lose a sale.
    return { discountPercent: 0 };
  }

  // Legacy fallback: PROMO_CODES={"LAUNCH20":20}
  try {
    const raw = process.env.PROMO_CODES;
    if (raw) {
      const map = JSON.parse(raw) as Record<string, number>;
      const pct = Number(map[code]);
      if (Number.isFinite(pct) && pct > 0 && pct <= 100) return { discountPercent: pct };
    }
  } catch {
    /* malformed env var — ignore */
  }

  return { discountPercent: 0, error: 'Invalid or expired promo code.' };
}

export async function POST(request: Request) {
  try {
    const { seatCount, durationMonths, planId, promoCode, userId } = await request.json();

    const durations = await loadDurations();
    const callerRole = await resolveCallerRole(request);

    // Seats sell in blocks of 10 with a 10-seat minimum. Enforced here as well
    // as in the purchase UIs so the rule holds even for a request that didn't
    // come from them; both sides use the same helper, so the charged seat count
    // matches the one the seller was shown.
    const seats = normalizeSeatCount(seatCount);

    // Unknown/absent period falls back to the shortest offered one rather than
    // assuming a literal 1 month — the ladder is admin-editable now and may not
    // contain a 1-month entry.
    // planId identifies the exact row; durationMonths is the legacy fallback for
    // clients that predate bundles. Neither is trusted for the price itself.
    const requestedPlan = planFor(durations, planId ?? durationMonths);

    // A plan the caller may not buy is refused outright rather than quietly
    // swapped for one they can: silently charging a different price than the
    // screen showed is the failure this whole path exists to prevent.
    if (requestedPlan && !isPlanAllowed(requestedPlan, callerRole)) {
      return NextResponse.json(
        {
          error:
            'This plan is not available for your account type. Please pick another plan or contact support.',
        },
        { status: 403 },
      );
    }

    // The client named a plan that is no longer on the ladder — an admin edited
    // or deleted it while this checkout was open. Refuse rather than fall back:
    // the fallback below is the first plan on the ladder (now a Standard
    // bundle), which would charge a different amount than the screen showed.
    if (!requestedPlan && (planId != null || durationMonths != null)) {
      return NextResponse.json(
        { error: 'This plan has just been updated. Please refresh the page and choose your plan again.' },
        { status: 409 },
      );
    }

    // No plan named at all: the first plan the caller is allowed to buy.
    const allowed = durations.filter((d) => isPlanAllowed(d, callerRole));
    if (allowed.length === 0) {
      return NextResponse.json(
        { error: 'No subscription plan is available for your account type.' },
        { status: 403 },
      );
    }
    const plan = requestedPlan ?? allowed[0]!;
    const months = plan.months;
    const unitPrice = plan.pricePerSeat;

    // Seats are clamped to what the plan includes BEFORE pricing, so a flat plan
    // cannot be turned into unlimited listings by sending a large seatCount.
    const grantedSeats = billableSeats(plan, seats);

    // Promo min/max-seat rules are checked against what is actually granted —
    // a Standard plan is always its included listings, whatever count the
    // client sent.
    const promoResult = await resolveDiscount(promoCode, grantedSeats, months);
    if (promoResult.error) {
      return NextResponse.json({ error: promoResult.error }, { status: 422 });
    }
    const discountPercent = promoResult.discountPercent;
    const subtotal = computeAmount(plan, grantedSeats);
    const baseAmount = discountPercent
      ? applyDiscount(subtotal, discountPercent)
      : subtotal;

    const options = {
      amount: baseAmount * 100, // paise
      currency: 'INR',
      receipt: `receipt_${Date.now()}`,
      notes: {
        userId:         userId || '',
        seatCount:      grantedSeats,
        durationMonths: months,
        promoCode:      promoCode || '',
        unitPrice,
        planId: planKey(plan),
        // Snapshotted onto the subscription record via verify/, so it keeps
        // saying Standard or Custom even if this ladder row is later edited.
        planTier: tierOf(plan),
        planName: planNameFor(plan),
        discountPercent,
        // The rupee amount actually charged. verify/ reads this back off the
        // order so the record written afterwards can never be re-derived from a
        // stale price table.
        amountCharged:  baseAmount,
      },
    };

    const order = await razorpay.orders.create(options);

    // Same lifecycle record as a cart purchase, so the admin Payments view
    // covers subscription failures and product failures in one place.
    await recordAttempt({
      razorpayOrderId: order.id,
      kind:            'subscription',
      userId:          String(userId || ''),
      amount:          baseAmount,
      subtotal:        subtotal,
      seatCount:       grantedSeats,
      durationMonths:  months,
      promoCode:       promoCode || null,
      discountPercent: discountPercent,
      source:          request.headers.get('x-client') === 'mobile' ? 'mobile' : 'web',
      note:            `${planNameFor(plan)} subscription — ${grantedSeats} listing(s), ${months} month(s)`,
    });

    return NextResponse.json({
      ...order,
      seatCount:      grantedSeats,
      durationMonths: months,
      unitPrice,
      planId:         planKey(plan),
      planTier:       tierOf(plan),
      planName:       planNameFor(plan),
      amountCharged:  baseAmount,
      discountPercent,
      // Return the key used to create this order so the mobile always opens
      // Razorpay with the matching key (prevents key-mismatch errors).
      key_id: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
  }
}
