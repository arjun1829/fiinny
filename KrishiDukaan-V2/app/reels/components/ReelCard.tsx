"use client";

import { Volume2, VolumeX } from "lucide-react";
import ReelVideo from "./ReelVideo";
import ReelOverlay from "./ReelOverlay";
import ReelStats from "./ReelStats";
import ReelInfo from "./ReelInfo";
import type { FeedReel } from "../lib/types";

interface Props {
  reel: FeedReel;
  index: number;
  activeIndex: number;
  isMuted: boolean;
  onToggleMute: () => void;
  onVisible: (index: number) => void;
}

/**
 * One full-height reel in the vertical feed.
 *
 * Composition only — playback lives in ReelVideo, fetch policy in lib/preload,
 * and the active-index bookkeeping in the parent feed. Keeping this component
 * free of behaviour is what lets the layout be adjusted without anyone having
 * to reason about media loading.
 */
export default function ReelCard({
  reel,
  index,
  activeIndex,
  isMuted,
  onToggleMute,
  onVisible,
}: Props) {
  const distance = Math.abs(index - activeIndex);

  return (
    <section className="relative flex h-[calc(100dvh-4rem)] snap-start snap-always items-center justify-center bg-black">
      <div className="relative h-full w-full max-w-[480px] overflow-hidden md:my-auto md:h-[92%] md:rounded-2xl">
        <ReelVideo
          reel={reel}
          distance={distance}
          isActive={index === activeIndex}
          isMuted={isMuted}
          onVisible={() => onVisible(index)}
        />

        {reel.overlayText ? (
          <ReelOverlay
            text={reel.overlayText}
            position={reel.overlayPos}
            variant="feed"
          />
        ) : null}

        {/* Mute is feed-wide state, not per-card: a viewer who unmutes one reel
            expects the next one to stay unmuted. */}
        <button
          onClick={onToggleMute}
          aria-label={isMuted ? "Unmute" : "Mute"}
          className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          {isMuted ? (
            <VolumeX className="h-5 w-5" aria-hidden />
          ) : (
            <Volume2 className="h-5 w-5" aria-hidden />
          )}
        </button>

        <ReelStats likesCount={reel.likesCount} viewsCount={reel.viewsCount} />
        <ReelInfo reel={reel} />
      </div>
    </section>
  );
}
