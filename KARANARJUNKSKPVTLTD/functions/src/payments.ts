// 2nd-gen (Cloud Run) HTTPS functions. 1st-gen Firebase Hosting rewrites only work
// in us-central1; migrating to 2nd gen lets the asia-south1 rewrites in firebase.json
// invoke these via the Firebase Hosting service agent (no `allUsers`) so the browser
// reaches them same-origin at /api/saas/* without hitting Google's IAM invoker 403.
import { onRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
// Use the modular FieldValue/Timestamp. The Functions emulator wraps the Admin
// SDK service accessor so the namespaced statics (FieldValue /
// .Timestamp) are undefined at runtime, even though admin.firestore() works.
// The modular imports resolve correctly in both the emulator and production.
import { FieldValue, Timestamp, type WriteBatch } from 'firebase-admin/firestore';
import Razorpay from 'razorpay';
import * as crypto from 'crypto';
import corsLib from 'cors';
import type { Request, Response } from 'express';

// ─── CORS ──────────────────────────────────────────────────────────────────────
// Hosted origins that may call these endpoints directly. Firebase Hosting rewrites
// invoke through a service account (no browser CORS at all), so these origins are
// only needed for local emulator development and direct-URL testing.
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://finny-erp-uat.web.app',
  'https://karanarjun-pvt-ltd.web.app',
  'https://fiinny.com',
];

const cors = corsLib({ origin: ALLOWED_ORIGINS, methods: ['POST', 'OPTIONS'] });

// ─── Credentials (lazy) ────────────────────────────────────────────────────────
// Resolved inside each handler — never at module load — so the deploy-time local
// analysis step (which runs without env vars) doesn't crash on startup.
function getKeyId(): string {
  const v = process.env.RAZORPAY_KEY_ID;
  if (!v) throw httpError(500, 'Payment gateway not configured (RAZORPAY_KEY_ID missing)');
  return v;
}
function getKeySecret(): string {
  const v = process.env.RAZORPAY_KEY_SECRET;
  if (!v) throw httpError(500, 'Payment gateway not configured (RAZORPAY_KEY_SECRET missing)');
  return v;
}
function getRazorpay(): Razorpay {
  return new Razorpay({ key_id: getKeyId(), key_secret: getKeySecret() });
}

// ─── Plan catalogue ───────────────────────────────────────────────────────────
// Fallback prices (whole INR rupees), used ONLY when the authoritative
// `plans/{catalogId}.pricing` document is missing or invalid. The Super Admin
// editor writes the live prices there; resolvePlanAmounts() reads them so the
// customer, this order, and verification all use ONE price.
const PLAN_AMOUNTS: Record<string, { monthly: number; yearly: number }> = {
  starter: { monthly: 999,  yearly: 9990  },
  growth:  { monthly: 1999, yearly: 19990 },
  pro:     { monthly: 2999, yearly: 29990 },
};

const PRICING_TO_PLAN_ID: Record<string, string> = {
  starter: 'retailer',
  growth:  'distributor',
  pro:     'manufacturer',
};

