import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getReelById,
  getAllReels,
  buildReelSlug,
  extractReelIdFromSlug,
  linkedProductStorePath,
  reelCssFilter,
} from "../../lib/seo/reels-server";
import ReelOverlay from "../components/ReelOverlay";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://krishidukan.com";

export const revalidate = 600;

interface PageProps {
  params: Promise<{ slug: string }>;
}

// ─── Metadata: reel title + caption become the indexable <title>/<meta> ─────

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const reel = await getReelById(extractReelIdFromSlug(slug));
  if (!reel) return { title: "Reel not found | KrishiDukan" };

  const title = reel.title
    ? `${reel.title} | AgriReels — KrishiDukan`
    : `${reel.shopName} on AgriReels | KrishiDukan`;
  const description =
    reel.caption ||
    reel.title ||
    `Watch this farming video by ${reel.shopName} on KrishiDukan AgriReels.`;
  const canonical = `${SITE_URL}/reels/${buildReelSlug(reel.title, reel.id)}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "video.other",
      ...(reel.thumbnailUrl ? { images: [reel.thumbnailUrl] } : {}),
      videos: [{ url: reel.videoUrl }],
    },
    twitter: {
      card: "player",
      title,
      description,
      ...(reel.thumbnailUrl ? { images: [reel.thumbnailUrl] } : {}),
    },
  };
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function ReelPage({ params }: PageProps) {
  const { slug } = await params;
  const reel = await getReelById(extractReelIdFromSlug(slug));
  if (!reel) notFound();

  const productPath = linkedProductStorePath(reel);
  const canonical = `${SITE_URL}/reels/${buildReelSlug(reel.title, reel.id)}`;

  // More reels for the "watch next" rail (excluding this one).
  const others = (await getAllReels(13)).filter((r) => r.id !== reel.id).slice(0, 12);

  // ── JSON-LD: VideoObject — Google's video rich-result format.
  const videoLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: reel.title || `${reel.shopName} on AgriReels`,
    description:
      reel.caption || reel.title || `Farming video by ${reel.shopName} on KrishiDukan.`,
    contentUrl: reel.videoUrl,
    url: canonical,
    ...(reel.thumbnailUrl ? { thumbnailUrl: reel.thumbnailUrl } : {}),
    ...(reel.createdAtMs
      ? { uploadDate: new Date(reel.createdAtMs).toISOString() }
      : {}),
    publisher: {
      "@type": "Organization",
      name: "KrishiDukan",
      url: SITE_URL,
    },
    author: { "@type": "Organization", name: reel.shopName },
    interactionStatistic: [
      {
        "@type": "InteractionCounter",
        interactionType: { "@type": "WatchAction" },
        userInteractionCount: reel.viewsCount,
      },
      {
        "@type": "InteractionCounter",
        interactionType: { "@type": "LikeAction" },
        userInteractionCount: reel.likesCount,
      },
    ],
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "KrishiDukan", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "AgriReels", item: `${SITE_URL}/reels` },
      { "@type": "ListItem", position: 3, name: reel.title || reel.shopName },
    ],
  };

  return (
    <main className="min-h-screen bg-surface">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(videoLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      <div className="mx-auto max-w-4xl px-4 py-8">
        {/* Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          className="mb-6 flex flex-wrap items-center gap-2 text-xs font-semibold text-on-surface-variant"
        >
          <Link href="/" className="hover:text-primary">KrishiDukan</Link>
          <span>›</span>
          <Link href="/reels" className="hover:text-primary">AgriReels</Link>
          <span>›</span>
          <span className="max-w-[240px] truncate text-primary">
            {reel.title || `@${reel.shopName}`}
          </span>
        </nav>

        <div className="grid gap-8 md:grid-cols-[minmax(0,380px)_1fr]">
          {/* Video (with the seller's playback-time filter + text overlay) */}
          <div className="relative overflow-hidden rounded-2xl bg-black">
            <video
              src={reel.videoUrl}
              poster={reel.thumbnailUrl}
              controls
              playsInline
              // This page has exactly one video and the visitor arrived
              // specifically to watch it, so fetching eagerly is right here —
              // unlike the feed, where dozens of elements compete (see
              // ../lib/preload.ts).
              preload="auto"
              style={
                reelCssFilter(reel.filterId)
                  ? { filter: reelCssFilter(reel.filterId) }
                  : undefined
              }
              className="aspect-[9/16] w-full object-contain"
            />
            {reel.overlayText ? (
              <ReelOverlay
                text={reel.overlayText}
                position={reel.overlayPos}
                variant="detail"
              />
            ) : null}
          </div>

          {/* Details */}
          <div>
            <p className="text-sm font-black text-primary">@{reel.shopName}</p>
            <h1 className="mt-1 text-2xl font-black leading-tight text-on-surface">
              {reel.title || `${reel.shopName} on AgriReels`}
            </h1>
            {reel.caption ? (
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-on-surface-variant">
                {reel.caption}
              </p>
            ) : null}

            <div className="mt-4 flex items-center gap-4 text-xs font-semibold text-on-surface-variant">
              <span>{reel.viewsCount.toLocaleString("en-IN")} views</span>
              <span>{reel.likesCount.toLocaleString("en-IN")} likes</span>
              {reel.createdAtMs ? (
                <span>
                  {new Date(reel.createdAtMs).toLocaleDateString("en-IN", {
                    day: "numeric", month: "short", year: "numeric",
                  })}
                </span>
              ) : null}
            </div>

            {productPath ? (
              <Link
                href={productPath}
                className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-primary px-6 py-3.5 text-sm font-black uppercase tracking-wide text-white shadow-lg shadow-primary/20 transition-transform hover:scale-[1.02]"
              >
                🛒 Shop {reel.linkedProductName || "this product"} →
              </Link>
            ) : null}

            <div className="mt-6">
              <Link
                href="/reels"
                className="text-sm font-bold text-primary hover:underline"
              >
                ← Watch more AgriReels
              </Link>
            </div>
          </div>
        </div>

        {/* More reels */}
        {others.length > 0 ? (
          <section className="mt-12">
            <h2 className="mb-4 text-lg font-black text-on-surface">More AgriReels</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {others.map((r) => (
                <Link
                  key={r.id}
                  href={`/reels/${buildReelSlug(r.title, r.id)}`}
                  className="group relative aspect-[9/16] overflow-hidden rounded-xl bg-black"
                >
                  {r.thumbnailUrl || r.linkedProductImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.thumbnailUrl || r.linkedProductImageUrl}
                      alt={r.title || r.shopName}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary to-primary/60 text-4xl text-white/60">
                      ▶
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2.5">
                    <p className="truncate text-xs font-bold text-white">
                      {r.title || `@${r.shopName}`}
                    </p>
                    <p className="text-[10px] text-white/75">
                      {r.viewsCount.toLocaleString("en-IN")} views
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
