'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useRequireAuth } from '@/features/auth/hooks/useRequireAuth';
import { LoginModal } from '@/features/auth/components/LoginModal';
import { fetchSavedListingIds } from '@/features/saved-history/lib/saved-history-firestore';
import { fetchListingsByIds } from '@/features/saved-history/lib/saved-history-listings';
import { ListingGrid } from '@/features/listings/components/ListingGrid';
import type { Listing } from '@/types/listing';

// Mirrors #tab-saved / renderSaved() (index (1).html, SAVED / HISTORY
// block) — same empty-state copy ("No saved listings yet" / "Tap ♡ on any
// listing to save it here"), same card grid. Auth-gated the same way
// switchTab() gated the Saved tab: `if(tabId==='saved'&&!isLoggedIn())
// requireLogin(...)`.
export default function SavedPage() {
  const { user, loading: authLoading } = useAuth();
  const { requireAuth, modalOpen, modalMessage, closeModal } = useRequireAuth();
  const [listings, setListings] = useState<Listing[] | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      requireAuth('Login to view your saved listings.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  useEffect(() => {
    if (!user) return;
    fetchSavedListingIds(user.uid)
      .then((ids) => fetchListingsByIds(Array.from(ids)))
      .then(setListings);
  }, [user]);

  if (authLoading) {
    return <div className="py-20 text-center text-muted">Loading…</div>;
  }

  if (!user) {
    return <LoginModal open={modalOpen} onClose={closeModal} message={modalMessage} />;
  }

  return (
    <div>
      <div className="mb-[26px]">
        <h1 className="mb-[5px] font-display text-[28px] font-extrabold tracking-tight">❤️ Saved Listings</h1>
        <p className="text-sm text-muted">Flats you&apos;ve saved for later review.</p>
      </div>
      {listings === null ? (
        <div className="py-20 text-center text-muted">Loading…</div>
      ) : listings.length === 0 ? (
        <div className="py-[72px] text-center text-muted">
          <div className="mb-[14px] text-[46px]">🤍</div>
          <div className="mb-[6px] font-display text-xl font-bold text-ink">No saved listings yet</div>
          <div>Tap ♡ on any listing to save it here</div>
        </div>
      ) : (
        <ListingGrid listings={listings} />
      )}
    </div>
  );
}
