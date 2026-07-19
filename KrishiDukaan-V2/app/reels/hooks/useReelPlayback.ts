"use client";

import { useEffect, useRef, useState } from "react";

/** Fraction of the card that must be visible before it counts as "the" reel. */
const VISIBILITY_THRESHOLD = 0.6;

interface Options {
  /** True when this card is the active one and should be playing. */
  isActive: boolean;
  /** Called when the card scrolls into view, so the feed can update its index. */
  onVisible: () => void;
}

/**
 * Drives play/pause for a single reel and reports its visibility upward.
 *
 * Two responsibilities that look separable but are not: the same
 * IntersectionObserver that decides "this reel should play" is also what tells
 * the feed which reel is active. Splitting them would mean two observers per
 * card watching the same element for the same threshold.
 *
 * Autoplay rejections are swallowed deliberately — a browser refusing to
 * autoplay is normal (no user gesture yet, or a data-saver setting), and the
 * poster frame stays up, which is the correct fallback rather than an error.
 */
export function useReelPlayback({ isActive, onVisible }: Options) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  // Visibility → tell the feed. Runs once per card; deliberately does not
  // depend on isActive, so the observer is never rebuilt during a scroll.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onVisible();
      },
      { threshold: VISIBILITY_THRESHOLD },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [onVisible]);

  // Active state → drive the element. Separated from the observer above so that
  // becoming active plays the video whether that was caused by scrolling or by
  // the feed changing the active index for any other reason.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isActive) {
      void video.play().then(
        () => setIsPaused(false),
        () => {
          /* autoplay blocked — poster stays, user can tap */
        },
      );
    } else {
      video.pause();
      // Rewind so a reel the viewer scrolls back to starts from the top rather
      // than resuming mid-sentence.
      video.currentTime = 0;
    }
  }, [isActive]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play();
      setIsPaused(false);
    } else {
      video.pause();
      setIsPaused(true);
    }
  };

  return { videoRef, isPaused, togglePlay };
}
