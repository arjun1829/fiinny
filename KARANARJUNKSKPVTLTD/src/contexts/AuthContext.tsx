import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot, collection } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { DEFAULT_FEATURE_PERMISSIONS, type FeaturePermissions } from '../utils/featurePermissions';
import {
    resolveEntitlements,
    isScreenAllowedByPlan,
    RESTRICTED_ENTITLEMENTS,
    type PlanEntitlements,
    type Plan,
    type TenantSubscription,
} from '../utils/subscriptionPlans';

// 'retailer' is a read-only portal for shops that buy FROM this tenant (see
// RETAILER_ALLOWED_PATHS in App.tsx). 'shopkeeper' is the opposite: a shop owner
// running their own tenant on the KrishiDukan basic plan.
export type BuiltInRole = 'admin' | 'analyst' | 'retailer' | 'shopkeeper' | 'manufacturer' | 'customer' | 'sales';
// Admins can define custom, tenant-scoped roles (see settings/customRoles). Their
// ids are arbitrary strings, so UserRole widens to accept any string while keeping
// autocomplete for the built-ins. 'admin' is never a custom/assignable-as-custom role.
export type UserRole = BuiltInRole | (string & {});

// A tenant-defined custom role. Permissions live in the existing
// settings/rolePermissions and settings/featurePermissions docs keyed by `id`.
export interface CustomRole {
    id: string;
    label: string;
    template?: BuiltInRole;
    createdAt?: any;
}

interface TenantData {
    businessName: string;
    logoUrl?: string;
    location?: string;
    purpose?: string;
    plan?: string;
    planStatus?: string;
    planExpiryAt?: any;
}

export type AppScreen =
    | 'dashboard'
    | 'b2c_dashboard'
    | 'retailers'
    | 'worklist'
    | 'khata'
    | 'dispatch'
    | 'pos'
    | 'inventory'
    | 'settings'
    | 'manage_retailers'
    | 'admin'
    | 'invoice_settings'
    | 'schema_builder'
    | 'invoice_templates'
    | 'manufacturers'
    | 'order_history'
    | 'online_orders'
    | 'online_dashboard'
    | 'manage_store'
    | 'analytics'
    | 'krishidukan'
    | 'loyalty'
    // ── Finance operations (HighRadius-style O2C + S2P) ──
    | 'accounts'
    | 'ar'
    | 'ap'
    | 'cash'
    | 'credit'
    | 'collections'
    | 'disputes'
    | 'promotions'
    | 'contracts'
    | 'finance_analytics'
    | 'expenses'
    | 'audit_log'
    | 'customers';

