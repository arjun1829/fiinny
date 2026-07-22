'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/providers/auth-provider';
import { useRequireAuth } from '@/features/auth/hooks/useRequireAuth';
import { LoginModal } from '@/features/auth/components/LoginModal';
import { Button } from '@/components/ui';
import { fetchSavedListingIds, fetchViewedListingIds } from '@/features/saved-history/lib/saved-history-firestore';
import { fetchRevealedListingIds } from '@/features/subscription/lib/reveal-firestore';
import { getProStatus } from '@/types/subscription';
import { ProExpiryWarning } from '@/features/subscription/components/ProBadge';
import { UpgradeModal } from '@/features/subscription/components/UpgradeModal';
import { FREE_CONTACTS } from '@/constants/listing-display';
import { MyListingsSection } from '@/features/my-listings/components/MyListingsSection';
import { CompleteProfileCard } from '@/features/profile/components/CompleteProfileCard';
import { ProfileInfoCard } from '@/features/profile/components/ProfileInfoCard';
import { formatPrimaryPhone } from '@/features/profile/lib/format-phone';

// Mirrors renderProfile() (index (1).html, PROFILE TAB block) in structure
// — avatar/phone-mask/member-since header, plan card, activity stat tiles,
// quick actions, logout — restyled since into an account-dashboard layout
// (two columns from `lg` up: account/plan/activity/quick-actions on the
// left at its original narrow-column width, My Listings — a management
// list, not a small stat tile — in its own wider column on the right;
// below `lg` everything stacks to one centered column, same top-to-bottom
// order as always). Data-level differences from the original, unrelated to
// this layout/visual pass:
//
//  - Plan card always renders the "Free" branch — Pro/subscription state
//    doesn't exist until Phase 11, so isPro is always false here (same
//    stub pattern as Header's Go Pro button and FreeTierBanner since
//    Phase 4/8). "Upgrade to Pro" is disabled rather than wired to a real
//    checkout flow that doesn't exist yet.
//  - "Contacts Revealed" and "Total Visits" both show 0 rather than a
//    fabricated number, for the same reasons documented in earlier phases
//    (paywall/reveal system deferred to Phase 11; the original's
//    trackVisit() was never actually defined anywhere in the source).
//  - Saved Listings / Listings Viewed are real counts from Firestore
//    (Phase 10). My Listings (Phase 13) is genuinely new content, not a
//    restyle of anything that existed — see features/my-listings for the
//    section, card, and edit-form components it's built from.
//
// Phase 14 (User Profile Management) replaces the old avatar block (photo
// circle + masked phone + member-since, inline in this file) with
// ProfileInfoCard, which shows the same content plus the new optional
// fields (full name, email, alternate phone) when present — see that
// component for why it degrades back to exactly the old block's appearance
// for a user who hasn't filled anything in yet. CompleteProfileCard renders
// directly below it, but only while profile.profileCompleted is false —
// see features/profile for the full feature (edit form, Storage upload,
// Firestore service).
export default function ProfilePage() {
  const { user, profile, loading: authLoading, signOut } = useAuth();
  const { requireAuth, modalOpen, modalMessage, closeModal } = useRequireAuth();
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [viewedCount, setViewedCount] = useState<number | null>(null);
  const [revealedCount, setRevealedCount] = useState<number | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      requireAuth('Login to view your profile.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  useEffect(() => {
    if (!user) return;
    fetchSavedListingIds(user.uid).then((ids) => setSavedCount(ids.size));
    fetchViewedListingIds(user.uid).then((ids) => setViewedCount(ids.size));
    fetchRevealedListingIds(user.uid).then((ids) => setRevealedCount(ids.size));
  }, [user]);

  const proStatus = getProStatus(profile);
  const remainingReveals = Math.max(0, FREE_CONTACTS - (revealedCount ?? 0));

  if (authLoading) {
    return <div className="py-20 text-center text-muted">Loading…</div>;
  }

  if (!user) {
    return <LoginModal open={modalOpen} onClose={closeModal} message={modalMessage} />;
  }

  const { masked: maskedPhone, avatarGlyph } = formatPrimaryPhone(user.phoneNumber);
  const sinceFormatted = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

  const stats = [
    { icon: '♥', value: savedCount ?? '—', label: 'Saved Listings', bg: '#fce7f3', color: '#be185d' },
    { icon: '👁', value: viewedCount ?? '—', label: 'Listings Viewed', bg: '#dbeafe', color: '#1d4ed8' },
    { icon: '📞', value: revealedCount ?? '—', label: 'Contacts Revealed', bg: '#dcfce7', color: '#166534' },
    { icon: '🔍', value: 0, label: 'Total Visits', bg: '#fff7ed', color: '#c2410c' },
  ];

  return (
    <div className="mx-auto max-w-[1040px] px-4 pb-16 pt-2 sm:px-6">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[360px_1fr] lg:items-start lg:gap-12">
        {/* Account column — header, plan, activity, quick actions, logout. */}
        <div className="flex flex-col">
          {profile && (
            <ProfileInfoCard profile={profile} maskedPhone={maskedPhone} avatarGlyph={avatarGlyph} sinceFormatted={sinceFormatted} />
          )}

          {profile && !profile.profileCompleted && <CompleteProfileCard profile={profile} />}

          <SectionLabel>Current Plan</SectionLabel>
          <div className="mb-8 rounded-r2 border-[1.5px] border-border bg-white p-5 shadow-card">
            {proStatus.isPro ? (
              <>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <div className="font-display text-[22px] font-black leading-none text-brand-2">Pro</div>
                    <div className="mt-[6px] text-[13px] text-muted">
                      Unlimited contact reveals · Renews{' '}
                      {proStatus.proExpiry
                        ? new Date(proStatus.proExpiry).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                        : '—'}
                    </div>
                  </div>
                  <span className="flex-shrink-0 rounded-full bg-brand-light px-3 py-1 text-[11px] font-bold tracking-wide text-brand-2">
                    ✓ Pro Plan
                  </span>
                </div>
                <ProExpiryWarning status={proStatus} />
              </>
            ) : (
              <>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <div className="font-display text-[22px] font-black leading-none text-ink">Free</div>
                    <div className="mt-[6px] text-[13px] text-muted">{remainingReveals} contact reveals remaining</div>
                  </div>
                  <span className="flex-shrink-0 rounded-full bg-[#fef9c3] px-3 py-1 text-[11px] font-bold tracking-wide text-[#854d0e]">
                    Free Plan
                  </span>
                </div>
                <Button
                  variant="brand"
                  className="w-full py-[11px] text-[13.5px] shadow-sm"
                  onClick={() => setUpgradeOpen(true)}
                >
                  ⚡ Upgrade to Pro — ₹499/mo
                </Button>
              </>
            )}
          </div>

          <SectionLabel>Activity</SectionLabel>
          <div className="mb-8 grid grid-cols-2 gap-3">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-r2 border-[1.5px] border-border/60 p-4 shadow-card"
                style={{ background: s.bg }}
              >
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/60 text-base">
                  {s.icon}
                </div>
                <div className="font-display text-[26px] font-black leading-none" style={{ color: s.color }}>
                  {s.value}
                </div>
                <div className="mt-[5px] text-[11.5px] font-semibold text-ink-2/70">{s.label}</div>
              </div>
            ))}
          </div>

          <SectionLabel>Quick Actions</SectionLabel>
          <div className="mb-8 flex flex-col gap-2">
            <QuickActionLink href="/saved" icon="♥" label="View Saved Listings" />
            <QuickActionLink href="/history" icon="👁" label="View History" />
            <QuickActionLink href="/post" icon="➕" label="Post a Listing" />
          </div>

          <button
            type="button"
            onClick={() => signOut()}
            className="w-full rounded-r2 border-[1.5px] border-red-200 bg-white py-[13px] text-sm font-bold text-red-600 transition-colors hover:border-red-300 hover:bg-red-50"
          >
            Logout
          </button>
          <div className="mb-2 mt-5 text-center text-[11px] text-[#a8a29e] lg:text-left">FlatFind · flatandflatmates.online</div>
        </div>

        {/* My Listings column — management view for everything this user owns. */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <SectionLabel className="mb-0">My Listings</SectionLabel>
            <Link
              href="/post"
              className="text-[12.5px] font-bold text-brand-2 no-underline transition-colors hover:text-brand"
            >
              + Post New
            </Link>
          </div>
          <MyListingsSection uid={user.uid} />
        </div>
      </div>
      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </div>
  );
}

function SectionLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`mb-3 text-[11px] font-extrabold tracking-[0.12em] text-[#a8a29e] ${className}`}>
      {children}
    </div>
  );
}

function QuickActionLink({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-r2 border-[1.5px] border-border bg-white px-4 py-[13px] text-sm font-semibold text-ink no-underline transition-all hover:border-brand/40 hover:bg-brand-light/40"
    >
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-bg text-base transition-colors group-hover:bg-white">
        {icon}
      </span>
      {label}
      <span className="ml-auto text-[#c4c0ba] transition-transform group-hover:translate-x-[2px] group-hover:text-brand">
        ›
      </span>
    </Link>
  );
}
