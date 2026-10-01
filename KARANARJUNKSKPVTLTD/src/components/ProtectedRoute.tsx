import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { UserRole, AppScreen } from '../contexts/AuthContext';
import { isScreenAllowedByPlan, isFeatureAllowedByPlan } from '../utils/subscriptionPlans';
import { navFeatureGroupForPath, isFeatureGroupAllowed } from '../utils/subscriptionCatalog';

// Mirrors the DEFAULT_LANDING in App.tsx — the built-in fallback when no
// admin-configured landing exists for a role.
const DEFAULT_ROLE_LANDING: Record<string, string> = {
    admin: '/dashboard',
    analyst: '/dashboard',
    shopkeeper: '/pos',
    sales: '/sales-targets',
    retailer: '/worklist',
    manufacturer: '/manufacturer-portal',
};

interface ProtectedRouteProps {
    children: React.ReactNode;
    requireAdmin?: boolean;
    requireRole?: UserRole[];
    appScreen?: AppScreen;
    // Leaf feature-permission key (FeaturePermissions doc). When set, a role that
    // has this granular action granted is admitted EVEN IF its appScreen permission
    // is not set — this keeps a route in lock-step with the in-page action that opens
    // it (e.g. Partners → "Add New" → /onboarding, gated by worklist.partners.create).
    // The plan gate still applies; roles without the feature stay blocked.
    requireFeature?: string;
    // Leaf feature-permission key that admits a role AS AN ALTERNATIVE to the
    // appScreen grant (an OR, not a mandatory gate like requireFeature). Use for a
    // shared page reachable from two surfaces gated by different keys — e.g. the
    // Customer Profile, opened either from the standalone Customers screen OR from
    // POS Billing → Customers (posBilling.customers.view). A role with EITHER the
    // appScreen grant or this feature is admitted; a role with neither is blocked.
    // The plan gate (both the screen and this feature) still applies.
    altFeature?: string;
    // The AppScreen of the SECOND surface an altFeature page is reached from, used
    // for the PLAN gate only. A page shared by two surfaces (e.g. Customer Profile,
    // reached from the standalone `customers` screen OR from POS Billing → Customers
    // under the `pos` screen) is plan-permitted when EITHER screen is in the plan —
    // so a plan that surfaces the page only through the second surface still allows
    // it. Pairs with altFeature (which OR-widens the ROLE gate).
    altScreen?: AppScreen;
    // Restricts the route to the platform super admin only (superadmin@fiinny.com).
    // Non-super-admin users are redirected to /login regardless of their role.
    requireSuperAdmin?: boolean;
}

/**
 * Route-level access control.
 *
 * Authorization is layered in this order:
 *   1. User must be authenticated.
 *   2. admin role bypasses all subsequent checks.
 *   3. requireAdmin flag → only 'admin' passes (legacy, prefer requireRole).
 *   4. appScreen permission from the live role matrix (Firestore rolePermissions)
 *      → this is the single source of truth and handles custom roles automatically.
 *   5. requireRole list → used as an additional guard for built-in roles. A custom
 *      role NOT in the list is still admitted when its appScreen permission is true.
 *   6. requireFeature → a role granted this leaf feature permission is admitted even
 *      without the appScreen grant, so the route matches the action that opens it.
 *   7. altFeature (+ altScreen) → OR-widens BOTH gates for a page shared by two
 *      surfaces: altScreen lets the plan gate pass on either screen, and altFeature
 *      lets the role gate pass on either grant (e.g. Customer Profile, reached from
 *      the Customers screen OR POS Billing → Customers). A role with neither is still
 *      blocked; plan bounds still apply.
 *
 * Denied requests are redirected to the user's configured landing page (from
 * roleLandingPages) or the built-in default. Loop prevention: if the landing page
 * equals the current path the fallback is /dashboard.
 *
 * DEV bypass removed intentionally — permissions must be testable in all
 * environments including UAT/staging. Use a real Firebase auth session to test.
 */
