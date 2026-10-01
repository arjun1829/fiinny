import type { AppScreen, RolePermissions, UserRole } from '../contexts/AuthContext';

/**
 * ─── Subscription Plan Layer (Phase 2A) ────────────────────────────────────────
 *
 * A tenant-level entitlement layer that sits ABOVE the existing role system:
 *
 *     Super Admin → Plan → Plan Features → Tenant Subscription
 *                 → Business Admin → Role Matrix / Feature Permissions
 *
 * The plan decides WHICH features a tenant may use at all. The existing Role
 * Matrix (settings/rolePermissions) and Feature Permissions
 * (settings/featurePermissions) remain the only role-level permission system —
 * this layer never replaces them, it only CLAMPS them: a role can never be
 * granted a screen the tenant's plan excludes.
 *
 * Reuse over duplication: plan entitlements are expressed with the EXISTING
 * identifiers already used elsewhere in the app, not new names:
 *   • `screens`  → `AppScreen` keys (same vocabulary as RolePermissions).
 *   • `features` → leaf ids from PERMISSION_MODULES (settings/featurePermissions).
 *   • `modules`  → `posModules` add-on ids (the marketplace catalogue).
 *
 * Access model (Phase 2B — confirmed):
 *   The subscription is the MAXIMUM access boundary for a tenant. A tenant
 *   WITHOUT a valid subscription is RESTRICTED, not unlimited — it receives no
 *   gated screens (only the always-allowed safety set below). The master tenant
 *   follows the exact same logic as every other tenant; "Manufacturer" means the
 *   screens explicitly configured on that plan, never "everything".
 */

// Screens every authenticated tenant user can always reach regardless of plan,
// so a tenant that is between plans / suspended is never fully locked out (they
// can still open Settings to see their subscription state). Keep this minimal.
export const ALWAYS_ALLOWED_SCREENS = new Set<AppScreen>(['settings']);

/**
 * Admin sub-screens that are corollaries of the `admin` AppScreen. The plan
 * editor (SUBSCRIPTION_MODULES) only exposes a single "Admin" toggle, so these
 * screens are never written into plan.screens by buildPlanEntitlement. They
 * must be injected at both build-time and resolve-time whenever `admin` is in
 * the plan, otherwise Admin Hub tabs gated by these screens are silently hidden.
 */
export const ADMIN_COROLLARY_SCREENS: AppScreen[] = [
    'audit_log',
    'manage_retailers',
    'invoice_settings',
    'manage_store',
    'manufacturers',
    'invoice_templates',
    'schema_builder',
];

// ─── Screen vocabulary ─────────────────────────────────────────────────────────
// Runtime list of every AppScreen (the TS union has no runtime form). Keep in
// sync with the AppScreen type in AuthContext.
export const ALL_APP_SCREENS: AppScreen[] = [
    'dashboard', 'b2c_dashboard', 'retailers', 'worklist', 'khata', 'dispatch',
    'pos', 'inventory', 'settings', 'manage_retailers', 'admin', 'invoice_settings',
    'schema_builder', 'invoice_templates', 'manufacturers', 'order_history',
    'online_orders', 'online_dashboard', 'manage_store', 'analytics', 'krishidukan',
    'loyalty', 'accounts', 'ar', 'ap', 'cash', 'credit', 'collections', 'disputes',
    'promotions', 'contracts', 'finance_analytics', 'expenses', 'audit_log', 'customers',
];

// ─── Types ─────────────────────────────────────────────────────────────────────

export type PlanId = 'retailer' | 'distributor' | 'manufacturer' | (string & {});

/**
 * Customer-facing pricing & marketing content for a plan. Lives INSIDE the
 * authoritative `plans/{planId}` document (never in a separate collection), so
 * there is a single source of truth shared by the Super Admin editor, the public
 * `/pricing` page, and the Razorpay order/verify Cloud Functions.
 *
 * `displayName` is intentionally separate from `Plan.name` (the entitlement
 * label used in Super Admin tables) so the customer-facing name can be changed
 * — e.g. "Starter"/"Growth"/"Pro" today — without disturbing the entitlement
 * identity ("Retailer"/"Distributor"/"Manufacturer").
 *
 * Prices are whole INR rupees (NOT paise). The server multiplies by 100 when
 * creating the Razorpay order.
 */
