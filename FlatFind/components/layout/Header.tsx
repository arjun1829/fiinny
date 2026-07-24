'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { useAuth } from '@/providers/auth-provider';
import { LoginModal } from '@/features/auth/components/LoginModal';
import { getProStatus } from '@/types/subscription';
import { ProBadge } from '@/features/subscription/components/ProBadge';
import { UpgradeModal } from '@/features/subscription/components/UpgradeModal';

// Mirrors #hdr / .hdr-inner / .logo / .hdr-right (index (1).html, HEADER
// block) — sticky top bar with logo, +Post, Profile, and Go Pro.
//
// Profile/Login button wired to real Firebase Auth state (Phase 8),
// replacing the original's `updateHeaderLoginState()` reading
// `localStorage.getItem('ff_phone')`. Same underlying behavior as ever:
// logged out opens the login modal (openProfileOrLogin()'s else-branch,
// requireLogin()); logged in links to /profile (openProfileOrLogin()'s
// if-branch — switchTab('profile')).
//
// Visual pass (design refinement only, no behavior change): Post is now a
// filled brand CTA rather than an outline button that read as a plain link
// — it's the primary action in this bar, so it should look like one, and
// now matches Go Pro's visual weight instead of competing with it. Profile
// dropped the raw "👤 {last 4 digits}" text (read as placeholder/debug
// data, not a real account affordance) for a circular avatar button using
// the same last-2-digits glyph the Profile page's own avatar already uses
// (app/profile/page.tsx) — no new per-user data invented, just the one
// identifier this app already surfaces reused in a smaller, icon-shaped
// slot appropriate for a header.
//
// Go Pro is still stubbed — Phase 11 (payments) wires it to the real
// upgrade flow.
export function Header() {
  const { user, profile, loading } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const phone = user?.phoneNumber?.replace('+91', '') ?? '';
  const avatarGlyph = phone.slice(-2);
  const { isPro } = getProStatus(profile);

  return (
    <header id="hdr" className="sticky top-0 z-[300] border-b-[1.5px] border-border bg-white">
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between gap-0 overflow-hidden px-[14px]">
        <Link href="/" className="flex flex-shrink-0 items-center gap-2 no-underline">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand text-xl">
            🏠
          </div>
          <span className="font-display text-[22px] font-extrabold tracking-tight text-ink">FlatFind</span>
        </Link>

        <div className="flex flex-shrink-0 items-center gap-2.5 mobile:gap-2">
          <Link href="/post">
            <Button
              variant="brand"
              size="sm"
              className="gap-[6px] whitespace-nowrap shadow-sm mobile:px-3 mobile:py-[7px] mobile:text-xs"
            >
              <span aria-hidden className="text-[15px] leading-none">
                +
              </span>
              Post
            </Button>
          </Link>

          {user ? (
            <Link
              href="/profile"
              aria-label="View profile"
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-light font-display text-[13px] font-extrabold text-brand-2 no-underline transition-colors hover:bg-[#bbf7d0] mobile:h-9 mobile:w-9"
            >
              {avatarGlyph}
            </Link>
          ) : (
            <button
              type="button"
              aria-label="Login to view profile"
              onClick={() => setLoginOpen(true)}
              disabled={loading}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-[1.5px] border-border bg-white text-lg text-muted transition-colors hover:border-brand hover:text-brand disabled:pointer-events-none disabled:opacity-50 mobile:h-9 mobile:w-9"
            >
              👤
            </button>
          )}

          {isPro ? (
            <ProBadge />
          ) : (
            <Button
              variant="brand"
              size="sm"
              className="mobile:px-3 mobile:py-[7px] mobile:text-xs"
              onClick={() => (user ? setUpgradeOpen(true) : setLoginOpen(true))}
            >
              ⚡ Go Pro
            </Button>
          )}
        </div>
      </div>

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} message="Login to view your profile." />
      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </header>
  );
}
