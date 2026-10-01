/**
 * Central route & sub-route permission registry.
 *
 * Every entry maps a navigable destination (route path or path#hash) to the
 * permission(s) that gate it.  This file is the single source of truth for
 * answering "what does a user need to open X?" — ProtectedRoute and
 * useHashTab (with isAllowed) enforce it at runtime.
 *
 * Columns:
 *   path        — URL path (React Router format) or path#hash for hash-tabs.
 *   appScreen   — Module-level key from RolePermissions (rolePermissions doc).
 *                 undefined = no module-level gate (public or auth-only).
 *   featurePerm — Leaf feature-permission key from FeaturePermissions
 *                 (featurePermissions doc). undefined = no feature-level gate.
 *   requireRole — Hardcoded role list from App.tsx ProtectedRoute.
 *                 undefined = any authenticated user.
 *   notes       — Human-readable explanation of any exceptions.
 */

export interface RoutePermission {
    path: string;
    appScreen?: string;
    featurePerm?: string;
    requireRole?: string[];
    notes?: string;
}

// ─── Public routes ─────────────────────────────────────────────────────────────
// No authentication required.

export const PUBLIC_ROUTES: RoutePermission[] = [
    { path: '/',                                notes: 'Marketing landing page' },
    { path: '/login',                           notes: 'Auth entry' },
    { path: '/about' },
    { path: '/privacy' },
    { path: '/terms' },
    { path: '/blog' },
    { path: '/changelog' },
    { path: '/download' },
    { path: '/store',                           notes: 'Public storefront' },
    { path: '/auth/handoff',                    notes: 'KrishiDukan mid-render sign-in handoff' },
    { path: '/pay/:token',                      notes: 'Razorpay payment landing — public link' },
    { path: '/receipt/:tenantId/:receiptId',    notes: 'Digital receipt — public link' },
    { path: '/feedback-submit',                 notes: 'Customer feedback form — public link' },
    { path: '/v-checkout/:tenantId/:token',     notes: 'Virtual checkout — public link' },
];

// ─── Auth-only routes (no specific role/screen gate) ──────────────────────────
// Any authenticated, tenanted user may open these.

export const AUTH_ONLY_ROUTES: RoutePermission[] = [
    { path: '/client-onboarding', notes: 'Tenant setup wizard — blocks until tenantId resolves' },
    { path: '/help',              notes: 'Help center — visible to all authenticated users' },
    { path: '/help/:articleId',   notes: 'Help article' },
    { path: '/settings',          appScreen: 'settings', notes: 'All roles have settings:true by default' },
];

// ─── Protected routes ──────────────────────────────────────────────────────────
// Enforced by ProtectedRoute in App.tsx via requireRole + appScreen.

