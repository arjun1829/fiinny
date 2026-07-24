import { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { Home, Users, UserPlus, LogOut, ReceiptText, ShieldAlert, Calculator, Settings, Package, ChevronDown, Layers, Palette, Database, Factory, Truck, Store, ShoppingCart, BarChart3, Activity, FileText, Bell, ClipboardList, Star, Link2, Bot, Loader2, Menu, X, Lock, Target } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './components/LanguageSwitcher';
import OfflineBanner from './components/OfflineBanner';
import CookieBanner from './components/CookieBanner';
import ErrorBoundary from './components/ErrorBoundary';
import ModuleGate from './components/ModuleGate';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import type { AppScreen } from './contexts/AuthContext';
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
const AdminPage              = lazy(() => import('./pages/AdminPage'));
const StorefrontPage         = lazy(() => import('./pages/StorefrontPage'));
const AdminStoreProductsPage = lazy(() => import('./pages/AdminStoreProductsPage'));
const RateSheetPage          = lazy(() => import('./pages/RateSheetPage'));
const InvoiceSettingsPage    = lazy(() => import('./pages/InvoiceSettingsPage'));
const ManageRetailersPage    = lazy(() => import('./pages/ManageRetailersPage'));
const POSPage                = lazy(() => import('./pages/POSPage'));
const SettingsPage           = lazy(() => import('./pages/SettingsPage'));
const SchemaBuilderPage      = lazy(() => import('./pages/SchemaBuilderPage'));
const InvoiceTemplateBuilderPage = lazy(() => import('./pages/InvoiceTemplateBuilderPage'));
const ManufacturersPage      = lazy(() => import('./pages/ManufacturersPage'));
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
const ClientOnboardingPage   = lazy(() => import('./pages/ClientOnboardingPage'));
const OnlineOrdersPage       = lazy(() => import('./pages/OnlineOrdersPage'));
const OnlineDashboardPage    = lazy(() => import('./pages/OnlineDashboardPage').then(m => ({ default: m.OnlineDashboardPage })));
const AnalyticsPage          = lazy(() => import('./pages/AnalyticsPage').then(m => ({ default: m.AnalyticsPage })));
const OrderHistoryPage       = lazy(() => import('./pages/OrderHistoryPage'));
const ManageRolesPage        = lazy(() => import('./pages/ManageRolesPage'));
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
const AdministrationPage     = lazy(() => import('./pages/AdministrationPage'));
const PricingPage            = lazy(() => import('./pages/PricingPage'));
const PaymentLinkPage        = lazy(() => import('./pages/PaymentLinkPage'));
const PaymentLandingPage     = lazy(() => import('./pages/PaymentLandingPage'));
const AIAdvisorPage          = lazy(() => import('./pages/AIAdvisorPage'));
const DigitalReceiptPage     = lazy(() => import('./pages/DigitalReceiptPage'));
const DigitalKhataPage       = lazy(() => import('./pages/DigitalKhataPage'));
const ModuleMarketplacePage  = lazy(() => import('./pages/ModuleMarketplacePage'));
// TEMPORARILY DISABLED (2026-07-03)
// Returns & Exchanges module is incomplete.
// Hidden until the feature is redesigned and rebuilt.
// const ReturnsPage            = lazy(() => import('./pages/ReturnsPage'));
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
const DataSecurityPage        = lazy(() => import('./pages/DataSecurityPage'));
const SalesTargetsPage        = lazy(() => import('./pages/SalesTargetsPage'));
const TeamPerformancePage     = lazy(() => import('./pages/TeamPerformancePage'));
const NotFoundPage            = lazy(() => import('./pages/NotFoundPage'));

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

function Layout({ children }: { children: React.ReactNode, currentTheme: 'light' | 'dark', toggleTheme: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { currentUser, userRole, tenantData, permissions, logout } = useAuth();

  const handleLogout = () => {
    logout().then(() => navigate('/login', { replace: true }));
  };
  const [adminExpanded, setAdminExpanded] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const publicPaths = ['/', '/login', '/about', '/privacy', '/terms', '/blog', '/changelog', '/download'];
  if (publicPaths.includes(location.pathname)) return <>{children}</>;

  // Fully standalone public pages — no nav, no sidebar
  const standalonePathPrefixes = ['/feedback-submit', '/v-checkout/', '/pay/', '/receipt/'];
  if (standalonePathPrefixes.some(p => location.pathname.startsWith(p))) return <>{children}</>;

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

  const isOwner = userRole === 'admin' || userRole === 'analyst';
  const isSalesUser = userRole === 'sales';

  // Paths sales role is allowed to see in the sidebar nav
  const SALES_NAV_PATHS = ['/sales-targets', '/worklist'];

  const mainNavItems = [
    { path: '/dashboard', icon: <Home size={19} />, label: 'B2B Dashboard', screenKey: 'dashboard' },
    { path: '/b2c-dashboard', icon: <BarChart3 size={19} />, label: 'B2C Dashboard', screenKey: 'b2c_dashboard' },
    { path: '/online-dashboard', icon: <Activity size={19} />, label: 'Online Dashboard', screenKey: 'online_dashboard' },
    { path: '/analytics', icon: <Layers size={19} />, label: 'Master Analytics', screenKey: 'analytics' },
    { path: '/onboarding', icon: <UserPlus size={19} />, label: t('common.retailers'), screenKey: 'retailers' },
    { path: '/worklist', icon: <ReceiptText size={19} />, label: t('common.worklist'), screenKey: 'worklist' },
    { path: '/dispatch', icon: <Truck size={19} />, label: 'Dispatch Board', screenKey: 'dispatch' },
    { path: '/pos', icon: <Calculator size={19} />, label: t('common.pos_billing'), screenKey: 'pos' },
    { path: '/b2b-invoice', icon: <ReceiptText size={19} />, label: 'B2B GST Invoice', screenKey: 'worklist' },
    { path: '/quotations', icon: <ClipboardList size={19} />, label: 'Quotations', screenKey: 'worklist' },
    { path: '/payment-reminders', icon: <Bell size={19} />, label: 'Payment Reminders', screenKey: 'worklist' },
    // TEMPORARILY DISABLED (2026-07-03): Worklist Purchase Orders is incomplete/broken — hidden
    // until rebuilt. Do not delete. Unrelated to Supplier Ledger → Purchase Orders (separate
    // PurchaseOrderModal-based implementation), which is unaffected.
    // { path: '/purchase-orders', icon: <ShoppingCart size={19} />, label: 'Purchase Orders', screenKey: 'worklist' },
    { path: '/supplier-ledger', icon: <Truck size={19} />, label: 'Supplier Ledger', screenKey: 'worklist' },
    { path: '/delivery-challans', icon: <Truck size={19} />, label: 'Delivery Challans', screenKey: 'worklist' },
    { path: '/gst-reports', icon: <FileText size={19} />, label: 'GST Reports', screenKey: 'analytics' },
    { path: '/financial-reports', icon: <BarChart3 size={19} />, label: 'Financial Reports', screenKey: 'analytics' },
    { path: '/warehouses', icon: <Layers size={19} />, label: 'Warehouses / Godowns', screenKey: 'inventory' },
    { path: '/inventory-batches', icon: <Package size={19} />, label: 'Inventory Batches', screenKey: 'inventory' },
    { path: '/barcode', icon: <Activity size={19} />, label: 'Barcode Labels', screenKey: 'inventory' },
    { path: '/pricing', icon: <Star size={19} />, label: '⭐ Upgrade Plan', screenKey: 'analytics' },
    { path: '/modules', icon: <Package size={19} />, label: '🧩 Module Marketplace', screenKey: 'analytics' },
    { path: '/payment-links', icon: <Link2 size={19} />, label: '💳 Payment Links', screenKey: 'worklist' },
    { path: '/ai-advisor', icon: <Bot size={19} />, label: '🤖 AI Advisor', screenKey: 'analytics' },
    // TEMPORARILY DISABLED (2026-07-03)
    // Returns & Exchanges module is incomplete.
    // Hidden until the feature is redesigned and rebuilt.
    // { path: '/returns', icon: <ReceiptText size={19} />, label: 'Returns & Exchanges', screenKey: 'pos' },
    { path: '/loyalty', icon: <Star size={19} />, label: 'Loyalty & Memberships', screenKey: 'loyalty' },
    // TEMPORARILY DISABLED (2026-07-06)
    // Customer Feedback module is under redevelopment.
    // Keep this code for future reactivation.
    // { path: '/feedback', icon: <Users size={19} />, label: 'Customer Feedback', screenKey: 'pos' },
    { path: '/rates', icon: <Package size={19} />, label: t('common.inventory'), screenKey: 'inventory' },
    { path: '/order-history', icon: <ReceiptText size={19} />, label: 'Order History', screenKey: 'order_history' },
    { path: '/online-orders', icon: <ShoppingCart size={19} />, label: 'Online Orders', screenKey: 'online_orders' },
  ];

  const navItems = mainNavItems.filter(item => {
    if (isSalesUser) return SALES_NAV_PATHS.includes(item.path);
    if (!isOwner) return false;
    if (userRole && permissions && !permissions[userRole]?.[item.screenKey as AppScreen]) return false;
    return true;
  });

  const adminItems = [
    { path: '/admin/manage-roles', icon: <ShieldAlert size={17} />, label: 'Role Matrix', screenKey: 'admin' },
    { path: '/admin/data-security', icon: <Lock size={17} />, label: 'Data Security', screenKey: 'admin' },
    { path: '/admin/manage-retailers', icon: <Users size={17} />, label: t('common.manage_retailers'), screenKey: 'manage_retailers' },
    { path: '/admin', icon: <ShieldAlert size={17} />, label: t('common.manage_users'), screenKey: 'admin' },
    { path: '/admin/manufacturers', icon: <Factory size={17} />, label: 'Manufacturers', screenKey: 'manufacturers' },
    { path: '/admin/manage-store', icon: <Store size={17} />, label: 'Manage Store', screenKey: 'manage_store' },
    { path: '/admin/invoice-templates', icon: <Layers size={17} />, label: 'Invoice Templates', screenKey: 'invoice_templates' },
    { path: '/admin/invoice-settings', icon: <Palette size={17} />, label: 'Invoice Branding', screenKey: 'invoice_settings' },
    { path: '/admin/schema-builder', icon: <Database size={17} />, label: 'UI Layout Builder', screenKey: 'schema_builder' },
    { path: '/admin/team-performance', icon: <Target size={17} />, label: 'Team Performance', screenKey: 'admin' },
    { path: '/settings', icon: <Settings size={17} />, label: t('common.settings'), screenKey: 'settings' },
    { path: '/krishidukan', icon: <Package size={17} />, label: '🌾 KrishiDukan', screenKey: 'krishidukan' },
  ].filter(item => {
    if (userRole && permissions && !permissions[userRole]?.[item.screenKey as AppScreen]) return false;
    return true;
  });

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
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <LanguageSwitcher />
          {/* Hamburger Menu Toggle */}
          <button onClick={() => setDrawerOpen(true)} style={{ background: 'hsla(152, 60%, 40%, 0.1)', border: '1px solid hsla(152, 60%, 40%, 0.2)', padding: '0.4rem', borderRadius: '8px', cursor: 'pointer', color: 'var(--primary-light)', display: 'flex', alignItems: 'center' }}>
            <Menu size={24} />
          </button>
        </div>
      </header>

      {/* Horizontal priority nav */}
      <HorizontalNavbar />

      {/* Main Content */}
      <main className="main-content">{children}</main>

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

        {/* Main Nav (owner only — sales users get their own nav below) */}
        {isOwner && (
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

        {/* Administration Section (admin only) */}
        {userRole === 'admin' && (
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
  const { currentUser, tenantId, userRole, loading } = useAuth();
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

  // Role-based auto-redirect after login
  const RETAILER_ALLOWED_PATHS = ['/worklist', '/settings'];
  if (currentUser && tenantId) {
    if (userRole === 'retailer' && !RETAILER_ALLOWED_PATHS.some(p => locationHook.pathname.startsWith(p))) {
      return <Navigate to="/worklist" replace />;
    }
    if (userRole === 'manufacturer' && !locationHook.pathname.startsWith('/manufacturer-portal')) {
      return <Navigate to="/manufacturer-portal" replace />;
    }
    // If Admin/Analyst visits landing page but is already logged in, go to dashboard
    if ((userRole === 'admin' || userRole === 'analyst') && (locationHook.pathname === '/' || locationHook.pathname === '/login')) {
      return <Navigate to="/dashboard" replace />;
    }
    // Sales users are confined to /sales-targets and /worklist
    if (userRole === 'sales' && !locationHook.pathname.startsWith('/sales-targets') && !locationHook.pathname.startsWith('/worklist')) {
      return <Navigate to="/sales-targets" replace />;
    }
  }

  // Force incomplete setups to finish onboarding — but ONLY for protected routes
  // Public paths like '/', '/about' etc. are always visible to everyone, even logged-in users without tenantId
  // This prevents the "stuck in onboarding" loop when Firestore read fails or user just wants to browse
  const publicPaths = ['/', '/about', '/privacy', '/terms', '/blog', '/changelog', '/download', '/login'];
  if (currentUser && !tenantId && !publicPaths.includes(locationHook.pathname) && locationHook.pathname !== '/client-onboarding') {
    return <Navigate to="/client-onboarding" replace />;
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/store" element={<StorefrontPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
      <Route path="/blog" element={<BlogPage />} />
      <Route path="/changelog" element={<ChangelogPage />} />
      <Route path="/download" element={<DownloadPage />} />

      {/* Onboarding */}
      <Route path="/client-onboarding" element={<ProtectedRoute><ClientOnboardingPage /></ProtectedRoute>} />

      {/* Retailer Portal */}
      <Route path="/retailer-portal" element={<ProtectedRoute requireRole={['retailer']}><RetailerPortalPage /></ProtectedRoute>} />

      {/* Manufacturer Portal */}
      <Route path="/manufacturer-portal" element={<ProtectedRoute requireRole={['manufacturer']}><ManufacturerPortalPage /></ProtectedRoute>} />

      {/* Owner / Analyst Routes */}
      <Route path="/dashboard" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="dashboard"><DashboardPage /></ProtectedRoute>} />
      <Route path="/b2c-dashboard" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="b2c_dashboard"><B2CDashboardPage /></ProtectedRoute>} />
      <Route path="/online-dashboard" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="online_dashboard"><OnlineDashboardPage /></ProtectedRoute>} />
      <Route path="/analytics" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="analytics"><AnalyticsPage /></ProtectedRoute>} />
      <Route path="/admin/manage-store" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="manage_store"><AdminStoreProductsPage /></ProtectedRoute>} />
      <Route path="/onboarding" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="retailers"><OnboardingPage /></ProtectedRoute>} />
      <Route path="/sales-targets" element={<ProtectedRoute requireRole={['admin', 'analyst', 'sales']} appScreen="worklist"><SalesTargetsPage /></ProtectedRoute>} />
      <Route path="/worklist" element={<ProtectedRoute requireRole={['admin', 'analyst', 'sales', 'retailer']} appScreen="worklist"><WorklistPage /></ProtectedRoute>} />
      <Route path="/worklist/:id" element={<ProtectedRoute requireRole={['admin', 'analyst', 'sales', 'retailer']} appScreen="worklist"><WorklistDetailsPage /></ProtectedRoute>} />
      <Route path="/inventory" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="inventory"><InventoryPage /></ProtectedRoute>} />
      <Route path="/administration" element={<ProtectedRoute requireRole={['admin']} appScreen="admin"><AdministrationPage /></ProtectedRoute>} />
      <Route path="/digital-khata" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="khata"><DigitalKhataPage /></ProtectedRoute>} />
      <Route path="/sales-order/new" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="worklist"><SalesOrderPage /></ProtectedRoute>} />
      <Route path="/sales-order/:id" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="worklist"><SalesOrderPage /></ProtectedRoute>} />
      <Route path="/dispatch" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="dispatch"><DispatchBoardPage /></ProtectedRoute>} />
      <Route path="/pos" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="pos"><POSPage /></ProtectedRoute>} />
      <Route path="/b2b-invoice" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="worklist"><B2BInvoicePage /></ProtectedRoute>} />
      <Route path="/quotations" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="worklist"><QuotationsPage /></ProtectedRoute>} />
      <Route path="/payment-reminders" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="worklist"><PaymentRemindersPage /></ProtectedRoute>} />
      {/* TEMPORARILY DISABLED (2026-07-03): Worklist Purchase Orders is incomplete/broken —
          route hidden until rebuilt. Do not delete. Supplier Ledger → Purchase Orders is a
          separate implementation (PurchaseOrderModal) and is unaffected. */}
      {/* <Route path="/purchase-orders" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="worklist"><PurchaseOrdersPage /></ProtectedRoute>} /> */}
      <Route path="/supplier-ledger" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="worklist"><SupplierLedgerPage /></ProtectedRoute>} />
      <Route path="/supplier-ledger/:id" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="worklist"><SupplierLedgerDetailPage /></ProtectedRoute>} />
      <Route path="/careoff-sync" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="accounts"><CareOffReconcilePage /></ProtectedRoute>} />
      <Route path="/supplier-invoice" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="worklist"><SupplierInvoicePage /></ProtectedRoute>} />
      <Route path="/delivery-challans" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="worklist"><DeliveryChallansPage /></ProtectedRoute>} />
      <Route path="/gst-reports" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="analytics"><GSTReportsPage /></ProtectedRoute>} />
      <Route path="/financial-reports" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="analytics"><FinancialReportsPage /></ProtectedRoute>} />
      <Route path="/warehouses" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="inventory"><WarehousePage /></ProtectedRoute>} />
      <Route path="/inventory-batches" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="inventory"><InventoryBatchPage /></ProtectedRoute>} />
      <Route path="/barcode" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="inventory"><BarcodePage /></ProtectedRoute>} />
      <Route path="/pricing" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="analytics"><PricingPage /></ProtectedRoute>} />
      <Route path="/payment-links" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="worklist"><PaymentLinkPage /></ProtectedRoute>} />
      <Route path="/ai-advisor" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="analytics"><AIAdvisorPage /></ProtectedRoute>} />
      {/* Module system */}
      <Route path="/modules" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="analytics"><ModuleMarketplacePage /></ProtectedRoute>} />

      {/* POS add-on pages */}
      {/* TEMPORARILY DISABLED (2026-07-03)
          Returns & Exchanges module is incomplete.
          Hidden until the feature is redesigned and rebuilt. */}
      {/* <Route path="/returns" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="pos"><ReturnsPage /></ProtectedRoute>} /> */}
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
      
      <Route path="/rates" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="inventory"><RateSheetPage /></ProtectedRoute>} />
      <Route path="/order-history" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="order_history"><OrderHistoryPage /></ProtectedRoute>} />
      <Route path="/online-orders" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="online_orders"><OnlineOrdersPage /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute appScreen="settings"><SettingsPage /></ProtectedRoute>} />

      {/* KrishiDukan marketplace module */}
      <Route path="/krishidukan" element={<ProtectedRoute requireRole={['admin']} appScreen="krishidukan"><KrishiDukanPage /></ProtectedRoute>} />

      {/* Admin Routes */}
      <Route path="/admin" element={<ProtectedRoute requireRole={['admin']} appScreen="admin"><AdminPage /></ProtectedRoute>} />
      <Route path="/admin/manage-roles" element={<ProtectedRoute requireRole={['admin']} appScreen="admin"><ManageRolesPage /></ProtectedRoute>} />
      <Route path="/admin/data-security" element={<ProtectedRoute requireRole={['admin']} appScreen="admin"><DataSecurityPage /></ProtectedRoute>} />
      <Route path="/admin/manage-retailers" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="manage_retailers"><ManageRetailersPage /></ProtectedRoute>} />
      <Route path="/admin/manufacturers" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="manufacturers"><ManufacturersPage /></ProtectedRoute>} />
      <Route path="/admin/invoice-settings" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="invoice_settings"><InvoiceSettingsPage /></ProtectedRoute>} />
      <Route path="/admin/schema-builder" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="schema_builder"><SchemaBuilderPage /></ProtectedRoute>} />
      <Route path="/admin/invoice-templates" element={<ProtectedRoute requireRole={['admin', 'analyst']} appScreen="invoice_templates"><InvoiceTemplateBuilderPage /></ProtectedRoute>} />
      <Route path="/admin/team-performance" element={<ProtectedRoute requireRole={['admin']} appScreen="admin"><TeamPerformancePage /></ProtectedRoute>} />

      {/* Catch-all: 404 for logged-in users, /login redirect for guests */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </Suspense>
  );
}

export default App
