"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Tracks which reel is currently on screen.
 *
 * Ownership of "which reel is active" sits here, in the feed, rather than in
 * each card. Every card needs to know its distance from the active one to
 * decide how much of its video to fetch (see lib/preload.ts), and a card cannot
 * work that out from its own visibility alone.
 *
 * Cards report visibility upward via [reportVisible]; the hook keeps the most
 * recently reported index. Because scroll-snap guarantees one reel occupies the
 * viewport at a time, last-reported is always the correct answer — no
 * tie-breaking on intersection ratio is needed.
 */
export function useActiveReel(initialIndex = 0) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);

  // Mirrors activeIndex without making reportVisible depend on it. Without this
  // the callback identity would change on every scroll, which re-runs the
  // IntersectionObserver effect in every card and tears down observers mid-swipe.
  const activeRef = useRef(initialIndex);

  const reportVisible = useCallback((index: number) => {
    if (activeRef.current === index) return;
    activeRef.current = index;
    setActiveIndex(index);
  }, []);

  return { activeIndex, reportVisible };
}
