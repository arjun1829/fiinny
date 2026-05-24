'use client';

import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, getUserProfile } from '../../firebase';
import { GuidedTour, TourStep } from '../../../components/helpers';

type Role = 'retailer' | 'manufacturer' | null;

const RETAILER_STEPS: TourStep[] = [
  { selector: '[data-tour="dash-shell"]', textKey: 'tourDashWelcome', side: 'auto' },
  { selector: '[data-tour-dash="overview"]', textKey: 'tourDashOverview', side: 'right' },
  { selector: '[data-tour-dash="analytics"]', textKey: 'tourDashAnalytics', side: 'right' },
  { selector: '[data-tour-dash="inventory"]', textKey: 'tourDashInventory', side: 'right' },
  { selector: '[data-tour-dash="subscription"]', textKey: 'tourDashSubscription', side: 'right' },
  { selector: '[data-tour-dash="orders"]', textKey: 'tourDashOrders', side: 'right' },
  { selector: '[data-tour-dash="reviews"]', textKey: 'tourDashReviews', side: 'right' },
  { selector: '[data-tour-dash="profile"]', textKey: 'tourDashProfile', side: 'right' },
  { selector: '[data-tour-dash="settings"]', textKey: 'tourDashSettings', side: 'right' },
];

const MANUFACTURER_STEPS: TourStep[] = [
  { selector: '[data-tour="dash-shell"]', textKey: 'tourDashWelcome', side: 'auto' },
  { selector: '[data-tour-dash="overview"]', textKey: 'tourDashOverview', side: 'right' },
  { selector: '[data-tour-dash="analytics"]', textKey: 'tourDashAnalytics', side: 'right' },
  { selector: '[data-tour-dash="inventory"]', textKey: 'tourDashInventory', side: 'right' },
  { selector: '[data-tour-dash="retailer-network"]', textKey: 'tourDashRetailerNetwork', side: 'right' },
  { selector: '[data-tour-dash="subscription"]', textKey: 'tourDashSubscription', side: 'right' },
  { selector: '[data-tour-dash="orders"]', textKey: 'tourDashOrders', side: 'right' },
  { selector: '[data-tour-dash="reviews"]', textKey: 'tourDashReviews', side: 'right' },
  { selector: '[data-tour-dash="profile"]', textKey: 'tourDashProfile', side: 'right' },
  { selector: '[data-tour-dash="settings"]', textKey: 'tourDashSettings', side: 'right' },
];

export function DashboardTour() {
  const [role, setRole] = useState<Role>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setRole(null);
        return;
      }
      try {
        const profile = await getUserProfile(user.uid);
        const r = profile?.role;
        setRole(r === 'manufacturer' || r === 'retailer' ? r : null);
      } catch {
        setRole(null);
      }
    });
    return () => unsub();
  }, []);

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