export interface PlanPricing {
    /** Customer-facing plan name shown on /pricing (e.g. "Starter"). */
    displayName: string;
    /** Short one-line pitch under the name. */
    tagline?: string;
    /** Longer description (optional). */
    description?: string;
    /** Monthly price in whole INR rupees. */
    monthlyPrice: number;
    /** Yearly price in whole INR rupees. */
    yearlyPrice: number;
    /** Optional override for the savings label; when absent it is computed. */
    savingsLabel?: string;
    /** Badge text (e.g. "Most Popular"). */
    badge?: string;
    /** Whether the badge is shown. Defaults to true when a badge is set. */
    badgeVisible?: boolean;
    /** Feature bullet list. */
    features: string[];
    /** Limit bullet list (e.g. "1 Warehouse"). */
    limits: string[];
}

/**
 * The stable pricing-tier id ⇄ entitlement plan id mapping. The public pricing
 * page and Razorpay client speak in tier ids ('starter'/'growth'/'pro'); the
 * authoritative catalogue docs are keyed by entitlement plan id. Keep both
 * directions here so nothing re-derives the mapping ad hoc.
 */
export const PRICING_TIER_TO_PLAN_ID: Record<string, PlanId> = {
    starter: 'retailer',
    growth: 'distributor',
    pro: 'manufacturer',
};
export const PLAN_ID_TO_PRICING_TIER: Record<string, string> = {
    retailer: 'starter',
    distributor: 'growth',
    manufacturer: 'pro',
};

/** Compute the % saved by paying yearly vs 12× monthly (0 when not applicable). */
export function computeSavingsPct(monthlyPrice: number, yearlyPrice: number): number {
    if (!monthlyPrice || monthlyPrice <= 0) return 0;
    const full = monthlyPrice * 12;
    if (yearlyPrice >= full || yearlyPrice <= 0) return 0;
    return Math.round(((full - yearlyPrice) / full) * 100);
}

export type SubscriptionStatus =
    | 'active'      // paid & current
    | 'trial'       // trial period, full access
    | 'past_due'    // payment failed, grace period
    | 'suspended'   // access revoked by platform
    | 'cancelled';  // ended

/** Global plan definition — lives in the root `plans/{planId}` collection. */
export interface Plan {
    id: PlanId;
    name: string;
    description?: string;
    /** Ordering / relative richness (retailer < distributor < manufacturer). */
    tier: number;
    isActive: boolean;
    /** AppScreen keys this plan unlocks. This is the primary entitlement axis. */
    screens: AppScreen[];
    /**
     * Optional finer-grained allowlist of PERMISSION_MODULES leaf feature ids.
     * Empty/omitted → every feature under an allowed screen is permitted (the
     * Feature Permissions layer still applies per role). Non-empty → only these
     * leaf features are available regardless of role config.
     */
    features?: string[];
    /** Optional bundled/allowed posModules add-on ids (marketplace reuse). */
    modules?: string[];
    /** Super-Admin-configured default landing page path for this plan (e.g. '/pos'). */
    defaultLandingPath?: string;
    /**
     * Customer-facing pricing & marketing content shown on the public `/pricing`
     * page and used (server-side) to price the Razorpay order. Optional so plans
     * that predate this field keep working; falls back to DEFAULT_PLAN_PRICING.
     */
    pricing?: PlanPricing;
    createdAt?: unknown;
    updatedAt?: unknown;
}

/** Tenant → plan assignment — lives in root `tenantSubscriptions/{tenantId}`. */
export interface TenantSubscription {
    tenantId: string;
    planId: PlanId;
    status: SubscriptionStatus;
    startedAt?: unknown;
    expiresAt?: unknown;
    /** Who assigned it (super-admin uid/email), for audit. */
    assignedBy?: string;
    updatedAt?: unknown;
    /**
     * Per-tenant entitlement additions on top of the plan (super-admin only).
     * Lets the platform grant a one-off screen/module without a new plan.
     */
    overrides?: {
        screens?: AppScreen[];
        features?: string[];
        modules?: string[];
    };
}

