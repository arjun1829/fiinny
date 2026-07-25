import type { RankingSignal } from "../types";

const DAY_MS = 1000 * 60 * 60 * 24;

/**
 * Exponential recency decay with a ~7 day half-life. Mirrors
 * domain/signals/freshness_signal.dart (mobile) exactly.
 */
export const freshnessSignal: RankingSignal = {
  id: "freshness",
  score(reel, ctx) {
    const ageDays = (ctx.now - reel.createdAtMs) / DAY_MS;
    if (ageDays < 0) return 1;
    return Math.exp(-ageDays / 7);
  },
};
