'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { useContactReveal } from '@/features/subscription/hooks/useContactReveal';
import { UpgradeModal } from '@/features/subscription/components/UpgradeModal';
import { LoginModal } from '@/features/auth/components/LoginModal';

// Mirrors .free-ticker/#free-ticker (index (1).html), now wired to the real
// per-user reveal count via useContactReveal (own instance — this banner is
// a sibling of ListingsExplorer in app/page.tsx, not a descendant of
// ListingGrid, so there's no shared ancestor to receive this state from as
// a prop). Hides entirely once Pro, matching the original's
// `S.isPaid` check the header comment used to reference as not-yet-existing.
export function FreeTierBanner() {
  const { isPro, remainingReveals, loginModalOpen, loginModalMessage, closeLoginModal } = useContactReveal();
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);

  if (isPro) return null;

  return (
    <div className="mt-7 rounded-r2 border-[1.5px] border-border bg-white p-[22px] text-center">
      <div className="mb-3 text-[13.5px] text-muted">
        Free contact reveals remaining: <strong className="text-brand-2">{remainingReveals}</strong> · All listings
        visible — upgrade to unlock unlimited contacts
      </div>
      <Button variant="brand" className="px-7 py-[11px] text-sm" onClick={() => setUpgradeModalOpen(true)}>
        ⚡ Unlock Unlimited — ₹499/mo
      </Button>
      <LoginModal open={loginModalOpen} onClose={closeLoginModal} message={loginModalMessage} />
      <UpgradeModal open={upgradeModalOpen} onClose={() => setUpgradeModalOpen(false)} />
    </div>
  );
}
