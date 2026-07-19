import { Link, useLocation } from 'react-router-dom';
import { Home, BarChart3, Layers, ReceiptText, Activity, FileText, ClipboardList, Package, ShieldAlert, Calculator, BookOpen } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import type { AppScreen } from '../contexts/AuthContext';

const PRIORITY_NAV = [
  { path: '/dashboard',        label: 'B2B Dashboard',    icon: <Home size={15} />,           screenKey: 'dashboard' as AppScreen },
  { path: '/b2c-dashboard',    label: 'B2C Dashboard',    icon: <BarChart3 size={15} />,      screenKey: 'b2c_dashboard' as AppScreen },
  { path: '/analytics',        label: 'Analytics',        icon: <Layers size={15} />,         screenKey: 'analytics' as AppScreen },
  { path: '/worklist',         label: 'Worklist',          icon: <ReceiptText size={15} />,    screenKey: 'worklist' as AppScreen },
  { path: '/pos',              label: 'POS Billing',       icon: <Calculator size={15} />,     screenKey: 'pos' as AppScreen },
  { path: '/digital-khata',    label: 'Khata (Udhari)',   icon: <BookOpen size={15} />,       screenKey: 'worklist' as AppScreen },
  { path: '/supplier-ledger', label: 'Supplier Ledger',   icon: <ClipboardList size={15} />,  screenKey: 'worklist' as AppScreen },
  { path: '/inventory',        label: 'Inventory',         icon: <Package size={15} />,        screenKey: 'inventory' as AppScreen },
  { path: '/administration',   label: 'Administration',    icon: <ShieldAlert size={15} />,    screenKey: 'admin' as AppScreen },
  { path: '/b2b-invoice',      label: 'B2B GST Invoice', icon: <ReceiptText size={15} />,   screenKey: 'worklist' as AppScreen },
  { path: '/barcode',          label: 'Barcode Labels',    icon: <Activity size={15} />,       screenKey: 'inventory' as AppScreen },
  { path: '/gst-reports',      label: 'GST Reports',      icon: <FileText size={15} />,       screenKey: 'analytics' as AppScreen },
  { path: '/order-history',    label: 'Audit Log',        icon: <ClipboardList size={15} />,  screenKey: 'order_history' as AppScreen },
];

const SALES_NAV_PATHS = ['/worklist'];

export default function HorizontalNavbar() {
  const location = useLocation();
  const { userRole, permissions } = useAuth();

  const isOwner = userRole === 'admin' || userRole === 'analyst';
  const isSalesUser = userRole === 'sales';
  if (!isOwner && !isSalesUser) return null;

  const visibleItems = PRIORITY_NAV.filter(item => {
    if (!userRole || !permissions) return false;
    if (isSalesUser) return SALES_NAV_PATHS.includes(item.path);
    if (permissions[userRole] && !permissions[userRole][item.screenKey]) return false;
    return true;
  });

  if (visibleItems.length === 0) return null;

  return (
    <nav
  aria-label="Priority navigation"
  style={{
    position: 'sticky',
    top: 0,
    zIndex: 100,
    display: 'flex',
    alignItems: 'center',
    gap: '0.125rem',
    padding: '0 1rem',
    background: 'var(--surface-base)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderBottom: '1px solid var(--surface-border)',
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)',
    overflowX: 'auto',
    scrollbarWidth: 'none',
    flexShrink: 0,
  }}
>
      {visibleItems.map(item => {
        const active =
          location.pathname === item.path ||
          (item.path !== '/' && location.pathname.startsWith(item.path + '/'));
        return (
          <Link
            key={item.path}
            to={item.path}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              padding: '0.625rem 0.875rem',
              color: active ? 'var(--primary-light)' : 'var(--text-tertiary)',
              textDecoration: 'none',
              fontSize: '0.84rem',
              fontWeight: active ? 600 : 400,
              borderBottom: `2px solid ${active ? 'var(--primary-light)' : 'transparent'}`,
              whiteSpace: 'nowrap',
              transition: 'color var(--transition-fast), border-color var(--transition-fast)',
            }}
            onMouseEnter={e => {
              if (!active) (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-primary)';
            }}
            onMouseLeave={e => {
              if (!active) (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-tertiary)';
            }}
          >
            <span style={{ opacity: active ? 1 : 0.7, display: 'flex' }}>{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