export const PROTECTED_ROUTES: RoutePermission[] = [
    // Portals — role-confined users
    { path: '/retailer-portal',      requireRole: ['retailer'] },
    { path: '/manufacturer-portal',  requireRole: ['manufacturer'] },

    // Dashboards & analytics
    { path: '/dashboard',            appScreen: 'dashboard',        requireRole: ['admin', 'analyst'] },
    { path: '/b2c-dashboard',        appScreen: 'b2c_dashboard',    requireRole: ['admin', 'analyst', 'shopkeeper'] },
    { path: '/online-dashboard',     appScreen: 'online_dashboard', requireRole: ['admin', 'analyst', 'shopkeeper'] },
    { path: '/analytics',            appScreen: 'analytics',        requireRole: ['admin', 'analyst', 'shopkeeper'] },
    { path: '/reports',              appScreen: 'analytics',        requireRole: ['admin', 'analyst', 'shopkeeper'] },
    { path: '/gst-reports',          appScreen: 'analytics',        requireRole: ['admin', 'analyst', 'shopkeeper'] },
    { path: '/financial-reports',    appScreen: 'analytics',        requireRole: ['admin', 'analyst', 'shopkeeper'] },
    { path: '/pricing',              appScreen: 'analytics',        requireRole: ['admin', 'analyst', 'shopkeeper'] },
    { path: '/modules',              appScreen: 'analytics',        requireRole: ['admin', 'analyst', 'shopkeeper'] },
    { path: '/ai-advisor',           appScreen: 'analytics',        requireRole: ['admin', 'analyst'] },
    { path: '/team-performance',                                     requireRole: ['admin', 'analyst'], notes: 'No appScreen — governed by requireRole only; no per-role permission toggle' },

    // Worklist family
    { path: '/worklist',             appScreen: 'worklist',         requireRole: ['admin', 'analyst', 'sales', 'retailer', 'shopkeeper'] },
    { path: '/worklist/:id',         appScreen: 'worklist',         requireRole: ['admin', 'analyst', 'sales', 'retailer', 'shopkeeper'] },
    { path: '/b2b-invoice',          appScreen: 'worklist',         requireRole: ['admin', 'analyst', 'shopkeeper'] },
    { path: '/quotations',           appScreen: 'worklist',         requireRole: ['admin', 'analyst'] },
    { path: '/payment-reminders',    appScreen: 'worklist',         requireRole: ['admin', 'analyst', 'shopkeeper'] },
    { path: '/delivery-challans',    appScreen: 'worklist',         requireRole: ['admin', 'analyst'] },
    { path: '/payment-links',        appScreen: 'worklist',         requireRole: ['admin', 'analyst', 'shopkeeper'] },
    { path: '/sales-order/new',      appScreen: 'worklist',         requireRole: ['admin', 'analyst'] },
    { path: '/sales-order/:id',      appScreen: 'worklist',         requireRole: ['admin', 'analyst'] },
    { path: '/sales-targets',        appScreen: 'worklist',         requireRole: ['admin', 'sales'] },
    { path: '/supplier-ledger',      appScreen: 'worklist',         requireRole: ['admin', 'analyst', 'shopkeeper'] },
    { path: '/supplier-ledger/:id',  appScreen: 'worklist',         requireRole: ['admin', 'analyst', 'shopkeeper'] },
    { path: '/supplier-invoice',     appScreen: 'worklist',         requireRole: ['admin', 'analyst', 'shopkeeper'] },
    { path: '/careoff-sync',         appScreen: 'accounts',         requireRole: ['admin', 'analyst'] },
    { path: '/dispatch',             appScreen: 'dispatch',         requireRole: ['admin', 'analyst'] },

    // POS & related
    { path: '/pos',                  appScreen: 'pos',              requireRole: ['admin', 'analyst', 'shopkeeper'] },
    { path: '/digital-khata',        appScreen: 'khata',            requireRole: ['admin', 'analyst', 'shopkeeper'] },
    { path: '/order-history',        appScreen: 'order_history',    requireRole: ['admin', 'analyst', 'shopkeeper'] },
    { path: '/online-orders',        appScreen: 'online_orders',    requireRole: ['admin', 'analyst', 'shopkeeper'] },
    { path: '/loyalty',              appScreen: 'loyalty',          requireRole: ['admin', 'analyst'], notes: 'Also gated by ModuleGate (loyalty subscription)' },

    // Inventory family
    { path: '/inventory',            appScreen: 'inventory',        requireRole: ['admin', 'analyst', 'shopkeeper'] },
    { path: '/rates',                appScreen: 'inventory',        requireRole: ['admin', 'analyst', 'shopkeeper'] },
    { path: '/inventory-batches',    appScreen: 'inventory',        requireRole: ['admin', 'analyst', 'shopkeeper'] },
    { path: '/warehouses',           appScreen: 'inventory',        requireRole: ['admin', 'analyst'] },
    { path: '/barcode',              appScreen: 'inventory',        requireRole: ['admin', 'analyst', 'shopkeeper'] },
    { path: '/manage-transport',     appScreen: 'inventory',        requireRole: ['admin', 'analyst'] },

    // Customers
    { path: '/customers',            appScreen: 'customers',        featurePerm: 'posBilling.customers.view', requireRole: ['admin', 'analyst', 'shopkeeper'], notes: 'altScreen=pos + altFeature=posBilling.customers.view: plan-permitted via the customers OR pos screen; role-admitted via the customers screen OR POS Billing → Customers.' },
    { path: '/customers/:id',        appScreen: 'customers',        featurePerm: 'posBilling.customers.view', requireRole: ['admin', 'analyst', 'shopkeeper'], notes: 'Customer Profile — same altScreen=pos / altFeature=posBilling.customers.view OR, so the POS Customers surface can open it (plan + role).' },

    // Onboarding / retailers
    { path: '/onboarding',           appScreen: 'worklist',         featurePerm: 'worklist.partners.create', requireRole: ['admin', 'analyst'], notes: 'Worklist → Partners "Add New" flow. Plan-gated on the worklist screen (every plan) and access-gated by worklist.partners.create, NOT the distributor-only retailers screen.' },

    // Finance
    { path: '/expenses',             appScreen: 'expenses',         requireRole: ['admin', 'analyst'] },

    // Admin
    { path: '/admin',                appScreen: 'admin',            requireRole: ['admin', 'analyst'] },
    { path: '/super-admin',                                         requireRole: ['admin'], notes: 'Platform Super Admin subscription mgmt. NO appScreen (never plan-gated); page hard-guards to master-tenant admin.' },
    { path: '/administration',       appScreen: 'admin',            requireRole: ['admin'] },
    { path: '/krishidukan',          appScreen: 'krishidukan',      requireRole: ['admin', 'shopkeeper'] },
];

// ─── Hash-tab sub-routes ───────────────────────────────────────────────────────
// Enforced by useHashTab(isAllowed) inside each page component.
// appScreen = parent route's module gate (already checked by ProtectedRoute).
// featurePerm = the leaf feature permission that controls the specific tab.