/** Resolved entitlements for the signed-in tenant, exposed via AuthContext. */
export interface PlanEntitlements {
    planId: PlanId | null;
    status: SubscriptionStatus | null;
    /** False when the tenant has no valid subscription (→ restricted access). */
    hasSubscription: boolean;
    /**
     * The exact set of screens the plan unlocks. Always a concrete set — an empty
     * set means "no gated access" (restricted). There is no null/unlimited state.
     */
    screens: Set<AppScreen>;
    /** Optional finer allowlists — null means "not restricted at that granularity". */
    features: Set<string> | null;
    modules: Set<string> | null;
    /** Super-Admin-configured default landing path for this plan (e.g. '/pos'). */
    defaultLandingPath: string | null;
}

/** The access a tenant gets when it has no valid subscription: restricted. */
export const RESTRICTED_ENTITLEMENTS: PlanEntitlements = {
    planId: null, status: null, hasSubscription: false,
    screens: new Set<AppScreen>(), features: null, modules: null,
    defaultLandingPath: null,
};

// ─── Default plan catalogue (seed source of truth) ─────────────────────────────
// Mirrors what a super admin will seed into `plans/*` (same pattern as
// DEFAULT_PERMISSIONS / DEFAULT_FEATURE_PERMISSIONS). Every plan includes
// `settings`, `admin` and `audit_log` so the Business Admin can always configure
// roles WITHIN the plan (rule 2).

const CORE_ADMIN_SCREENS: AppScreen[] = ['settings', 'admin', 'audit_log'];

// Retailer — single-shop / POS-centric (KrishiDukan-style B2C).
const RETAILER_SCREENS: AppScreen[] = [
    ...CORE_ADMIN_SCREENS,
    'b2c_dashboard', 'online_dashboard', 'analytics',
    'pos', 'khata', 'customers', 'loyalty',
    'inventory', 'order_history', 'online_orders', 'manage_store',
    'worklist', 'invoice_settings', 'invoice_templates', 'krishidukan',
];

// Distributor — B2B wholesale: full worklist, dispatch, supplier ledger, finance.
const DISTRIBUTOR_SCREENS: AppScreen[] = [
    ...RETAILER_SCREENS,
    'dashboard', 'retailers', 'manage_retailers', 'manufacturers',
    'dispatch', 'schema_builder',
    'accounts', 'ar', 'ap', 'cash', 'credit', 'collections', 'disputes',
    'promotions', 'contracts', 'finance_analytics', 'expenses',
];

// Manufacturer — production + distributor network + dispatch.
const MANUFACTURER_SCREENS: AppScreen[] = [
    ...CORE_ADMIN_SCREENS,
    'dashboard', 'analytics', 'manufacturers', 'retailers', 'manage_retailers',
    'worklist', 'dispatch', 'inventory', 'schema_builder',
    'invoice_settings', 'invoice_templates',
    'accounts', 'ar', 'ap', 'cash', 'credit', 'collections', 'disputes',
    'contracts', 'finance_analytics', 'expenses',
];

const dedupe = (arr: AppScreen[]): AppScreen[] => Array.from(new Set(arr));

