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
    // SubscriptionView only invokes this after the payment has been verified and
    // the subscription activated (the paymentLogged guard), so this is a trusted
    // success. The one-time success state it wrote is read by /success.
    router.push('/success');
  };

  const handleLogout = async () => {
    await auth.signOut();
    router.push('/');
  };

  const role = effectiveProfile?.role;
  const canSubscribe = role === 'retailer' || role === 'manufacturer';

  // Only retailers and manufacturers have a plan to buy. The old `role || 'retailer'`
  // fallback meant a farmer — or a profile whose role had not loaded — was shown the
  // retailer pitch, because SubscriptionView reads any non-manufacturer role as retailer.
  useEffect(() => {
    if (!loading && effectiveUid && !canSubscribe) {
      router.replace('/dashboard');
    }
  }, [loading, effectiveUid, canSubscribe, router]);

  if (loading || !effectiveUid || !canSubscribe) {
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
        role={role}
        onSuccess={handleSuccess}
        onLogout={handleLogout}
      />
    </div>
  );
}
