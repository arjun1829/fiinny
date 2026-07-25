'use client';

import { useState } from 'react';
import type { Listing } from '@/types/listing';
import type { LatLng } from '@/utils/haversine';
import { LoginModal } from '@/features/auth/components/LoginModal';
import { useSavedListings } from '@/features/saved-history/hooks/useSavedListings';
import { useContactReveal } from '@/features/subscription/hooks/useContactReveal';
import { UpgradeModal } from '@/features/subscription/components/UpgradeModal';
import { ListingCard } from './ListingCard';

interface ListingGridProps {
  listings: Listing[];
  userLocation?: LatLng | null;
}

// Mirrors .grid / #grid + the .empty state (index (1).html, GRID + EMPTY
// blocks). auto-fill(310px) is the original's exact grid-template-columns.
//
// useSavedListings() and useContactReveal() are both instantiated once here
// — the shared ancestor of every card on a page — rather than inside each
// ListingCard. One shared saved-set/reveal-set and one shared login-modal
// instance, instead of N independent Firestore reads and N login modals if
// every card owned its own copy of this state.
export function ListingGrid({ listings, userLocation }: ListingGridProps) {
  const { savedIds, toggleSave, loginModalOpen, loginModalMessage, closeLoginModal } = useSavedListings();
  const {
    isRevealed,
    reveal,
    loginModalOpen: revealLoginModalOpen,
    loginModalMessage: revealLoginModalMessage,
    closeLoginModal: closeRevealLoginModal,
  } = useContactReveal();
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);

  if (listings.length === 0) {
    return (
      <div className="py-[72px] text-center text-muted">
        <div className="mb-[14px] text-[46px]">🔍</div>
        <div className="mb-[6px] font-display text-xl font-bold text-ink">No listings match your filters</div>
        <div>Try adjusting city, type or budget above</div>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(310px,1fr))] gap-5">
        {listings.map((listing, i) => (
          <ListingCard
            key={listing.id}
            listing={listing}
            index={i}
            userLocation={userLocation}
            isSaved={savedIds.has(listing.id)}
            onToggleSave={() => toggleSave(listing.id)}
            isRevealed={isRevealed(listing.id)}
            onRevealContact={() => reveal(listing.id, () => setUpgradeModalOpen(true))}
          />
        ))}
      </div>
      <LoginModal open={loginModalOpen} onClose={closeLoginModal} message={loginModalMessage} />
      <LoginModal open={revealLoginModalOpen} onClose={closeRevealLoginModal} message={revealLoginModalMessage} />
      <UpgradeModal open={upgradeModalOpen} onClose={() => setUpgradeModalOpen(false)} />
    </>
  );
}
