'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '../../firebase';
import { useEffectiveUser } from '../_context/effective-user-context';
import SubscriptionView from '../../views/SubscriptionView';

export default function UpgradePage() {
  const router = useRouter();
  const { uid: effectiveUid, profile: effectiveProfile } = useEffectiveUser();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (effectiveUid && effectiveProfile) {
      setLoading(false);
    }
  }, [effectiveUid, effectiveProfile]);

  const handleSuccess = () => {
    router.push('/dashboard/profile');
  };

  const handleLogout = async () => {
    await auth.signOut();
    router.push('/');
  };

  if (loading || !effectiveUid) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="py-8">
      <SubscriptionView
        user={{ uid: effectiveUid }}
        role={effectiveProfile?.role || 'retailer'}
        onSuccess={handleSuccess}
        onLogout={handleLogout}
      />
    </div>
  );
}
