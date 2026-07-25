/**
 * Server-only product data layer for SEO SSR pages (/products, /category).
 *
 * Uses the same server-safe Firebase access pattern as the brand pages
 * (getClientDb() + firebase/firestore/lite over HTTP REST). This module is
 * READ-ONLY: it never writes, and it deliberately does NOT reuse the client
 * fetchMarketplaceProducts() dedup/merge logic — SEO pages render the single
 * canonical product document directly, which is simpler and cannot drift from
 * or affect marketplace behavior.
 *
 * Public read access is permitted by firestore.rules:
 *   match /products/{productId} { allow read: if true; }
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore/lite";
import { getClientDb } from "../firebase-client-server";

// Per-seller copies — never indexed; only the canonical product gets a page.
const COPY_SOURCES = new Set([
  "retailer_inventory_copy",
  "manufacturer_assigned",
  "admin_assigned",
]);

export interface ProductReel {
  id: string;
  videoUrl: string;
  thumbnailUrl?: string;
  title: string;
  caption: string;
  shopName: string;
  viewsCount: number;
}

export interface SeoProduct {
  id: string;
  name: string;
  fullName?: string;
  description: string;
  category: string;
  price: number;
  oldPrice?: number;
  image: string;
  images: string[];
  averageRating?: number;
  totalReviews?: number;
  lowestPrice?: number;
  lowestFinalPrice?: number;
  variants: { unit: string; price: number; stock?: number }[];
  categoryInfo: Record<string, string | string[]>;
  benefits: string[];
  inStock: boolean;
}

function str(v: unknown, fallback = ""): string {
  return v == null ? fallback : String(v);
}

function mapProduct(id: string, data: Record<string, unknown>): SeoProduct {
  const stockText = str(data.stock, "In Stock").toLowerCase();
  const inStock =
    stockText === "in stock" ||
    stockText === "fast selling" ||
    stockText === "trending" ||
    stockText === "";

  return {
    id,
    name: str(data.name),
    fullName: data.fullName ? str(data.fullName) : undefined,
    description: str(data.description),
    category: str(data.category, "Other"),
    price: Number(data.price || 0),
    oldPrice: data.oldPrice ? Number(data.oldPrice) : undefined,
    image: str(data.image),
    images: Array.isArray(data.images) ? (data.images as string[]) : [],
    averageRating:
      typeof data.averageRating === "number" ? data.averageRating : undefined,
    totalReviews:
      typeof data.totalReviews === "number" ? data.totalReviews : undefined,
    lowestPrice:
      typeof data.lowestPrice === "number" ? data.lowestPrice : undefined,
    lowestFinalPrice:
      typeof data.lowestFinalPrice === "number"
        ? data.lowestFinalPrice
        : undefined,
    variants: Array.isArray(data.variants)
      ? (data.variants as { unit: string; price: number; stock?: number }[])
      : [],
    categoryInfo:
      data.categoryInfo &&
      typeof data.categoryInfo === "object" &&
      !Array.isArray(data.categoryInfo)
        ? (data.categoryInfo as Record<string, string | string[]>)
        : {},
    benefits: Array.isArray(data.benefits) ? (data.benefits as string[]) : [],
    inStock,
  };
}

/** True if the doc is a public, canonical, listable product (not a copy/inactive). */
function isListable(data: Record<string, unknown>): boolean {
  if (data.isActive === false) return false;
  if (COPY_SOURCES.has(str(data.source))) return false;
  if (!data.name || !data.image) return false;
  if (!Number.isFinite(Number(data.price))) return false;
  return true;
}

// ─── Slug helpers ─────────────────────────────────────────────────────────
// URL slug format: `{kebab-name}--{docId}` (double-hyphen separator).
// The double hyphen is used because both the kebab name and the Firestore doc
// id can contain single hyphens (e.g. doc id "karanarjun-humi-gold-250-g"),
// making a single-hyphen separator ambiguous at extraction time.
//
// Legacy slugs built before this fix used a single hyphen and only worked
// correctly for auto-generated (no-hyphen) doc ids. The extractor below
// handles both formats so existing indexed URLs continue to resolve.

