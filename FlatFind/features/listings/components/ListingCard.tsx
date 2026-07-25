import Link from 'next/link';
import { Badge } from '@/components/ui';
import type { Listing } from '@/types/listing';
import { TAG_CONFIG, CITY_COLOR_CLASS, TYPE_ICON } from '@/constants/listing-display';
import { formatRelativeTime } from '@/utils/format-relative-time';
import { haversineDistanceKm, type LatLng } from '@/utils/haversine';
import { maskPhone } from '@/features/subscription/lib/mask-phone';
import { ImageCarousel } from './ImageCarousel';

const NEW_WINDOW_MS = 2 * 60 * 60 * 1000; // matches isNew in buildCard()
const HOT_VIEW_THRESHOLD = 30; // matches isHot in buildCard()

interface ListingCardProps {
  listing: Listing;
  index: number;
  userLocation?: LatLng | null;
  isSaved?: boolean;
  onToggleSave?: () => void;
  /** True when this listing's contact should show in full — Pro or already-revealed; useContactReveal.isRevealed() folds both cases in. */
  isRevealed?: boolean;
  /** Requests a reveal for this card's listing — gates through login/cap, see useContactReveal. */
  onRevealContact?: () => void;
}

// Mirrors .card / buildCard() (index (1).html, main IIFE). Structural/visual
// port, plus real state wired up across phases:
//
//  - Save button: real per-user persistence as of Phase 10
//    (useSavedListings, instantiated once in ListingGrid and passed down as
//    isSaved/onToggleSave — see that file for why it's not owned per-card).
//  - Click-through: the whole card now links to /listings/[id] (Phase 10),
//    replacing the deferred `el.onclick=()=>openDet(l.id)`. Phase 0 decided
//    detail pages use Next.js intercepting routes, so this Link opens the
//    detail as a modal-over-grid when navigated from here, or as a full
//    page on direct visit/refresh/share — see
//    app/@modal/(.)listings/[id]/page.tsx and app/listings/[id]/page.tsx.
//
// Paywall/reveal gating (isContactLocked, S.freeLeft, .lock-inline,
// cardReveal/cardRevealWA) is now wired via useContactReveal, instantiated
// once in ListingGrid and passed down as isPro/isRevealed/onRevealContact —
// same prop-threading shape isSaved/onToggleSave already use for saves.
export function ListingCard({
  listing,
  index,
  userLocation,
  isSaved = false,
  onToggleSave,
  isRevealed = false,
  onRevealContact,
}: ListingCardProps) {
  const tag = TAG_CONFIG[listing.tag];
  const isNew = Date.now() - new Date(listing.created).getTime() < NEW_WINDOW_MS;
  const isHot = listing.views > HOT_VIEW_THRESHOLD;
  const distanceKm =
    userLocation && listing.lat != null && listing.lng != null
      ? haversineDistanceKm(userLocation, { lat: listing.lat, lng: listing.lng })
      : null;

  return (
    <Link
      href={`/listings/${listing.id}`}
      id={`listing-${listing.id}`}
      className="relative flex flex-col overflow-hidden rounded-r2 border-[1.5px] border-border bg-white no-underline transition-all duration-[180ms] hover:-translate-y-1 hover:border-border-2 hover:shadow-card-lg"
      style={{ animationDelay: `${Math.min(index * 0.05, 0.4)}s` }}
    >
      <div className="relative h-[190px] flex-shrink-0 overflow-hidden bg-gradient-to-br from-[#d1fae5] to-[#a7f3d0]">
        <ImageCarousel images={listing.image_urls} placeholderIcon={TYPE_ICON[listing.type]} />
      </div>

      <div className="absolute right-[11px] top-[11px] z-[4] flex flex-col items-end gap-[5px]">
        {isNew && <Badge variant="new">NEW</Badge>}
        {isHot && <Badge variant="hot">🔥 Hot</Badge>}
      </div>

      <div className="flex flex-1 flex-col p-[18px] pt-4">
        <div className="mb-2 flex flex-wrap items-center gap-[7px]">
          <Badge variant={tag.badgeVariant}>{tag.label.toUpperCase()}</Badge>
          <span className={`text-xs font-bold ${CITY_COLOR_CLASS[listing.city]}`}>{listing.city}</span>
          <span className="text-[11px] font-semibold text-muted">{listing.type}</span>
        </div>

        <div className="mb-[5px] font-display text-[15.5px] font-bold leading-tight text-ink">{listing.title}</div>
        <div className="mb-3 flex items-center gap-[3px] text-[12.5px] text-muted">
          📍 {listing.location}
          {distanceKm != null && <span className="ml-1 font-bold text-brand-2">· {distanceKm} km</span>}
        </div>

        <div className="mb-3 flex-1 text-[13px] leading-[1.6] text-ink-2" style={{
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {listing.description}
        </div>

        <div className="mb-[14px] flex items-center justify-between">
          <div>
            <span className="font-display text-[22px] font-extrabold text-ink">₹{listing.rent.toLocaleString('en-IN')}</span>
            <span className="font-sans text-xs font-normal text-[#bbbbbb]">/mo</span>
          </div>
          <div className="flex items-center gap-[10px]">
            <span className="text-[11.5px] text-[#bbbbbb]">👁 {listing.views}</span>
            <span className="text-[11.5px] text-[#bbbbbb]">🕐 {formatRelativeTime(listing.created)}</span>
            {/* Mirrors .savebtn's onclick="event.stopPropagation();toggleSave(...)" — the
                save action must not trigger the card's own navigation (now a Link). */}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleSave?.();
              }}
              className={`p-0 text-[21px] leading-none transition-colors ${isSaved ? 'text-rose-600' : 'text-[#d4d0cc]'}`}
              title="Save listing"
            >
              {isSaved ? '♥' : '♡'}
            </button>
          </div>
        </div>

        {/* preventDefault+stopPropagation for the same reason as the save button above — contact actions must not trigger the card's own navigation. */}
        <div className="flex gap-2" onClick={(e) => e.preventDefault()}>
          {listing.contact_phone ? (
            isRevealed ? (
              <>
                <button type="button" className="flex-1 rounded-[10px] bg-brand-light px-2 py-[9px] text-[12.5px] font-bold text-brand-2">
                  📞 {listing.contact_phone}
                </button>
                <button type="button" className="flex-1 rounded-[10px] bg-[#dcfce7] px-2 py-[9px] text-[12.5px] font-bold text-[#166534]">
                  💬 WhatsApp
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRevealContact?.();
                }}
                className="flex-1 rounded-[10px] bg-brand-light px-2 py-[9px] text-[12.5px] font-bold text-brand-2"
              >
                🔒 {maskPhone(listing.contact_phone)} · Reveal
              </button>
            )
          ) : (
            <button type="button" className="flex-1 rounded-[10px] bg-brand-light px-2 py-[9px] text-[12.5px] font-bold text-brand-2">
              🔗 View Original Post
            </button>
          )}
        </div>
      </div>
    </Link>
  );
}
