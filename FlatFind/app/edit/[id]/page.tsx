'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useRequireAuth } from '@/features/auth/hooks/useRequireAuth';
import { LoginModal } from '@/features/auth/components/LoginModal';
import { fetchListingById } from '@/features/listings/lib/listing-firestore';
import { EditListingForm } from '@/features/my-listings/components/EditListingForm';
import type { Listing } from '@/types/listing';

interface PageProps {
  params: { id: string };
}

// New in Phase 13 — reachable only from My Listings' Edit action. Auth- and
// ownership-gated the same way /post is auth-gated (useRequireAuth), plus
// an extra ownership check this route needs that /post doesn't: fetching
// someone else's listing here must not render an edit form for it, even
// though firestore.rules' `get` already lets any signed-in user read only
// published/own listings — an owner's *edit* access is enforced separately
// by the `update` rule (Phase 13), so this page's job is just to avoid
// showing an edit form the write would fail against anyway.
export default function EditListingPage({ params }: PageProps) {
  const { user, loading: authLoading } = useAuth();
  const { requireAuth, modalOpen, modalMessage, closeModal } = useRequireAuth();
  const [listing, setListing] = useState<Listing | null | undefined>(undefined);

  useEffect(() => {
    if (!authLoading && !user) {
      requireAuth('Login to edit your listing.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchListingById(params.id).then((result) => {
      if (!cancelled) setListing(result);
    });
    return () => {
      cancelled = true;
    };
  }, [user, params.id]);

  if (authLoading) {
    return <div className="py-20 text-center text-muted">Loading…</div>;
  }

  if (!user) {
    return <LoginModal open={modalOpen} onClose={closeModal} message={modalMessage} />;
  }

  if (listing === undefined) {
    return <div className="py-20 text-center text-muted">Loading listing…</div>;
  }

  if (listing === null || listing.ownerId !== user.uid) {
    return (
      <div className="mx-auto max-w-[420px] py-20 text-center">
        <div className="mb-2 text-3xl">🔍</div>
        <div className="font-display text-lg font-bold text-ink">Listing not found</div>
        <p className="text-sm text-muted">This listing doesn&apos;t exist or isn&apos;t yours to edit.</p>
      </div>
    );
  }

  return <EditListingForm listing={listing} />;
}
