'use client';

import { useEffect, useState } from 'react';
import { fetchAllListingsForAdmin } from '../lib/admin-firestore';
import type { Listing } from '@/types/listing';

// Mirrors renderAdminStats() (index (1).html, ADMIN block) — same 4-card
// shape and colors (.sg/#admin-sg). "Active" (l.available) becomes
// "Published" (l.status==='published') — `available` still exists on the
// Listing type but `status` is the field that actually gates public
// visibility as of Phase 7, so this counts the field that means what the
// label says. "From Excel"/"User Posted" still read `source`, unchanged
// from the original — the CSV/Excel import path itself isn't rebuilt in
// this app (there's no Sheet/CSV sync anymore per Phase 0's decision), but
// the field and its original meaning are preserved for whenever bulk
// import is revisited.
export function AdminStats() {
  const [listings, setListings] = useState<Listing[] | null>(null);

  useEffect(() => {
    fetchAllListingsForAdmin().then(setListings);
  }, []);

  const cards = [
    { icon: '🏠', label: 'Total', value: listings?.length ?? '—', bg: '#e8eaf6' },
    { icon: '📊', label: 'From Excel', value: listings?.filter((l) => l.source === 'excel').length ?? '—', bg: '#dcfce7' },
    { icon: '👤', label: 'User Posted', value: listings?.filter((l) => l.source === 'user').length ?? '—', bg: '#fff7ed' },
    { icon: '✅', label: 'Published', value: listings?.filter((l) => l.status === 'published').length ?? '—', bg: '#d1fae5' },
  ];

  return (
    <div className="mb-[26px] grid grid-cols-2 gap-[14px] sm:grid-cols-4">
      {cards.map((s, i) => (
        <div
          key={s.label}
          className="rounded-r p-[18px]"
          style={{ background: s.bg, animationDelay: `${i * 0.07}s` }}
        >
          <div className="mb-[6px] text-[26px]">{s.icon}</div>
          <div className="font-display text-[30px] font-black leading-none text-ink">{s.value}</div>
          <div className="mt-[3px] text-xs font-semibold text-ink-2">{s.label}</div>
        </div>
      ))}
    </div>
  );
}
