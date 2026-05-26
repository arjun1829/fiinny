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

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [profileComplete, setProfileComplete] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/?view=login');
      } else {
        const profile = await getUserProfile(user.uid);
        const role = profile?.role;
        const isPaid = profile?.isPaid;

        // Track whether the user has ever saved their business profile
        setProfileComplete(profile?.profileComplete === true);

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

  const profileBanner = !profileComplete && !isOnProfilePage ? (
    <div className="bg-amber-50 px-4 py-2.5 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-amber-500 text-lg shrink-0">⚠</span>
        <p className="text-sm font-semibold text-amber-800 leading-snug">
          Your business profile is incomplete.{' '}
          <span className="font-normal text-amber-700">Add your business name, location, and contact details to activate your store.</span>
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
      <div className="flex-1 flex overflow-hidden">
        <DashboardShell banner={profileBanner}>{children}</DashboardShell>
      </div>
      <DashboardTour />
    </div>
  );
}