// ─── Default customer-facing pricing (seed source of truth) ─────────────────────
// Mirrors exactly what the /pricing page and Razorpay used to hardcode, keyed by
// entitlement plan id. Both the Super Admin editor and PricingPage fall back to
// this when a plan doc has no `pricing` block, and the Cloud Functions fall back
// to it when the doc/field is missing — so behaviour is unchanged until edited.
export const DEFAULT_PLAN_PRICING: Record<'retailer' | 'distributor' | 'manufacturer', PlanPricing> = {
    retailer: {
        displayName: 'Starter',
        tagline: 'Perfect for small retailers',
        monthlyPrice: 999,
        yearlyPrice: 9990,
        features: [
            'Up to 500 invoices / month',
            'GST Invoice & POS Billing',
            'GSTR-1 & GSTR-3B Reports',
            'WhatsApp Payment Reminders',
            'Basic Inventory (500 SKUs)',
            'Up to 3 users',
            'Email Support',
        ],
        limits: ['1 Business Profile', '1 Warehouse'],
    },
    distributor: {
        displayName: 'Growth',
        tagline: 'For growing businesses',
        monthlyPrice: 1999,
        yearlyPrice: 19990,
        badge: 'Most Popular',
        badgeVisible: true,
        features: [
            'Unlimited invoices',
            'Everything in Starter',
            'Purchase Orders & Delivery Challans',
            'Quotations → Invoice conversion',
            'Inventory Batch + Expiry Tracking',
            'Barcode Label Printing',
            'Financial Reports (P&L, Balance Sheet)',
            'Multi-Warehouse / Godown',
            'Up to 10 users',
            'Priority Support',
        ],
        limits: ['3 Business Profiles', '5 Warehouses'],
    },
    manufacturer: {
        displayName: 'Pro',
        tagline: 'For enterprise operations',
        monthlyPrice: 2999,
        yearlyPrice: 29990,
        badge: 'Best Value',
        badgeVisible: true,
        features: [
            'Everything in Growth',
            'Unlimited users',
            'Unlimited Business Profiles',
            'Unlimited Warehouses',
            'AI Business Advisor (insights, reorders)',
            'Online Payment Links (Razorpay)',
            'Multi-Company Support',
            'Custom Invoice Templates (10+)',
            'Offline PWA Mode',
            'Dedicated Account Manager',
            'API Access',
        ],
        limits: ['Unlimited everything'],
    },
};

export const DEFAULT_PLAN_CATALOGUE: Record<'retailer' | 'distributor' | 'manufacturer', Plan> = {
    retailer: {
        id: 'retailer',
        name: 'Retailer',
        description: 'Single-shop POS, billing, khata and inventory for retail businesses.',
        tier: 1,
        isActive: true,
        screens: dedupe(RETAILER_SCREENS),
        pricing: DEFAULT_PLAN_PRICING.retailer,
    },
    distributor: {
        id: 'distributor',
        name: 'Distributor',
        description: 'B2B wholesale: worklist, dispatch, supplier ledger and full finance suite.',
        tier: 2,
        isActive: true,
        screens: dedupe(DISTRIBUTOR_SCREENS),
        pricing: DEFAULT_PLAN_PRICING.distributor,
    },
    manufacturer: {
        id: 'manufacturer',
        name: 'Manufacturer',
        description: 'Production, distributor network, dispatch and finance operations.',
        tier: 3,
        isActive: true,
        screens: dedupe(MANUFACTURER_SCREENS),
        pricing: DEFAULT_PLAN_PRICING.manufacturer,
    },
};

// ─── Resolution & enforcement helpers ──────────────────────────────────────────

/**
 * Build the resolved entitlement set for a tenant from its subscription + plan.
 * Returns RESTRICTED (empty screen set) when there is no valid subscription — a
 * tenant without a subscription never gets unrestricted access.
 */
export function resolveEntitlements(
    subscription: TenantSubscription | null,
    plan: Plan | null,
): PlanEntitlements {
    // No subscription/plan assigned → restricted. This applies to every tenant
    // including master (which must be assigned a plan like everyone else).
    if (!subscription || !plan) {
        return RESTRICTED_ENTITLEMENTS;
    }

    const screens = new Set<AppScreen>([
        ...plan.screens,
        ...(subscription.overrides?.screens ?? []),
    ]);

    // Admin corollary screens are not toggled individually in the plan editor, so they
    // can be absent from saved plans. Inject them whenever admin is present so every
    // Admin Hub tab that the subscription + role permits is actually visible.
    if (screens.has('admin')) {
        for (const s of ADMIN_COROLLARY_SCREENS) screens.add(s);
    }

    const featureList = [...(plan.features ?? []), ...(subscription.overrides?.features ?? [])];
    const moduleList = [...(plan.modules ?? []), ...(subscription.overrides?.modules ?? [])];

    return {
        planId: subscription.planId,
        status: subscription.status,
        hasSubscription: true,
        screens,
        // Empty feature/module allowlist means "not restricted at that granularity".
        features: featureList.length ? new Set(featureList) : null,
        modules: moduleList.length ? new Set(moduleList) : null,
        defaultLandingPath: plan.defaultLandingPath ?? null,
    };
}

