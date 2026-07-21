'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchMyListings,
  setListingHidden,
  deleteMyListing,
} from '../lib/my-listings-firestore';
import type { Listing } from '@/types/listing';

/**
 * Loads and mutates the signed-in user's own listings for the Profile
 * page's My Listings section. Mirrors useSavedListings' shape (load once,
 * mutate local state optimistically, re-sync from Firestore on demand)
 * rather than a live onSnapshot subscription — same rationale as
 * listings-firestore.ts's fetchPublishedListings over
 * subscribeToPublishedListings for the homepage: an open listener per
 * profile visit is ongoing overhead this view doesn't need, since My
 * Listings' own actions (hide/delete) already update local state directly.
 */
export function useMyListings(uid: string | undefined) {
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!uid) return;
    fetchMyListings(uid)
      .then(setListings)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your listings.'));
  }, [uid]);

  useEffect(() => {
    reload();
  }, [reload]);

  const toggleHidden = useCallback(async (listingId: string, nextHidden: boolean) => {
    setListings((prev) => prev?.map((l) => (l.id === listingId ? { ...l, hidden: nextHidden } : l)) ?? null);
    try {
      await setListingHidden(listingId, nextHidden);
    } catch (err) {
      // Roll back on failure rather than leaving the UI showing a state that never persisted.
      setListings((prev) => prev?.map((l) => (l.id === listingId ? { ...l, hidden: !nextHidden } : l)) ?? null);
      throw err;
    }
  }, []);

  const remove = useCallback(async (listingId: string) => {
    const previous = listings;
    setListings((prev) => prev?.filter((l) => l.id !== listingId) ?? null);
    try {
      await deleteMyListing(listingId);
    } catch (err) {
      setListings(previous ?? null);
      throw err;
    }
  }, [listings]);

  return { listings, error, reload, toggleHidden, remove };
}
