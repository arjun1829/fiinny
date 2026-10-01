import { useState, useEffect, lazy, Suspense, startTransition } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { Home, Users, UserPlus, LogOut, ReceiptText, ShieldAlert, Calculator, Settings, Package, ChevronDown, Layers, Truck, ShoppingCart, BarChart3, Activity, Bell, ClipboardList, Star, Link2, Bot, Loader2, Menu, X, Target, Sun, Moon, Receipt, HelpCircle, LifeBuoy, ArrowLeft, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './components/LanguageSwitcher';
import EnvBadge from './components/EnvBadge';
import OfflineBanner from './components/OfflineBanner';
import CookieBanner from './components/CookieBanner';
import ErrorBoundary from './components/ErrorBoundary';
import ModuleGate from './components/ModuleGate';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import type { AppScreen } from './contexts/AuthContext';
import { navFeatureGroupForPath, isFeatureGroupAllowed } from './utils/subscriptionCatalog';
import { SchemaProvider } from './contexts/SchemaContext';
import { ToastProvider } from './contexts/ToastContext';
import ToastContainer from './components/ToastContainer';

// ✅ Code splitting — each page is a separate JS chunk loaded on demand
// Reduces initial bundle from 2.4MB → ~400KB
const OnboardingPage         = lazy(() => import('./pages/OnboardingPage'));
const WorklistPage           = lazy(() => import('./pages/WorklistPage'));
const WorklistDetailsPage    = lazy(() => import('./pages/WorklistDetailsPage'));
const DashboardPage          = lazy(() => import('./pages/DashboardPage'));
const B2CDashboardPage       = lazy(() => import('./pages/B2CDashboardPage'));
const LoginPage              = lazy(() => import('./pages/LoginPage'));
const AdminHubPage           = lazy(() => import('./pages/AdminHubPage'));
const SuperAdminSubscriptionsPage = lazy(() => import('./pages/SuperAdminSubscriptionsPage'));
const TeamPerformancePage    = lazy(() => import('./pages/TeamPerformancePage'));
const StorefrontPage         = lazy(() => import('./pages/StorefrontPage'));
const ErpHandoffPage         = lazy(() => import('./pages/ErpHandoffPage'));
const RateSheetPage          = lazy(() => import('./pages/RateSheetPage'));
const POSPage                = lazy(() => import('./pages/POSPage'));
const SettingsPage           = lazy(() => import('./pages/SettingsPage'));
const SalesOrderPage         = lazy(() => import('./pages/SalesOrderPage'));
const DispatchBoardPage      = lazy(() => import('./pages/DispatchBoardPage'));
const RetailerPortalPage     = lazy(() => import('./pages/RetailerPortalPage'));
const ManufacturerPortalPage = lazy(() => import('./pages/ManufacturerPortalPage'));
const LandingPage            = lazy(() => import('./pages/LandingPage'));
const AboutPage              = lazy(() => import('./pages/AboutPage'));
const PrivacyPage            = lazy(() => import('./pages/PrivacyPage'));
const TermsPage              = lazy(() => import('./pages/TermsPage'));
const BlogPage               = lazy(() => import('./pages/BlogPage'));
const ChangelogPage          = lazy(() => import('./pages/ChangelogPage'));
const DownloadPage           = lazy(() => import('./pages/DownloadPage'));
const CareersPage            = lazy(() => import('./pages/CareersPage'));
const ContactPage            = lazy(() => import('./pages/ContactPage'));
const ClientOnboardingPage   = lazy(() => import('./pages/ClientOnboardingPage'));
const OnlineOrdersPage       = lazy(() => import('./pages/OnlineOrdersPage'));
const OnlineDashboardPage    = lazy(() => import('./pages/OnlineDashboardPage').then(m => ({ default: m.OnlineDashboardPage })));
const AnalyticsPage          = lazy(() => import('./pages/AnalyticsPage').then(m => ({ default: m.AnalyticsPage })));
const OrderHistoryPage       = lazy(() => import('./pages/OrderHistoryPage'));
const B2BInvoicePage         = lazy(() => import('./pages/B2BInvoicePage'));
const GSTReportsPage         = lazy(() => import('./pages/GSTReportsPage'));
const QuotationsPage         = lazy(() => import('./pages/QuotationsPage'));
const PaymentRemindersPage   = lazy(() => import('./pages/PaymentRemindersPage'));
// TEMPORARILY DISABLED (2026-07-03): Worklist Purchase Orders is incomplete/broken — hidden
// until rebuilt. Do not delete. See matching route/nav comments below.
// const PurchaseOrdersPage     = lazy(() => import('./pages/PurchaseOrdersPage'));
const DeliveryChallansPage   = lazy(() => import('./pages/DeliveryChallansPage'));
const FinancialReportsPage   = lazy(() => import('./pages/FinancialReportsPage'));
const WarehousePage          = lazy(() => import('./pages/WarehousePage'));
const InventoryBatchPage     = lazy(() => import('./pages/InventoryBatchPage'));
const BarcodePage            = lazy(() => import('./pages/BarcodePage'));
const InventoryPage          = lazy(() => import('./pages/InventoryPage'));
const ReportsPage            = lazy(() => import('./pages/ReportsPage'));
const ManageTransportPage    = lazy(() => import('./pages/ManageTransportPage'));
const AdministrationPage     = lazy(() => import('./pages/AdministrationPage'));
const CustomersPage          = lazy(() => import('./pages/CustomersPage'));
const CustomerProfilePage    = lazy(() => import('./pages/CustomerProfilePage'));
const PricingPage            = lazy(() => import('./pages/PricingPage'));
const PaymentLinkPage        = lazy(() => import('./pages/PaymentLinkPage'));
const PaymentLandingPage     = lazy(() => import('./pages/PaymentLandingPage'));
const AIAdvisorPage          = lazy(() => import('./pages/AIAdvisorPage'));
const DigitalReceiptPage     = lazy(() => import('./pages/DigitalReceiptPage'));
const DigitalKhataPage       = lazy(() => import('./pages/DigitalKhataPage'));
const ModuleMarketplacePage  = lazy(() => import('./pages/ModuleMarketplacePage'));
// B2C Sales Return (Credit Note) — Iteration 1.
const ReturnsPage            = lazy(() => import('./pages/ReturnsPage'));
// B2C Sales Returns — read-only history/viewing of returned orders.
const SalesReturnsPage       = lazy(() => import('./pages/SalesReturnsPage'));
const LoyaltyPage            = lazy(() => import('./pages/LoyaltyPage'));
// TEMPORARILY DISABLED (2026-07-06)
// Customer Feedback module is under redevelopment.
// Keep this code for future reactivation.
// const CustomerFeedbackPage   = lazy(() => import('./pages/CustomerFeedbackPage'));
const CustomerFeedbackSubmitPage = lazy(() => import('./pages/CustomerFeedbackSubmitPage'));
const VCheckoutPage          = lazy(() => import('./pages/VCheckoutPage'));
const KrishiDukanPage        = lazy(() => import('./pages/KrishiDukanPage'));
const SupplierLedgerPage     = lazy(() => import('./pages/SupplierLedgerPage'));
const SupplierLedgerDetailPage = lazy(() => import('./pages/SupplierLedgerDetailPage'));
const CareOffReconcilePage    = lazy(() => import('./pages/CareOffReconcilePage'));
const SupplierInvoicePage     = lazy(() => import('./pages/SupplierInvoicePage'));
const SalesTargetsPage        = lazy(() => import('./pages/SalesTargetsPage'));
const ExpensePage             = lazy(() => import('./pages/ExpensePage'));
const NotFoundPage            = lazy(() => import('./pages/NotFoundPage'));
const HelpCenterPage          = lazy(() => import('./pages/HelpCenterPage'));
const HelpArticlePage         = lazy(() => import('./pages/HelpArticlePage'));
const SupportTicketsPage      = lazy(() => import('./pages/SupportTicketsPage'));

// Full-page spinner shown while a lazy chunk is loading
function PageLoader() {
  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Loader2 size={36} className="animate-spin" style={{ color: 'var(--primary-light)' }} />
    </div>
  );
}

