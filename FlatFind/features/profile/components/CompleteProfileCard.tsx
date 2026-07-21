'use client';

import Link from 'next/link';
import { Button } from '@/components/ui';
import type { UserProfile } from '@/types/user';

interface CompleteProfileCardProps {
  profile: UserProfile;
}

// New in Phase 14 (User Profile Management) — shown at the top of the
// account column only while profile.profileCompleted is false (computed by
// profile-firestore.ts's isProfileComplete: fullName + email both present).
// Disappears automatically the moment those two fields are saved, since
// ProfilePage re-renders from the same `profile` object this reads —
// no separate dismiss/hide state to manage.
export function CompleteProfileCard({ profile }: CompleteProfileCardProps) {
  const missing: string[] = [];
  if (!profile.fullName?.trim()) missing.push('full name');
  if (!profile.email?.trim()) missing.push('email address');

  return (
    <div className="mb-8 rounded-r2 border-[1.5px] border-brand/30 bg-brand-light/50 p-5 shadow-card">
      <div className="mb-3 flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand text-lg text-white">
          ✨
        </div>
        <div>
          <div className="font-display text-[16px] font-bold text-ink">Complete your profile</div>
          <p className="mt-[3px] text-[13px] text-ink-2/80">
            Add your {missing.join(' and ')} so listing owners and admins know who they&apos;re dealing with.
          </p>
        </div>
      </div>
      <Link href="/profile/edit">
        <Button variant="brand" className="w-full py-[11px] text-[13.5px] shadow-sm">
          Complete Profile
        </Button>
      </Link>
    </div>
  );
}
