/**
 * Server-only reels data layer for the SEO SSR pages (/reels, /reels/[slug]).
 *
 * Same server-safe access pattern as products-server.ts: getClientDb() +
 * firebase/firestore/lite over HTTP REST, read-only, never throws (every
 * fetcher returns null/[] on failure). Public read access is permitted by
 * firestore.rules: `match /reels/{reelId} { allow read: if true; }`.
 *
 * These pages exist primarily so each reel's title/caption is server-rendered
 * with VideoObject structured data and gets indexed by Google.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
} from "firebase/firestore/lite";
import { getClientDb } from "../firebase-client-server";
import { buildProductSlug } from "./products-server";

export interface SeoReel {
  id: string;
  videoUrl: string;
  thumbnailUrl?: string;
  title: string;
  caption: string;
  shopName: string;
  shopOwnerId: string;
  viewsCount: number;
  likesCount: number;
  /** Same doc as everything else here, so exposing it costs nothing extra. */
  commentsCount: number;
  createdAtMs: number;
  /** Empty until reels carry crop tags — see reel_ranker.dart's SeasonSignal. */
  cropTags?: string[];
  /** 'approved' | 'flagged'. See mobile/lib/core/models/reel_model.dart for the full contract. */
  moderationStatus: string;
  linkedProductId?: string;
  linkedProductName?: string;
  linkedProductImageUrl?: string;
  /** Playback-time edits set in the mobile upload editor. */
  filterId?: string;
  overlayText?: string;
  overlayPos?: string; // 'top' | 'center' | 'bottom'
}

/** Maps mobile filter ids (reel_filters.dart) to equivalent CSS filters. */
export function reelCssFilter(filterId: string | undefined): string | undefined {
  switch (filterId) {
    case "warm":  return "sepia(0.25) saturate(1.2) hue-rotate(-10deg)";
    case "cool":  return "saturate(1.1) hue-rotate(15deg) brightness(1.03)";
    case "vivid": return "saturate(1.35) contrast(1.05)";
    case "mono":  return "grayscale(1)";
    case "sepia": return "sepia(0.9)";
    default:      return undefined;
  }
}

function str(v: unknown, fallback = ""): string {
  return v == null ? fallback : String(v);
}

function mapReel(id: string, data: Record<string, unknown>): SeoReel {
  return {
    id,
    videoUrl: str(data.videoUrl),
    thumbnailUrl: data.thumbnailUrl ? str(data.thumbnailUrl) : undefined,
    title: str(data.title),
    caption: str(data.caption),
    shopName: str(data.shopName),
    shopOwnerId: str(data.shopOwnerId),
    viewsCount: Number(data.viewsCount) || 0,
    likesCount: Number(data.likesCount) || 0,
    commentsCount: Number(data.commentsCount) || 0,
    createdAtMs:
      (data.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0,
    cropTags: Array.isArray(data.cropTags)
      ? (data.cropTags as unknown[]).map(String)
      : undefined,
    moderationStatus: str(data.moderationStatus, "approved"),
    linkedProductId: data.linkedProductId ? str(data.linkedProductId) : undefined,
    linkedProductName: data.linkedProductName
      ? str(data.linkedProductName)
      : undefined,
    linkedProductImageUrl: data.linkedProductImageUrl
      ? str(data.linkedProductImageUrl)
      : undefined,
    filterId: data.filterId ? str(data.filterId) : undefined,
    overlayText: data.overlayText ? str(data.overlayText) : undefined,
    overlayPos: data.overlayPos ? str(data.overlayPos) : undefined,
  };
}

/**
 * A reel must have a playable video and not be flagged to be
 * listable/indexable. Gates both getAllReels (the /reels feed + sitemap)
 * and getReelById (the /reels/[slug] detail page and share-link target) —
 * a flagged reel must disappear from every public surface, not just the
 * feed, or a direct link keeps it fully visible.
 */
function isListable(r: SeoReel): boolean {
  return r.videoUrl.length > 0 && r.moderationStatus !== "flagged";
}

// ─── Slug helpers (same convention as product slugs: {kebab-title}--{docId}) ─

export function buildReelSlug(title: string, id: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
  return base ? `${base}--${id}` : id;
}

export function extractReelIdFromSlug(slug: string): string {
  const decoded = decodeURIComponent(slug).trim();
  const sep = decoded.indexOf("--");
  if (sep !== -1) return decoded.slice(sep + 2);
  const idx = decoded.lastIndexOf("-");
  return idx === -1 ? decoded : decoded.slice(idx + 1);
}

/** Canonical (indexable) URL path for a reel's linked product, if any. */
export function linkedProductPath(reel: SeoReel): string | null {
  if (!reel.linkedProductId) return null;
  return `/products/${buildProductSlug(
    reel.linkedProductName ?? "",
    reel.linkedProductId,
  )}`;
}

/**
 * Shopping deep link for a reel's linked product: opens the interactive
 * store product view (sellers, cart, Buy Now) — the page humans buy on.
 * SEO surfaces (JSON-LD, sitemap) keep using linkedProductPath instead.
 */
export function linkedProductStorePath(reel: SeoReel): string | null {
  if (!reel.linkedProductId) return null;
  return `/?view=product&product=${encodeURIComponent(reel.linkedProductId)}`;
}

// ─── Fetchers ────────────────────────────────────────────────────────────────

/** Newest-first reel feed. */
export async function getAllReels(max = 60): Promise<SeoReel[]> {
  try {
    const db = getClientDb();
    const snap = await getDocs(query(collection(db, "reels"), limit(max * 2)));
    const reels = snap.docs
      .map((d) => mapReel(d.id, d.data() as Record<string, unknown>))
      .filter(isListable);
    reels.sort((a, b) => b.createdAtMs - a.createdAtMs);
    return reels.slice(0, max);
  } catch (err) {
    console.warn("[seo/reels-server] getAllReels failed:", err);
    return [];
  }
}

export async function getReelById(id: string): Promise<SeoReel | null> {
  try {
    if (!id) return null;
    const db = getClientDb();
    const snap = await getDoc(doc(db, "reels", id));
    if (!snap.exists()) return null;
    const reel = mapReel(snap.id, snap.data() as Record<string, unknown>);
    return isListable(reel) ? reel : null;
  } catch (err) {
    console.warn("[seo/reels-server] getReelById failed:", err);
    return null;
  }
}

/** All indexable reels for the sitemap. */
export async function getReelsForSitemap(
  max = 2000,
): Promise<{ id: string; title: string; createdAtMs: number }[]> {
  try {
    const reels = await getAllReels(max);
    return reels.map((r) => ({
      id: r.id,
      title: r.title,
      createdAtMs: r.createdAtMs,
    }));
  } catch (err) {
    console.warn("[seo/reels-server] sitemap reels failed:", err);
    return [];
  }
}
