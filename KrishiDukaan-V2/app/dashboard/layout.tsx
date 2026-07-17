'use client';

import { DashboardShell } from "./_components/dashboard-shell";
import { DashboardTour } from "./_components/dashboard-tour";
import { auth, getUserProfile } from '../firebase';
import {
  autoAcceptPendingInvitesForPhone,
  grantAccessIfManufacturerLinked,
  grantAccessIfHasActiveSeat,
} from '../lib/invite/invite-acceptance-service';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter, usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Navbar } from '../../components/shared/navbar';
import Link from 'next/link';
import { ICONS } from '../constants';
import {
  getCachedLocation,
  getUserLocation,
  DEFAULT_LOCATION_LABEL,
  type GeoResult,
} from '../utils/geolocation';
import {
  EffectiveUserContext,
  type EffectiveUser,
} from './_context/effective-user-context';

// sessionStorage key for the admin view UID — persists across within-tab navigation
const ADMIN_VIEW_KEY = 'kd_admin_view_uid';

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [profileIncomplete, setProfileIncomplete] = useState(false);
  const [uidState, setUidState] = useState<string | null>(null);
  const prevPathnameRef = useRef<string>(pathname ?? '');

  const [effectiveUser, setEffectiveUser] = useState<EffectiveUser>({
    uid: null,
    profile: null,
    isAdminView: false,
    displayName: '',
  });

  // Holds the admin-view UID in a stable ref so the auth guard never re-runs
  // when the URL changes (sidebar navigation drops ?adminView from the URL).
  const adminViewUidRef = useRef<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  // Seed adminViewUid from the URL param on first load, then persist in
  // sessionStorage so it survives within-tab navigation (which drops the param).
  useEffect(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get('adminView');
      if (fromUrl) {
        sessionStorage.setItem(ADMIN_VIEW_KEY, fromUrl);
        adminViewUidRef.current = fromUrl;
        // Clean the param from the URL so it doesn't linger in browser history
        window.history.replaceState(null, '', window.location.pathname);
        console.debug('[AdminView] init from URL param:', fromUrl);
      } else {
        const stored = sessionStorage.getItem(ADMIN_VIEW_KEY);
        adminViewUidRef.current = stored ?? null;
        console.debug('[AdminView] init from sessionStorage:', stored);
      }
    } catch {
      // sessionStorage unavailable (private browsing edge case) — ignore
    }
    setAuthReady(true);
  }, []); // mount only — never re-runs on navigation

  const [locationQuery, setLocationQuery] = useState<string>(DEFAULT_LOCATION_LABEL);
  useEffect(() => {
    const cached = getCachedLocation();
    if (cached) setLocationQuery(cached.label);
    void getUserLocation().then((result: GeoResult) => setLocationQuery(result.label));
  }, []);

  const applyCompletion = useCallback((profile: any) => {
    const hasBusinessName = !!String(profile?.businessName ?? profile?.shopName ?? '').trim();
    const hasOwnerName    = !!String(profile?.ownerName ?? '').trim();
    const hasCity         = !!String(profile?.city ?? '').trim();
    setProfileIncomplete(!hasBusinessName || !hasOwnerName || !hasCity);
  }, []);

  // Auth guard — runs only after adminViewUid is resolved from storage (authReady).
  // adminViewUidRef is intentionally NOT in the deps so navigation never re-triggers
  // the guard and drops admin context.
  useEffect(() => {
    if (!authReady) return;

    // Capture the stable ref value into a local so the closure always has it
    const adminViewUid = adminViewUidRef.current;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/?view=login');
        return;
      }
      setUidState(user.uid);
      const profile = await getUserProfile(user.uid);
      const role = profile?.role;
      console.debug('[AdminView] auth user uid:', user.uid, '| role:', role, '| adminViewUid:', adminViewUid);

      // ── Admin impersonation ───────────────────────────────────────────────
      if (role === 'admin' && adminViewUid) {
        console.debug('[AdminView] entering admin path, loading target profile for:', adminViewUid);
        const targetProfile = await getUserProfile(adminViewUid).catch((e) => {
          console.error('[AdminView] getUserProfile threw:', e);
          return null;
        });
        console.debug('[AdminView] targetProfile:', targetProfile);

        // Prefer the target's real Firebase Auth UID (if they've ever logged in) over
        // the phone-number key that was passed in the URL. Data-fetching functions
        // resolve phone via uidIndex/{uid}, so using the real UID makes that lookup work.
        // Falls back to adminViewUid (the phone) for admin-created users with uid: null.
        const targetUid = (targetProfile as any)?.uid || adminViewUid;

        const name =
          (targetProfile as any)?.shopName ||
          (targetProfile as any)?.businessName ||
          (targetProfile as any)?.name ||
          adminViewUid;
        setEffectiveUser({
          uid: targetUid,
          profile: targetProfile,
          isAdminView: true,
          displayName: name,
        });
        console.debug('[AdminView] effectiveUser set → uid:', targetUid, '| profile null?', targetProfile === null);
        setLoading(false);
        return;
      }

      // ── Normal user ───────────────────────────────────────────────────────
      const isPaid = profile?.isPaid;
      applyCompletion(profile);
      setEffectiveUser({
        uid: user.uid,
        profile,
        isAdminView: false,
        displayName:
          (profile as any)?.shopName ||
          (profile as any)?.businessName ||
          (profile as any)?.name ||
          '',
      });

      if (profile && (role === 'retailer' || role === 'manufacturer') && isPaid) {
        setLoading(false);
      } else if (role === 'retailer') {
        const accepted = await autoAcceptPendingInvitesForPhone(user.uid).catch(() => false);
        if (accepted) {
          setLoading(false);
        } else {
          const linked = await grantAccessIfManufacturerLinked(user.uid).catch(() => false);
          if (linked) {
            setLoading(false);
          } else {
            const hasSeat = await grantAccessIfHasActiveSeat(user.uid).catch(() => false);
            if (hasSeat) {
              setLoading(false);
            } else {
              router.push('/');
            }
          }
        }
      } else {
        router.push('/');
      }
    });
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, router, applyCompletion]);
  // ^ adminViewUidRef.current is deliberately excluded — it's set before authReady
  //   fires and never changes thereafter, so it's safe to read from closure.

  // Re-check profile completion when navigating away from profile page
  useEffect(() => {
    const prev = prevPathnameRef.current;
    prevPathnameRef.current = pathname ?? '';
    if (prev === '/dashboard/profile' && pathname !== '/dashboard/profile' && uidState && !effectiveUser.isAdminView) {
      getUserProfile(uidState).then(applyCompletion).catch(() => {});
    }
  }, [pathname, uidState, applyCompletion, effectiveUser.isAdminView]);

  // Redirect incomplete profiles — skip in admin view
  useEffect(() => {
    if (!loading && !effectiveUser.isAdminView && profileIncomplete && pathname !== '/dashboard/profile') {
      router.push('/dashboard/profile');
    }
  }, [loading, profileIncomplete, pathname, router, effectiveUser.isAdminView]);

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
      <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full mb-4" />
      <p className="font-bold text-primary">Verifying access...</p>
    </div>
  );

  const isOnProfilePage = pathname === '/dashboard/profile';
  const profileBanner = !effectiveUser.isAdminView && profileIncomplete && isOnProfilePage ? (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-center gap-2.5">
      <span className="text-amber-500 text-lg shrink-0">⚠</span>
      <p className="text-sm font-semibold text-amber-800 leading-snug">
        Complete your profile to continue using the dashboard.{' '}
        <span className="font-normal text-amber-700">Required: Business Name and Location.</span>
      </p>
    </div>
  ) : null;

  return (
    <EffectiveUserContext.Provider value={effectiveUser}>
      <div className="min-h-screen flex flex-col" data-tour="dash-shell">
        <Navbar
          isDashboard={true}
          locationQuery={locationQuery}
          onLocationChange={(loc) => setLocationQuery(loc)}
        />
        <div className="flex-1 flex overflow-hidden pb-16 md:pb-0">
          <DashboardShell banner={profileBanner}>{children}</DashboardShell>
        </div>
        <DashboardTour />

        {/* Bottom nav — mobile only */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-surface-container bg-white/95 px-3 py-2 shadow-[0_-6px_20px_rgba(0,0,0,0.06)] backdrop-blur md:hidden">
          <div className="grid grid-cols-5 gap-2">
            {([
              { key: 'home',      icon: ICONS.Home,      label: 'Home',      href: '/' },
              { key: 'market',    icon: ICONS.Market,    label: 'Market',    href: '/?view=market' },
              { key: 'hub',       icon: ICONS.Hub,       label: 'Hub',       href: '/?view=hub' },
              { key: 'map',       icon: ICONS.Location,  label: 'Stores',    href: '/?view=map' },
              { key: 'dashboard', icon: ICONS.Dashboard, label: 'Dashboard', href: '/dashboard' },
            ] as { key: string; icon: React.ElementType; label: string; href: string }[]).map((item) => {
              const isActive = item.key === 'dashboard';
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`relative flex h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 transition-all ${
                    isActive
                      ? 'bg-primary/10 text-primary shadow-sm'
                      : 'text-on-surface-variant hover:bg-surface-container-low'
                  }`}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  <span className="truncate text-[9px] font-bold uppercase tracking-wide">{item.label}</span>
                  {isActive && (
                    <span className="absolute inset-0 -z-10 rounded-2xl border border-primary/15 bg-primary/10" />
                  )}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </EffectiveUserContext.Provider>
  );
}
