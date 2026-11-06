/**
 * Shared, client- AND server-safe helpers for brand-page "Tips & Videos" links.
 *
 * The brandPages `videos: string[]` array historically stored bare 11-character
 * YouTube video IDs. It now stores full http(s) URLs from any platform
 * (YouTube incl. Shorts, Instagram Reels, Facebook videos, or any other link),
 * while legacy bare IDs continue to work unchanged (back-compat).
 *
 * `parseBrandVideo` is the single sanitisation gate: it accepts only legacy
 * YouTube IDs or safe http/https URLs and rejects everything else (javascript:,
 * data:, malformed strings). Because it runs wherever the brand page renders —
 * including server-side during SSR of /brand/[slug] — unsafe stored values are
 * stripped on the server before they can reach the DOM.
 */

export type BrandVideoPlatform = 'youtube' | 'instagram' | 'facebook' | 'link';

export type BrandVideo = {
  /** Safe http(s) URL that always opens the original content. */
  href: string;
  platform: BrandVideoPlatform;
  /** Inline-embeddable URL, present only where embedding is reliable (YouTube). */
  embedUrl?: string;
  /** Thumbnail URL when cheaply derivable (YouTube). */
  thumbnail?: string;
  /** Short display label, e.g. "YouTube", "Instagram". */
  label: string;
};

const YT_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

/** Extract a YouTube video id from any YouTube URL form (watch, youtu.be, embed, shorts, live). */
function youtubeIdFromUrl(u: URL): string | null {
  const host = u.hostname.replace(/^www\./, '').toLowerCase();
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0];
    return YT_ID_RE.test(id) ? id : null;
  }
  if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtube-nocookie.com' || host.endsWith('.youtube-nocookie.com')) {
    const v = u.searchParams.get('v');
    if (v && YT_ID_RE.test(v)) return v;
    const m = u.pathname.match(/\/(?:embed|shorts|v|live)\/([a-zA-Z0-9_-]{11})/);
    if (m) return m[1];
  }
  return null;
}

/**
 * True when the raw string is something we accept into the videos array:
 * a legacy bare YouTube id, or a well-formed http/https URL. Used for the
 * editor's client-side add validation. Rejects empty, malformed, and any
 * non-http(s) protocol (javascript:, data:, ftp:, …).
 */
export function isValidBrandVideoUrl(input: string): boolean {
  const t = (input ?? '').trim();
  if (!t) return false;
  if (YT_ID_RE.test(t)) return true; // legacy bare YouTube id (back-compat)
  try {
    const u = new URL(t);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Classify one stored entry (legacy bare YouTube id OR a full URL) into a safe,
 * displayable descriptor. Returns null for anything that is not a legacy id or a
 * safe http/https URL — the server-side sanitisation gate.
 */
export function parseBrandVideo(entry: string): BrandVideo | null {
  const t = (entry ?? '').trim();
  if (!t) return null;

  // Legacy: bare 11-char YouTube video id.
  if (YT_ID_RE.test(t)) {
    return {
      href: `https://www.youtube.com/watch?v=${t}`,
      platform: 'youtube',
      embedUrl: `https://www.youtube.com/embed/${t}?rel=0&modestbranding=1`,
      thumbnail: `https://img.youtube.com/vi/${t}/mqdefault.jpg`,
      label: 'YouTube',
    };
  }

  let u: URL;
  try {
    u = new URL(t);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;

  const host = u.hostname.replace(/^www\./, '').toLowerCase();
  const href = u.toString();

  const ytId = youtubeIdFromUrl(u);
  if (ytId) {
    return {
      href,
      platform: 'youtube',
      embedUrl: `https://www.youtube.com/embed/${ytId}?rel=0&modestbranding=1`,
      thumbnail: `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`,
      label: 'YouTube',
    };
  }

  if (host === 'instagram.com' || host.endsWith('.instagram.com')) {
    // Instagram's iframe embed endpoint: {origin}{pathname}embed (query dropped).
    const path = u.pathname.endsWith('/') ? u.pathname : `${u.pathname}/`;
    return {
      href,
      platform: 'instagram',
      embedUrl: `${u.origin}${path}embed`,
      label: 'Instagram',
    };
  }
  if (
    host === 'facebook.com' || host.endsWith('.facebook.com') ||
    host === 'fb.watch' || host === 'fb.com' || host.endsWith('.fb.com')
  ) {
    // Facebook's video plugin renders any public video/reel URL in an iframe.
    return {
      href,
      platform: 'facebook',
      embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(href)}&show_text=false`,
      label: 'Facebook',
    };
  }
  return { href, platform: 'link', label: 'Watch' };
}

/** Map a raw videos array to safe descriptors, dropping unsafe/malformed/duplicate entries. */
export function parseBrandVideos(entries: readonly string[] | undefined | null): BrandVideo[] {
  if (!Array.isArray(entries)) return [];
  const out: BrandVideo[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    const v = parseBrandVideo(e);
    if (v && !seen.has(v.href)) {
      seen.add(v.href);
      out.push(v);
    }
  }
  return out;
}
