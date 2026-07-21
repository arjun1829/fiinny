'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useRequireAuth } from '@/features/auth/hooks/useRequireAuth';
import { fetchSavedListingIds, toggleSavedListing } from '../lib/saved-history-firestore';

// Mirrors S.savedIds (index (1).html, main IIFE) — a set of saved listing
// IDs, plus a toggle function. Loaded once per signed-in session (Firestore
// read) instead of starting empty on every page load, which is what fixes
// the original's "saved listings reset on refresh" gap (architecture
// report §1.2). toggleSave()'s requireLogin() gate is reproduced via
// useRequireAuth — attempting to save while signed out opens the login
// modal and completes the save automatically once sign-in succeeds.
export function useSavedListings() {
  const { user } = useAuth();
  const { requireAuth, modalOpen, modalMessage, closeModal } = useRequireAuth();
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) {
      setSavedIds(new Set());
      setLoaded(false);
      return;
    }
    fetchSavedListingIds(user.uid).then((ids) => {
      setSavedIds(ids);
      setLoaded(true);
    });
  }, [user]);

  const toggleSave = useCallback(
    (listingId: string) => {
      const doToggle = async () => {
        if (!user) return;
        const currentlySaved = savedIds.has(listingId);
        // Optimistic update, matching the original's toggleSave() flipping
        // the button's class/glyph immediately rather than waiting on a
        // network round-trip.
        setSavedIds((prev) => {
          const next = new Set(prev);
          currentlySaved ? next.delete(listingId) : next.add(listingId);
          return next;
        });
        try {
          await toggleSavedListing(user.uid, listingId, currentlySaved);
        } catch {
          // Revert on failure — the write didn't actually happen.
          setSavedIds((prev) => {
            const next = new Set(prev);
            currentlySaved ? next.add(listingId) : next.delete(listingId);
            return next;
          });
        }
      };

      requireAuth('Login to save listings.', doToggle);
    },
    [user, savedIds, requireAuth],
  );

  return { savedIds, loaded, toggleSave, loginModalOpen: modalOpen, loginModalMessage: modalMessage, closeLoginModal: closeModal };
}