/** A price is valid only if it is a finite, strictly-positive number. */
function isValidPrice(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/**
 * Resolve the authoritative monthly/yearly price (in whole INR rupees) for a
 * pricing tier. Reads the customer-facing `plans/{catalogId}.pricing` block —
 * the SAME source the /pricing page renders — and falls back to PLAN_AMOUNTS if
 * the doc/field is absent or invalid. This guarantees the price charged equals
 * the price shown, and the client-supplied plan is never trusted for the amount.
 */
async function resolvePlanAmounts(
  pricingTier: string,
): Promise<{ monthly: number; yearly: number } | null> {
  const catalogId = PRICING_TO_PLAN_ID[pricingTier] ?? pricingTier;
  try {
    const snap = await admin.firestore().doc(`plans/${catalogId}`).get();
    const pricing = snap.data()?.pricing as
      | { monthlyPrice?: number; yearlyPrice?: number }
      | undefined;
    if (pricing && isValidPrice(pricing.monthlyPrice) && isValidPrice(pricing.yearlyPrice)) {
      return { monthly: Math.round(pricing.monthlyPrice), yearly: Math.round(pricing.yearlyPrice) };
    }
  } catch (err) {
    logger.warn('[payments] Could not read authoritative plan pricing; using fallback', {
      pricingTier, catalogId, err,
    });
  }
  return PLAN_AMOUNTS[pricingTier] ?? null;
}

// ─── Plan promotions ────────────────────────────────────────────────────────
// A promotion is a time-boxed % discount applied ON TOP of the authoritative base
// price. The base price (resolvePlanAmounts) is never overwritten. This logic
// mirrors src/utils/planPromotions.ts — that module cannot be imported here (it
// lives in the frontend package), so the maths is intentionally duplicated. Keep
// the two in sync. Dates are interpreted at UTC day boundaries so the price the
// customer saw on /pricing and the price charged here always agree.
const PLAN_PROMOTIONS_COLLECTION = 'planPromotions';

function promoStartMs(d?: string): number | null {
  if (!d) return null;
  const ms = Date.parse(`${d}T00:00:00Z`);
  return Number.isNaN(ms) ? null : ms;
}
function promoEndMs(d?: string): number | null {
  if (!d) return null;
  const ms = Date.parse(`${d}T23:59:59.999Z`);
  return Number.isNaN(ms) ? null : ms;
}
function isPromoLive(startDate?: string, endDate?: string, nowMs = Date.now()): boolean {
  const start = promoStartMs(startDate);
  const end = promoEndMs(endDate);
  if (start !== null && nowMs < start) return false;
  if (end !== null && nowMs > end) return false;
  return true;
}
function isValidPct(pct: unknown): pct is number {
  return typeof pct === 'number' && Number.isFinite(pct) && pct > 0 && pct <= 100;
}

/** Apply a % discount to a paise amount (integer paise in, integer paise out). */
function applyDiscountPaise(basePaise: number, pct: number): number {
  if (!isValidPct(pct)) return basePaise;
  return Math.round((basePaise * (100 - pct)) / 100);
}

/**
 * Resolve the best (highest-%) ACTIVE, in-window promotion for a pricing tier +
 * billing cycle, or null when none applies. Reads the SAME `planPromotions`
 * collection the /pricing page shows. Never throws — a lookup failure means "no
 * promotion" so a full-price order is still created.
 */
async function resolveActivePromotion(
  pricingTier: string,
  cycle: 'monthly' | 'yearly',
): Promise<{ id: string; pct: number } | null> {
  try {
    const snap = await admin.firestore()
      .collection(PLAN_PROMOTIONS_COLLECTION)
      .where('isActive', '==', true)
      .get();
    const now = Date.now();
    let best: { id: string; pct: number } | null = null;
    snap.forEach(d => {
      const p = d.data() as {
        tiers?: string[]; billingCycle?: string; discountPct?: number;
        startDate?: string; endDate?: string;
      };
      if (!Array.isArray(p.tiers) || !p.tiers.includes(pricingTier)) return;
      if (p.billingCycle !== 'both' && p.billingCycle !== cycle) return;
      if (!isValidPct(p.discountPct)) return;
      if (!isPromoLive(p.startDate, p.endDate, now)) return;
      if (!best || (p.discountPct as number) > best.pct) best = { id: d.id, pct: p.discountPct as number };
    });
    return best;
  } catch (err) {
    logger.warn('[payments] Could not read plan promotions; charging full price', {
      pricingTier, cycle, err,
    });
    return null;
  }
}

const PLAN_MODULE_MAP: Record<string, string[]> = {
  starter: ['fast_checkout', 'vpay', 'whatsapp_integration', 'cash_drawer'],
  growth: [
    'fast_checkout', 'vpay', 'whatsapp_integration', 'cash_drawer',
    'cash_tender', 'multiple_payment_modes', 'customer_feedback',
    'returns_exchanges', 'loyalty', 'multiple_billing_counters',
  ],
  pro: [
    'fast_checkout', 'vpay', 'whatsapp_integration', 'cash_drawer',
    'cash_tender', 'multiple_payment_modes', 'customer_feedback',
    'returns_exchanges', 'loyalty', 'multiple_billing_counters',
    'weight_scale', 'multi_bill_tabs', 'offline_pos', 'vcheckout',
    'image_based_pos', 'in_store_online_orders',
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
function httpError(status: number, msg: string): HttpError {
  return new HttpError(status, msg);
}

/** Verify the Firebase ID token from the Authorization header. */
async function authenticate(req: Request): Promise<admin.auth.DecodedIdToken> {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) throw httpError(401, 'Missing or malformed Authorization header');
  const token = header.slice(7);
  try {
    return await admin.auth().verifyIdToken(token);
  } catch {
    throw httpError(401, 'Invalid or expired ID token');
  }
}

/** Verify the caller's tenantId matches the one stored in Firestore. */
async function assertTenantOwnership(uid: string, claimedTenantId: string): Promise<void> {
  const snap = await admin.firestore().doc(`users/${uid}`).get();
  if (snap.data()?.tenantId !== claimedTenantId) {
    throw httpError(403, 'Caller does not belong to the specified tenant');
  }
}

// Adds the plan's add-on module docs to a caller-owned batch (no commit), so
// module activation is atomic with the subscription + ledger writes.
function addPlanModulesToBatch(
  batch: WriteBatch, tenantId: string, pricingTier: string, expiry: Date,
): void {
  const modules = PLAN_MODULE_MAP[pricingTier] ?? [];
  for (const moduleId of modules) {
    batch.set(admin.firestore().doc(`tenants/${tenantId}/modules/${moduleId}`), {
      moduleId,
      status: 'active',
      billingCycle: 'plan_included',
      activatedAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromDate(expiry),
    }, { merge: true });
  }
}

/** Wrap a handler with CORS + unified error handling. Returns an onRequest function. */
function withCors(
  handler: (req: Request, res: Response) => Promise<void>
): (req: Request, res: Response) => void {
  return (req, res) => {
    cors(req, res, async () => {
      try {
        await handler(req, res);
      } catch (err) {
        if (err instanceof HttpError) {
          res.status(err.status).json({ error: err.message });
        } else {
          logger.error('[payments] Unhandled error', err);
          res.status(500).json({ error: 'Internal server error' });
        }
      }
    });
  };
}

// ─── getSaaSSubscription ──────────────────────────────────────────────────────
export const getSaaSSubscription = onRequest({ region: 'asia-south1' }, withCors(async (req, res) => {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
    const decoded = await authenticate(req);
    const { tenantId } = req.body as { tenantId?: string };
    if (!tenantId) throw httpError(400, 'Missing tenantId');

    const snap = await admin.firestore().doc(`tenantSubscriptions/${tenantId}`).get();
    if (!snap.exists) { res.json({ plan: 'free', status: 'none', expiryAt: null }); return; }
    const sub = snap.data()!;
    // Silence unused variable warning (decoded used for auth side-effect)
    void decoded;
    res.json({
      plan: sub.planId ?? 'free',
      status: sub.status ?? 'none',
      expiryAt: sub.expiresAt ? (sub.expiresAt as Timestamp).toDate().toISOString() : null,
    });
  }));

// ─── createSaaSOrder ──────────────────────────────────────────────────────────
// Creates a Razorpay order. Returns order_id + the PUBLIC key_id only.
// The secret key never leaves this function.
export const createSaaSOrder = onRequest({ region: 'asia-south1' }, withCors(async (req, res) => {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
    const decoded = await authenticate(req);

    const { plan, cycle, tenantId } = req.body as {
      plan?: string; cycle?: string; tenantId?: string;
    };
    if (!plan || !cycle || !tenantId) throw httpError(400, 'Missing required parameters: plan, cycle, tenantId');

    if (!PLAN_AMOUNTS[plan]) throw httpError(400, `Unknown plan: ${plan}`);
    if (cycle !== 'monthly' && cycle !== 'yearly') throw httpError(400, `Unknown billing cycle: ${cycle}`);

    await assertTenantOwnership(decoded.uid, tenantId);

    // Authoritative price (same source as /pricing); never trust a client amount.
    const planAmounts = await resolvePlanAmounts(plan);
    if (!planAmounts) throw httpError(500, `Pricing unavailable for plan: ${plan}`);
    const baseInPaise = (cycle === 'yearly' ? planAmounts.yearly : planAmounts.monthly) * 100;

    // Apply the best active promotion (if any) ON TOP of the base price. The
    // resolved %/id is bound into the order notes so verifySaaSPayment re-derives
    // the exact same amount even if the promotion changes/expires afterwards.
    const promo = await resolveActivePromotion(plan, cycle);
    const discountPct = promo ? promo.pct : 0;
    const amountInPaise = applyDiscountPaise(baseInPaise, discountPct);
    const rzp = getRazorpay();

    try {
      const order = await rzp.orders.create({
        amount: amountInPaise,
        currency: 'INR',
        receipt: `rcpt_${tenantId}_${Date.now()}`.substring(0, 40),
        notes: {
          tenantId, plan, cycle,
          promoId: promo?.id ?? '',
          discountPct: String(discountPct),
        },
      });
      res.json({ order_id: order.id, key_id: getKeyId(), amount: order.amount });
    } catch (err: any) {
      logger.error('[payments] Razorpay order creation failed', err);
      throw httpError(500, 'Could not create Razorpay order');
    }
  }));

// ─── verifySaaSPayment ────────────────────────────────────────────────────────
// Validates the Razorpay signature server-side (HMAC-SHA256), then writes the
// subscription to Firestore. The client never writes subscription data.
export const verifySaaSPayment = onRequest({ region: 'asia-south1' }, withCors(async (req, res) => {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
    const decoded = await authenticate(req);

    const {
      razorpay_order_id, razorpay_payment_id, razorpay_signature, tenantId,
    } = req.body as {
      razorpay_order_id?: string; razorpay_payment_id?: string;
      razorpay_signature?: string; tenantId?: string;
    };

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !tenantId) {
      throw httpError(400, 'Missing verification parameters');
    }

    await assertTenantOwnership(decoded.uid, tenantId);

    // ── Strict HMAC-SHA256 — no bypass, no fallback, fail closed ─────────────
    const expectedSig = crypto
      .createHmac('sha256', getKeySecret())
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSig !== razorpay_signature) {
      logger.warn('[payments] Signature mismatch', { tenantId, razorpay_order_id });
      throw httpError(400, 'Payment signature verification failed');
    }

    // ── Bind plan/cycle/amount to the PAID order — never trust client input ───
    // The order's notes and amount were fixed server-side by createSaaSOrder, so
    // they are the authoritative record of what was actually paid for. This blocks
    // a client from paying for a cheap plan and requesting a more expensive one.
    let order;
    try {
      order = await getRazorpay().orders.fetch(razorpay_order_id);
    } catch (err: any) {
      logger.error('[payments] Could not fetch Razorpay order', err);
      throw httpError(502, 'Could not verify order with payment gateway');
    }

    const notes = (order.notes ?? {}) as unknown as {
      tenantId?: string; plan?: string; cycle?: string;
      promoId?: string; discountPct?: string;
    };
    if (notes.tenantId !== tenantId) {
      logger.warn('[payments] Order tenant mismatch', {
        tenantId, orderTenant: notes.tenantId, razorpay_order_id,
      });
      throw httpError(403, 'Order does not belong to this tenant');
    }

    const plan = notes.plan;
    const cycle = notes.cycle;
    if (!plan || !PLAN_AMOUNTS[plan] || (cycle !== 'monthly' && cycle !== 'yearly')) {
      throw httpError(400, 'Order is missing a valid plan or billing cycle');
    }
    const planAmounts = await resolvePlanAmounts(plan);
    if (!planAmounts) throw httpError(500, `Pricing unavailable for plan: ${plan}`);

    // Defense in depth: the amount actually charged must equal the authoritative
    // catalogue price for the order's plan/cycle, LESS the discount that was bound
    // into the order at creation — blocks any amount/plan/discount tampering. The
    // discount % comes from the server-set order notes (the client can never set
    // notes), so re-deriving it here is stable even if the promotion later expired.
    const baseInPaise = (cycle === 'yearly' ? planAmounts.yearly : planAmounts.monthly) * 100;
    const notedPct = Number(notes.discountPct);
    const discountPct = isValidPct(notedPct) ? notedPct : 0;
    const amountInPaise = applyDiscountPaise(baseInPaise, discountPct);
    if (Number(order.amount) !== amountInPaise) {
      logger.warn('[payments] Order amount mismatch', {
        razorpay_order_id, orderAmount: order.amount, amountInPaise, discountPct,
      });
      throw httpError(400, 'Order amount does not match plan pricing');
    }

    // ── Activate subscription atomically ──────────────────────────────────────
    const durationDays = cycle === 'yearly' ? 365 : 30;
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + durationDays);

    const catalogPlanId = PRICING_TO_PLAN_ID[plan] ?? plan;
    const db = admin.firestore();
    const batch = db.batch();

    // 0. saasPayments/{razorpayPaymentId} — transaction/audit ledger (server-side
    //    only). Kept separate from the finance `payments` collection. Never store
    //    razorpay_signature.
    batch.set(db.doc(`saasPayments/${razorpay_payment_id}`), {
      tenantId,
      planId: catalogPlanId,
      cycle,
      amount: amountInPaise,
      currency: 'INR',
      // Audit trail of the discount that was applied to this charge (0 when none).
      discountPct,
      ...(notes.promoId ? { promoId: notes.promoId } : {}),
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      status: 'captured',
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    // 1. tenantSubscriptions/{tenantId} — Phase 2A source of truth
    batch.set(db.doc(`tenantSubscriptions/${tenantId}`), {
      tenantId, planId: catalogPlanId, status: 'active',
      startedAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromDate(expiry),
      assignedBy: `razorpay:${razorpay_payment_id}`,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    // 2. tenants/{tenantId} — backward-compat mirror
    batch.set(db.doc(`tenants/${tenantId}`), {
      plan: catalogPlanId, planStatus: 'active',
      planExpiryAt: Timestamp.fromDate(expiry),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    // 3. posModule add-ons
    addPlanModulesToBatch(batch, tenantId, plan, expiry);

    await batch.commit();

    logger.info('[payments] Subscription activated', {
      tenantId, catalogPlanId, cycle, razorpay_payment_id,
    });
    res.json({ success: true, planId: catalogPlanId });
  }));
