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
import {
  getAllStores,
  getStoreGeography,
  storeUrlPath,
} from "./lib/seo/stores-server";
import { HELP_SECTIONS } from "./views/helpContent";
import { TERMS_VERSION } from "./lib/legal-constants";

// Canonical public origin (kept in sync with app/layout.tsx and app/robots.ts).
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://krishidukan.com";

// Regenerate the sitemap at most once per hour (ISR).
export const revalidate = 3600;

/**
 * WHAT <lastmod> MEANS HERE
 * -------------------------
 * The date the page's CONTENT last changed — never the time the sitemap was
 * generated. Every entry used to be stamped with `now`, so each hourly ISR
 * regeneration told Google that all ~1,400 URLs had just changed. A crawler
 * that checks a few of those, finds them identical, and is told the same thing
 * an hour later learns to ignore the field entirely — which costs exactly the
 * pages that genuinely did change.
 *
 * So: a real timestamp where the record has one, and NO lastmod at all where it
 * does not. Google's own guidance is that an omitted lastmod beats an
 * inaccurate one. That is why the helpers below return undefined rather than a
 * fallback date, and why the static routes carry no lastmod.
 */

/** The freshest lastModified in a set of entries, for its index page. */
function newestOf(entries: MetadataRoute.Sitemap): Date | undefined {
  let newest = 0;
  for (const e of entries) {
    const t = e.lastModified ? new Date(e.lastModified).getTime() : 0;
    if (t > newest) newest = t;
  }
  return newest ? new Date(newest) : undefined;
}

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
// Only SSR routes that return real HTML content to crawlers are listed here.
// The SPA's ?view=* query-param URLs (market, hub, map, about, help) are
// intentionally excluded — they are client-rendered and deliver an empty page
// to search engines, wasting crawl budget and degrading sitemap quality.
function staticEntries(newest: {
  stores?: Date;
  blog?: Date;
}): MetadataRoute.Sitemap {
  // The legal pages are the only static routes with a real edit date: the same
  // constant stamped onto every subscription as the version accepted.
  const legalDate = new Date(TERMS_VERSION);
  const legal = isNaN(legalDate.getTime()) ? undefined : legalDate;

  return [
    // No lastmod on the hand-written routes. Their copy changes when someone
    // edits the code, which this file cannot see, and guessing would put us
    // back where we started.
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1.0 },
    { url: `${SITE_URL}/sell`, changeFrequency: "monthly", priority: 0.9 },
    // The index pages are their listings, so they are as fresh as the freshest
    // thing listed on them.
    { url: `${SITE_URL}/stores`, ...(newest.stores ? { lastModified: newest.stores } : {}), changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/help`, changeFrequency: "monthly", priority: 0.8 },
    // The 21 documentation sections. Same content the SPA has always rendered at
    // /?view=help — which is the homepage shell to a crawler and canonicalises to
    // "/", so none of it could be indexed until these routes existed.
    ...HELP_SECTIONS.map((s) => ({
      url: `${SITE_URL}/help/${s.id}`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    { url: `${SITE_URL}/blog`, ...(newest.blog ? { lastModified: newest.blog } : {}), changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/app`, changeFrequency: "monthly", priority: 0.8 },
    // No version constant tracks the privacy policy, so it carries no lastmod.
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, ...(legal ? { lastModified: legal } : {}), changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/return-policy`, ...(legal ? { lastModified: legal } : {}), changeFrequency: "yearly", priority: 0.4 },
    // Indexed deliberately, and at a higher priority than the other two legal
    // pages: this is the document a manufacturer is pointed at when told that
    // KrishiDukan has no company-specific agreements, so it has to be findable.
    { url: `${SITE_URL}/seller-terms`, ...(legal ? { lastModified: legal } : {}), changeFrequency: "monthly", priority: 0.6 },
  ];
}

// ─── Category entries ───────────────────────────────────────────────────────
function categoryEntries(): MetadataRoute.Sitemap {
  // Canonical SSR category landing pages (/category/[slug]).
  // NOTE: The legacy `/?view=market&category=…` entries were removed — the raw
  // `&` they contained broke XML validation (EntityRef: expecting ';'), and they
  // merely duplicated these canonical, query-param-free category routes.
  return SEO_CATEGORIES.map((c) => ({
    url: `${SITE_URL}/category/${c.slug}`,
    // No lastmod: the page is a live query over the catalogue, so its freshness
    // is whichever product changed last — not knowable without joining every
    // product to a category here. changeFrequency already says "daily".
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
    ...(r.createdAtMs ? { lastModified: new Date(r.createdAtMs) } : {}),
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));
}

// ─── Store entries (dynamic, safe-fallback) ─────────────────────────────────
// State → city → store, built only from sellers that have a real city and state
// on file (see the hard constraint in stores-server.getAllStores). Cities with
// no store never get a URL, so this cannot emit doorway pages.
async function storeEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const [geo, stores] = await Promise.all([getStoreGeography(), getAllStores()]);

    const stateUrls = geo.map((s) => ({
      url: `${SITE_URL}/stores/${s.stateSlug}`,
      // A state page is its list of cities and shops: it changed when the most
      // recently edited shop in it did.
      ...(s.updatedAtMs ? { lastModified: new Date(s.updatedAtMs) } : {}),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

    const cityUrls = geo.flatMap((s) =>
      s.cities.map((c) => ({
        url: `${SITE_URL}/stores/${c.stateSlug}/${c.citySlug}`,
        ...(c.updatedAtMs ? { lastModified: new Date(c.updatedAtMs) } : {}),
        // The "<product> dealer in <city>" target — highest-intent local query.
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
    );

    const storeUrls = stores.map((s) => ({
      // storeUrlPath, not a second copy of the formula: what is submitted here
      // has to be byte-identical to the canonical tag the page emits, or the
      // sitemap advertises URLs that disown themselves.
      url: `${SITE_URL}${storeUrlPath(s)}`,
      ...(s.updatedAtMs ? { lastModified: new Date(s.updatedAtMs) } : {}),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

    return [...stateUrls, ...cityUrls, ...storeUrls];
  } catch (err) {
    console.warn("[sitemap] store entries unavailable:", err);
    return [];
  }
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
  // Dynamic sections fetched in parallel; each resolves to [] on failure so the
  // sitemap always renders the static + category baseline.
  const [brands, posts, products, reels, storeUrls] = await Promise.all([
    brandEntries(),
    blogEntries(),
    productEntries(),
    reelEntries(),
    storeEntries(),
  ]);

  // Index pages inherit the freshness of what they list.
  const newestReel = newestOf(reels);

  return [
    {
      url: `${SITE_URL}/reels`,
      ...(newestReel ? { lastModified: newestReel } : {}),
      changeFrequency: "daily" as const,
      priority: 0.8,
    },
    ...staticEntries({ stores: newestOf(storeUrls), blog: newestOf(posts) }),
    ...categoryEntries(),
    ...storeUrls,
    ...products,
    ...reels,
    ...brands,
    ...posts,
  ];
}
