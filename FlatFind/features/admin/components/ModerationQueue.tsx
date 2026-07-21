'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { fetchListingsByStatus, publishListing, rejectListing } from '../lib/admin-firestore';
import type { Listing } from '@/types/listing';

// New in Phase 12 — the original had no moderation UI at all (the upload
// dropzone and results table referenced by processFile()/renderAdminTable()
// were wired to JS that worked, but their DOM elements didn't exist
// anywhere in the HTML body — architecture report §1.10 confirmed this via
// full-file search). This is a genuine "build to the apparent intent of
// the dead code" case, not a port: a list of 'pending' listings, each with
// Publish/Reject actions, is the natural shape given the moderation
// workflow decided in Phase 0 and enforced at the Firestore-rules layer
// since Phase 9.
export function ModerationQueue() {
  const [pending, setPending] = useState<Listing[] | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);

  const load = () => {
    fetchListingsByStatus('pending').then(setPending);
  };

  useEffect(() => {
    load();
  }, []);

  const handlePublish = async (id: string) => {
    setActioning(id);
    try {
      await publishListing(id);
      setPending((prev) => prev?.filter((l) => l.id !== id) ?? null);
    } finally {
      setActioning(null);
    }
  };

  const handleReject = async (id: string) => {
    setActioning(id);
    try {
      await rejectListing(id);
      setPending((prev) => prev?.filter((l) => l.id !== id) ?? null);
    } finally {
      setActioning(null);
    }
  };

  if (pending === null) {
    return <div className="py-10 text-center text-muted">Loading pending listings…</div>;
  }

  if (pending.length === 0) {
    return (
      <div className="rounded-r2 border-[1.5px] border-border bg-white p-10 text-center text-muted">
        <div className="mb-2 text-3xl">✅</div>
        <div className="font-display text-lg font-bold text-ink">Nothing to review</div>
        <div className="text-sm">New listings will appear here once submitted.</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {pending.map((listing) => (
        <div key={listing.id} className="flex flex-col gap-3 rounded-r2 border-[1.5px] border-border bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="mb-[2px] font-display text-[15px] font-bold text-ink">{listing.title}</div>
            <div className="text-[12.5px] text-muted">
              {listing.type} · {listing.city} · ₹{listing.rent.toLocaleString('en-IN')}/mo · {listing.location}
            </div>
            {listing.description && <p className="mt-1 line-clamp-2 text-[12.5px] text-ink-2">{listing.description}</p>}
          </div>
          <div className="flex flex-shrink-0 gap-2">
            <Button variant="brand" size="sm" onClick={() => handlePublish(listing.id)} disabled={actioning === listing.id}>
              ✓ Publish
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleReject(listing.id)} disabled={actioning === listing.id}>
              ✕ Reject
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
