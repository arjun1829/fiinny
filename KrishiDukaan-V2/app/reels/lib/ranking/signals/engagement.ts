import type { RankingSignal } from "../types";

/**
 * Engagement **rate**, not raw counts — ranking on likesCount alone is a
 * rich-get-richer trap, since reels that got an early boost keep winning
 * and new sellers never surface. The +50 floor stops a reel with 2 views
 * and 1 like from scoring a perfect 1.0. Mirrors
 * domain/signals/engagement_signal.dart (mobile) exactly.
 */
export const engagementSignal: RankingSignal = {
  id: "engagement",
  score(reel) {
    const weighted = reel.likesCount + reel.commentsCount * 3;
    const denom = Math.max(reel.viewsCount, 50);
    return Math.min(1, Math.max(0, weighted / denom));
  },
};
