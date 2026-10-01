import { useEffect } from 'react';
import {
    UserCog, Shield, TrendingUp, Target, Lock, Users,
    Palette, Store, Factory, Layers, Database, KeyRound,
} from 'lucide-react';
import { useHashTab } from '../hooks/useHashTab';
import { useAuth } from '../contexts/AuthContext';
import type { AppScreen, UserRole } from '../contexts/AuthContext';

// Sub-pages rendered inside the Admin hub. AdminHubPage itself is lazy-loaded by
// App.tsx, so these direct imports keep the whole Admin area in one chunk —
// consistent with InventoryPage's in-page tab pattern.
import AdminPage from './AdminPage';
import AuditLogPage from './AuditLogPage';
import TeamPerformancePage from './TeamPerformancePage';
import SalesTargetsAdminPage from './SalesTargetsAdminPage';
import DataSecurityPage from './DataSecurityPage';
import SuperAdminPermissionsPage from './SuperAdminPermissionsPage';
import ManageRetailersPage from './ManageRetailersPage';
import InvoiceSettingsPage from './InvoiceSettingsPage';
import AdminStoreProductsPage from './AdminStoreProductsPage';
import ManufacturersPage from './ManufacturersPage';
import InvoiceTemplateBuilderPage from './InvoiceTemplateBuilderPage';
import SchemaBuilderPage from './SchemaBuilderPage';

// ─── Tab definitions ──────────────────────────────────────────────────────────
// `id` is the URL hash (/admin#<id>). `requireRole` + `appScreen` mirror the
// exact gating each sub-page had as its own route, so permissions are preserved.

type AdminTab = {
    id: string;
    label: string;
    icon: React.ReactNode;
    requireRole: UserRole[];
    appScreen: AppScreen;
    Comp: React.ComponentType;
};

const ADMIN_TABS: AdminTab[] = [
    { id: 'manage-users',      label: 'Manage Users',      icon: <UserCog size={16} />,     requireRole: ['admin'],            appScreen: 'admin',             Comp: AdminPage },
    { id: 'audit-log',         label: 'Audit Log',         icon: <Shield size={16} />,      requireRole: ['admin'],            appScreen: 'audit_log',         Comp: AuditLogPage },
    { id: 'team-performance',  label: 'Team Performance',  icon: <TrendingUp size={16} />,  requireRole: ['admin'],            appScreen: 'admin',             Comp: TeamPerformancePage },
    { id: 'sales-target',      label: 'Sales Target',      icon: <Target size={16} />,      requireRole: ['admin'],            appScreen: 'admin',             Comp: SalesTargetsAdminPage },
    { id: 'data-security',     label: 'Data Security',     icon: <Lock size={16} />,        requireRole: ['admin'],            appScreen: 'admin',             Comp: DataSecurityPage },
    { id: 'feature-permissions', label: 'Feature Permissions', icon: <KeyRound size={16} />,  requireRole: ['admin'],            appScreen: 'admin',             Comp: SuperAdminPermissionsPage },
    { id: 'manage-retailers',  label: 'Manage Retailers',  icon: <Users size={16} />,       requireRole: ['admin', 'analyst'], appScreen: 'manage_retailers',  Comp: ManageRetailersPage },
    { id: 'invoice-branding',  label: 'Invoice Branding',  icon: <Palette size={16} />,     requireRole: ['admin', 'analyst'], appScreen: 'invoice_settings',  Comp: InvoiceSettingsPage },
    { id: 'manage-store',      label: 'Manage Store',      icon: <Store size={16} />,       requireRole: ['admin', 'analyst'], appScreen: 'manage_store',      Comp: AdminStoreProductsPage },
    { id: 'manufacturers',     label: 'Manufacturers',     icon: <Factory size={16} />,     requireRole: ['admin', 'analyst'], appScreen: 'manufacturers',     Comp: ManufacturersPage },
    { id: 'invoice-templates', label: 'Invoice Templates', icon: <Layers size={16} />,      requireRole: ['admin', 'analyst'], appScreen: 'invoice_templates', Comp: InvoiceTemplateBuilderPage },
    { id: 'schema-builder',    label: 'UI Layout Builder', icon: <Database size={16} />,    requireRole: ['admin', 'analyst'], appScreen: 'schema_builder',    Comp: SchemaBuilderPage },
];

