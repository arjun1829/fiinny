/**
 * Shared shape for a reel in the web feed.
 *
 * Kept separate from the server-side `SeoReel` (app/lib/seo/reels-server.ts) on
 * purpose: that type mirrors the Firestore document, while this one is the
 * view-model the client components actually need. The mapping between them
 * happens once, in app/reels/page.tsx, so presentation concerns (slug, CSS
 * filter string, resolved product path) never leak back into the data layer.
 */
export interface FeedReel {
  id: string;
  slug: string;
  videoUrl: string;
  thumbnailUrl?: string;
  title: string;
  caption: string;
  shopName: string;
  viewsCount: number;
  likesCount: number;
  productPath: string | null;
  linkedProductName?: string;
  /** Pre-resolved CSS `filter` value for the seller's chosen look filter. */
  cssFilter?: string;
  overlayText?: string;
  /** 'top' | 'center' | 'bottom' — where the seller placed their caption. */
  overlayPos?: string;
}
