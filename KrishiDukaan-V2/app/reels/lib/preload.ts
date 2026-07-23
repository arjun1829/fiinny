/**
 * Preload policy for the reels feed.
 *
 * The feed renders every reel as a real `<video>` in the DOM. The original
 * implementation set `preload="metadata"` on all of them, which told the browser
 * to open a range request for all ~60 reels the moment the page loaded. Those
 * requests compete for bandwidth and connections with the one video the viewer
 * is actually waiting on, so the visible reel started *later* the more content
 * the feed had — the feed got slower as it got better stocked.
 *
 * Policy: fetch aggressively for the reel on screen, cheaply for its immediate
 * neighbours (so a swipe feels instant), and not at all for anything further
 * away.
 */
export type PreloadMode = "auto" | "metadata" | "none";

/** How many reels either side of the active one get a metadata fetch. */
const WARM_RADIUS = 1;

/**
 * @param distance absolute index distance from the currently visible reel.
 */
export function preloadForDistance(distance: number): PreloadMode {
  if (distance === 0) return "auto";
  if (distance <= WARM_RADIUS) return "metadata";
  return "none";
}

/**
 * Whether the `<video>` should carry a `src` at all.
 *
 * Beyond the warm window we omit it entirely rather than relying on
 * `preload="none"`. Chrome and Safari still perform some speculative work for a
 * source-bearing element, and an element with no `src` is guaranteed inert —
 * which matters on the low-end Android devices most of our farmers use, where
 * dozens of idle media elements cost real memory.
 */
export function shouldAttachSource(distance: number): boolean {
  return distance <= WARM_RADIUS;
}