/** Statuses that grant feature access (past_due = grace period). */
const ACCESS_GRANTING: SubscriptionStatus[] = ['active', 'trial', 'past_due'];

/**
 * True if the tenant's plan permits the given screen. This is the tenant-level
 * gate that applies to EVERY role, including the business admin (rule 1).
 *
 * Order: ungated route → allow; always-allowed safety screen → allow; no valid
 * subscription or non-granting status (suspended/cancelled) → deny; otherwise the
 * screen must be in the plan's set.
 */
export function isScreenAllowedByPlan(
    screen: AppScreen | undefined,
    entitlements: PlanEntitlements,
): boolean {
    if (!screen) return true;                          // ungated route
    if (ALWAYS_ALLOWED_SCREENS.has(screen)) return true; // safety net (Settings)
    if (!entitlements.hasSubscription) return false;   // no valid subscription → restricted
    if (entitlements.status && !ACCESS_GRANTING.includes(entitlements.status)) return false;
    return entitlements.screens.has(screen);
}

/**
 * True if a leaf feature id is permitted by the plan's sub-section entitlements.
 *
 * `features` is a per-module ALLOWLIST of PERMISSION_MODULES section ids (e.g.
 * `worklist.invoices`). It is module-scoped so it composes with module-level
 * grants: a module that has NO entry in `features` is unrestricted (fully
 * included with its screen); a module that HAS entries only permits leaf ids
 * under one of those listed sections. `null`/empty features → no sub-section
 * restriction at all.
 */
export function isFeatureAllowedByPlan(featureId: string, entitlements: PlanEntitlements): boolean {
    if (entitlements.features === null || entitlements.features.size === 0) return true;

    const moduleId = featureId.split('.')[0];
    // Is this feature's module restricted (does any listed section share its module)?
    let moduleRestricted = false;
    for (const sec of entitlements.features) {
        if (sec.split('.')[0] === moduleId) { moduleRestricted = true; break; }
    }
    if (!moduleRestricted) return true; // module not restricted → included with its screen

    // Restricted module: allow only leaf ids under an explicitly-included section.
    for (const sec of entitlements.features) {
        if (featureId === sec || featureId.startsWith(sec + '.')) return true;
    }
    return false;
}

/**
 * Clamp a full RolePermissions matrix so no role can be granted a screen the
 * plan excludes. Used by the Phase 2B Role Matrix UI to disable out-of-plan
 * toggles and by any code that wants the *effective* (plan ∩ role) permissions.
 * Unlimited entitlements return the matrix unchanged.
 */
export function clampPermissionsToPlan(
    permissions: RolePermissions,
    entitlements: PlanEntitlements,
): RolePermissions {
    const clamped = {} as RolePermissions;
    for (const [role, screens] of Object.entries(permissions)) {
        const roleScreens: Record<string, boolean> = {};
        for (const [screen, allowed] of Object.entries(screens)) {
            roleScreens[screen] = allowed && isScreenAllowedByPlan(screen as AppScreen, entitlements);
        }
        clamped[role as UserRole] = roleScreens as RolePermissions[UserRole];
    }
    return clamped;
}

// NOTE: the Super Admin UI's module/section list is derived from the real ERP
// navigation + PERMISSION_MODULES in `subscriptionCatalog.ts` (SUBSCRIPTION_CATALOG),
// not a flat screen list here — that keeps it from diverging from the app's nav.
