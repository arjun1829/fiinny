'use client';

import { DashboardShell } from "./_components/dashboard-shell";
import { DashboardTour } from "./_components/dashboard-tour";
import { auth, getUserProfile } from '../firebase';
import { grantAccessIfManufacturerLinked } from '../lib/invite/invite-acceptance-service';
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
import { enterStaffSession } from './_lib/staff-session';
import { staffMayOpen } from '../lib/shop-team';

// sessionStorage key for the admin view UID — persists across within-tab navigation
const ADMIN_VIEW_KEY = 'kd_admin_view_uid';

// The upgrade/checkout route. An unpaid seller must be able to reach it (it is
// where they buy a plan), so it is exempted from both the paid-access guard and
// the profile-completion guard below.
const UPGRADE_PATH = '/dashboard/upgrade';

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [profileIncomplete, setProfileIncomplete] = useState(false);
  // True for an authenticated seller who hasn't paid and isn't invite-linked —
  // they may use /dashboard/upgrade to buy a plan but no other dashboard route.
  const [sellerNeedsUpgrade, setSellerNeedsUpgrade] = useState(false);
  const [uidState, setUidState] = useState<string | null>(null);
  // A shop helper whose access is paused, or whose shop's plan has lapsed.
  const [staffBlock, setStaffBlock] = useState<{ reason: 'paused' | 'unpaid'; ownerName: string } | null>(null);
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
      // "team" accounts (limited-access admin-portal staff) get the same
      // "view seller's dashboard" link as full admins in Users & Roles, but
      // only when they were actually granted that section — without this
      // check every team account fell through to the "normal user" branch
      // below (role is 'team', not 'admin', 'retailer', or 'manufacturer')
      // and got redirected to '/' instead of seeing the seller's dashboard.
      const adminSections = Array.isArray((profile as any)?.adminSections)
        ? (profile as any).adminSections as string[]
        : [];
      const isTeamWithUsersAccess = role === 'team' && adminSections.includes('users');
      console.debug('[AdminView] auth user uid:', user.uid, '| role:', role, '| adminViewUid:', adminViewUid);

      // ── Admin impersonation ───────────────────────────────────────────────
      if ((role === 'admin' || isTeamWithUsersAccess) && adminViewUid) {
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

      // ── Shop helper (app/lib/shop-team.ts) ────────────────────────────────
      // The shopStaff hint on their own profile means no extra read for anyone
      // else; /api/team/me is the authority (a removed helper gets "none").
      if (role !== 'retailer' && role !== 'manufacturer' && (profile as any)?.shopStaff) {
        const entry = await enterStaffSession(user).catch((e) => {
          console.error('[StaffView] could not enter staff mode:', e);
          return { kind: 'none' as const };
        });
        if (entry.kind === 'ok') {
          setEffectiveUser({
            uid: entry.ownerUid,
            profile: entry.ownerProfile,
            isAdminView: false,
            displayName: entry.session.ownerName,
            staff: entry.session,
          });
          setLoading(false);
          return;
        }
        if (entry.kind === 'blocked') {
          setStaffBlock({ reason: entry.reason, ownerName: entry.ownerName });
          setLoading(false);
          return;
        }
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

      const isSeller = role === 'retailer' || role === 'manufacturer';

      if (profile && isSeller && isPaid) {
        setSellerNeedsUpgrade(false);
        setLoading(false);
      } else if (isSeller) {
        // Unpaid retailer or manufacturer.
        //
        // P5: The dashboard only observes access state — invite acceptance and backfill
        // are handled exclusively by the signup/invite flow. grantAccessIfManufacturerLinked
        // is a lightweight read-only check that writes isPaid:true when the invite was
        // accepted but the flag hasn't propagated yet (race between backfill and redirect).
        // It applies to retailers only; a manufacturer is never granted via an invite link.
        const linked = role === 'retailer'
          ? await grantAccessIfManufacturerLinked(user.uid).catch(() => false)
          : false;

        // Access is decided REACTIVELY by the effect below, not here: an unpaid,
        // non-linked seller is confined to /dashboard/upgrade (where they buy a
        // plan) rather than bounced to the homepage. We still render the shell
        // (setLoading(false)) so the redirect effect — which keys off the live
        // pathname — can run; deciding it inline here would leave them stuck on
        // the spinner, since this guard never re-runs on client navigation.
        setSellerNeedsUpgrade(!linked);
        setLoading(false);
      } else {
        // Non-seller roles (farmer / customer / etc.) keep their existing restriction.
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

  // A helper only opens the pages their permissions cover (the rules enforce
  // it too; this just keeps them off pages that would fail to load).
  useEffect(() => {
    const staff = effectiveUser.staff;
    if (!loading && staff && pathname && !staffMayOpen(pathname, staff.permissions)) {
      router.replace('/dashboard');
    }
  }, [loading, effectiveUser.staff, pathname, router]);

  // Redirect incomplete profiles — skip in admin view
  useEffect(() => {
    if (
      !loading &&
      !effectiveUser.isAdminView &&
      profileIncomplete &&
      // An unpaid seller is steered to the upgrade page (below), not pushed
      // through profile completion first — a newly registered seller must be
      // able to buy a plan before filling in every field.
      !sellerNeedsUpgrade &&
      pathname !== '/dashboard/profile' &&
      // A paid seller with an incomplete profile may still open the upgrade page
      // to buy more seats, so it is exempt too — just like the profile page.
      pathname !== UPGRADE_PATH
    ) {
      router.push('/dashboard/profile');
    }
  }, [loading, profileIncomplete, sellerNeedsUpgrade, pathname, router, effectiveUser.isAdminView]);

  // Confine an unpaid seller to the upgrade page. From any other protected
  // dashboard route, send them to /dashboard/upgrade (where they buy a plan)
  // instead of the homepage. Reactive to the live pathname, and since the
  // upgrade page is the one exempt destination there is no redirect loop.
  useEffect(() => {
    if (!loading && sellerNeedsUpgrade && pathname !== UPGRADE_PATH) {
      router.replace(UPGRADE_PATH);
    }
  }, [loading, sellerNeedsUpgrade, pathname, router]);

  if (!loading && staffBlock) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6 text-center">
      <div className="max-w-md rounded-3xl border border-outline-variant/30 bg-white p-8 shadow-sm">
        <p className="text-xs font-black uppercase tracking-widest text-primary mb-2">{staffBlock.ownerName}</p>
        <h1 className="text-xl font-bold text-on-surface mb-2">
          {staffBlock.reason === 'paused' ? 'Your helper access is paused' : "This shop's plan isn't active"}
        </h1>
        <p className="text-sm text-on-surface-variant mb-6">
          {staffBlock.reason === 'paused'
            ? 'The shop owner has paused your access. Ask them to turn it back on from Dashboard → Team.'
            : 'The shop dashboard opens again once the owner renews their KrishiDukan plan.'}
        </p>
        <Link href="/" className="inline-block rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white">Go to home</Link>
      </div>
    </div>
  );

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
