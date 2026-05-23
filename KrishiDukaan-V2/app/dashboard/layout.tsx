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
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Navbar } from '../../components/shared/navbar';

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/?view=login');
      } else {
        const profile = await getUserProfile(user.uid);
        const role = profile?.role;
        const isPaid = profile?.isPaid;

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

  return (
    <div className="min-h-screen flex flex-col" data-tour="dash-shell">
      <Navbar isDashboard={true} />
      <div className="flex-1 flex overflow-hidden">
        <DashboardShell>{children}</DashboardShell>
      </div>
      <DashboardTour />
    </div>
  );
}