export type RolePermissions = Record<UserRole, Record<AppScreen, boolean>>;
export const defaultPermissions: RolePermissions = {
    admin: { dashboard: true, b2c_dashboard: true, online_dashboard: true, analytics: true, retailers: true, worklist: true, khata: true, dispatch: true, pos: true, inventory: true, online_orders: true, order_history: true, settings: true, admin: true, manufacturers: true, invoice_templates: true, invoice_settings: true, schema_builder: true, manage_retailers: true, manage_store: true, krishidukan: true, loyalty: true, accounts: true, ar: true, ap: true, cash: true, credit: true, collections: true, disputes: true, promotions: true, contracts: true, finance_analytics: true, expenses: true, audit_log: true, customers: true },
    analyst: { dashboard: true, b2c_dashboard: true, online_dashboard: true, analytics: true, retailers: true, worklist: true, khata: true, dispatch: true, pos: true, inventory: true, online_orders: false, order_history: true, settings: true, admin: false, manufacturers: false, invoice_templates: false, invoice_settings: false, schema_builder: false, manage_retailers: false, manage_store: false, krishidukan: false, loyalty: true, accounts: true, ar: true, ap: true, cash: true, credit: true, collections: true, disputes: true, promotions: true, contracts: true, finance_analytics: true, expenses: true, audit_log: false, customers: true },
    sales: { dashboard: false, b2c_dashboard: false, online_dashboard: false, analytics: false, retailers: false, worklist: true, khata: false, dispatch: false, pos: false, inventory: false, online_orders: false, order_history: false, settings: false, admin: false, manufacturers: false, invoice_templates: false, invoice_settings: false, schema_builder: false, manage_retailers: false, manage_store: false, krishidukan: false, loyalty: false, accounts: false, ar: false, ap: false, cash: false, credit: false, collections: false, disputes: false, promotions: false, contracts: false, finance_analytics: false, expenses: false, audit_log: false, customers: false },
    retailer: { dashboard: false, b2c_dashboard: false, online_dashboard: false, analytics: false, retailers: false, worklist: true, khata: false, dispatch: false, pos: false, inventory: false, online_orders: false, order_history: false, settings: true, admin: false, manufacturers: false, invoice_templates: false, invoice_settings: false, schema_builder: false, manage_retailers: false, manage_store: false, krishidukan: false, loyalty: false, accounts: false, ar: false, ap: false, cash: false, credit: false, collections: false, disputes: false, promotions: false, contracts: false, finance_analytics: false, expenses: false, audit_log: false, customers: false },
    // KrishiDukan basic plan. invoice_settings is on because GST billing without the
    // shop's own name and GSTIN on the invoice is not usable. The enterprise finance
    // suite (ar/ap/cash/credit/collections/…), schema builder and admin tools stay off.
    shopkeeper: { dashboard: false, b2c_dashboard: true, online_dashboard: true, analytics: true, retailers: false, worklist: true, khata: true, dispatch: false, pos: true, inventory: true, online_orders: true, order_history: true, settings: true, admin: false, manufacturers: false, invoice_templates: false, invoice_settings: true, schema_builder: false, manage_retailers: false, manage_store: false, krishidukan: true, loyalty: false, accounts: false, ar: false, ap: false, cash: false, credit: false, collections: false, disputes: false, promotions: false, contracts: false, finance_analytics: false, expenses: false, audit_log: false, customers: true },
    manufacturer: { dashboard: false, b2c_dashboard: false, online_dashboard: false, analytics: false, retailers: false, worklist: false, khata: false, dispatch: false, pos: false, inventory: false, online_orders: false, order_history: false, settings: true, admin: false, manufacturers: false, invoice_templates: false, invoice_settings: false, schema_builder: false, manage_retailers: false, manage_store: false, krishidukan: false, loyalty: false, accounts: false, ar: false, ap: false, cash: false, credit: false, collections: false, disputes: false, promotions: false, contracts: false, finance_analytics: false, expenses: false, audit_log: false, customers: false },
    customer: { dashboard: false, b2c_dashboard: false, online_dashboard: false, analytics: false, retailers: false, worklist: false, khata: false, dispatch: false, pos: false, inventory: false, online_orders: false, order_history: false, settings: true, admin: false, manufacturers: false, invoice_templates: false, invoice_settings: false, schema_builder: false, manage_retailers: false, manage_store: false, krishidukan: false, loyalty: false, accounts: false, ar: false, ap: false, cash: false, credit: false, collections: false, disputes: false, promotions: false, contracts: false, finance_analytics: false, expenses: false, audit_log: false, customers: false }
};

// sessionStorage keys for the Super Admin's active "view business" selection. Session-
// scoped so it survives a refresh but never leaks across browser sessions.
const VIEW_TENANT_KEY = 'superadmin.viewTenantId';
const VIEW_TENANT_NAME_KEY = 'superadmin.viewTenantName';

