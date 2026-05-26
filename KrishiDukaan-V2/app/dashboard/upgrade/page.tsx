'use client';

import { useEffect, useState } from 'react';
import { auth, getUserProfile } from '../../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import SubscriptionView from '../../views/SubscriptionView';

export default function UpgradePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        const p = await getUserProfile(u.uid);
        setProfile(p);
        setLoading(false);
      } else {
        router.push('/');
      }
    });
    return () => unsubscribe();
  }, [router]);

  const handleSuccess = () => {
    router.push('/dashboard/profile');
  };

  const handleLogout = async () => {
    await auth.signOut();
    router.push('/');
  };

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="py-8">
      <SubscriptionView 
        user={user} 
        role={profile?.role || 'retailer'} 
        onSuccess={handleSuccess} 
        onLogout={handleLogout} 
      />
    </div>
  );
}
