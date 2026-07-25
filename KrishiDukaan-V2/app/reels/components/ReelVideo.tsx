"use client";

import { Play } from "lucide-react";
import { useReelPlayback } from "../hooks/useReelPlayback";
import { preloadForDistance, shouldAttachSource } from "../lib/preload";
import type { FeedReel } from "../lib/types";

interface Props {
  reel: FeedReel;
  /** Index distance from the reel currently on screen. Drives fetch policy. */
  distance: number;
  isActive: boolean;
  isMuted: boolean;
  onVisible: () => void;
}

/**
 * The video surface for one reel: element, fetch policy, and tap-to-pause.
 *
 * How much of this video gets downloaded is decided entirely by [distance] via
 * lib/preload.ts — see that file for why a feed full of eagerly-preloading
 * elements makes the *visible* reel slower.
 *
 * The poster is always present even when the source is withheld, so a card the
 * viewer scrolls toward shows real content immediately instead of black. That
 * matters most for reels uploaded from the website, which historically had no
 * poster at all until the transcode function started generating one.
 */
export default function ReelVideo({
  reel,
  distance,
  isActive,
  isMuted,
  onVisible,
}: Props) {
  const { videoRef, isPaused, togglePlay } = useReelPlayback({
    isActive,
    onVisible,
  });

  const attachSource = shouldAttachSource(distance);

  return (
    <>
      <video
        ref={videoRef}
        // Omitted entirely outside the warm window — an element with no src is
        // guaranteed not to touch the network.
        src={attachSource ? reel.videoUrl : undefined}
        poster={reel.thumbnailUrl}
        muted={isMuted}
        loop
        playsInline
        preload={preloadForDistance(distance)}
        onClick={togglePlay}
        style={reel.cssFilter ? { filter: reel.cssFilter } : undefined}
        className="h-full w-full cursor-pointer object-cover"
      />

      {isPaused && (
        <button
          onClick={togglePlay}
          aria-label="Play"
          className="absolute inset-0 m-auto flex h-16 w-16 items-center justify-center rounded-full bg-black/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          <Play className="h-8 w-8 text-white" />
        </button>
      )}
    </>
  );
}
