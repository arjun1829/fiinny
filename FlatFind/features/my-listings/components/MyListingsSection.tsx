'use client';

import Link from 'next/link';
import { useMyListings } from '../hooks/useMyListings';
import { MyListingCard } from './MyListingCard';

interface MyListingsSectionProps {
  uid: string;
}

// New in Phase 13 — the Profile page previously had no way to see or manage
// what you'd posted (Quick Actions only linked to Post a Listing, never
// back to anything already submitted). Placed on the Profile page itself
// rather than a separate route, matching this app's existing pattern of
// Saved/History also being reachable from Profile's Quick Actions, and
// because "your listings" is squarely account-dashboard content.
export function MyListingsSection({ uid }: MyListingsSectionProps) {
  const { listings, error, toggleHidden, remove } = useMyListings(uid);

  if (listings === null && !error) {
    return (
      <div className="rounded-r2 border-[1.5px] border-border bg-white py-14 text-center text-sm text-muted shadow-card">
        Loading your listings…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-r2 border-[1.5px] border-red-200 bg-red-50 py-8 text-center text-sm text-red-600">{error}</div>
    );
  }

  if (listings && listings.length === 0) {
    return (
      <div className="rounded-r2 border-[1.5px] border-dashed border-border bg-white p-10 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-light text-2xl">
          🏠
        </div>
        <div className="mb-1 font-display text-[16px] font-bold text-ink">You haven&apos;t posted any listings yet</div>
        <p className="mb-4 text-[13px] text-muted">Your posted listings will show up here for you to manage.</p>
        <Link
          href="/post"
          className="inline-flex items-center gap-1 text-sm font-bold text-brand-2 no-underline transition-colors hover:text-brand"
        >
          Post your first listing <span aria-hidden>→</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {listings?.map((listing) => (
        <MyListingCard key={listing.id} listing={listing} onToggleHidden={toggleHidden} onDelete={remove} />
      ))}
    </div>
  );
}
