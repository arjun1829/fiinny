/**
 * ─── Plan Promotions ───────────────────────────────────────────────────────────
 *
 * A promotion is a time-boxed percentage discount applied ON TOP of a plan's
 * authoritative base price. It NEVER overwrites the base price — the base price in
 * `plans/{planId}.pricing` stays the single source of truth. A promotion is stored
 * separately in its own root collection and applied dynamically at read/charge time
 * (customer /pricing page + Razorpay order creation, server-side).
 *
 * Targeting is a SINGLE axis: the three plans. In this codebase the pricing tier
 * and the entitlement "business category" are the same three entities (1:1):
 *   starter  ↔ Retailer
 *   growth   ↔ Distributor
 *   pro      ↔ Manufacturer
 * so a promotion targets one or more pricing tiers, and the UI shows both labels.
 *
 * IMPORTANT: this module has NO firebase-admin / React dependency so its pure
 * helpers can be reused anywhere in `src/`. The Cloud Functions (functions/src/
 * payments.ts) intentionally re-implement the same date/discount logic because
 * that package cannot import from `src/` — keep the two in sync if you change the
 * "live" or discount maths here.
 */

/** Root collection holding plan promotions. Distinct from the unrelated tenant/
 * root `promotions` collection (the B2B trade-promotions ERP feature). */
export const PLAN_PROMOTIONS_COLLECTION = 'planPromotions';

/** Which billing cycles a promotion applies to. */
export type PromoBillingCycle = 'monthly' | 'yearly' | 'both';

/** A pricing tier a promotion can target (same three entities as the plans). */
export type PromoTier = 'starter' | 'growth' | 'pro';

export interface PlanPromotion {
    id: string;
    /** Human-facing promotion name/label (e.g. "Diwali Sale"). */
    label: string;
    /** Applicable pricing tiers (subset of starter/growth/pro). */
    tiers: PromoTier[];
    /** Discount as a whole/decimal percentage, 0–100 (exclusive of 0 to be useful). */
    discountPct: number;
    /** Billing cycle this promotion applies to. */
    billingCycle: PromoBillingCycle;
    /** Inclusive start date as an ISO calendar date 'YYYY-MM-DD' (UTC-interpreted). */
    startDate: string;
    /** Inclusive end date as an ISO calendar date 'YYYY-MM-DD' (UTC-interpreted). */
    endDate: string;
    /** Whether the promotion is enabled at all (independent of the date window). */
    isActive: boolean;
    createdBy?: string;
    createdAt?: unknown;
    updatedAt?: unknown;
}

/** The three tiers with both their customer name and entitlement category label. */
export const PROMO_TIER_OPTIONS: { value: PromoTier; label: string }[] = [
    { value: 'starter', label: 'Starter · Retailer' },
    { value: 'growth',  label: 'Growth · Distributor' },
    { value: 'pro',     label: 'Pro · Manufacturer' },
];

export const PROMO_CYCLE_OPTIONS: { value: PromoBillingCycle; label: string }[] = [
    { value: 'both',    label: 'Monthly & Yearly' },
    { value: 'monthly', label: 'Monthly only' },
    { value: 'yearly',  label: 'Yearly only' },
];

// Dates are interpreted at UTC day boundaries so the client display and the
// server-side charge always agree on whether a promotion is live (a promotion is
// live from 00:00:00Z of its start date through 23:59:59.999Z of its end date).
const parseStartMs = (d?: string): number | null => {
    if (!d) return null;
    const ms = Date.parse(`${d}T00:00:00Z`);
    return Number.isNaN(ms) ? null : ms;
};
const parseEndMs = (d?: string): number | null => {
    if (!d) return null;
    const ms = Date.parse(`${d}T23:59:59.999Z`);
    return Number.isNaN(ms) ? null : ms;
};

/** A discount percentage is usable only when it is a finite number in (0, 100]. */
export function isValidDiscountPct(pct: unknown): pct is number {
    return typeof pct === 'number' && Number.isFinite(pct) && pct > 0 && pct <= 100;
}

/** True when the promotion is enabled AND today falls inside its date window. */
export function isPromotionLive(
    p: Pick<PlanPromotion, 'isActive' | 'startDate' | 'endDate'>,
    nowMs: number = Date.now(),
): boolean {
    if (!p.isActive) return false;
    const start = parseStartMs(p.startDate);
    const end = parseEndMs(p.endDate);
    if (start !== null && nowMs < start) return false;
    if (end !== null && nowMs > end) return false;
    return true;
}

/**
 * Find the best (highest-discount) promotion that applies to a given tier + cycle
 * right now, or null when none applies. Ties break on whichever appears first.
 */
export function findApplicablePromotion(
    promotions: PlanPromotion[],
    tier: PromoTier | string,
    cycle: 'monthly' | 'yearly',
    nowMs: number = Date.now(),
): PlanPromotion | null {
    let best: PlanPromotion | null = null;
    for (const p of promotions) {
        if (!Array.isArray(p.tiers) || !p.tiers.includes(tier as PromoTier)) continue;
        if (p.billingCycle !== 'both' && p.billingCycle !== cycle) continue;
        if (!isValidDiscountPct(p.discountPct)) continue;
        if (!isPromotionLive(p, nowMs)) continue;
        if (!best || p.discountPct > best.discountPct) best = p;
    }
    return best;
}

/** Apply a discount to a paise amount (integer paise in, integer paise out). */
export function applyDiscountPaise(basePaise: number, pct: number): number {
    if (!isValidDiscountPct(pct)) return basePaise;
    return Math.round((basePaise * (100 - pct)) / 100);
}

/**
 * The effective discounted price in whole/decimal rupees for a base rupee price.
 * Computed via paise so 2-decimal results (e.g. ₹999 − 10% = ₹899.10) are exact.
 */
export function discountedRupees(baseRupees: number, pct: number): number {
    return applyDiscountPaise(Math.round(baseRupees * 100), pct) / 100;
}

/** Format a rupee amount that may have paise (drops the decimals when whole). */
export function formatRupees(amount: number): string {
    const whole = Number.isInteger(amount);
    return amount.toLocaleString('en-IN', {
        minimumFractionDigits: whole ? 0 : 2,
        maximumFractionDigits: 2,
    });
}

/** Validate a promotion form. Returns a user-facing message or null when valid. */
export function validatePromotion(
    p: Pick<PlanPromotion, 'label' | 'tiers' | 'discountPct' | 'startDate' | 'endDate'>,
): string | null {
    if (!p.label.trim()) return 'Promotion name is required.';
    if (!p.tiers || p.tiers.length === 0) return 'Select at least one applicable plan.';
    if (!Number.isFinite(p.discountPct)) return 'Discount must be a number.';
    if (p.discountPct <= 0 || p.discountPct > 100) return 'Discount must be between 0 and 100%.';
    if (!p.startDate) return 'Start date is required.';
    if (!p.endDate) return 'End date is required.';
    const start = parseStartMs(p.startDate);
    const end = parseEndMs(p.endDate);
    if (start === null) return 'Start date is invalid.';
    if (end === null) return 'End date is invalid.';
    if (end < start) return 'End date must be on or after the start date.';
    return null;
}
