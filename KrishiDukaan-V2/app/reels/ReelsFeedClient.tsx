"use client";

/**
 * Vertical scroll-snap reels feed (web version of the mobile AgriReels tab).
 *
 * Videos autoplay muted when ≥60% visible (IntersectionObserver) and pause
 * when scrolled away. Tap toggles sound; the overlay links to the reel's own
 * SEO page and its linked product.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Volume2, VolumeX, Play, ShoppingBag, Eye, Heart } from "lucide-react";

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
  /** Playback-time edits set in the mobile upload editor. */
  cssFilter?: string;
  overlayText?: string;
  overlayPos?: string; // 'top' | 'center' | 'bottom'
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function ReelCard({ reel }: { reel: FeedReel }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          video.play().catch(() => {/* autoplay blocked — poster stays */});
          setPaused(false);
        } else {
          video.pause();
        }
      },
      { threshold: 0.6 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play();
      setPaused(false);
    } else {
      video.pause();
      setPaused(true);
    }
  };

  return (
    <section className="relative h-[calc(100dvh-4rem)] snap-start snap-always flex items-center justify-center bg-black">
      <div className="relative h-full w-full max-w-[480px] overflow-hidden md:rounded-2xl md:h-[92%] md:my-auto">
        <video
          ref={videoRef}
          src={reel.videoUrl}
          poster={reel.thumbnailUrl}
          muted={muted}
          loop
          playsInline
          preload="metadata"
          onClick={togglePlay}
          style={reel.cssFilter ? { filter: reel.cssFilter } : undefined}
          className="h-full w-full object-cover cursor-pointer"
        />

        {/* Seller's text overlay (set in the mobile upload editor) */}
        {reel.overlayText ? (
          <div
            className={`pointer-events-none absolute inset-x-6 flex justify-center ${
              reel.overlayPos === "top"
                ? "top-16"
                : reel.overlayPos === "bottom"
                  ? "bottom-44"
                  : "top-1/2 -translate-y-1/2"
            }`}
          >
            <p className="max-w-full rounded-xl bg-black/35 px-3 py-1.5 text-center text-xl font-extrabold leading-snug text-white drop-shadow-md">
              {reel.overlayText}
            </p>
          </div>
        ) : null}

        {paused && (
          <button
            onClick={togglePlay}
            aria-label="Play"
            className="absolute inset-0 m-auto h-16 w-16 rounded-full bg-black/50 flex items-center justify-center"
          >
            <Play className="h-8 w-8 text-white" />
          </button>
        )}

        {/* Mute toggle */}
        <button
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? "Unmute" : "Mute"}
          className="absolute right-3 top-3 h-10 w-10 rounded-full bg-black/50 flex items-center justify-center text-white"
        >
          {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>

        {/* Stats column */}
        <div className="absolute right-3 bottom-24 flex flex-col items-center gap-4 text-white">
          <span className="flex flex-col items-center text-xs font-semibold">
            <Heart className="h-6 w-6 mb-1" />
            {formatCount(reel.likesCount)}
          </span>
          <span className="flex flex-col items-center text-xs font-semibold">
            <Eye className="h-6 w-6 mb-1" />
            {formatCount(reel.viewsCount)}
          </span>
        </div>

        {/* Bottom overlay: shop, title, caption, product chip */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pb-5 text-white">
          <p className="text-sm font-black">@{reel.shopName}</p>
          {reel.title ? (
            <Link
              href={`/reels/${reel.slug}`}
              className="mt-1 block text-base font-bold leading-snug hover:underline"
            >
              {reel.title}
            </Link>
          ) : null}
          {reel.caption ? (
            <p className="mt-0.5 text-xs text-white/85 line-clamp-2">{reel.caption}</p>
          ) : null}
          {reel.productPath ? (
            <Link
              href={reel.productPath}
              className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/15 px-4 py-2 text-xs font-bold backdrop-blur-sm hover:bg-white/25 transition-colors"
            >
              <ShoppingBag className="h-3.5 w-3.5" />
              <span className="max-w-[220px] truncate">
                {reel.linkedProductName || "View Product"}
              </span>
              <span aria-hidden>›</span>
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default function ReelsFeedClient({ reels }: { reels: FeedReel[] }) {
  return (
    <div className="h-[calc(100dvh-4rem)] snap-y snap-mandatory overflow-y-auto overscroll-contain bg-black">
      {reels.map((reel) => (
        <ReelCard key={reel.id} reel={reel} />
      ))}
    </div>
  );
}