export function buildProductSlug(name: string, id: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
  return base ? `${base}--${id}` : id;
}

/** Extract the Firestore doc id from a product slug.
 *  New format:    `{kebab-name}--{docId}`  → split on first "--"
 *  Legacy format: `{kebab-name}-{docId}`   → lastIndexOf("-") fallback
 *  Bare id (no name prefix):               → returned as-is
 */
export function extractIdFromSlug(slug: string): string {
  const decoded = decodeURIComponent(slug).trim();
  const sep = decoded.indexOf("--");
  if (sep !== -1) return decoded.slice(sep + 2);
  // Legacy: single-hyphen format — only correct for IDs that contain no hyphens.
  const idx = decoded.lastIndexOf("-");
  return idx === -1 ? decoded : decoded.slice(idx + 1);
}

// ─── Fetchers (each returns null/[] on failure — never throws) ──────────────

export async function getProductById(id: string): Promise<SeoProduct | null> {
  try {
    if (!id) return null;
    const db = getClientDb();
    const snap = await getDoc(doc(db, "products", id));
    if (!snap.exists()) return null;
    const data = snap.data() as Record<string, unknown>;
    if (!isListable(data)) return null;
    return mapProduct(snap.id, data);
  } catch (err) {
    console.warn("[seo/products-server] getProductById failed:", err);
    return null;
  }
}

export async function getReelsForProduct(productId: string): Promise<ProductReel[]> {
  try {
    if (!productId) return [];
    const db = getClientDb();
    const snap = await getDocs(
      query(
        collection(db, "reels"),
        where("linkedProductId", "==", productId),
        limit(50),
      ),
    );
    const reels = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        videoUrl: str(data.videoUrl),
        thumbnailUrl: data.thumbnailUrl ? str(data.thumbnailUrl) : undefined,
        title: str(data.title),
        caption: str(data.caption),
        shopName: str(data.shopName),
        viewsCount: Number(data.viewsCount) || 0,
        createdAt: data.createdAt?.toMillis?.() || 0,
      };
    });
    // Sort manually as Firestore requires composite index for query sorting
    reels.sort((a, b) => {
      const byViews = b.viewsCount - a.viewsCount;
      if (byViews !== 0) return byViews;
      return b.createdAt - a.createdAt;
    });
    return reels.slice(0, 5).map(({ createdAt, ...rest }) => rest);
  } catch (err) {
    console.warn("[seo/products-server] getReelsForProduct failed:", err);
    return [];
  }
}

export async function getProductsByCategory(
  categoryName: string,
  max = 60,
): Promise<SeoProduct[]> {
  try {
    const db = getClientDb();
    const snap = await getDocs(
      query(
        collection(db, "products"),
        where("category", "==", categoryName),
        limit(Math.min(max * 3, 300)),
      ),
    );
    return snap.docs
      .map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }))
      .filter(({ data }) => isListable(data))
      .map(({ id, data }) => mapProduct(id, data))
      .slice(0, max);
  } catch (err) {
    console.warn("[seo/products-server] getProductsByCategory failed:", err);
    return [];
  }
}

/** Active canonical products for the sitemap. Returns [] on failure. */
export async function getAllListableProductsForSitemap(
  max = 5000,
): Promise<{ id: string; name: string; updatedAt: unknown }[]> {
  try {
    const db = getClientDb();
    const snap = await getDocs(query(collection(db, "products"), limit(max)));
    return snap.docs
      .map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }))
      .filter(({ data }) => isListable(data))
      .map(({ id, data }) => ({
        id,
        name: str(data.name),
        updatedAt: data.updatedAt ?? data.createdAt ?? null,
      }));
  } catch (err) {
    console.warn("[seo/products-server] sitemap products failed:", err);
    return [];
  }
}
