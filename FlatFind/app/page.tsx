'use client';

import { useEffect, useState } from 'react';
import { fetchPublishedListings } from '@/features/listings/lib/listings-firestore';
import { HeroBand } from '@/features/listings/components/HeroBand';
import { ListingsExplorer } from '@/features/listings/components/ListingsExplorer';
import { FreeTierBanner } from '@/features/listings/components/FreeTierBanner';
import type { Listing } from '@/types/listing';

// Phase 7 replaced getSeedListings() with a real Firestore read; this pass
// (Admin SDK removal) replaces THAT read again — fetchPublishedListingsServer()
// ran on the server via the Admin SDK (a Server Component, no 'use client'
// here), which no longer exists: no service account credentials were
// available for the current Firebase project, and the decision was to drop
// the Admin SDK entirely rather than block on obtaining them. This page is
// now a Client Component that calls fetchPublishedListings() (the same
// client-SDK function every other page's listing reads already use)
// on mount, the same shape as /saved, /history, and /profile's own
// Firestore-backed sections.
//
// What this costs relative to the Server Component version: the previous
// `revalidate = 60` ISR strategy is gone along with the Server Component
// that used it — there's no server-rendered HTML to revalidate anymore, so
// the homepage no longer has a build-time-cached fallback and instead
// fetches fresh on every visit (a plain client read, not a subscription —
// see subscribeToPublishedListings's file header for why an open listener
// per visitor was rejected as unnecessary overhead, a rationale that still
// holds here). Net effect on freshness is neutral-to-better (every load is
// live instead of up-to-60-seconds-stale); net effect on first-paint is a
// brief loading state instead of pre-rendered content, handled below the
// same way every other data-dependent page in this app already handles it.
export default function Home() {
  const [listings, setListings] = useState<Listing[] | null>(null);

  useEffect(() => {
    fetchPublishedListings().then(setListings);
  }, []);

  if (listings === null) {
    return <div className="py-20 text-center text-muted">Loading…</div>;
  }

  return (
    <>
      <HeroBand listings={listings} />
      <ListingsExplorer listings={listings} />
      <FreeTierBanner />
    </>
  );
}
