'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';

// Enforces mandatory profile completion (Full Name + Email) before a
// signed-in user can reach any other page. Sits once inside AuthProvider's
// tree (app/layout.tsx) rather than being duplicated into every page's own
// useRequireAuth() call — this is a second, independent check for the
// signed-in-but-incomplete case; signed-out gating is still entirely
// useRequireAuth()/LoginModal's job and is untouched by this component.
//
// Redirect only — never blocks render itself, matching the rest of this
// app's "effect-driven redirect" pattern (every useRequireAuth() call site
// works the same way: render normally, redirect from an effect once the
// relevant state is known). /profile/edit is the one exempt path, since
// that's where the user completes the profile that unblocks everything
// else — see ProfileEditForm's onboarding-mode conditional for the other
// half of this flow.
export function ProfileCompletionGuard({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user || !profile) return;
    if (!profile.profileCompleted && pathname !== '/profile/edit') {
      router.push('/profile/edit');
    }
  }, [loading, user, profile, pathname, router]);

  return <>{children}</>;
}
