'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useRequireAuth } from '@/features/auth/hooks/useRequireAuth';
import { fetchRevealedListingIds, recordContactReveal } from '../lib/reveal-firestore';
import { getProStatus } from '@/types/subscription';
import { FREE_CONTACTS } from '@/constants/listing-display';

// Mirrors useSavedListings.ts's structure exactly: loads a per-user
// Firestore-backed set once per session, exposes an optimistic mutator.
// This hook additionally derives Pro status and the free-tier cap, and
// takes an onNeedUpgrade callback so callers (ListingCard/ListingDetail)
// can open their own UpgradeModal instance when the cap is hit, rather than
// this hook owning modal UI itself.
export function useContactReveal() {
  const { user, profile } = useAuth();
  const { requireAuth, modalOpen, modalMessage, closeModal } = useRequireAuth();
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) {
      setRevealedIds(new Set());
      setLoaded(false);
      return;
    }
    fetchRevealedListingIds(user.uid).then((ids) => {
      setRevealedIds(ids);
      setLoaded(true);
    });
  }, [user]);

  const { isPro } = getProStatus(profile);
  const remainingReveals = Math.max(0, FREE_CONTACTS - revealedIds.size);

  /** True once a listing's contact should be shown in full — Pro (always), or free-tier having already spent a reveal on this exact listing. */
  const isRevealed = useCallback(
    (listingId: string) => isPro || revealedIds.has(listingId),
    [isPro, revealedIds],
  );

  /**
   * Attempts to reveal a listing's contact. Gating order: signed-out →
   * login modal (via useRequireAuth, same contextual-message pattern every
   * other gated action already uses); signed-in + already revealed/Pro →
   * no-op, caller just renders the real number; signed-in + free + cap
   * reached → onNeedUpgrade() instead of writing; signed-in + free + under
   * cap → optimistic reveal + recordContactReveal (mirrors
   * useSavedListings' toggleSave optimistic-update-with-revert pattern).
   */
  const reveal = useCallback(
    (listingId: string, onNeedUpgrade: () => void) => {
      const doReveal = async () => {
        if (!user) return;
        if (isPro || revealedIds.has(listingId)) return;
        if (remainingReveals <= 0) {
          onNeedUpgrade();
          return;
        }
        setRevealedIds((prev) => new Set(prev).add(listingId));
        try {
          await recordContactReveal(user.uid, listingId);
        } catch {
          setRevealedIds((prev) => {
            const next = new Set(prev);
            next.delete(listingId);
            return next;
          });
        }
      };

      requireAuth('Login to view contact details.', doReveal);
    },
    [user, isPro, revealedIds, remainingReveals, requireAuth],
  );

  return {
    isPro,
    isRevealed,
    remainingReveals,
    loaded,
    reveal,
    loginModalOpen: modalOpen,
    loginModalMessage: modalMessage,
    closeLoginModal: closeModal,
  };
}
