'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button, useToast } from '@/components/ui';
import type { Listing } from '@/types/listing';
import { DeleteConfirmModal } from './DeleteConfirmModal';

interface MyListingCardProps {
  listing: Listing;
  onToggleHidden: (listingId: string, nextHidden: boolean) => Promise<void>;
  onDelete: (listingId: string) => Promise<void>;
}

const STATUS_STYLE: Record<Listing['status'], { label: string; className: string }> = {
  pending: { label: 'Pending Review', className: 'bg-[#fff7ed] text-[#c2410c]' },
  published: { label: 'Published', className: 'bg-[#dcfce7] text-[#166534]' },
  rejected: { label: 'Rejected', className: 'bg-[#fee2e2] text-[#b91c1c]' },
};

// Falls back rather than indexing STATUS_STYLE directly — `status` is typed
// as a closed union, but that only constrains what this app writes, not
// what's already sitting in Firestore. A listing document with a missing
// or unrecognized status (e.g. pre-Phase-7 data, or a manual Console edit)
// would otherwise index STATUS_STYLE with `undefined` and throw on
// `.className` — this is exactly that case, hit against live data.
const UNKNOWN_STATUS_STYLE = { label: 'Unknown Status', className: 'bg-[#f5f4f2] text-[#78716c]' };
function getStatusStyle(status: Listing['status']) {
  return STATUS_STYLE[status] ?? UNKNOWN_STATUS_STYLE;
}

// New in Phase 13 — one row per owned listing in the Profile page's My
// Listings section, with the management actions the original never had
// (posting a listing there was write-only: no way to see, edit, hide, or
// remove what you'd posted afterward). Status/hidden are shown as distinct
// pills since they're independent axes (a published listing can also be
// owner-hidden — see types/listing.ts's doc comment on `hidden`).
export function MyListingCard({ listing, onToggleHidden, onDelete }: MyListingCardProps) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const status = getStatusStyle(listing.status);

  const handleToggleHidden = async () => {
    setBusy(true);
    try {
      await onToggleHidden(listing.id, !listing.hidden);
    } catch {
      toast('Could not update visibility. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await onDelete(listing.id);
      toast('Listing deleted.');
    } catch {
      toast('Could not delete listing. Please try again.');
    } finally {
      setBusy(false);
      setConfirmingDelete(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-r2 border-[1.5px] border-border bg-white p-5 shadow-card transition-shadow hover:shadow-card-lg sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-[6px]">
          <span className={`rounded-full px-[10px] py-[4px] text-[10.5px] font-extrabold tracking-[0.03em] ${status.className}`}>
            {status.label}
          </span>
          {listing.hidden && (
            <span className="rounded-full bg-[#f5f4f2] px-[10px] py-[4px] text-[10.5px] font-extrabold tracking-[0.03em] text-[#78716c]">
              🙈 Hidden
            </span>
          )}
        </div>
        <div className="mb-1 font-display text-[16px] font-bold leading-snug text-ink">{listing.title}</div>
        <div className="text-[12.5px] text-ink-2/80">
          {listing.type} · {listing.city} · <span className="font-semibold text-ink">₹{listing.rent.toLocaleString('en-IN')}/mo</span> · {listing.location}
        </div>
        <div className="mt-[6px] text-[11.5px] text-[#a8a29e]">
          Posted {new Date(listing.created).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        </div>
      </div>

      <div className="flex flex-shrink-0 flex-wrap items-center gap-[6px] sm:flex-col sm:items-stretch sm:gap-[6px]">
        <div className="flex flex-1 gap-[6px] sm:flex-initial">
          <Link href={`/listings/${listing.id}`} className="flex-1 sm:flex-initial">
            <Button variant="outline" size="sm" type="button" className="w-full">
              View
            </Button>
          </Link>
          <Link href={`/edit/${listing.id}`} className="flex-1 sm:flex-initial">
            <Button variant="outline" size="sm" type="button" className="w-full">
              Edit
            </Button>
          </Link>
        </div>
        <div className="flex flex-1 gap-[6px] sm:flex-initial">
          <Button variant="outline" size="sm" type="button" className="flex-1 sm:flex-initial" onClick={handleToggleHidden} disabled={busy}>
            {listing.hidden ? 'Unhide' : 'Hide'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            type="button"
            className="flex-1 border-red-200 text-red-600 hover:border-red-400 hover:bg-red-50 hover:text-red-700 sm:flex-initial"
            onClick={() => setConfirmingDelete(true)}
            disabled={busy}
          >
            Delete
          </Button>
        </div>
      </div>

      <DeleteConfirmModal
        open={confirmingDelete}
        listingTitle={listing.title}
        busy={busy}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
