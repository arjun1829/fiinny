'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal, ModalCloseButton } from '@/components/ui';
import { fetchListingById } from '@/features/listings/lib/listing-firestore';
import { ListingDetail } from '@/features/listings/components/ListingDetail';
import type { Listing } from '@/types/listing';

// Mirrors #det-overlay (index (1).html, DETAIL MODAL block) — same "modal
// over the current page" presentation as openDet(), but this time it's a
// real Next.js intercepting route (Phase 0's decision), not a JS-toggled
// overlay div. Navigating here from a ListingCard's Link (features/listings/
// components/ListingCard.tsx) renders this modal on top of whatever page
// was already showing; a direct visit, refresh, or shared link instead hits
// app/listings/[id]/page.tsx (the plain full-page version) because
// intercepting routes only intercept in-app navigation, never a fresh load.
//
// The route match is (.)listings/[id] — same-level interception from
// app/@modal, matching a same-level /listings/[id] navigation triggered
// from anywhere under app/.
//
// Not-found handling: this deliberately does NOT call next/navigation's
// notFound() — that function's documented examples are all Server
// Components, and this route can only be a Client Component (it needs
// useRouter() for the close/back behavior). Rather than ship a pattern
// whose Client Component behavior isn't clearly documented, a missing/
// unpublished listing renders an inline message inside the same modal
// shell instead — same visual result (a small message where the detail
// would be), fully within patterns already verified elsewhere in this app.
export default function InterceptedListingModal({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [listing, setListing] = useState<Listing | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchListingById(params.id).then((result) => {
      if (!cancelled) setListing(result);
    });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const close = () => router.back();

  return (
    <Modal open onClose={close} maxWidthClassName="max-w-[580px]">
      {listing === undefined && <div className="flex h-[280px] items-center justify-center text-muted">Loading…</div>}
      {listing === null && (
        <div className="flex h-[280px] flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="text-4xl">🔍</div>
          <div className="font-display text-lg font-bold text-ink">Listing not found</div>
          <p className="text-sm text-muted">This listing may have been removed or is no longer available.</p>
          <ModalCloseButton onClick={close} />
        </div>
      )}
      {listing && <ListingDetail listing={listing} onClose={close} />}
    </Modal>
  );
}
