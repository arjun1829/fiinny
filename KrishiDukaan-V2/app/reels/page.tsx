import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  getAllReels,
  buildReelSlug,
  linkedProductPath,
  reelCssFilter,
  servableLinkedProductIds,
} from "../lib/seo/reels-server";
import ReelsFeedClient from "./ReelsFeedClient";
import { rankReels } from "./lib/ranking/rank";
import type { FeedReel } from "./lib/types";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://krishidukan.com";

// Fresh feed at most every 10 minutes (ISR) — reels change often.
export const revalidate = 600;

export const metadata: Metadata = {
  // Brand appended by the "%s | KrishiDukan" template in app/layout.tsx.
  title: "AgriReels — Farming Videos, Product Demos & Tips",
  description:
    "Watch short farming videos from verified agri sellers: product demos, crop tips, pesticides, fertilizers and seeds in action. Shop products directly from every reel.",
  alternates: { canonical: `${SITE_URL}/reels` },
  openGraph: {
    title: "AgriReels — Farming Videos & Product Demos | KrishiDukan",
    description:
      "Short farming videos from verified agri sellers. Watch demos and shop products directly from every reel.",
    url: `${SITE_URL}/reels`,
    type: "website",
  },
};

export default async function ReelsPage() {
  // Ranked, not raw newest-first — see lib/ranking/rank.ts. Diversifies
  // across sellers and gives fresh, low-view reels a shot instead of
  // burying them under whoever posted most recently.
  const reels = rankReels(await getAllReels(60));

  // A reel's linkedProductId can point at a product that has no page (deleted,
  // deactivated, or a per-seller copy). Resolve once for the whole feed so the
  // "Shop this product" links below are only rendered where they resolve.
  const servableProductIds = await servableLinkedProductIds(reels);

  const feedReels: FeedReel[] = reels.map((r) => ({
    id: r.id,
    slug: buildReelSlug(r.title, r.id),
    videoUrl: r.videoUrl,
    thumbnailUrl: r.thumbnailUrl,
    linkedProductImageUrl: r.linkedProductImageUrl,
    title: r.title,
    caption: r.caption,
    shopName: r.shopName,
    viewsCount: r.viewsCount,
    likesCount: r.likesCount,
    commentsCount: r.commentsCount,
    // Canonical /products/[slug] — see the note in app/reels/[slug]/page.tsx.
    // The feed renders server-side, so these are real crawlable links into the
    // product catalogue; the SPA deep link they replaced was invisible. Gated
    // on servableProductIds so a stale link becomes no link, never a 404.
    productPath:
      r.linkedProductId && servableProductIds.has(r.linkedProductId)
        ? linkedProductPath(r)
        : null,
    linkedProductName: r.linkedProductName,
    cssFilter: reelCssFilter(r.filterId),
    overlayText: r.overlayText,
    overlayPos: r.overlayPos,
  }));

  // ── JSON-LD: ItemList of links to the watch pages.
  //
  // Deliberately NOT VideoObject entries, which is what this used to emit.
  // A VideoObject is attributed to the page carrying it, and this page is a
  // thumbnail grid with no player — so declaring thirty of them here told
  // Google about thirty videos that are not on a watch page, and Search
  // Console rejected every one of them with exactly that reason. An ItemList
  // of URLs says the true thing: these are links to pages, and each of those
  // pages carries one video and the markup describing it.
  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "KrishiDukan AgriReels",
    itemListElement: reels.slice(0, 30).map((r, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_URL}/reels/${buildReelSlug(r.title, r.id)}`,
      name: r.title || `${r.shopName} on AgriReels`,
    })),
  };

  return (
    <main className="min-h-screen bg-black">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }}
      />

      {/* Slim top bar (h-16 — the feed height calc assumes this) */}
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between bg-black/90 px-4 backdrop-blur-sm">
        <Link href="/" className="flex items-center gap-2">
          <span className="font-black text-xl text-white">
            Agri<span className="text-secondary">Reels</span>
          </span>
        </Link>
        <Link
          href="/"
          className="rounded-full border border-white/25 px-4 py-1.5 text-xs font-bold text-white hover:bg-white/10 transition-colors"
        >
          ← Back to store
        </Link>
      </header>

      {feedReels.length === 0 ? (
        <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-white/70">
          <p className="text-lg font-bold">No reels yet</p>
          <p className="text-sm">Sellers can post the first one from the KrishiDukan app!</p>
        </div>
      ) : (
        <Suspense fallback={<div className="h-[calc(100dvh-4rem)] bg-black" />}>
          <ReelsFeedClient reels={feedReels} />
        </Suspense>
      )}
    </main>
  );
}