import ProtectedRoute from './components/ProtectedRoute';
import HorizontalNavbar from './components/HorizontalNavbar';
import { useFeaturePermissions } from './hooks/useFeaturePermissions';

// Drawer nav paths that are governed by the Main Navbar Feature Matrix
// (Super Admin → Feature Permissions → Main Navbar). This mirrors NAV_PERM in
// HorizontalNavbar so the drawer and the top nav follow the same single source of
// truth. Any path NOT listed here has no matrix toggle and stays governed solely
// by module-level role permissions.
const DRAWER_NAV_PERM: Record<string, string> = {
  '/reports':         'navbar.reports.view',
  '/dashboard':       'navbar.dashboard.view',
  '/b2c-dashboard':   'navbar.b2cDashboard.view',
  '/analytics':       'navbar.analytics.view',
  '/worklist':        'navbar.worklist.view',
  '/pos':             'navbar.pos.view',
  '/supplier-ledger': 'navbar.supplierLedger.view',
  '/expenses':        'navbar.expenses.view',
  '/barcode':         'navbar.barcode.view',
  '/rates':           'navbar.inventory.view',
};

function Layout({ children, currentTheme, toggleTheme }: { children: React.ReactNode; currentTheme: 'light' | 'dark'; toggleTheme: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { currentUser, userRole, tenantData, tenantId, permissions, logout, hasPlanScreen, planEntitlements, subscriptionLoading, isSuperAdmin, isImpersonating, exitTenantView } = useAuth();
  const can = useFeaturePermissions();

  const handleLogout = () => {
    logout().then(() => navigate('/login', { replace: true }));
  };

  // Super Admin exits a tenant view and returns directly to the Businesses section.
  // Clearing impersonation and the navigation are committed in a single transition so
  // React never renders the intermediate "on a tenant route but no longer impersonating"
  // state — that state trips ProtectedRoute's super-admin guard, which would redirect to
  // /super-admin (no hash) and strip the #businesses target.
  const handleExitTenantView = () => {
    startTransition(() => {
      exitTenantView();
      navigate('/super-admin#businesses', { replace: true });
    });
  };
  const [adminExpanded, setAdminExpanded] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const publicPaths = ['/', '/login', '/about', '/privacy', '/terms', '/blog', '/changelog', '/download', '/careers', '/contact'];
  if (publicPaths.includes(location.pathname)) return <>{children}</>;

  // Fully standalone public pages — no nav, no sidebar
  const standalonePathPrefixes = ['/feedback-submit', '/v-checkout/', '/pay/', '/receipt/'];
  if (standalonePathPrefixes.some(p => location.pathname.startsWith(p))) return <>{children}</>;

  // Pricing is authenticated-only. A logged-out visitor who deep-links (or clicks a
  // landing-page link) to /pricing is redirected to the Login page by ProtectedRoute
  // on the route itself (see the route definition), the same guard every other ERP
  // route uses. Authenticated users fall through to the normal shells below (the
  // subscription gate for unsubscribed tenants, or the full ERP layout), keeping the
  // in-app upgrade flow unchanged.

  // Platform super admin — fully standalone layout, no tenant nav or business data.
  if (location.pathname.startsWith('/super-admin') && isSuperAdmin) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--surface-base)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--surface-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-raised)' }}>
          <h2 className="primary-gradient-text" style={{ fontSize: '1.2rem', margin: 0 }}>
            Fiinny Platform Admin
          </h2>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {currentUser && (
              <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'transparent', border: '1px solid var(--surface-border)', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-secondary)', font: 'inherit', fontSize: '0.875rem' }}>
                <LogOut size={16} /> Logout
              </button>
            )}
          </div>
        </div>
        <main style={{ flex: 1, display: 'flex', minHeight: 0 }}>{children}</main>
      </div>
    );
  }

  // Role-specific portal paths — no sidebar needed, standalone layout
  const portalPaths = ['/retailer-portal', '/manufacturer-portal'];
  if (portalPaths.some(p => location.pathname.startsWith(p))) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--surface-base)' }}>
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--surface-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-raised)' }}>
          <h2 className="primary-gradient-text" style={{ fontSize: '1.2rem', margin: 0 }}>
            {tenantData?.businessName || 'Your Business Name'}
          </h2>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <LanguageSwitcher />
            {currentUser && (
              <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'transparent', border: '1px solid var(--surface-border)', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-secondary)', font: 'inherit', fontSize: '0.875rem' }}>
                <LogOut size={16} /> Logout
              </button>
            )}
          </div>
        </div>
        <main style={{ padding: '2rem', maxWidth: '1100px', margin: '0 auto' }}>{children}</main>
      </div>
    );
  }

  // Subscription inactive guard — shown for any non-master tenant whose subscription
  // is missing, suspended, or cancelled. Bypassed while the subscription is still
  // resolving to avoid a flash. Master tenant (super admin) is never blocked.
  const subscriptionActive =
    !planEntitlements.hasSubscription
      ? false
      : ['active', 'trial', 'past_due'].includes(planEntitlements.status ?? '');
  const showInactiveScreen =
    !subscriptionLoading &&
    !!currentUser &&
    !!tenantId &&
    tenantId !== 'master' &&
    !subscriptionActive;

  if (showInactiveScreen) {
    // New tenants (and tenants whose subscription has lapsed) must choose a plan
    // before accessing the ERP. Show the pricing page in a minimal shell layout;
    // redirect every other route to /pricing so they can't bypass it.
    const pricingHeader = (
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem', background: 'var(--surface-raised)', borderBottom: '1px solid var(--surface-border)' }}>
        <h2 className="primary-gradient-text" style={{ fontSize: '1.35rem', margin: 0, letterSpacing: '-0.03em' }}>
          {tenantData?.businessName || 'Fiinny ERP'}
        </h2>
        <button
          onClick={handleLogout}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'transparent', border: '1px solid var(--surface-border)', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-secondary)', font: 'inherit', fontSize: '0.875rem' }}
        >
          <LogOut size={16} /> Logout
        </button>
      </header>
    );

    if (location.pathname === '/pricing') {
      return (
        <div style={{ minHeight: '100vh', background: 'var(--surface-base)', display: 'flex', flexDirection: 'column' }}>
          {pricingHeader}
          <main style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
            <Suspense fallback={<PageLoader />}>{children}</Suspense>
          </main>
        </div>
      );
    }

    return <Navigate to="/pricing" replace />;
  }

  const isOwner = userRole === 'admin' || userRole === 'analyst';
  const isSalesUser = userRole === 'sales';
  const isShopkeeper = userRole === 'shopkeeper';

  // Paths sales role is allowed to see in the sidebar nav
  const SALES_NAV_PATHS = ['/sales-targets', '/worklist'];

  const mainNavItems = [
    { path: '/reports', icon: <BarChart3 size={19} />, label: 'Reports', screenKey: 'analytics' },
    { path: '/dashboard', icon: <Home size={19} />, label: 'B2B Dashboard', screenKey: 'dashboard' },
    { path: '/b2c-dashboard', icon: <BarChart3 size={19} />, label: 'B2C Dashboard', screenKey: 'b2c_dashboard' },
    { path: '/online-dashboard', icon: <Activity size={19} />, label: 'Online Dashboard', screenKey: 'online_dashboard' },
    { path: '/analytics', icon: <Layers size={19} />, label: 'Master Analytics', screenKey: 'analytics' },
    { path: '/onboarding', icon: <UserPlus size={19} />, label: t('common.retailers'), screenKey: 'retailers' },
    { path: '/worklist', icon: <ReceiptText size={19} />, label: t('common.worklist'), screenKey: 'worklist' },
    { path: '/dispatch', icon: <Truck size={19} />, label: 'Dispatch Board', screenKey: 'dispatch' },
    { path: '/pos', icon: <Calculator size={19} />, label: t('common.pos_billing'), screenKey: 'pos' },
    // The /digital-khata route existed but was never linked from the drawer, so
    // udhaari tracking was reachable only by typing the URL.
    { path: '/digital-khata', icon: <ReceiptText size={19} />, label: t('common.khata'), screenKey: 'khata' },
    { path: '/customers', icon: <Users size={19} />, label: 'Customer Profiles', screenKey: 'customers' },
    { path: '/b2b-invoice', icon: <ReceiptText size={19} />, label: 'B2B GST Invoice', screenKey: 'worklist' },
    { path: '/quotations', icon: <ClipboardList size={19} />, label: 'Quotations', screenKey: 'worklist' },
    { path: '/payment-reminders', icon: <Bell size={19} />, label: 'Payment Reminders', screenKey: 'worklist' },
    // TEMPORARILY DISABLED (2026-07-03): Worklist Purchase Orders is incomplete/broken — hidden
    // until rebuilt. Do not delete. Unrelated to Supplier Ledger → Purchase Orders (separate
    // PurchaseOrderModal-based implementation), which is unaffected.
    // { path: '/purchase-orders', icon: <ShoppingCart size={19} />, label: 'Purchase Orders', screenKey: 'worklist' },
    { path: '/supplier-ledger', icon: <Truck size={19} />, label: 'Supplier Ledger', screenKey: 'worklist' },
    { path: '/expenses', icon: <Receipt size={19} />, label: 'Expenses', screenKey: 'expenses' },
    { path: '/delivery-challans', icon: <Truck size={19} />, label: 'Delivery Challans', screenKey: 'worklist' },
    { path: '/warehouses', icon: <Layers size={19} />, label: 'Warehouses / Godowns', screenKey: 'inventory' },
    { path: '/inventory-batches', icon: <Package size={19} />, label: 'Inventory Batches', screenKey: 'inventory' },
    { path: '/barcode', icon: <Activity size={19} />, label: 'Barcode Labels', screenKey: 'inventory' },
    { path: '/manage-transport', icon: <Truck size={19} />, label: 'Manage Transport', screenKey: 'inventory' },
    { path: '/pricing', icon: <Star size={19} />, label: '⭐ Upgrade Plan', screenKey: 'analytics' },
    { path: '/modules', icon: <Package size={19} />, label: '🧩 Module Marketplace', screenKey: 'analytics' },
    { path: '/payment-links', icon: <Link2 size={19} />, label: '💳 Payment Links', screenKey: 'worklist' },
    { path: '/ai-advisor', icon: <Bot size={19} />, label: '🤖 AI Advisor', screenKey: 'analytics' },
    { path: '/returns', icon: <ReceiptText size={19} />, label: 'New Sales Return', screenKey: 'pos' },
    { path: '/loyalty', icon: <Star size={19} />, label: 'Loyalty & Memberships', screenKey: 'loyalty' },
    // TEMPORARILY DISABLED (2026-07-06)
    // Customer Feedback module is under redevelopment.
    // Keep this code for future reactivation.
    // { path: '/feedback', icon: <Users size={19} />, label: 'Customer Feedback', screenKey: 'pos' },
    { path: '/rates', icon: <Package size={19} />, label: t('common.inventory'), screenKey: 'inventory' },
    { path: '/order-history', icon: <ReceiptText size={19} />, label: 'Order History', screenKey: 'order_history' },
    { path: '/sales-returns', icon: <RotateCcw size={19} />, label: 'Sales Returns', screenKey: 'pos' },
    { path: '/online-orders', icon: <ShoppingCart size={19} />, label: 'Online Orders', screenKey: 'online_orders' },
  ];

  // 'worklist' and 'analytics' each cover several screens, so the basic plan cannot be
  // expressed by the permission row alone — these paths come along with the screenKey a
  // shopkeeper does need. Hiding them here avoids a menu entry that only 403s. Splitting
  // those two screenKeys would let this list go away.
  const BASIC_PLAN_HIDDEN_PATHS = ['/ai-advisor', '/quotations', '/delivery-challans', '/warehouses', '/manage-transport'];

  const navItems = mainNavItems.filter(item => {
    if (isSalesUser) return SALES_NAV_PATHS.includes(item.path);
    if (!isOwner && !isShopkeeper) return false;
    if (isShopkeeper && BASIC_PLAN_HIDDEN_PATHS.includes(item.path)) return false;
    // Subscription plan gate — hide screens the tenant's plan excludes (rule 1),
    // plus the feature group for screen-sharing modules (e.g. Supplier Ledger).
    if (!hasPlanScreen(item.screenKey as AppScreen)) return false;
    const navGroup = navFeatureGroupForPath(item.path);
    if (navGroup && !isFeatureGroupAllowed(navGroup, planEntitlements)) return false;
    // Module-level role permission gate (existing behaviour).
    if (userRole && permissions && !permissions[userRole]?.[item.screenKey as AppScreen]) return false;
    // Main Navbar Feature Matrix — single source of truth for the tabs it covers.
    // Admin bypasses (useFeaturePermissions returns true for admin). Items without a
    // matrix mapping stay governed solely by the module-level check above.
    const perm = DRAWER_NAV_PERM[item.path];
    if (perm && !can(perm)) return false;
    return true;
  });

  // Admin sub-tabs now live in-page at /admin#<tab> (AdminHubPage), so the
  // drawer keeps a single Admin entry alongside Settings and KrishiDukan.
  const adminItems = [
    { path: '/admin',                      icon: <ShieldAlert size={17} />, label: 'Admin',                           screenKey: 'admin' },
    { path: '/settings',                   icon: <Settings size={17} />,    label: t('common.settings'),              screenKey: 'settings' },
    { path: '/krishidukan',                icon: <Package size={17} />,     label: '🌾 KrishiDukan',                  screenKey: 'krishidukan' },
  ].filter(item => {
    // Subscription plan gate first, then the module-level role permission gate.
    if (!hasPlanScreen(item.screenKey as AppScreen)) return false;
    const navGroup = navFeatureGroupForPath(item.path);
    if (navGroup && !isFeatureGroupAllowed(navGroup, planEntitlements)) return false;
    if (userRole && permissions && !permissions[userRole]?.[item.screenKey as AppScreen]) return false;
    return true;
  });

  // Platform Super Admin entry — only the dedicated super admin identity sees it.
  // Not screen/plan-gated (the super admin has no tenant subscription to check).
  if (isSuperAdmin) {
    adminItems.push({ path: '/super-admin', icon: <ShieldAlert size={17} />, label: '🛡️ Super Admin', screenKey: 'admin' });
  }

  const isAdminPath = adminItems.some(i => location.pathname === i.path || location.pathname.startsWith(i.path + '/'));

  const navLinkStyle = (path: string, accent = 'primary') => {
    const active = location.pathname === path || (path !== '/' && location.pathname.startsWith(path));
    const acColor = accent === 'secondary' ? 'var(--secondary-dark)' : 'var(--primary-light)';
    const acBg = accent === 'secondary' ? 'hsla(45,93%,47%,0.1)' : 'hsla(152,60%,40%,0.1)';
    return {
      display: 'flex' as const,
      alignItems: 'center' as const,
      gap: '0.875rem',
      padding: '0.75rem 1rem',
      borderRadius: '10px',
      color: active ? acColor : 'var(--text-tertiary)',
      background: active ? acBg : 'transparent',
      textDecoration: 'none' as const,
      fontWeight: active ? 600 : 400,
      fontSize: '0.9rem',
      transition: 'all var(--transition-fast)',
      borderLeft: active ? `3px solid ${acColor}` : '3px solid transparent',
    };
  };

  return (
    <div className="app-container" style={{ flexDirection: 'column' }}>
      {/* Super Admin impersonation banner — shown only while a Super Admin is
          viewing a tenant's dashboard. Makes the tenant context explicit and gives
          a one-click return to /super-admin. */}
      {isImpersonating && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
          padding: '0.55rem 1.25rem', background: 'hsla(45,93%,47%,0.14)',
          borderBottom: '1px solid hsla(45,93%,47%,0.35)', color: 'var(--secondary-dark)',
          fontSize: '0.85rem', fontWeight: 600,
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
            <ShieldAlert size={16} style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Super Admin view · {tenantData?.businessName || tenantId}
            </span>
          </span>
          <button
            onClick={handleExitTenantView}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.8rem', background: 'var(--surface-raised)', border: '1px solid hsla(45,93%,47%,0.4)', borderRadius: '8px', cursor: 'pointer', color: 'var(--secondary-dark)', font: 'inherit', fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            <ArrowLeft size={15} /> Exit Business
          </button>
        </div>
      )}

      {/* Top Header */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
        padding: '1rem 1.5rem', background: 'var(--surface-base)', 
        borderBottom: '1px solid var(--surface-border)', zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h2 className="primary-gradient-text" style={{ fontSize: '1.35rem', margin: 0, letterSpacing: '-0.03em' }}>
            {tenantData?.businessName || 'Your Business Name'}
          </h2>
          {/* Dev-only deployment-environment badge (hidden on the hosted site) */}
          <EnvBadge />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <LanguageSwitcher />
          {/* Light/Dark toggle */}
          <button
            onClick={toggleTheme}
            title={currentTheme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}
            style={{ background: 'hsla(220,20%,50%,0.1)', border: '1px solid var(--surface-border)', padding: '0.4rem', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', transition: 'all 0.2s' }}
          >
            {currentTheme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          {/* Hamburger Menu Toggle */}
          <button onClick={() => setDrawerOpen(true)} style={{ background: 'hsla(152, 60%, 40%, 0.1)', border: '1px solid hsla(152, 60%, 40%, 0.2)', padding: '0.4rem', borderRadius: '8px', cursor: 'pointer', color: 'var(--primary-light)', display: 'flex', alignItems: 'center' }}>
            <Menu size={24} />
          </button>
        </div>
      </header>

      {/* Horizontal priority nav */}
      <HorizontalNavbar />

      {/* Main Content — Reports, Admin, Inventory, POS, and Worklist (wide
          sub-navbar + data tables need the extra width) use the full viewport
          width instead of the centered 1200px column. */}
      <main className={`main-content${(location.pathname.startsWith('/reports') || location.pathname.startsWith('/admin') || location.pathname.startsWith('/inventory') || location.pathname.startsWith('/worklist') || location.pathname.startsWith('/pos') || location.pathname.startsWith('/payment-reminders') || location.pathname.startsWith('/dispatch') || location.pathname.startsWith('/online-orders')) ? ' main-content--full' : ''}`}>{children}</main>

      {/* Drawer Overlay */}
      {drawerOpen && (
        <div 
          onClick={() => setDrawerOpen(false)}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999, backdropFilter: 'blur(3px)' }} 
        />
      )}

      {/* Right Drawer */}
      <nav style={{
          position: 'fixed', top: 0, right: drawerOpen ? 0 : '-320px', bottom: 0,
          width: '300px', background: 'var(--surface-base)', boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
          zIndex: 1000, transition: 'right 0.3s cubic-bezier(0.4, 0, 0.2, 1)', display: 'flex', flexDirection: 'column',
          padding: '1.5rem 1.1rem', overflowY: 'auto'
      }}>
        {/* Drawer Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', borderBottom: '1px solid var(--surface-border)', paddingBottom: '1rem' }}>
          <div>
            <h2 className="primary-gradient-text" style={{ fontSize: '1.35rem', marginBottom: '0.15rem', letterSpacing: '-0.03em' }}>
              Menu
            </h2>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>
              {tenantData?.location || 'Retailer Management'}
            </p>
          </div>
          <button onClick={() => setDrawerOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            <X size={24} />
          </button>
        </div>

        {/* Main Nav (owner + shopkeeper — sales users get their own nav below) */}
        {(isOwner || isShopkeeper) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginBottom: '0.5rem' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0.25rem 1rem', marginBottom: '0.2rem' }}>Main</div>
            {navItems.map(item => (
              <Link key={(item as any).path} to={(item as any).path} style={navLinkStyle((item as any).path)} onClick={() => setDrawerOpen(false)}>
                <span style={{ opacity: 0.8 }}>{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>
        )}

        {/* Administration Section (admin, plus shopkeepers for Settings + KrishiDukan —
            adminItems is permission-filtered, so 'Admin' itself stays hidden for them) */}
        {(userRole === 'admin' || isShopkeeper) && (
          <div style={{ marginTop: '0.5rem' }}>
            <button
              onClick={() => setAdminExpanded(e => !e)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 1rem', background: isAdminPath ? 'hsla(45,93%,47%,0.06)' : 'transparent', border: 'none', cursor: 'pointer', borderRadius: '8px', marginBottom: '0.2rem' }}
            >
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: isAdminPath ? 'var(--secondary-dark)' : 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                ⚙ Administration
              </span>
              <ChevronDown size={13} style={{ color: 'var(--text-tertiary)', transform: adminExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.25s' }} />
            </button>
            {adminExpanded && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', paddingLeft: '0.4rem' }}>
                {adminItems.map(item => (
                  <Link key={item.path} to={item.path} style={navLinkStyle(item.path, 'secondary')} onClick={() => setDrawerOpen(false)}>
                    <span style={{ opacity: 0.8 }}>{item.icon}</span>
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Sales quick nav */}
        {userRole === 'sales' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0.25rem 1rem', marginBottom: '0.2rem' }}>My Workspace</div>
            <Link to="/sales-targets" style={navLinkStyle('/sales-targets')} onClick={() => setDrawerOpen(false)}><Target size={19} /> Sales Targets</Link>
            <Link to="/worklist" style={navLinkStyle('/worklist')} onClick={() => setDrawerOpen(false)}><ReceiptText size={19} /> Worklist</Link>
          </div>
        )}

        {/* Retailer quick nav */}
        {userRole === 'retailer' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0.25rem 1rem', marginBottom: '0.2rem' }}>My Portal</div>
            <Link to="/worklist" style={navLinkStyle('/worklist')} onClick={() => setDrawerOpen(false)}><ReceiptText size={19} /> My Orders</Link>
            <Link to="/settings" style={navLinkStyle('/settings')} onClick={() => setDrawerOpen(false)}><Settings size={19} /> Settings</Link>
          </div>
        )}

        {/* Help Center — visible to all authenticated users */}
        {currentUser && (
          <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--surface-border)' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0.25rem 1rem', marginBottom: '0.2rem' }}>Support</div>
            <Link to="/help" style={navLinkStyle('/help')} onClick={() => setDrawerOpen(false)}>
              <HelpCircle size={19} /> Help Center
            </Link>
            <Link to="/support" style={navLinkStyle('/support')} onClick={() => setDrawerOpen(false)}>
              <LifeBuoy size={19} /> Support Tickets
            </Link>
          </div>
        )}

        {/* Logout */}
        {currentUser && (
          <div style={{ marginTop: 'auto', borderTop: '1px solid var(--surface-border)', paddingTop: '1rem' }}>
            <button
              onClick={() => { setDrawerOpen(false); handleLogout(); }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '0.75rem 1rem', width: '100%', borderRadius: '10px', color: 'var(--text-tertiary)', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 400, font: 'inherit', fontSize: '0.9rem', transition: 'all var(--transition-fast)' }}
              onMouseOver={e => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'hsla(0,84%,60%,0.08)'; }}
              onMouseOut={e => { e.currentTarget.style.color = 'var(--text-tertiary)'; e.currentTarget.style.background = 'transparent'; }}
            >
              <LogOut size={18} /> {t('common.logout')}
            </button>
          </div>
        )}
      </nav>
    </div>
  );
}

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('fiinny-theme') as 'light' | 'dark') || 'light';
  });

  useEffect(() => {
    document.body.className = theme === 'dark' ? 'dark-theme' : '';
    localStorage.setItem('fiinny-theme', theme);
    (window as any).__toggleTheme = toggleTheme;
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <SchemaProvider>
            <ToastProvider>
              <Layout currentTheme={theme} toggleTheme={toggleTheme}>
                <AppRoutes />
              </Layout>
              <ToastContainer />
              <OfflineBanner />
              <CookieBanner />

            </ToastProvider>
          </SchemaProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )

}

function AppRoutes() {
  const { currentUser, tenantId, userRole, loading, roleLandingPages, planEntitlements, isSuperAdmin, isImpersonating } = useAuth();
  const locationHook = useLocation();

  if (loading) return null;

  // Allow public store route without any auth redirect
  if (locationHook.pathname === '/store') {
    return (
      <Routes>
        <Route path="/store" element={<StorefrontPage />} />
      </Routes>
    );
  }

  // The KrishiDukan handoff signs the user in mid-render. Between that and the
  // page's own redirect there is a moment where currentUser exists but tenantId
  // has not resolved — the onboarding guard below would hijack it. Short-circuit
  // so the handoff always gets to finish.
  if (locationHook.pathname === '/auth/handoff') {
    return (
      <Routes>
        <Route path="/auth/handoff" element={<ErpHandoffPage />} />
      </Routes>
    );
  }

  // Role-based auto-redirect after login. The landing page per role is admin-
  // configurable (settings/roleLandingPages, surfaced via AuthContext); each role
  // falls back to a built-in default when unset. Confined roles (retailer / sales)
  // only honour a configured landing that stays inside their allowed paths.
  const RETAILER_ALLOWED_PATHS = ['/worklist', '/settings', '/help', '/support'];
  const SALES_ALLOWED_PATHS = ['/sales-targets', '/worklist', '/help', '/support'];
  const DEFAULT_LANDING: Record<string, string> = {
    admin: '/dashboard', analyst: '/dashboard', shopkeeper: '/pos',
    sales: '/sales-targets', retailer: '/worklist', manufacturer: '/manufacturer-portal',
  };
  const landingFor = (role: string | null, allowed?: string[]): string => {
    const configured = (role && roleLandingPages?.[role]) || '';
    const fallback = (role && DEFAULT_LANDING[role]) || '/dashboard';
    if (configured) {
      // For confined roles, ignore a configured landing outside their allowed paths.
      if (allowed && !allowed.some(p => configured.startsWith(p))) return fallback;
      return configured;
    }
    // Plan-level default applies to admin/analyst — confined roles ignore it.
    if (!allowed && (role === 'admin' || role === 'analyst')) {
      const planDefault = planEntitlements.defaultLandingPath || '';
      if (planDefault) return planDefault;
    }
    return fallback;
  };
  const onEntryPage = locationHook.pathname === '/' || locationHook.pathname === '/login';

  // Platform super admin — route to /super-admin on entry pages; never to onboarding.
  // While "viewing" a tenant (impersonation) the super admin behaves like that tenant's
  // admin, so skip this redirect and let the normal tenant redirects below run.
  if (currentUser && isSuperAdmin && !isImpersonating) {
    if (onEntryPage) return <Navigate to="/super-admin" replace />;
    // Allow any explicit navigation (including /super-admin itself); no further redirect.
  }

  if (currentUser && tenantId) {
    if (userRole === 'retailer' && !RETAILER_ALLOWED_PATHS.some(p => locationHook.pathname.startsWith(p))) {
      return <Navigate to={landingFor('retailer', RETAILER_ALLOWED_PATHS)} replace />;
    }
    if (userRole === 'manufacturer' && !locationHook.pathname.startsWith('/manufacturer-portal')) {
      return <Navigate to="/manufacturer-portal" replace />;
    }
    // Sales users are confined to /sales-targets, /worklist and /help.
    if (userRole === 'sales' && !SALES_ALLOWED_PATHS.some(p => locationHook.pathname.startsWith(p))) {
      return <Navigate to={landingFor('sales', SALES_ALLOWED_PATHS)} replace />;
    }
    // Every other logged-in tenant user (admin / analyst / shopkeeper / custom roles)
    // lands on their configured page when hitting the marketing/login entry pages.
    if (onEntryPage && userRole !== 'retailer' && userRole !== 'manufacturer' && userRole !== 'sales') {
      return <Navigate to={landingFor(userRole)} replace />;
    }
  }

  // Force incomplete setups to finish onboarding — but ONLY for protected routes.
  // Super admin is exempt: it intentionally has no tenant.
  const publicPaths = ['/', '/about', '/privacy', '/terms', '/blog', '/changelog', '/download', '/careers', '/contact', '/login'];
  if (currentUser && !tenantId && !isSuperAdmin && !publicPaths.includes(locationHook.pathname) && locationHook.pathname !== '/client-onboarding') {
    return <Navigate to="/client-onboarding" replace />;
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/store" element={<StorefrontPage />} />
        <Route path="/auth/handoff" element={<ErpHandoffPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
      <Route path="/blog" element={<BlogPage />} />
      <Route path="/changelog" element={<ChangelogPage />} />
      <Route path="/download" element={<DownloadPage />} />
      <Route path="/careers" element={<CareersPage />} />
      <Route path="/contact" element={<ContactPage />} />

      {/* Onboarding */}
      <Route path="/client-onboarding" element={<ProtectedRoute><ClientOnboardingPage /></ProtectedRoute>} />

      {/* Retailer Portal */}
      <Route path="/retailer-portal" element={<ProtectedRoute requireRole={['retailer']}><RetailerPortalPage /></ProtectedRoute>} />

      {/* Manufacturer Portal */}
      <Route path="/manufacturer-portal" element={<ProtectedRoute requireRole={['manufacturer']}><ManufacturerPortalPage /></ProtectedRoute>} />

      {/* Owner / Analyst Routes */}
      <Route path="/dashboard" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="dashboard"><DashboardPage /></ProtectedRoute>} />
      <Route path="/b2c-dashboard" element={<ProtectedRoute requireRole={['admin', 'analyst', 'shopkeeper']} appScreen="b2c_dashboard"><B2CDashboardPage /></ProtectedRoute>} />
      <Route path="/online-dashboard" element={<ProtectedRoute requireRole={['admin', 'analyst', 'shopkeeper']} appScreen="online_dashboard"><OnlineDashboardPage /></ProtectedRoute>} />
      <Route path="/analytics" element={<ProtectedRoute requireRole={['admin', 'analyst', 'shopkeeper']} appScreen="analytics"><AnalyticsPage /></ProtectedRoute>} />
      <Route path="/admin/manage-store" element={<Navigate to="/admin#manage-store" replace />} />
      {/* Onboarding is the Worklist → Partners "Add New" flow, so it is plan-gated
          under the worklist screen (present on every plan) and access-gated by the
          same worklist.partners.create feature that shows the button — not the
          distributor-only `retailers` screen, which locked Retailer-plan tenants out. */}
      <Route path="/onboarding" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="worklist" requireFeature="worklist.partners.create"><OnboardingPage /></ProtectedRoute>} />
      <Route path="/sales-targets" element={<ProtectedRoute requireRole={['admin', 'sales']} appScreen="worklist"><SalesTargetsPage /></ProtectedRoute>} />
      <Route path="/worklist" element={<ProtectedRoute requireRole={['admin', 'analyst', 'sales', 'retailer', 'shopkeeper']} appScreen="worklist"><WorklistPage /></ProtectedRoute>} />
      <Route path="/worklist/:id" element={<ProtectedRoute requireRole={['admin', 'analyst', 'sales', 'retailer', 'shopkeeper']} appScreen="worklist"><WorklistDetailsPage /></ProtectedRoute>} />
      <Route path="/inventory" element={<ProtectedRoute requireRole={['admin', 'analyst', 'shopkeeper']} appScreen="inventory"><InventoryPage /></ProtectedRoute>} />
      <Route path="/administration" element={<ProtectedRoute requireRole={['admin']} appScreen="admin"><AdministrationPage /></ProtectedRoute>} />
      <Route path="/digital-khata" element={<ProtectedRoute requireRole={['admin', 'analyst', 'shopkeeper']} appScreen="khata"><DigitalKhataPage /></ProtectedRoute>} />
      <Route path="/sales-order/new" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="worklist"><SalesOrderPage /></ProtectedRoute>} />
      <Route path="/sales-order/:id" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="worklist"><SalesOrderPage /></ProtectedRoute>} />
      <Route path="/dispatch" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="dispatch"><DispatchBoardPage /></ProtectedRoute>} />
      <Route path="/pos" element={<ProtectedRoute requireRole={['admin', 'analyst', 'shopkeeper']} appScreen="pos"><POSPage /></ProtectedRoute>} />
      <Route path="/b2b-invoice" element={<ProtectedRoute requireRole={['admin', 'analyst', 'shopkeeper']} appScreen="worklist"><B2BInvoicePage /></ProtectedRoute>} />
      <Route path="/quotations" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="worklist"><QuotationsPage /></ProtectedRoute>} />
      <Route path="/payment-reminders" element={<ProtectedRoute requireRole={['admin', 'analyst', 'shopkeeper']} appScreen="worklist"><PaymentRemindersPage /></ProtectedRoute>} />
      {/* TEMPORARILY DISABLED (2026-07-03): Worklist Purchase Orders is incomplete/broken —
          route hidden until rebuilt. Do not delete. Supplier Ledger → Purchase Orders is a
          separate implementation (PurchaseOrderModal) and is unaffected. */}
      {/* <Route path="/purchase-orders" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="worklist"><PurchaseOrdersPage /></ProtectedRoute>} /> */}
      <Route path="/supplier-ledger" element={<ProtectedRoute requireRole={['admin', 'analyst', 'shopkeeper']} appScreen="worklist"><SupplierLedgerPage /></ProtectedRoute>} />
      <Route path="/supplier-ledger/:id" element={<ProtectedRoute requireRole={['admin', 'analyst', 'shopkeeper']} appScreen="worklist"><SupplierLedgerDetailPage /></ProtectedRoute>} />
      <Route path="/expenses" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="expenses"><ExpensePage /></ProtectedRoute>} />
      <Route path="/careoff-sync" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="accounts"><CareOffReconcilePage /></ProtectedRoute>} />
      <Route path="/supplier-invoice" element={<ProtectedRoute requireRole={['admin', 'analyst', 'shopkeeper']} appScreen="worklist"><SupplierInvoicePage /></ProtectedRoute>} />
      <Route path="/delivery-challans" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="worklist"><DeliveryChallansPage /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute requireRole={['admin', 'analyst', 'shopkeeper']} appScreen="analytics"><ReportsPage /></ProtectedRoute>} />
      <Route path="/gst-reports" element={<ProtectedRoute requireRole={['admin', 'analyst', 'shopkeeper']} appScreen="analytics"><GSTReportsPage /></ProtectedRoute>} />
      <Route path="/financial-reports" element={<ProtectedRoute requireRole={['admin', 'analyst', 'shopkeeper']} appScreen="analytics"><FinancialReportsPage /></ProtectedRoute>} />
      <Route path="/warehouses" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="inventory"><WarehousePage /></ProtectedRoute>} />
      <Route path="/inventory-batches" element={<ProtectedRoute requireRole={['admin', 'analyst', 'shopkeeper']} appScreen="inventory"><InventoryBatchPage /></ProtectedRoute>} />
      <Route path="/barcode" element={<ProtectedRoute requireRole={['admin', 'analyst', 'shopkeeper']} appScreen="inventory"><BarcodePage /></ProtectedRoute>} />
      <Route path="/manage-transport" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="inventory"><ManageTransportPage /></ProtectedRoute>} />
      {/* Pricing requires a FIINNY session — ProtectedRoute redirects logged-out
          visitors to /login (the same guard every other ERP route uses). No appScreen
          or requireRole is set, so it enforces authentication ONLY: any authenticated
          role can view and compare plans, and it stays reachable for authenticated
          tenants regardless of plan (unsubscribed tenants are routed here by the
          subscription gate to pick a plan after signup). The page only shows plan DATA;
          subscription/payment remains gated by the auth-checked Cloud Functions. */}
      <Route path="/pricing" element={<ProtectedRoute><PricingPage /></ProtectedRoute>} />
      <Route path="/payment-links" element={<ProtectedRoute requireRole={['admin', 'analyst', 'shopkeeper']} appScreen="worklist"><PaymentLinkPage /></ProtectedRoute>} />
      <Route path="/ai-advisor" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="analytics"><AIAdvisorPage /></ProtectedRoute>} />
      {/* Module system */}
      <Route path="/modules" element={<ProtectedRoute requireRole={['admin', 'analyst', 'shopkeeper']} appScreen="analytics"><ModuleMarketplacePage /></ProtectedRoute>} />

      {/* POS add-on pages */}
      {/* B2C Sales Return — admin/analyst only, matching the tenant `returns` + stock write rules. */}
      <Route path="/returns" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="pos"><ReturnsPage /></ProtectedRoute>} />
      {/* B2C Sales Returns — read-only history/viewing of returned orders. */}
      <Route path="/sales-returns" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="pos"><SalesReturnsPage /></ProtectedRoute>} />
      <Route path="/loyalty" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="loyalty"><ModuleGate moduleId="loyalty" moduleName="Loyalty & Memberships"><LoyaltyPage /></ModuleGate></ProtectedRoute>} />
      {/* TEMPORARILY DISABLED (2026-07-06)
          Customer Feedback module is under redevelopment.
          Keep this code for future reactivation. */}
      {/* <Route path="/feedback" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="pos"><CustomerFeedbackPage /></ProtectedRoute>} /> */}

      {/* Public pages */}
      <Route path="/feedback-submit" element={<CustomerFeedbackSubmitPage />} />
      <Route path="/v-checkout/:tenantId/:token" element={<VCheckoutPage />} />
      <Route path="/pay/:token" element={<PaymentLandingPage />} />
      <Route path="/receipt/:tenantId/:receiptId" element={<DigitalReceiptPage />} />
      
      <Route path="/rates" element={<ProtectedRoute requireRole={['admin', 'analyst', 'shopkeeper']} appScreen="inventory"><RateSheetPage /></ProtectedRoute>} />
      <Route path="/order-history" element={<ProtectedRoute requireRole={['admin', 'analyst', 'shopkeeper']} appScreen="order_history"><OrderHistoryPage /></ProtectedRoute>} />
      <Route path="/online-orders" element={<ProtectedRoute requireRole={['admin', 'analyst', 'shopkeeper']} appScreen="online_orders"><OnlineOrdersPage /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute appScreen="settings"><SettingsPage /></ProtectedRoute>} />

      {/* KrishiDukan marketplace module */}
      <Route path="/krishidukan" element={<ProtectedRoute requireRole={['admin', 'shopkeeper']} appScreen="krishidukan"><KrishiDukanPage /></ProtectedRoute>} />

      {/* Admin — single hash-based hub. Sub-tabs live at /admin#<tab>; each
          tab's own role/permission gate is enforced inside AdminHubPage. */}
      <Route path="/admin" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="admin"><AdminHubPage /></ProtectedRoute>} />
      {/* Super Admin subscription management — platform-level. Only the dedicated
          super admin identity may access this route (requireSuperAdmin enforces it). */}
      <Route path="/super-admin" element={<ProtectedRoute requireSuperAdmin><SuperAdminSubscriptionsPage /></ProtectedRoute>} />
      {/* Team Performance — also a standalone navbar destination; navbar visibility
          is driven by the Main Navbar Feature Matrix (navbar.teamPerformance.view).
          The Admin sub-tab at /admin#team-performance remains intact. */}
      <Route path="/team-performance" element={<ProtectedRoute requireRole={['admin', 'analyst']}><TeamPerformancePage /></ProtectedRoute>} />
      {/* Customer Profiles are reachable two ways: the standalone Customers screen
          AND POS Billing → Customers (posBilling.customers.view, rendered inline in
          /pos). altFeature OR-admits the POS surface so opening a customer — and the
          profile's "back to list" — never wrongly redirects a role that has POS
          Customers but not the standalone customers screen. */}
      <Route path="/customers" element={<ProtectedRoute requireRole={['admin', 'analyst', 'shopkeeper']} appScreen="customers" altScreen="pos" altFeature="posBilling.customers.view"><CustomersPage /></ProtectedRoute>} />
      <Route path="/customers/:id" element={<ProtectedRoute requireRole={['admin', 'analyst', 'shopkeeper']} appScreen="customers" altScreen="pos" altFeature="posBilling.customers.view"><CustomerProfilePage /></ProtectedRoute>} />
      {/* Legacy /admin/* deep links → hash equivalents (bookmarks stay working) */}
      <Route path="/admin/manage-roles" element={<Navigate to="/admin#feature-permissions" replace />} />
      <Route path="/admin/data-security" element={<Navigate to="/admin#data-security" replace />} />
      <Route path="/admin/audit-log" element={<Navigate to="/admin#audit-log" replace />} />
      {/* Platform Super Admin audit logs live in the /super-admin console. */}
      <Route path="/admin/audit-logs" element={<Navigate to="/super-admin#audit-logs" replace />} />
      <Route path="/admin/manage-retailers" element={<Navigate to="/admin#manage-retailers" replace />} />
      <Route path="/admin/manufacturers" element={<Navigate to="/admin#manufacturers" replace />} />
      <Route path="/admin/invoice-settings" element={<Navigate to="/admin#invoice-branding" replace />} />
      <Route path="/admin/schema-builder" element={<Navigate to="/admin#schema-builder" replace />} />
      <Route path="/admin/invoice-templates" element={<Navigate to="/admin#invoice-templates" replace />} />
      <Route path="/admin/team-performance" element={<Navigate to="/admin#team-performance" replace />} />
      <Route path="/admin/sales-targets" element={<Navigate to="/admin#sales-target" replace />} />

      {/* Help Center */}
      <Route path="/help" element={<ProtectedRoute><HelpCenterPage /></ProtectedRoute>} />
      <Route path="/help/:articleId" element={<ProtectedRoute><HelpArticlePage /></ProtectedRoute>} />

      {/* Support Tickets — available to every authenticated tenant user/role */}
      <Route path="/support" element={<ProtectedRoute><SupportTicketsPage /></ProtectedRoute>} />

      {/* Catch-all: 404 for logged-in users, /login redirect for guests */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </Suspense>
  );
}

export default App
