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
import { useEffect, useState } from 'react';
import { Navbar } from '../../components/shared/navbar';
import Link from 'next/link';
import { ICONS } from '../constants';

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [profileIncomplete, setProfileIncomplete] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/?view=login');
      } else {
        const profile = await getUserProfile(user.uid);
        const role = profile?.role;
        const isPaid = profile?.isPaid;

        // Profile is considered complete if business name + phone + city are all set.
        // These are written to users/{phone} by saveManufacturerProfile / saveRetailerProfile.
        const hasBusinessName = !!String(profile?.businessName ?? "").trim();
        const hasPhone = !!String(profile?.phone ?? "").trim();
        const hasCity = !!String(profile?.city ?? "").trim();
        setProfileIncomplete(!hasBusinessName || !hasPhone || !hasCity);

        if (profile && (role === 'retailer' || role === 'manufacturer') && isPaid) {
          setLoading(false);
        } else if (role === 'retailer') {
          // Retailer not yet marked paid — try progressively cheaper checks:
          // 1. Auto-accept any pending phone-matched invites (sets isPaid:true via backfill).
          // 2. Grant access if already linked to an active manufacturer network.
          // 3. Direct seat check: has at least one active assigned seat listing (source of truth).
          //    This catches cases where steps 1/2 failed but the seat was already created.
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
      }
    });
    return () => unsubscribe();
  }, [router]);

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
      <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full mb-4" />
      <p className="font-bold text-primary">Verifying access...</p>
    </div>
  );

  const isOnProfilePage = pathname === '/dashboard/profile';

  const profileBanner = profileIncomplete && !isOnProfilePage ? (
    <div className="bg-amber-50 px-4 py-2.5 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-amber-500 text-lg shrink-0">⚠</span>
        <p className="text-sm font-semibold text-amber-800 leading-snug">
          Profile incomplete.{' '}
          <span className="font-normal text-amber-700">Add your business name, contact number, and location to complete your profile and generate your brand page.</span>
        </p>
      </div>
      <Link
        href="/dashboard/profile"
        className="shrink-0 bg-amber-500 hover:bg-amber-600 text-white text-xs font-black uppercase tracking-widest px-4 py-2 rounded-xl transition-colors whitespace-nowrap"
      >
        Complete Profile →
      </Link>
    </div>
  ) : null;

  return (
    <div className="min-h-screen flex flex-col" data-tour="dash-shell">
      <Navbar isDashboard={true} />
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
  );
}
