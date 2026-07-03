import type { MetadataRoute } from "next";
import {
  collection,
  getDocs,
  query,
  where,
  limit,
} from "firebase/firestore/lite";
import { getClientDb } from "./lib/firebase-client-server";
import { SEO_CATEGORIES } from "./lib/seo/category-meta";
import {
  getAllListableProductsForSitemap,
  buildProductSlug,
} from "./lib/seo/products-server";
import { getReelsForSitemap, buildReelSlug } from "./lib/seo/reels-server";

// Canonical public origin (kept in sync with app/layout.tsx and app/robots.ts).
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://krishidukan.com";

// Regenerate the sitemap at most once per hour (ISR).
export const revalidate = 3600;

// Firestore Timestamp | Date | string → Date, with a safe fallback to now.
function toDate(value: unknown): Date {
  try {
    const d = (value as { toDate?: () => Date })?.toDate?.();
    if (d instanceof Date && !isNaN(d.getTime())) return d;
    if (value) {
      const parsed = new Date(value as string);
      if (!isNaN(parsed.getTime())) return parsed;
    }
  } catch {
    /* ignore */
  }
  return new Date();
}

// ─── Static public entries ──────────────────────────────────────────────────
// These map to the SPA's public query-based views, which are the real navigable
// URLs today. Authenticated/cart views are intentionally excluded.
function staticEntries(now: Date): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "daily", priority: 1.0 },
    { url: `${SITE_URL}/?view=market`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/?view=hub`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/?view=map`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/?view=about`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/?view=help`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}

// ─── Category entries ───────────────────────────────────────────────────────
function categoryEntries(now: Date): MetadataRoute.Sitemap {
  // Canonical SSR category landing pages (/category/[slug]).
  // NOTE: The legacy `/?view=market&category=…` entries were removed — the raw
  // `&` they contained broke XML validation (EntityRef: expecting ';'), and they
  // merely duplicated these canonical, query-param-free category routes.
  return SEO_CATEGORIES.map((c) => ({
    url: `${SITE_URL}/category/${c.slug}`,
    lastModified: now,
    changeFrequency: "daily" as const,
    priority: 0.9,
  }));
}

// ─── Product entries (dynamic, safe-fallback) ───────────────────────────────
async function productEntries(): Promise<MetadataRoute.Sitemap> {
  const products = await getAllListableProductsForSitemap();
  return products.map((p) => ({
    url: `${SITE_URL}/products/${buildProductSlug(p.name, p.id)}`,
    lastModified: toDate(p.updatedAt),
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));
}

// ─── Brand entries (dynamic, safe-fallback) ─────────────────────────────────
async function brandEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const db = getClientDb();
    const snap = await getDocs(
      query(collection(db, "manufacturers"), where("slug", "!=", ""), limit(2000)),
    );
    return snap.docs
      .map((d) => {
        const data = d.data() as Record<string, unknown>;
        const slug = typeof data.slug === "string" ? data.slug.trim() : "";
        if (!slug) return null;
        return {
          url: `${SITE_URL}/brand/${slug}`,
          lastModified: toDate(data.updatedAt),
          changeFrequency: "weekly" as const,
          priority: 0.7,
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);
  } catch (err) {
    console.warn("[sitemap] brand entries unavailable:", err);
    return [];
  }
}

// ─── Reel entries (dynamic, safe-fallback) ──────────────────────────────────
async function reelEntries(): Promise<MetadataRoute.Sitemap> {
  const reels = await getReelsForSitemap();
  return reels.map((r) => ({
    url: `${SITE_URL}/reels/${buildReelSlug(r.title, r.id)}`,
    lastModified: r.createdAtMs ? new Date(r.createdAtMs) : new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));
}

// ─── Blog entries (dynamic, safe-fallback) ──────────────────────────────────
async function blogEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const db = getClientDb();
    const snap = await getDocs(
      query(
        collection(db, "blogPosts"),
        where("status", "==", "published"),
        limit(5000),
      ),
    );
    return snap.docs
      .map((d) => {
        const data = d.data() as Record<string, unknown>;
        const slug = typeof data.slug === "string" ? data.slug.trim() : "";
        if (!slug) return null;
        return {
          url: `${SITE_URL}/blog/${encodeURIComponent(slug)}`,
          lastModified: toDate(data.updatedAt ?? data.publishedAt),
          changeFrequency: "monthly" as const,
          priority: 0.6,
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);
  } catch (err) {
    console.warn("[sitemap] blog entries unavailable:", err);
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Dynamic sections fetched in parallel; each resolves to [] on failure so the
  // sitemap always renders the static + category baseline.
  const [brands, posts, products, reels] = await Promise.all([
    brandEntries(),
    blogEntries(),
    productEntries(),
    reelEntries(),
  ]);

  return [
    { url: `${SITE_URL}/reels`, lastModified: now, changeFrequency: "daily" as const, priority: 0.8 },
    ...staticEntries(now),
    ...categoryEntries(now),
    ...products,
    ...reels,
    ...brands,
    ...posts,
  ];
}
