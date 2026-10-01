import { useAuth } from '../contexts/AuthContext';
import { isFeatureAllowedByPlan } from '../utils/subscriptionPlans';

/**
 * Returns a checker function for granular feature-level permissions.
 * Usage: const can = useFeaturePermissions(); then can('worklist.partners.view')
 *
 * Layering:
 *   1. Subscription boundary — if the tenant's plan excludes the sub-section the
 *      feature is denied for EVERY role including admin (rule 1). Inert unless the
 *      Super Admin restricted sub-sections for the plan.
 *   2. Admin role bypasses the role-level feature matrix (within the plan).
 *   3. Otherwise the role's configured feature permission applies.
 * Defaults to false for unknown roles or unconfigured permission IDs.
 */
export function useFeaturePermissions(): (permId: string) => boolean {
    const { userRole, featurePermissions, planEntitlements } = useAuth();

    return (permId: string): boolean => {
        if (!userRole) return false;
        // Subscription boundary — applies before the admin bypass.
        if (!isFeatureAllowedByPlan(permId, planEntitlements)) return false;
        if (userRole === 'admin') return true;
        return featurePermissions?.[userRole]?.[permId] ?? false;
    };
}