export const HASH_TAB_PERMISSIONS: RoutePermission[] = [
    // /reports#<tab>  (ReportsPage)
    { path: '/reports#stock',             appScreen: 'analytics', featurePerm: 'reports.stock.view' },
    { path: '/reports#sales',             appScreen: 'analytics', featurePerm: 'reports.sales.view' },
    { path: '/reports#financial',         appScreen: 'analytics', featurePerm: 'reports.financial.view' },
    { path: '/reports#gst',               appScreen: 'analytics', featurePerm: 'reports.gst.view' },

    // /pos#<tab>  (POSPage)
    { path: '/pos#billing',               appScreen: 'pos', featurePerm: 'posBilling.billing.view' },
    { path: '/pos#khata',                 appScreen: 'pos', featurePerm: 'posBilling.khata.view' },
    { path: '/pos#customers',             appScreen: 'pos', featurePerm: 'posBilling.customers.view' },
    { path: '/pos#order-history',         appScreen: 'pos', featurePerm: 'posBilling.orderHistory.view' },

    // /worklist#<tab>  (WorklistPage)
    { path: '/worklist#partners',         appScreen: 'worklist', featurePerm: 'worklist.partners.view' },
    { path: '/worklist#invoices',         appScreen: 'worklist', featurePerm: 'worklist.invoices.view' },
    { path: '/worklist#payments',         appScreen: 'worklist', featurePerm: 'worklist.payments.view' },
    { path: '/worklist#reminders',        appScreen: 'worklist', featurePerm: 'worklist.reminders.view' },
    { path: '/worklist#tracking',         appScreen: 'worklist', featurePerm: 'worklist.tracking.view' },
    { path: '/worklist#online-orders',    appScreen: 'worklist', featurePerm: 'worklist.onlineOrders.view' },

    // /inventory#<tab>  (InventoryPage)
    { path: '/inventory#products',        appScreen: 'inventory', featurePerm: 'inventory.productMaster.view' },
    { path: '/inventory#batches',         appScreen: 'inventory', featurePerm: 'inventory.registers.view' },
    { path: '/inventory#stock-movement',  appScreen: 'inventory', featurePerm: 'inventory.stockMovements.view' },
    { path: '/inventory#transport',       appScreen: 'inventory', featurePerm: 'inventory.transfer.view' },

    // /supplier-ledger#<tab>  (SupplierLedgerPage)
    { path: '/supplier-ledger#suppliers', appScreen: 'worklist', featurePerm: 'supplierLedger.suppliers.view' },
    { path: '/supplier-ledger#payments',  appScreen: 'worklist', featurePerm: 'supplierLedger.payments.view' },
    { path: '/supplier-ledger#reminders', appScreen: 'worklist', featurePerm: 'supplierLedger.reminders.view' },
    { path: '/supplier-ledger#reports',   appScreen: 'worklist', featurePerm: 'supplierLedger.reports.view' },

    // /admin#<tab>  (AdminHubPage) — gated by requireRole + appScreen, NOT featurePermissions
    { path: '/admin#manage-users',      appScreen: 'admin',            requireRole: ['admin'],            notes: 'Role-matrix gate; no feature-level toggle' },
    { path: '/admin#audit-log',         appScreen: 'audit_log',        requireRole: ['admin'],            notes: 'Role-matrix gate' },
    { path: '/admin#team-performance',  appScreen: 'admin',            requireRole: ['admin'],            notes: 'Role-matrix gate' },
    { path: '/admin#sales-target',      appScreen: 'admin',            requireRole: ['admin'],            notes: 'Role-matrix gate' },
    { path: '/admin#data-security',     appScreen: 'admin',            requireRole: ['admin'],            notes: 'Role-matrix gate' },
    { path: '/admin#role-matrix',       appScreen: 'admin',            requireRole: ['admin'],            notes: 'Role-matrix gate' },
    { path: '/admin#feature-permissions', appScreen: 'admin',          requireRole: ['admin'],            notes: 'Role-matrix gate' },
    { path: '/admin#manage-retailers',  appScreen: 'manage_retailers', requireRole: ['admin', 'analyst'], notes: 'Role-matrix gate' },
    { path: '/admin#invoice-branding',  appScreen: 'invoice_settings', requireRole: ['admin', 'analyst'], notes: 'Role-matrix gate' },
    { path: '/admin#manage-store',      appScreen: 'manage_store',     requireRole: ['admin', 'analyst'], notes: 'Role-matrix gate' },
    { path: '/admin#manufacturers',     appScreen: 'manufacturers',    requireRole: ['admin', 'analyst'], notes: 'Role-matrix gate' },
    { path: '/admin#invoice-templates', appScreen: 'invoice_templates',requireRole: ['admin', 'analyst'], notes: 'Role-matrix gate' },
    { path: '/admin#schema-builder',    appScreen: 'schema_builder',   requireRole: ['admin', 'analyst'], notes: 'Role-matrix gate' },
];

// ─── Unmapped / intentionally open routes ─────────────────────────────────────
// These have no specific permission beyond authenticated access or role confinement.
// Documented here for visibility, not as a gap — see notes for rationale.

export const UNMAPPED_ROUTES: RoutePermission[] = [
    {
        path: '/team-performance',
        requireRole: ['admin', 'analyst'],
        notes: 'No AppScreen key defined in AuthContext for team-performance. Governed solely by requireRole. A dedicated screen key could be added if per-role toggling is needed.',
    },
    {
        path: '/admin/manage-roles → /admin#role-matrix',
        notes: 'Legacy redirect — no permission needed beyond the destination hash gate.',
    },
];
