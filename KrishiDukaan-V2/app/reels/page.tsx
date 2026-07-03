import type { Metadata } from "next";
import Link from "next/link";
import {
  getAllReels,
  buildReelSlug,
  linkedProductStorePath,
} from "../lib/seo/reels-server";
import ReelsFeedClient, { type FeedReel } from "./ReelsFeedClient";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://krishidukan.com";

// Fresh feed at most every 10 minutes (ISR) — reels change often.
export const revalidate = 600;

export const metadata: Metadata = {
  title: "AgriReels — Farming Videos, Product Demos & Tips | KrishiDukan",
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
  const reels = await getAllReels(60);

  const feedReels: FeedReel[] = reels.map((r) => ({
    id: r.id,
    slug: buildReelSlug(r.title, r.id),
    videoUrl: r.videoUrl,
    thumbnailUrl: r.thumbnailUrl,
    title: r.title,
    caption: r.caption,
    shopName: r.shopName,
    viewsCount: r.viewsCount,
    likesCount: r.likesCount,
    productPath: linkedProductStorePath(r),
    linkedProductName: r.linkedProductName,
  }));

  // ── JSON-LD: ItemList of VideoObjects — this is what gets each reel's
  //    title/description into Google's video indexing.
  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "KrishiDukan AgriReels",
    itemListElement: reels.slice(0, 30).map((r, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_URL}/reels/${buildReelSlug(r.title, r.id)}`,
      item: {
        "@type": "VideoObject",
        name: r.title || `${r.shopName} on AgriReels`,
        description: r.caption || r.title || `Farming video by ${r.shopName}`,
        contentUrl: r.videoUrl,
        ...(r.thumbnailUrl ? { thumbnailUrl: r.thumbnailUrl } : {}),
        uploadDate: r.createdAtMs
          ? new Date(r.createdAtMs).toISOString()
          : undefined,
        interactionStatistic: {
          "@type": "InteractionCounter",
          interactionType: { "@type": "WatchAction" },
          userInteractionCount: r.viewsCount,
        },
      },
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
        <ReelsFeedClient reels={feedReels} />
      )}
    </main>
  );
}
