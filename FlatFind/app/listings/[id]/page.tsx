import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchListingById } from '@/features/listings/lib/listing-firestore';
import { ListingDetail } from '@/features/listings/components/ListingDetail';

interface PageProps {
  params: { id: string };
}

// Full-page fallback for /listings/[id] — used on direct visit, refresh, or
// share (a WhatsApp link, for instance). Server-rendered with per-listing
// metadata, which the original could never do at all (its detail view only
// ever existed inside a JS-controlled #det-overlay with no unique URL —
// architecture report §3.9's exact rationale for choosing intercepting
// routes in Phase 0: "today's detail view only exists inside a JS-
// controlled modal with no unique URL, so it's not shareable or indexable
// despite the app already having WhatsApp/Facebook share affordances that
// need a real link to point to").
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const listing = await fetchListingById(params.id);
  if (!listing) return {};
  return {
    title: listing.title,
    description: listing.description || `${listing.type} in ${listing.location}, ${listing.city} — ₹${listing.rent}/mo`,
    openGraph: {
      title: listing.title,
      description: listing.description,
      images: listing.image_urls[0] ? [listing.image_urls[0]] : undefined,
    },
  };
}

export default async function ListingPage({ params }: PageProps) {
  const listing = await fetchListingById(params.id);
  if (!listing) notFound();

  return (
    <div className="py-6">
      <ListingDetail listing={listing} />
    </div>
  );
}
