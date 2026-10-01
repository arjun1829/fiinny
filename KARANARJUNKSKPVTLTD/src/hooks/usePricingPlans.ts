import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import {
    DEFAULT_PLAN_PRICING,
    type PlanPricing,
} from '../utils/subscriptionPlans';

/**
 * Public read-only projection of `plans/*.pricing`. The authoritative `plans/*`
 * collection is readable only by authenticated users (it also carries entitlement
 * config), so logged-out visitors (landing page, public /pricing) cannot read it
 * and would otherwise fall back to the seed defaults. The Super Admin mirrors ONLY
 * the customer-facing pricing subset into these docs, which are world-readable —
 * making Super Admin Plans the single pricing source for every surface.
 * Each doc: { pricing: PlanPricing, updatedAt }, keyed by catalog id.
 */
export const PUBLIC_PLANS_COLLECTION = 'publicPlans';

/**
 * ─── Pricing catalogue: the single source of truth for plan DATA ───────────────
 *
 * Everything customer-facing that shows a plan's price/name/features — the public
 * `/pricing` page, the landing-page pricing preview, and the Super Admin live
 * preview — reads its DATA from HERE. There is exactly one definition of the plan
 * tiers and one place that merges the authoritative pricing:
 *
 *   Firestore `plans/{catalogId}.pricing`  (Super-Admin edited, authoritative)
 *        └─ falls back to → DEFAULT_PLAN_PRICING[catalogId]  (seed defaults)
 *
 * This module intentionally carries NO visual styling (colors, gradients, fonts).
 * Those belong to each consumer's UI layer — the landing/`/pricing` cards use the
 * marketing palette, the Super Admin preview uses the ERP theme — so the same DATA
 * can render in different design languages without duplicating the DATA itself.
 */

/** Stable identity of a pricing tier — the pricing-page tier id + its entitlement
 *  catalog id, plus whether it is the visually emphasised ("featured") plan. */
export interface PricingTier {
    /** Public pricing-tier id used by the Razorpay client ('starter'/'growth'/'pro'). */
    id: 'starter' | 'growth' | 'pro';
    /** Authoritative entitlement plan id the `plans/*` doc is keyed by. */
    catalogId: 'retailer' | 'distributor' | 'manufacturer';
    /** The one plan highlighted across every surface (kept consistent everywhere). */
    featured: boolean;
}

/** The three tiers, in display order. The ONE place this ordering/identity lives. */
export const PRICING_TIERS: PricingTier[] = [
    { id: 'starter', catalogId: 'retailer',     featured: false },
    { id: 'growth',  catalogId: 'distributor',  featured: true  },
    { id: 'pro',     catalogId: 'manufacturer',  featured: false },
];

/** Tier lookup by entitlement catalog id (retailer/distributor/manufacturer). */
export const PRICING_TIER_BY_CATALOG: Record<string, PricingTier> =
    Object.fromEntries(PRICING_TIERS.map(t => [t.catalogId, t]));

/** A render-ready plan: tier identity merged with its authoritative pricing content. */
export interface PricingPlan extends PricingTier {
    /** Customer-facing name (e.g. "Starter"). */
    name: string;
    tagline: string;
    description?: string;
    /** Whole INR rupees (not paise). */
    monthlyPrice: number;
    yearlyPrice: number;
    savingsLabel?: string;
    badge?: string;
    /** True when a badge is set and not explicitly hidden. */
    badgeVisible: boolean;
    features: string[];
    limits: string[];
}

/** Merge a tier's identity with a `PlanPricing` block into the shared render model. */
export function buildPricingPlan(tier: PricingTier, pricing: PlanPricing): PricingPlan {
    return {
        ...tier,
        name: pricing.displayName,
        tagline: pricing.tagline ?? '',
        description: pricing.description,
        monthlyPrice: pricing.monthlyPrice,
        yearlyPrice: pricing.yearlyPrice,
        savingsLabel: pricing.savingsLabel,
        badge: pricing.badge,
        badgeVisible: pricing.badgeVisible ?? !!pricing.badge,
        features: pricing.features ?? [],
        limits: pricing.limits ?? [],
    };
}

/**
 * Live pricing catalogue for customer-facing surfaces. Streams the authoritative
 * `plans/*` docs and merges each with the seed defaults so a card always renders,
 * and so any Super Admin edit is reflected everywhere immediately. On error /
 * missing docs it falls back to DEFAULT_PLAN_PRICING (behaviour unchanged).
 */
export function usePricingPlans(): { plans: PricingPlan[]; loading: boolean } {
    const { currentUser } = useAuth();
    const isAuthed = !!currentUser;
    const [pricingByCatalog, setPricingByCatalog] = useState<Record<string, PlanPricing>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Authenticated users read the authoritative catalogue directly (unchanged
        // flow). Logged-out visitors read the public projection, which mirrors the
        // same Super-Admin pricing but is world-readable — the private `plans/*`
        // collection denies anonymous reads. Both doc shapes expose `.pricing`.
        const source = isAuthed ? 'plans' : PUBLIC_PLANS_COLLECTION;
        setLoading(true);
        const unsub = onSnapshot(
            collection(db, source),
            snap => {
                const map: Record<string, PlanPricing> = {};
                snap.docs.forEach(d => {
                    const data = d.data() as { pricing?: PlanPricing };
                    if (data.pricing) map[d.id] = data.pricing;
                });
                setPricingByCatalog(map);
                setLoading(false);
            },
            () => setLoading(false),
        );
        return () => unsub();
    }, [isAuthed]);

    const plans = PRICING_TIERS.map(tier =>
        buildPricingPlan(tier, pricingByCatalog[tier.catalogId] ?? DEFAULT_PLAN_PRICING[tier.catalogId])
    );

    return { plans, loading };
}
