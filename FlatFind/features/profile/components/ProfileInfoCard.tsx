'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { UserProfile } from '@/types/user';

interface ProfileInfoCardProps {
  profile: UserProfile;
  maskedPhone: string;
  avatarGlyph: string;
  sinceFormatted: string;
}

// Replaces the avatar block that previously sat at the top of the account
// column (photo circle + masked phone + member-since only) — same visual
// position and same initials-circle fallback when there's no photo yet, now
// showing the full Phase 14 profile set: photo, full name (if set), primary
// phone (unchanged, still auth-derived and masked), email + alternate phone
// (shown only when present, per the task's "if available"), member since
// (unchanged), and an Edit Profile link. Nothing about this changes what
// was already there for a user who hasn't filled in the new fields yet —
// it degrades back to exactly the old block's content in that case.
export function ProfileInfoCard({ profile, maskedPhone, avatarGlyph, sinceFormatted }: ProfileInfoCardProps) {
  return (
    <div className="mb-7 flex flex-col items-center gap-3 pt-4 text-center lg:items-start lg:text-left">
      <div className="relative h-[76px] w-[76px] flex-shrink-0">
        {profile.profilePhotoURL ? (
          <Image
            src={profile.profilePhotoURL}
            alt="Profile photo"
            width={76}
            height={76}
            className="h-[76px] w-[76px] rounded-full object-cover shadow-card"
          />
        ) : (
          <div className="flex h-[76px] w-[76px] items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-2 font-display text-[26px] font-extrabold text-white shadow-card">
            {avatarGlyph}
          </div>
        )}
      </div>

      <div className="w-full">
        {profile.fullName && (
          <div className="font-display text-xl font-extrabold tracking-tight text-ink">{profile.fullName}</div>
        )}
        <div className={profile.fullName ? 'mt-[2px] text-sm font-semibold text-ink-2' : 'font-display text-xl font-extrabold tracking-tight text-ink'}>
          {maskedPhone}
        </div>
        {profile.email && <div className="mt-[3px] text-[13px] text-ink-2/80">{profile.email}</div>}
        {profile.alternatePhone && (
          <div className="mt-[2px] text-[13px] text-ink-2/80">Alt: +91 {profile.alternatePhone}</div>
        )}
        <div className="mt-[3px] text-[13px] text-muted">Member since {sinceFormatted}</div>

        <Link
          href="/profile/edit"
          className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-bold text-brand-2 no-underline transition-colors hover:text-brand"
        >
          Edit Profile <span aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}
