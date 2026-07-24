"use client";

/**
 * Vertical scroll-snap reels feed — the web counterpart of the mobile AgriReels
 * tab.
 *
 * This component is deliberately thin. It owns exactly two pieces of feed-wide
 * state (which reel is on screen, and whether audio is on) and delegates
 * everything else:
 *
 *   components/ReelCard   — layout of a single reel
 *   components/ReelVideo  — the media element and playback
 *   hooks/useReelPlayback — play/pause and visibility reporting
 *   lib/preload           — how much of each video to fetch
 *
 * The split exists because media loading and layout were previously tangled in
 * one file, which is how the feed ended up preloading every reel at once.
 */

import { useState } from "react";
import ReelCard from "./components/ReelCard";
import { useActiveReel } from "./hooks/useActiveReel";
import type { FeedReel } from "./lib/types";

// Re-exported so existing importers keep working; new code should import from
// ./lib/types directly.
export type { FeedReel };

export default function ReelsFeedClient({ reels }: { reels: FeedReel[] }) {
  const { activeIndex, reportVisible } = useActiveReel();

  // Muted by default because browsers block autoplay with sound, and a feed
  // that silently fails to start is worse than one that starts silent.
  const [isMuted, setIsMuted] = useState(true);

  return (
    <div className="h-[calc(100dvh-4rem)] snap-y snap-mandatory overflow-y-auto overscroll-contain bg-black">
      {reels.map((reel, index) => (
        <ReelCard
          key={reel.id}
          reel={reel}
          index={index}
          activeIndex={activeIndex}
          isMuted={isMuted}
          onToggleMute={() => setIsMuted((muted) => !muted)}
          onVisible={reportVisible}
        />
      ))}
    </div>
  );
}
