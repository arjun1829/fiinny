import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Home, BarChart3, Layers, ReceiptText, Activity, FileText, ClipboardList,
  Package, Calculator, Target, Receipt, ChevronLeft,
  ChevronRight, HelpCircle, Settings, RotateCcw, TrendingUp,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import type { AppScreen } from '../contexts/AuthContext';
import { useFeaturePermissions } from '../hooks/useFeaturePermissions';
import { navFeatureGroupForPath, isFeatureGroupAllowed } from '../utils/subscriptionCatalog';

type NavItem = { path: string; label: string; icon: React.ReactNode; screenKey: AppScreen; exact?: boolean };

// ── Main business nav ─────────────────────────────────────────────────────────
// NOTE: Customers, Order History, Khata (Udhari) and B2B GST Invoice were removed
// from the horizontal navbar — they remain reachable via their own routes / the
// POS sub-navigation. Their routes and functionality are untouched.
const PRIORITY_NAV: NavItem[] = [
  { path: '/reports',         label: 'Reports',           icon: <FileText size={15} />,      screenKey: 'analytics' },
  { path: '/dashboard',       label: 'B2B Dashboard',   icon: <Home size={15} />,          screenKey: 'dashboard' },
  { path: '/b2c-dashboard',   label: 'B2C Dashboard',   icon: <BarChart3 size={15} />,     screenKey: 'b2c_dashboard' },
  { path: '/analytics',       label: 'Analytics',        icon: <Layers size={15} />,        screenKey: 'analytics' },
  { path: '/worklist',        label: 'Worklist',          icon: <ReceiptText size={15} />,   screenKey: 'worklist' },
  { path: '/pos',             label: 'POS Billing',       icon: <Calculator size={15} />,    screenKey: 'pos' },
  { path: '/admin',           label: 'Admin',             icon: <Settings size={15} />,      screenKey: 'admin' },
  { path: '/supplier-ledger', label: 'Supplier Ledger',  icon: <ClipboardList size={15} />, screenKey: 'worklist' },
  { path: '/inventory',       label: 'Inventory',         icon: <Package size={15} />,       screenKey: 'inventory' },
  { path: '/team-performance', label: 'Team Performance', icon: <TrendingUp size={15} />,   screenKey: 'admin' },
  { path: '/sales-targets',   label: 'Sales Targets',    icon: <Target size={15} />,        screenKey: 'worklist' },
  { path: '/expenses',        label: 'Expenses',          icon: <Receipt size={15} />,       screenKey: 'expenses' },
  { path: '/barcode',         label: 'Barcode Labels',   icon: <Activity size={15} />,      screenKey: 'inventory' },
  { path: '/help',            label: 'Help Center',       icon: <HelpCircle size={15} />,    screenKey: 'settings' },
];

// Feature-permission id per navbar tab (Super Admin → Feature Permissions → Main
// Navbar). Only the tabs exposed in that matrix appear here; the rest are always
// governed solely by module-level role permissions.
const NAV_PERM: Record<string, string> = {
  '/dashboard':       'navbar.dashboard.view',
  '/b2c-dashboard':   'navbar.b2cDashboard.view',
  '/analytics':       'navbar.analytics.view',
  '/worklist':        'navbar.worklist.view',
  '/pos':             'navbar.pos.view',
  '/supplier-ledger': 'navbar.supplierLedger.view',
  '/inventory':       'navbar.inventory.view',
  '/team-performance': 'navbar.teamPerformance.view',
  '/reports':         'navbar.reports.view',
  '/expenses':        'navbar.expenses.view',
  '/barcode':         'navbar.barcode.view',
  '/help':            'navbar.help.view',
};

// Admin sub-tabs are no longer separate routes — they render in-page at
// /admin#<tab> (see AdminHubPage). The navbar keeps a single "Admin" entry.

// Sales keeps its own minimal workspace nav (distinct from the owner navbar).
const SALES_NAV_PATHS = ['/sales-targets', '/worklist', '/help'];
const SCROLL_STEP = 220;

const DEFAULT_ORDER = PRIORITY_NAV.map(i => i.path);
const LS_ORDER = (tid: string) => `fiinny_navbar_order_${tid}`;