export default function ProtectedRoute({ children, requireAdmin = false, requireRole, appScreen, requireFeature, altFeature, altScreen, requireSuperAdmin = false }: ProtectedRouteProps) {
    const { currentUser, userRole, permissions, featurePermissions, loading, roleLandingPages, planEntitlements, subscriptionLoading, isSuperAdmin, isImpersonating } = useAuth();
    const location = useLocation();

    // Wait for both auth AND the subscription to resolve — denying a gated screen
    // before the plan is known would flash a wrongful redirect on every load.
    if (loading || (currentUser && subscriptionLoading)) {
        return (
            <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                Verifying access…
            </div>
        );
    }

    if (!currentUser) {
        return <Navigate to="/login" replace />;
    }

    // ─��� Super admin gate ──────────────────────────────────────────────────────
    // If the route requires the platform super admin identity, enforce it strictly.
    // The super admin bypasses all tenant-level role and plan checks — they have
    // no tenant and the page is fully standalone.
    if (requireSuperAdmin) {
        return isSuperAdmin ? <>{children}</> : <Navigate to="/login" replace />;
    }

    // The super admin should never access tenant routes — UNLESS they are actively
    // "viewing" a tenant (impersonation). While viewing, AuthContext overrides tenantId
    // and userRole ('admin') so the checks below admit them like a business admin. If
    // they are NOT viewing a tenant and hit a tenant route, send them back to their page.
    if (isSuperAdmin && !isImpersonating) {
        return <Navigate to="/super-admin" replace />;
    }

    // ── Tenant-level plan gate (Phase 2A) ─────────────────────────────────────
    // A tenant may only reach screens its subscription plan includes — this sits
    // ABOVE roles and constrains even the business admin (rule 1). It never grants
    // access the role matrix would deny; it only ever subtracts. Two axes:
    //   • screen  — plan.screens (the AppScreen for this route).
    //   • group   — plan.features, for modules that share a screen (Worklist vs
    //               Supplier Ledger, Analytics vs Reports) or have none (Team
    //               Performance). Blocks direct-URL / refresh for those too.
    const routeGroup = navFeatureGroupForPath(location.pathname);
    const planAllowsScreen =
        (isScreenAllowedByPlan(appScreen, planEntitlements) ||
            // Second surface (altScreen) — a shared page is plan-permitted when the
            // plan includes EITHER screen (e.g. Customer Profile via POS Billing).
            (altScreen != null && isScreenAllowedByPlan(altScreen, planEntitlements))) &&
        (!routeGroup || isFeatureGroupAllowed(routeGroup, planEntitlements));

    // 'admin' role is unrestricted at the ROLE layer — but still bound by the plan
    // (rule 1). Settings is always allowed, so it is a loop-free redirect target.
    if (userRole === 'admin') {
        if (!planAllowsScreen) return <Navigate to="/settings" replace />;
        return <>{children}</>;
    }

    // Compute the safe redirect for this user. Uses the admin-configured landing
    // page when available, then the built-in default, then /dashboard as last resort.
    const configured = (userRole && roleLandingPages?.[userRole]) || '';
    const builtIn = (userRole && DEFAULT_ROLE_LANDING[userRole]) || '/dashboard';
    const landingPage = configured || builtIn;
    // Prevent redirect loops: if we would redirect to the current path, fall back
    // to /dashboard; if that is also current (shouldn't happen), fall back to /login.
    const safeRedirect =
        location.pathname !== landingPage ? landingPage :
        location.pathname !== '/dashboard' ? '/dashboard' :
        '/login';

    // Legacy requireAdmin flag — non-admin roles are redirected.
    if (requireAdmin) {
        return <Navigate to={safeRedirect} replace />;
    }

    // ── Feature-level gate (mirrors useFeaturePermissions) ────────────────────
    // When a route names a required feature it IS the access gate — the same one
    // that shows/hides the in-page action that opens this route (e.g. Partners →
    // "Add New" → /onboarding, gated by worklist.partners.create). A role reaches
    // the route only when the plan permits the sub-section AND the role has it
    // granted, so the button and the route can never disagree. 'admin' already
    // bypassed above. The plan SCREEN gate (planAllowsScreen) still applies below.
    if (requireFeature) {
        const planPermitsFeature = isFeatureAllowedByPlan(requireFeature, planEntitlements);
        const rolePermitsFeature =
            userRole != null && featurePermissions?.[userRole]?.[requireFeature] === true;
        if (!planPermitsFeature || !rolePermitsFeature) {
            return <Navigate to={safeRedirect} replace />;
        }
    }

    // Alternative feature admittance (OR): a role that has this granular feature
    // (and the plan permits it) is admitted even without the appScreen role grant.
    // This keeps a shared detail page open to every surface that leads to it — e.g.
    // Customer Profile, reached from the Customers screen OR POS Billing → Customers.
    const altFeatureAllowed =
        altFeature != null &&
        userRole != null &&
        featurePermissions?.[userRole]?.[altFeature] === true &&
        isFeatureAllowedByPlan(altFeature, planEntitlements);

    // ── Module-level permission (single source of truth) ──────────────────────
    // Reads the live rolePermissions matrix from Firestore via AuthContext.
    // undefined → not configured for this role → denied (secure by default).
    // Role matrix grant AND the plan must include the screen (plan only subtracts).
    // A satisfied requireFeature stands in for the screen grant so a feature-gated
    // route never additionally requires the coarser screen toggle; altFeature adds
    // an OR path for pages reachable from a second, differently-gated surface.
    const screenAllowed =
        planAllowsScreen &&
        (!appScreen ||
            (userRole != null && permissions[userRole]?.[appScreen] === true) ||
            !!requireFeature ||
            altFeatureAllowed);

    // ── Role list check ───────────────────────────────────────────────────────
    // A custom role will not appear in requireRole (those lists name built-in
    // roles only). Admit any role whose appScreen permission is explicitly true
    // so custom roles work without modifying route definitions.
    const roleAllowed =
        !requireRole ||
        requireRole.length === 0 ||
        requireRole.includes(userRole as UserRole) ||
        screenAllowed; // custom role admitted via screen permission

    if (!roleAllowed || !screenAllowed) {
        return <Navigate to={safeRedirect} replace />;
    }

    return <>{children}</>;
}