const VALID_TABS: readonly string[] = ADMIN_TABS.map(t => t.id);

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminHubPage() {
    const { userRole, permissions, hasPlanScreen } = useAuth();

    // Per-tab permission check — uses requireRole + appScreen from each tab definition,
    // exactly matching the gate those sub-pages had when they were standalone routes.
    const isTabAllowed = (tabId: string): boolean => {
        const tabDef = ADMIN_TABS.find(t => t.id === tabId);
        if (!tabDef || !userRole) return false;
        // Plan gate mirrors ProtectedRoute: tab's appScreen must be in the subscription plan.
        if (!hasPlanScreen(tabDef.appScreen)) return false;
        // admin role bypasses role/permission checks (plan already checked above).
        if (userRole === 'admin') return true;
        // For built-in roles listed in requireRole: requireRole is sufficient — the plan
        // gate above is the access boundary. For custom/unlisted roles: fall back to the
        // existing screen-level permission grant (Feature Permissions / legacy role data).
        const inRequireRole = tabDef.requireRole.includes(userRole as UserRole);
        const screenAllowed = permissions[userRole]?.[tabDef.appScreen] === true;
        return inRequireRole || screenAllowed;
    };

    const [activeTab, setActiveTab] = useHashTab<string>(VALID_TABS, 'manage-users', 'fiinny-tab-admin', isTabAllowed);

    // Only show tabs the current role/permissions allow — mirrors the nav filter.
    const visibleTabs = ADMIN_TABS.filter(t => isTabAllowed(t.id));

    // Fallback: if the active tab is no longer in the visible set (e.g. because
    // Firestore permissions loaded after initial render), switch to the first
    // permitted tab. The `!window.location.hash` guard was intentionally removed —
    // a denied hash in the URL is exactly the case that needs correcting.
    useEffect(() => {
        if (visibleTabs.length > 0 && !visibleTabs.some(t => t.id === activeTab)) {
            setActiveTab(visibleTabs[0].id);
        }
    }, [visibleTabs, activeTab, setActiveTab]);

    const active = ADMIN_TABS.find(t => t.id === activeTab) ?? ADMIN_TABS[0];
    const ActiveComp = active.Comp;

    return (
        <div className="animate-fade-in" style={{ width: '100%', display: 'flex', gap: '1.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>

            {/* ── Sidebar Nav — same buttons/gating as before, laid out vertically.
                 Sticky under the app's top nav; wraps to a full-width horizontal
                 strip on narrow viewports instead of overflowing or hiding content. */}
            <div
                style={{
                    position: 'sticky',
                    top: '1rem',
                    zIndex: 50,
                    background: 'var(--surface-base)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.15rem',
                    border: '1px solid var(--surface-border)',
                    borderRadius: '12px',
                    padding: '0.6rem',
                    width: '220px',
                    flexShrink: 0,
                    maxHeight: 'calc(100vh - 2rem)',
                    overflowY: 'auto',
                }}
            >
                {visibleTabs.map(tab => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.6rem',
                                padding: '0.65rem 0.85rem',
                                background: isActive ? 'var(--surface-raised)' : 'transparent',
                                border: 'none',
                                borderLeft: isActive ? '2px solid var(--primary-light)' : '2px solid transparent',
                                borderRadius: '8px',
                                color: isActive ? 'var(--primary-light)' : 'var(--text-tertiary)',
                                fontWeight: isActive ? 700 : 400,
                                fontSize: '0.9rem',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                whiteSpace: 'nowrap',
                                textAlign: 'left',
                                width: '100%',
                                transition: 'color 0.15s ease, background 0.15s ease, border-color 0.15s ease',
                                flexShrink: 0,
                            }}
                            onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)'; }}
                            onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)'; }}
                        >
                            <span style={{ opacity: isActive ? 1 : 0.6, display: 'flex', flexShrink: 0 }}>{tab.icon}</span>
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* ── Tab Content — isTabAllowed gates every tab with the same plan +
                 requireRole logic as ProtectedRoute, so rendering directly avoids
                 the page-level <Navigate> a nested ProtectedRoute would fire. */}
            <div style={{ flex: '1 1 480px', minWidth: 0 }}>
                <ActiveComp />
            </div>
        </div>
    );
}