interface AuthContextType {
    currentUser: User | null;
    userRole: UserRole | null;
    tenantId: string | null;
    tenantData: TenantData | null;
    linkedId: string | null;
    userName: string | null;
    permissions: RolePermissions;
    featurePermissions: FeaturePermissions;
    customRoles: CustomRole[];
    // Per-role landing page after login (path), configurable by admins. Empty/missing
    // means "use the built-in default" (see App.tsx role-based redirect).
    roleLandingPages: Record<string, string>;
    loading: boolean;
    logout: () => Promise<void>;
    // District-based and retailer-based access for sales role
    assignedDistricts: string[];
    assignedRetailers: string[];
    // Module system
    enabledModules: string[];
    tenantPlan: string;
    modulesLoading: boolean;
    hasModule: (moduleId: string) => boolean;
    // ── Subscription plan layer (Phase 2A) ──
    // Tenant-level entitlements resolved from tenantSubscriptions/{id} + plans/{planId}.
    // A tenant with no valid subscription is RESTRICTED (empty screen set).
    planEntitlements: PlanEntitlements;
    hasPlanScreen: (screen: AppScreen) => boolean;
    // True until the tenant's subscription has been resolved after login.
    subscriptionLoading: boolean;
    // True only for the dedicated platform super admin (superadmin@fiinny.com).
    // This identity never belongs to any tenant and has no business UI.
    isSuperAdmin: boolean;
    // ── Super Admin "view business" (tenant impersonation) ──
    // When the Super Admin opens a tenant's dashboard from /super-admin, the values
    // above (tenantId, userRole, permissions, planEntitlements, …) are transparently
    // overridden to that tenant with full admin access. isImpersonating is true only
    // then. Regular users can never enter this mode (enterTenantView is a no-op for them).
    isImpersonating: boolean;
    impersonatedTenantId: string | null;
    enterTenantView: (tenantId: string, businessName?: string) => void;
    exitTenantView: () => void;
}

