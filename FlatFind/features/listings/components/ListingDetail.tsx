'use client';

import { useEffect } from 'react';
import { Badge } from '@/components/ui';
import type { Listing } from '@/types/listing';
import { TAG_CONFIG, CITY_COLOR_CLASS, TYPE_ICON } from '@/constants/listing-display';
import { formatRelativeTime } from '@/utils/format-relative-time';
import { haversineDistanceKm, type LatLng } from '@/utils/haversine';
import { useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useUserLocation } from '@/features/map/hooks/useUserLocation';
import { recordListingView } from '@/features/saved-history/lib/saved-history-firestore';
import { useSavedListings } from '@/features/saved-history/hooks/useSavedListings';
import { useContactReveal } from '@/features/subscription/hooks/useContactReveal';
import { UpgradeModal } from '@/features/subscription/components/UpgradeModal';
import { maskPhone } from '@/features/subscription/lib/mask-phone';
import { LoginModal } from '@/features/auth/components/LoginModal';
import { ImageCarousel } from './ImageCarousel';

interface ListingDetailProps {
  listing: Listing;
  /** Present when rendered inside the intercepting-route modal; renders a × close button instead of nothing. */
  onClose?: () => void;
}

// Mirrors openDet() (index (1).html, main IIFE) — same structure: full-size
// carousel, tag/type/city chips, title/location row with save + close,
// rent row, description, meta chips (distance/views/date/source), contact
// actions. Two behavioral differences:
//
//  1. View tracking: the original bumped `l.views++` in-memory and added
//     to S.viewedIds on every open, including the poster's own repeat
//     visits and simple re-opens with no persistence. Here,
//     recordListingView() (Phase 10) writes a real per-user history record
//     — but only when a user is signed in (anonymous browsing still works
//     for viewing, just doesn't populate /history, since there's no uid to
//     attach the record to). The `views` counter itself is NOT
//     incremented client-side anymore — this component doesn't write to
//     the listing document — that's server-side-trigger territory
//     (analogous to KrishiDukaan's Cloud Functions pattern) which is out
//     of scope for Phase 10.
//  2. Paywall/reveal gating: this component owns its own useContactReveal
//     instance (same independence useSavedListings/useRequireAuth already
//     have here) rather than receiving it as a prop — ListingDetail is
//     reached both from the intercepting-route modal (sibling of
//     ListingGrid, no shared ancestor) and the standalone /listings/[id]
//     page, so there's no single parent to lift this state into.
export function ListingDetail({ listing, onClose }: ListingDetailProps) {
  const { user } = useAuth();
  const userLocation = useUserLocation();
  const { savedIds, toggleSave, loginModalOpen, loginModalMessage, closeLoginModal } = useSavedListings();
  const isSaved = savedIds.has(listing.id);
  const {
    isRevealed,
    reveal,
    loginModalOpen: revealLoginModalOpen,
    loginModalMessage: revealLoginModalMessage,
    closeLoginModal: closeRevealLoginModal,
  } = useContactReveal();
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const contactRevealed = isRevealed(listing.id);

  useEffect(() => {
    if (user) {
      recordListingView(user.uid, listing.id).catch(() => {});
    }
  }, [user, listing.id]);

  const tag = TAG_CONFIG[listing.tag];
  const distanceKm: number | null =
    userLocation && listing.lat != null && listing.lng != null
      ? haversineDistanceKm(userLocation as LatLng, { lat: listing.lat, lng: listing.lng })
      : null;

  return (
    <div className="mx-auto max-w-[580px] overflow-hidden rounded-r3 bg-white">
      <div className="relative h-[280px] overflow-hidden rounded-t-r3 bg-gradient-to-br from-[#d1fae5] to-[#a7f3d0]">
        <ImageCarousel images={listing.image_urls} placeholderIcon={TYPE_ICON[listing.type]} />
      </div>

      <div className="px-[26px] pt-[22px]">
        <div className="mb-[10px] flex flex-wrap gap-2">
          <Badge variant={tag.badgeVariant}>{tag.label.toUpperCase()}</Badge>
          <span className="rounded-full bg-[#f5f4f2] px-[13px] py-[5px] text-[12.5px] font-semibold text-ink-2">
            {listing.type}
          </span>
          <span className={`rounded-full bg-[#f5f4f2] px-[13px] py-[5px] text-[12.5px] font-semibold ${CITY_COLOR_CLASS[listing.city]}`}>
            {listing.city}
          </span>
        </div>

        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="mb-1 font-display text-2xl font-extrabold tracking-tight text-ink">{listing.title}</div>
            <div className="flex items-center gap-1 text-[13.5px] text-muted">📍 {listing.location}</div>
          </div>
          <div className="flex flex-shrink-0 items-start gap-2">
            <button
              type="button"
              onClick={() => toggleSave(listing.id)}
              title="Save listing"
              className={`p-0 text-[26px] leading-none ${isSaved ? 'text-rose-600' : 'text-[#d4d0cc]'}`}
            >
              {isSaved ? '♥' : '♡'}
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-[#f5f4f2] text-xl text-ink-2"
              >
                &times;
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mx-[26px] mt-4 flex items-center justify-between rounded-2xl bg-bg px-5 py-4">
        <div>
          <div className="text-[11px] font-bold tracking-[0.08em] text-muted">MONTHLY RENT</div>
          <div className="font-display text-[32px] font-black tracking-tight text-ink">
            ₹{listing.rent.toLocaleString('en-IN')}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] text-muted">Listed by</div>
          <div className="text-sm font-bold text-ink">{listing.owner_name || 'Owner'}</div>
          <div className="mt-[2px] text-xs font-semibold text-brand-2">{formatRelativeTime(listing.created)}</div>
        </div>
      </div>

      <div className="px-[26px] pb-[26px] pt-4">
        <p className="mb-4 text-sm leading-[1.8] text-ink-2">{listing.description}</p>

        <div className="mb-5 flex flex-wrap gap-2">
          {distanceKm != null && (
            <span className="rounded-full bg-brand-light px-[13px] py-[5px] text-[12.5px] font-semibold text-brand-2">
              📏 {distanceKm} km away
            </span>
          )}
          <span className="rounded-full bg-[#f5f4f2] px-[13px] py-[5px] text-[12.5px] font-semibold text-ink-2">
            👁 {listing.views} views
          </span>
          <span className="rounded-full bg-[#f5f4f2] px-[13px] py-[5px] text-[12.5px] font-semibold text-ink-2">
            📅 {new Date(listing.created).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
          <span className="rounded-full bg-[#f5f4f2] px-[13px] py-[5px] text-[12.5px] font-semibold text-ink-2">
            Source: {listing.source}
          </span>
        </div>

        {listing.contact_phone ? (
          contactRevealed ? (
            <div className="flex gap-[10px]">
              <button type="button" className="flex-1 rounded-2xl bg-brand py-[13px] text-[15px] font-bold text-white">
                📞 {listing.contact_phone}
              </button>
              <button type="button" className="flex-1 rounded-2xl bg-brand-light py-[13px] text-[15px] font-bold text-brand-2">
                💬 WhatsApp
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => reveal(listing.id, () => setUpgradeModalOpen(true))}
              className="w-full rounded-2xl bg-brand-light py-[13px] text-[15px] font-bold text-brand-2"
            >
              🔒 {maskPhone(listing.contact_phone)} · Reveal Contact
            </button>
          )
        ) : (
          <button
            type="button"
            onClick={() => listing.fb_url && window.open(listing.fb_url, '_blank')}
            className="w-full rounded-2xl bg-brand-light py-[13px] text-[15px] font-bold text-brand-2"
          >
            🔗 View Original Post
          </button>
        )}
      </div>

      <LoginModal open={loginModalOpen} onClose={closeLoginModal} message={loginModalMessage} />
      <LoginModal open={revealLoginModalOpen} onClose={closeRevealLoginModal} message={revealLoginModalMessage} />
      <UpgradeModal open={upgradeModalOpen} onClose={() => setUpgradeModalOpen(false)} />
    </div>
  );
}