// Merge a persisted path order with the canonical list: keep valid saved paths in
// their saved sequence, and slot any new/missing paths back at their default index.
function mergeOrder(saved: string[]): string[] {
  const valid = saved.filter(p => DEFAULT_ORDER.includes(p));
  const missing = DEFAULT_ORDER.filter(p => !valid.includes(p));
  if (missing.length === 0) return valid;
  const canonicalIndex = new Map(DEFAULT_ORDER.map((p, i) => [p, i]));
  const result = [...valid];
  for (const p of missing) {
    const pIdx = canonicalIndex.get(p)!;
    let insertAt = result.length;
    for (let i = 0; i < result.length; i++) {
      if (canonicalIndex.get(result[i])! > pIdx) { insertAt = i; break; }
    }
    result.splice(insertAt, 0, p);
  }
  return result;
}

export default function HorizontalNavbar() {
  const location = useLocation();
  const { userRole, permissions, tenantId, hasPlanScreen, planEntitlements } = useAuth();
  const can = useFeaturePermissions();

  // Subscription gate — a nav item is visible only if the tenant's plan includes
  // the module (screen) and its feature group (for screen-sharing/screenless ones).
  const planAllowsNav = (path: string, screenKey: AppScreen): boolean => {
    if (!hasPlanScreen(screenKey)) return false;
    const grp = navFeatureGroupForPath(path);
    return !grp || isFeatureGroupAllowed(grp, planEntitlements);
  };
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // ── Custom tab order (drag-to-reorder, persisted per tenant) ────────────────
  const [order, setOrder] = useState<string[]>(DEFAULT_ORDER);
  const [orderLoaded, setOrderLoaded] = useState(false);
  const [dragFrom, setDragFrom] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  // Load persisted order once the tenant is known.
  useEffect(() => {
    if (!tenantId) return;
    try {
      const raw = localStorage.getItem(LS_ORDER(tenantId));
      setOrder(raw ? mergeOrder(JSON.parse(raw)) : DEFAULT_ORDER);
    } catch {
      setOrder(DEFAULT_ORDER);
    }
    setOrderLoaded(true);
  }, [tenantId]);

  // Persist on change (after the initial load).
  useEffect(() => {
    if (!tenantId || !orderLoaded) return;
    try { localStorage.setItem(LS_ORDER(tenantId), JSON.stringify(order)); } catch {}
  }, [order, tenantId, orderLoaded]);

  // Close the context menu on Escape.
  useEffect(() => {
    if (!ctxMenu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCtxMenu(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctxMenu]);

  const isOwner = userRole === 'admin' || userRole === 'analyst';
  const isSalesUser = userRole === 'sales';

  // Reorder PRIORITY_NAV by the saved order, then apply role + feature-permission
  // visibility filters.
  const orderedNav = useMemo(() => {
    const byPath = new Map(PRIORITY_NAV.map(i => [i.path, i]));
    return order.map(p => byPath.get(p)).filter((i): i is NavItem => !!i);
  }, [order]);

  const visibleItems = (isOwner || isSalesUser) ? orderedNav.filter(item => {
    if (!userRole || !permissions) return false;

    // Subscription gate first — hidden if the tenant's plan excludes this module
    // (or its feature group). Applies to every role, mirrors the route + drawer.
    if (!planAllowsNav(item.path, item.screenKey)) return false;

    // Sales keeps its own minimal workspace nav.
    if (isSalesUser) return SALES_NAV_PATHS.includes(item.path);

    // Admin tab has no Main Navbar Feature Matrix toggle — it is governed solely
    // by the module-level 'admin' role permission, so it stays admin-only.
    if (item.path === '/admin') return !!permissions[userRole]?.admin;

    // Owner roles (admin + analyst): navbar visibility is driven SOLELY by the
    // centralized Main Navbar Feature Matrix — no hardcoded per-role list and no
    // module-permission dependency. Admin bypasses the feature check via
    // useFeaturePermissions (always full access). Any nav item not present in the
    // matrix (e.g. the sales-only /sales-targets) never appears in the owner nav.
    const perm = NAV_PERM[item.path];
    if (!perm) return false;
    return can(perm);
  }) : [];

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', checkScroll); ro.disconnect(); };
  }, [checkScroll, visibleItems.length]);

  if (!isOwner && !isSalesUser) return null;
  if (visibleItems.length === 0) return null;

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'right' ? SCROLL_STEP : -SCROLL_STEP, behavior: 'smooth' });
  };

  // Move `from` to sit at `to`'s position within the full saved order.
  const reorder = (from: string, to: string) => {
    if (from === to) return;
    setOrder(prev => {
      const next = [...prev];
      const fi = next.indexOf(from);
      const ti = next.indexOf(to);
      if (fi < 0 || ti < 0) return prev;
      next.splice(fi, 1);
      next.splice(ti, 0, from);
      return next;
    });
  };

  const resetOrder = () => { setOrder([...DEFAULT_ORDER]); setCtxMenu(null); };

  const arrowBtn = (dir: 'left' | 'right', enabled: boolean) => (
    <button
      aria-label={dir === 'left' ? 'Scroll left' : 'Scroll right'}
      onClick={() => scroll(dir)}
      style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '28px',
        height: '100%',
        minHeight: '38px',
        background: 'none',
        border: 'none',
        cursor: enabled ? 'pointer' : 'default',
        color: enabled ? 'var(--text-secondary)' : 'transparent',
        pointerEvents: enabled ? 'auto' : 'none',
        transition: 'color 0.15s',
        padding: 0,
        zIndex: 1,
      }}
      onMouseEnter={e => { if (enabled) e.currentTarget.style.color = 'var(--primary-light)'; }}
      onMouseLeave={e => { if (enabled) e.currentTarget.style.color = 'var(--text-secondary)'; }}
    >
      {dir === 'left' ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
    </button>
  );

  return (
    <nav
      aria-label="Priority navigation"
      onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY }); }}
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        background: 'var(--surface-base)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--surface-border)',
        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)',
        flexShrink: 0,
      }}
    >
      {/* Left arrow */}
      {arrowBtn('left', canScrollLeft)}

      {/* Scrollable link strip */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: '0.125rem',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          padding: '0 0.25rem',
        }}
      >
        {visibleItems.map(item => {
          const active = item.exact
            ? location.pathname === item.path
            : location.pathname === item.path ||
              (item.path !== '/' && location.pathname.startsWith(item.path + '/'));
          const isDragTarget = dragOver === item.path && dragFrom !== item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              draggable
              onDragStart={e => { setDragFrom(item.path); e.dataTransfer.effectAllowed = 'move'; }}
              onDragOver={e => { e.preventDefault(); if (item.path !== dragFrom) setDragOver(item.path); }}
              onDragLeave={() => setDragOver(prev => (prev === item.path ? null : prev))}
              onDrop={e => { e.preventDefault(); if (dragFrom) reorder(dragFrom, item.path); setDragFrom(null); setDragOver(null); }}
              onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
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
                cursor: dragFrom ? 'grabbing' : 'pointer',
                opacity: dragFrom === item.path ? 0.4 : 1,
                boxShadow: isDragTarget ? 'inset 2px 0 0 var(--primary-light)' : 'none',
                transition: 'color var(--transition-fast), border-color var(--transition-fast)',
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-primary)'; }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-tertiary)'; }}
            >
              <span style={{ opacity: active ? 1 : 0.7, display: 'flex' }}>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </div>

      {/* Right arrow */}
      {arrowBtn('right', canScrollRight)}

      {/* Right-click context menu — Reset Order (Google-Sheets-style) */}
      {ctxMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 5000 }} onMouseDown={() => setCtxMenu(null)} onContextMenu={e => { e.preventDefault(); setCtxMenu(null); }} />
          <div role="menu"
            style={{ position: 'fixed', top: Math.min(ctxMenu.y, window.innerHeight - 90), left: Math.min(ctxMenu.x, window.innerWidth - 210), zIndex: 5001, minWidth: '190px', background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderRadius: '10px', padding: '0.35rem', boxShadow: '0 12px 40px rgba(0,0,0,0.22)' }}
            onMouseDown={e => e.stopPropagation()}>
            <div style={{ padding: '0.25rem 0.6rem 0.4rem', fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 600, borderBottom: '1px solid var(--surface-border)', marginBottom: '0.25rem' }}>
              Navbar
            </div>
            <button onClick={resetOrder}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem 0.6rem', borderRadius: '6px', fontSize: '0.82rem', color: 'var(--text-primary)', font: 'inherit' }}>
              <RotateCcw size={14} /> Reset Order
            </button>
          </div>
        </>
      )}
    </nav>
  );
}