const AuthContext = createContext<AuthContextType>({
    currentUser: null,
    userRole: null,
    tenantId: null,
    tenantData: null,
    linkedId: null,
    userName: null,
    permissions: defaultPermissions,
    featurePermissions: DEFAULT_FEATURE_PERMISSIONS,
    customRoles: [],
    roleLandingPages: {},
    loading: true,
    logout: async () => { },
    assignedDistricts: [],
    assignedRetailers: [],
    enabledModules: [],
    tenantPlan: 'free',
    modulesLoading: true,
    hasModule: () => false,
    planEntitlements: RESTRICTED_ENTITLEMENTS,
    hasPlanScreen: () => false,
    subscriptionLoading: true,
    isSuperAdmin: false,
    isImpersonating: false,
    impersonatedTenantId: null,
    enterTenantView: () => { },
    exitTenantView: () => { },
});

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [userRole, setUserRole] = useState<UserRole | null>(null);
    const [tenantId, setTenantId] = useState<string | null>(null);
    const [tenantData, setTenantData] = useState<TenantData | null>(null);
    const [linkedId, setLinkedId] = useState<string | null>(null);
    const [userName, setUserName] = useState<string | null>(null);
    const [permissions, setPermissions] = useState<RolePermissions>(defaultPermissions);
    const [featurePermissions, setFeaturePermissions] = useState<FeaturePermissions>(DEFAULT_FEATURE_PERMISSIONS);
    const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
    const [roleLandingPages, setRoleLandingPages] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [assignedDistricts, setAssignedDistricts] = useState<string[]>([]);
    const [assignedRetailers, setAssignedRetailers] = useState<string[]>([]);
    const [enabledModules, setEnabledModules] = useState<string[]>([]);
    const [tenantPlan, setTenantPlan] = useState<string>('free');
    const [modulesLoading, setModulesLoading] = useState(true);
    const [planEntitlements, setPlanEntitlements] = useState<PlanEntitlements>(RESTRICTED_ENTITLEMENTS);
    const [subscriptionLoading, setSubscriptionLoading] = useState(true);
    const [isSuperAdmin, setIsSuperAdmin] = useState(false);
    // Super Admin "view business" selection (persisted for the browser session).
    const [impersonatedTenantId, setImpersonatedTenantId] = useState<string | null>(
        () => sessionStorage.getItem(VIEW_TENANT_KEY)
    );
    const [impersonatedTenantData, setImpersonatedTenantData] = useState<TenantData | null>(() => {
        const name = sessionStorage.getItem(VIEW_TENANT_NAME_KEY);
        return name ? { businessName: name } : null;
    });
    // The viewed tenant's OWN resolved entitlements while the Super Admin is viewing
    // its dashboard. Resolved from the exact same authoritative source as a business
    // admin (tenantSubscriptions/{id} → plans/{planId}), so the Super Admin sees the
    // business scoped precisely to its subscription. Fail-closed to RESTRICTED.
    const [impersonatedEntitlements, setImpersonatedEntitlements] = useState<PlanEntitlements>(RESTRICTED_ENTITLEMENTS);
    const [impersonatedSubscriptionLoading, setImpersonatedSubscriptionLoading] = useState(false);

    useEffect(() => {
        let unsubscribePerms: (() => void) | null = null;
        let unsubscribeModules: (() => void) | null = null;
        let unsubscribeSubscription: (() => void) | null = null;

        // The dedicated platform super admin never belongs to any tenant.
        // Checked before the master-admin list so it is never accidentally
        // folded into a tenant even if the Firestore doc has a stale tenantId.
        const SUPER_ADMIN_EMAIL = 'superadmin@fiinny.com';

        // Business owners / master tenant admins. Must NOT include the platform
        // super admin — it has its own identity path above.
        const MASTER_ADMIN_EMAILS = [
            'arjuntanpure@karanarjun.com',
            'arjutanpure@karanarjun.com',
            'arjun1829@karanarjun.com',
            'karanarjun@karanarjun.com',
            'arjutanpure@gmail.com',
        ];

        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    const userDocRef = doc(db, 'users', user.uid);
                    const userDoc = await getDoc(userDocRef);
                    const emailLC = user.email?.toLowerCase() || '';

                    // ── Platform Super Admin path ─────────────────────────────
                    // This identity has no tenant, no subscription, no nav.
                    if (emailLC === SUPER_ADMIN_EMAIL) {
                        setIsSuperAdmin(true);
                        setUserRole('admin');
                        setTenantId(null);
                        setTenantData(null);
                        setLinkedId(null);
                        setUserName(
                            userDoc.exists()
                                ? (userDoc.data().name || user.displayName || 'Super Admin')
                                : (user.displayName || 'Super Admin')
                        );
                        setAssignedDistricts([]);
                        setAssignedRetailers([]);
                        setPermissions(defaultPermissions);
                        setFeaturePermissions(DEFAULT_FEATURE_PERMISSIONS);
                        setCustomRoles([]);
                        setRoleLandingPages({});
                        setEnabledModules([]);
                        setTenantPlan('free');
                        setModulesLoading(false);
                        setPlanEntitlements(RESTRICTED_ENTITLEMENTS);
                        setSubscriptionLoading(false);
                        setCurrentUser(user);
                        setLoading(false);
                        return; // skip all tenant loading
                    }

                    // ── Regular / master-tenant user path ─────────────────────
                    setIsSuperAdmin(false);
                    const isMasterAdmin = MASTER_ADMIN_EMAILS.includes(emailLC);

                    let existingRole = userDoc.exists() ? (userDoc.data().role as UserRole) : null;
                    let existingTenantId = userDoc.exists() ? userDoc.data().tenantId : null;

                    let role: UserRole = isMasterAdmin ? 'admin' : (existingRole || 'analyst');
                    let tId = isMasterAdmin ? (existingTenantId && existingTenantId !== 'master' ? existingTenantId : 'master') : existingTenantId;
                    let lId: string | null = userDoc.exists() ? (userDoc.data().linkedId || null) : null;

                    // Avoid unnecessary writes for master admin if doc already exists
                    if (!userDoc.exists()) {
                        await setDoc(userDocRef, {
                            email: user.email,
                            name: user.displayName || user.email?.split('@')[0] || 'Member',
                            role: role,
                            tenantId: tId,
                            linkedId: lId,
                            updatedAt: serverTimestamp(),
                            createdAt: serverTimestamp()
                        }, { merge: true });
                    }

                    setUserRole(role);
                    setTenantId(tId);
                    setLinkedId(lId);
                    setAssignedDistricts(userDoc.exists() ? (userDoc.data().assignedDistricts || []) : []);
                    setAssignedRetailers(userDoc.exists() ? (userDoc.data().assignedRetailers || []) : []);

                    // Priority: Firestore name -> Auth displayName -> Email prefix
                    const resolvedName = userDoc.exists() 
                        ? (userDoc.data().name || user.displayName || user.email?.split('@')[0] || null)
                        : (user.displayName || user.email?.split('@')[0] || null);
                    
                    setUserName(resolvedName);

                    if (tId && tId !== 'master') {
                        const tenantDoc = await getDoc(doc(db, 'tenants', tId));
                        if (tenantDoc.exists()) {
                            setTenantData(tenantDoc.data() as TenantData);
                        }
                    } else if (tId === 'master') {
                        setTenantData({ businessName: 'KaranArjun' });
                    }

                    // Fetch or Initialize Role Permissions
                    if (tId) {
                        try {
                            const [getTenantDoc] = await Promise.all([
                                import('../utils/tenantPath').then(m => m.getTenantDoc)
                            ]);
                            const permDocRef = getTenantDoc(db, tId, 'settings', 'rolePermissions');

                            if (unsubscribePerms) unsubscribePerms();

                            unsubscribePerms = onSnapshot(permDocRef, async (permDoc) => {
                                if (permDoc.exists() && Object.keys(permDoc.data() || {}).length > 0) {
                                    const fetchedPerms = permDoc.data() as RolePermissions;
                                    const mergedPerms: any = { ...defaultPermissions };

                                    for (const [r, pObj] of Object.entries(fetchedPerms)) {
                                        mergedPerms[r] = {
                                            ...(defaultPermissions[r as UserRole] || {}),
                                            ...pObj
                                        };
                                    }
                                    setPermissions(mergedPerms as RolePermissions);
                                } else {
                                    await setDoc(permDocRef, defaultPermissions);
                                    // Snapshot will trigger again automatically after setDoc
                                }
                            }, (_err) => {
                                setPermissions(defaultPermissions);
                            });

                            // Feature-level permissions (granular action/section control)
                            const featPermDocRef = getTenantDoc(db, tId, 'settings', 'featurePermissions');
                            onSnapshot(featPermDocRef, async (snap) => {
                                if (snap.exists() && Object.keys(snap.data() || {}).length > 0) {
                                    const fetched = snap.data() as FeaturePermissions;
                                    const merged: FeaturePermissions = { ...DEFAULT_FEATURE_PERMISSIONS };
                                    for (const [r, pMap] of Object.entries(fetched)) {
                                        merged[r as UserRole] = {
                                            ...(DEFAULT_FEATURE_PERMISSIONS[r as UserRole] || {}),
                                            ...(pMap as Record<string, boolean>),
                                        };
                                    }
                                    setFeaturePermissions(merged);
                                } else {
                                    await setDoc(featPermDocRef, DEFAULT_FEATURE_PERMISSIONS);
                                }
                            }, (_err) => {
                                setFeaturePermissions(DEFAULT_FEATURE_PERMISSIONS);
                            });

                            // Tenant-defined custom roles (admin-created). Their granular
                            // + module permissions live in the featurePermissions /
                            // rolePermissions docs above, keyed by the custom role id.
                            const customRolesDocRef = getTenantDoc(db, tId, 'settings', 'customRoles');
                            onSnapshot(customRolesDocRef, (snap) => {
                                const list = (snap.exists() ? snap.data()?.roles : null);
                                setCustomRoles(Array.isArray(list) ? (list as CustomRole[]) : []);
                            }, (_err) => {
                                setCustomRoles([]);
                            });

                            // Per-role landing pages (admin-configurable).
                            const landingDocRef = getTenantDoc(db, tId, 'settings', 'roleLandingPages');
                            onSnapshot(landingDocRef, (snap) => {
                                const data = (snap.exists() ? snap.data() : null) || {};
                                const { updatedAt: _ua, ...map } = data as Record<string, any>;
                                setRoleLandingPages(map as Record<string, string>);
                            }, (_err) => {
                                setRoleLandingPages({});
                            });
                        } catch (permErr) {
                            console.error("Error fetching permissions", permErr);
                            setPermissions(defaultPermissions);
                        }

                        // Subscribe to tenant's purchased modules
                        try {
                            const tenantSnap = await getDoc(doc(db, 'tenants', tId));
                            setTenantPlan(tenantSnap.data()?.plan || 'free');

                            if (unsubscribeModules) unsubscribeModules();
                            const modulesColRef = collection(db, 'tenants', tId, 'modules');
                            unsubscribeModules = onSnapshot(modulesColRef, (snap) => {
                                const now = new Date();
                                const active = snap.docs
                                    .filter(d => {
                                        const data = d.data();
                                        if (!['active', 'cancelled_at_period_end'].includes(data.status)) return false;
                                        if (data.expiresAt && data.expiresAt.toDate() < now) return false;
                                        return true;
                                    })
                                    .map(d => d.id);
                                setEnabledModules(active);
                                setModulesLoading(false);
                            }, (_err) => {
                                // permission-denied on free/unauthenticated tenants — silent fallback
                                setModulesLoading(false);
                            });
                        } catch (modErr) {
                            console.error("Error fetching modules", modErr);
                            setModulesLoading(false);
                        }

                        // ── Subscription plan entitlements (Phase 2B) ──
                        // Every tenant — INCLUDING master — resolves its plan from
                        // tenantSubscriptions/{id} → plans/{planId}. No subscription →
                        // RESTRICTED (not unlimited). Fail CLOSED so a rules/offline
                        // hiccup can never silently grant unrestricted access.
                        try {
                            setSubscriptionLoading(true);
                            if (unsubscribeSubscription) unsubscribeSubscription();
                            const subRef = doc(db, 'tenantSubscriptions', tId);
                            unsubscribeSubscription = onSnapshot(subRef, async (subSnap) => {
                                if (!subSnap.exists()) {
                                    setPlanEntitlements(RESTRICTED_ENTITLEMENTS);
                                    setSubscriptionLoading(false);
                                    return;
                                }
                                const subscription = subSnap.data() as TenantSubscription;
                                let plan: Plan | null = null;
                                if (subscription.planId) {
                                    const planSnap = await getDoc(doc(db, 'plans', subscription.planId));
                                    if (planSnap.exists()) plan = planSnap.data() as Plan;
                                }
                                setPlanEntitlements(resolveEntitlements(subscription, plan));
                                setSubscriptionLoading(false);
                            }, () => {
                                setPlanEntitlements(RESTRICTED_ENTITLEMENTS);
                                setSubscriptionLoading(false);
                            });
                        } catch (subErr) {
                            console.error("Error fetching subscription", subErr);
                            setPlanEntitlements(RESTRICTED_ENTITLEMENTS);
                            setSubscriptionLoading(false);
                        }
                    } else {
                        if (unsubscribePerms) {
                            unsubscribePerms();
                            unsubscribePerms = null;
                        }
                        setModulesLoading(false);
                        // No tenant yet (e.g. mid-onboarding) — nothing to resolve.
                        setPlanEntitlements(RESTRICTED_ENTITLEMENTS);
                        setSubscriptionLoading(false);
                    }

                } catch (error) {
                    console.error("Error fetching user role:", error);

                    const emailLC = user.email?.toLowerCase() || '';
                    if (emailLC === SUPER_ADMIN_EMAIL) {
                        // Super admin fallback — still no tenant.
                        setIsSuperAdmin(true);
                        setUserRole('admin');
                        setTenantId(null);
                        setTenantData(null);
                    } else {
                        // Fallback to ensure business owners never get locked out.
                        setIsSuperAdmin(false);
                        const isMasterAdmin = emailLC.includes('arjuntanpure') || emailLC.includes('arjutanpure') || emailLC.includes('arjun1829') || emailLC.includes('karanarjun');
                        setUserRole(isMasterAdmin ? 'admin' : 'analyst');
                        if (isMasterAdmin) {
                            setTenantId('master');
                            setTenantData({ businessName: 'KaranArjun' });
                        } else {
                            setTenantId(null);
                            setTenantData(null);
                        }
                    }
                    setAssignedDistricts([]);
                    setAssignedRetailers([]);
                    setPermissions(defaultPermissions);
                    setModulesLoading(false);
                    setPlanEntitlements(RESTRICTED_ENTITLEMENTS);
                    setSubscriptionLoading(false);
                }
            } else {
                setIsSuperAdmin(false);
                setUserRole(null);
                setTenantId(null);
                setTenantData(null);
                setLinkedId(null);
                setAssignedDistricts([]);
                setAssignedRetailers([]);
                setPermissions(defaultPermissions);
                setFeaturePermissions(DEFAULT_FEATURE_PERMISSIONS);
                setCustomRoles([]);
                setRoleLandingPages({});
                setPlanEntitlements(RESTRICTED_ENTITLEMENTS);
                setSubscriptionLoading(false);
                if (unsubscribeSubscription) {
                    unsubscribeSubscription();
                    unsubscribeSubscription = null;
                }
            }
            setCurrentUser(user);
            setLoading(false);
        });

        return () => {
            unsubscribe();
            if (unsubscribePerms) unsubscribePerms();
            if (unsubscribeModules) unsubscribeModules();
            if (unsubscribeSubscription) unsubscribeSubscription();
        };
    }, []);

    // ── Super Admin "view business" (impersonation) ──────────────────────────
    // Only the platform Super Admin may enter a tenant's dashboard. Regular users
    // calling these functions is a no-op (guarded by isSuperAdmin here AND enforced
    // by Firestore rules, which only grant a master-tenant admin cross-tenant access).
    const enterTenantView = (viewTenantId: string, businessName?: string) => {
        if (!isSuperAdmin || !viewTenantId) return;
        sessionStorage.setItem(VIEW_TENANT_KEY, viewTenantId);
        if (businessName) sessionStorage.setItem(VIEW_TENANT_NAME_KEY, businessName);
        else sessionStorage.removeItem(VIEW_TENANT_NAME_KEY);
        setImpersonatedTenantId(viewTenantId);
        setImpersonatedTenantData(businessName ? { businessName } : null);
    };

    const exitTenantView = () => {
        sessionStorage.removeItem(VIEW_TENANT_KEY);
        sessionStorage.removeItem(VIEW_TENANT_NAME_KEY);
        setImpersonatedTenantId(null);
        setImpersonatedTenantData(null);
    };

    // Clear any stale view selection if the session is not (or no longer) a Super Admin.
    useEffect(() => {
        if (!loading && !isSuperAdmin && impersonatedTenantId) {
            exitTenantView();
        }
    }, [loading, isSuperAdmin, impersonatedTenantId]);

    // Load the viewed tenant's business name for the header (master uses its own name).
    useEffect(() => {
        if (!isSuperAdmin || !impersonatedTenantId) return;
        let cancelled = false;
        (async () => {
            try {
                if (impersonatedTenantId === 'master') {
                    if (!cancelled) setImpersonatedTenantData({ businessName: 'KaranArjun' });
                    return;
                }
                const snap = await getDoc(doc(db, 'tenants', impersonatedTenantId));
                if (!cancelled && snap.exists()) setImpersonatedTenantData(snap.data() as TenantData);
            } catch {
                // Keep the name we already have (from sessionStorage / the click).
            }
        })();
        return () => { cancelled = true; };
    }, [isSuperAdmin, impersonatedTenantId]);

    // Load the viewed tenant's OWN subscription entitlements so the Super Admin's
    // dashboard is scoped exactly like that business's Business Admin. Reuses the
    // identical resolver as the normal per-tenant loader above — no second
    // subscription system. Fail CLOSED (RESTRICTED) on missing sub / rules / error,
    // matching how a real tenant with no subscription is treated.
    useEffect(() => {
        if (!isSuperAdmin || !impersonatedTenantId) {
            setImpersonatedEntitlements(RESTRICTED_ENTITLEMENTS);
            setImpersonatedSubscriptionLoading(false);
            return;
        }
        setImpersonatedSubscriptionLoading(true);
        const subRef = doc(db, 'tenantSubscriptions', impersonatedTenantId);
        const unsub = onSnapshot(subRef, async (subSnap) => {
            if (!subSnap.exists()) {
                setImpersonatedEntitlements(RESTRICTED_ENTITLEMENTS);
                setImpersonatedSubscriptionLoading(false);
                return;
            }
            const subscription = subSnap.data() as TenantSubscription;
            let plan: Plan | null = null;
            if (subscription.planId) {
                const planSnap = await getDoc(doc(db, 'plans', subscription.planId));
                if (planSnap.exists()) plan = planSnap.data() as Plan;
            }
            setImpersonatedEntitlements(resolveEntitlements(subscription, plan));
            setImpersonatedSubscriptionLoading(false);
        }, () => {
            setImpersonatedEntitlements(RESTRICTED_ENTITLEMENTS);
            setImpersonatedSubscriptionLoading(false);
        });
        return () => unsub();
    }, [isSuperAdmin, impersonatedTenantId]);

    const logout = () => {
        // Never carry a Super Admin's tenant view across a logout.
        exitTenantView();
        return signOut(auth);
    };

    const isImpersonating = isSuperAdmin && !!impersonatedTenantId;

    const hasModule = (moduleId: string): boolean => enabledModules.includes(moduleId);
    // While impersonating, entitlements come from the VIEWED tenant's own subscription
    // so the Super Admin's dashboard is scoped exactly like that business's admin.
    const effectiveEntitlements = isImpersonating ? impersonatedEntitlements : planEntitlements;
    const hasPlanScreen = (screen: AppScreen): boolean => isScreenAllowedByPlan(screen, effectiveEntitlements);

    // When the Super Admin is viewing a tenant, transparently override the tenant-scoped
    // values so every page/route/nav item resolves against the selected tenant with full
    // admin access — without any per-page changes. The tenant's own users/roles/subscription
    // are untouched; this is a client-side view only (Firestore rules gate the real access).
    const value = {
        currentUser,
        userRole: isImpersonating ? 'admin' as UserRole : userRole,
        tenantId: isImpersonating ? impersonatedTenantId : tenantId,
        tenantData: isImpersonating ? (impersonatedTenantData || { businessName: impersonatedTenantId || 'Business' }) : tenantData,
        linkedId: isImpersonating ? null : linkedId,
        userName,
        permissions: isImpersonating ? defaultPermissions : permissions,
        featurePermissions: isImpersonating ? DEFAULT_FEATURE_PERMISSIONS : featurePermissions,
        customRoles: isImpersonating ? [] : customRoles,
        roleLandingPages: isImpersonating ? {} : roleLandingPages,
        loading,
        logout,
        assignedDistricts: isImpersonating ? [] : assignedDistricts,
        assignedRetailers: isImpersonating ? [] : assignedRetailers,
        enabledModules,
        tenantPlan,
        modulesLoading: isImpersonating ? false : modulesLoading,
        hasModule,
        planEntitlements: effectiveEntitlements,
        hasPlanScreen,
        subscriptionLoading: isImpersonating ? impersonatedSubscriptionLoading : subscriptionLoading,
        isSuperAdmin,
        isImpersonating,
        impersonatedTenantId,
        enterTenantView,
        exitTenantView,
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
}
