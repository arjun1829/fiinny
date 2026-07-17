'use client';

import { useMemo } from 'react';
import { GuidedTour, TourStep } from '../../../components/helpers';
import { useEffectiveUser } from '../_context/effective-user-context';

type Role = 'retailer' | 'manufacturer' | null;

const MOBILE_BREAKPOINT = 768; // matches Tailwind `md`

/**
 * On mobile the sidebar is an off-canvas drawer, so its links are hidden until
 * the drawer is opened. Before a sidebar-targeting step shows, open the drawer
 * by triggering the existing hamburger toggle. No-op on desktop (the toggle is
 * `md:hidden`) so desktop behavior is unchanged.
 */
function isDrawerOpen() {
  // The off-canvas drawer is `-translate-x-full` when closed: it keeps a
  // non-zero width but sits off-screen (negative left). So detect "open" by
  // whether a sidebar link is actually within the horizontal viewport, not by
  // width alone.
  const sample = document.querySelector('[data-tour-dash="overview"]') as HTMLElement | null;
  if (!sample) return false;
  const r = sample.getBoundingClientRect();
  return r.width > 0 && r.right > 0 && r.left < window.innerWidth;
}

function openMobileDrawer() {
  if (typeof window === 'undefined' || window.innerWidth >= MOBILE_BREAKPOINT) return;
  if (isDrawerOpen()) return; // already open — don't toggle it shut
  const toggle = document.querySelector('[data-dash-menu-toggle]') as HTMLElement | null;
  toggle?.click();
}

/** Sidebar steps use `side: 'right'` on desktop; the shared tour engine adapts
 *  to vertical placement on mobile. `beforeShow` ensures the drawer is open. */
const sidebarStep = (
  selector: string,
  textKey: TourStep['textKey'],
): TourStep => ({ selector, textKey, side: 'right', beforeShow: openMobileDrawer });

const RETAILER_STEPS: TourStep[] = [
  { selector: '[data-tour="dash-shell"]', textKey: 'tourDashWelcome', side: 'auto' },
  sidebarStep('[data-tour-dash="overview"]', 'tourDashOverview'),
  sidebarStep('[data-tour-dash="analytics"]', 'tourDashAnalytics'),
  sidebarStep('[data-tour-dash="inventory"]', 'tourDashInventory'),
  sidebarStep('[data-tour-dash="subscription"]', 'tourDashSubscription'),
  sidebarStep('[data-tour-dash="orders"]', 'tourDashOrders'),
  sidebarStep('[data-tour-dash="reviews"]', 'tourDashReviews'),
  sidebarStep('[data-tour-dash="profile"]', 'tourDashProfile'),
  sidebarStep('[data-tour-dash="settings"]', 'tourDashSettings'),
];

const MANUFACTURER_STEPS: TourStep[] = [
  { selector: '[data-tour="dash-shell"]', textKey: 'tourDashWelcome', side: 'auto' },
  sidebarStep('[data-tour-dash="overview"]', 'tourDashOverview'),
  sidebarStep('[data-tour-dash="analytics"]', 'tourDashAnalytics'),
  sidebarStep('[data-tour-dash="inventory"]', 'tourDashInventory'),
  sidebarStep('[data-tour-dash="retailer-network"]', 'tourDashRetailerNetwork'),
  sidebarStep('[data-tour-dash="subscription"]', 'tourDashSubscription'),
  sidebarStep('[data-tour-dash="orders"]', 'tourDashOrders'),
  sidebarStep('[data-tour-dash="reviews"]', 'tourDashReviews'),
  sidebarStep('[data-tour-dash="profile"]', 'tourDashProfile'),
  sidebarStep('[data-tour-dash="settings"]', 'tourDashSettings'),
];

export function DashboardTour() {
  const { profile: effectiveProfile, isAdminView } = useEffectiveUser();
  const r = effectiveProfile?.role;
  const role: Role = !isAdminView && (r === 'manufacturer' || r === 'retailer') ? r : null;

  const steps = useMemo(() => {
    if (role === 'manufacturer') return MANUFACTURER_STEPS;
    if (role === 'retailer') return RETAILER_STEPS;
    return null;
  }, [role]);

  const storageKey =
    role === 'manufacturer'
      ? 'kd_dash_manufacturer_onboarding_complete'
      : role === 'retailer'
      ? 'kd_dash_retailer_onboarding_complete'
      : 'kd_dash_onboarding_complete';

  if (!steps) return null;

  return <GuidedTour steps={steps} storageKey={storageKey} startDelay={900} />;
}

export default DashboardTour;
