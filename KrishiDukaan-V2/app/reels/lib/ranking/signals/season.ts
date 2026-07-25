import type { RankingSignal } from "../types";

/**
 * India's crop calendar. Mirrors cropsInSeason() in
 * mobile/lib/features/reels/domain/ranking_context.dart — kept as a plain
 * map rather than config because it changes roughly never.
 */
function cropsInSeason(date: Date): Set<string> {
  const m = date.getMonth() + 1;
  if (m >= 6 && m <= 10) {
    // Kharif — sown with the monsoon.
    return new Set([
      "rice", "paddy", "cotton", "soybean", "maize", "bajra",
      "jowar", "groundnut", "tur", "moong",
    ]);
  }
  if (m >= 11 || m <= 3) {
    // Rabi — winter sown.
    return new Set([
      "wheat", "mustard", "gram", "chana", "barley", "peas",
      "lentil", "masoor", "potato", "onion",
    ]);
  }
  // Zaid — short summer season.
  return new Set(["watermelon", "muskmelon", "cucumber", "fodder", "vegetables"]);
}

/**
 * Overlap between a reel's crop tags and what's in season right now.
 * Mirrors domain/signals/season_signal.dart (mobile) — dormant until reels
 * carry a `cropTags` field. `SeoReel.cropTags` exists for exactly this
 * (app/lib/seo/reels-server.ts) but nothing writes it yet, so this returns
 * 0 for every reel today at zero cost.
 */
export const seasonSignal: RankingSignal = {
  id: "season",
  score(reel, ctx) {
    const cropTags = reel.cropTags ?? [];
    if (cropTags.length === 0) return 0;
    const inSeason = cropsInSeason(new Date(ctx.now));
    const hits = cropTags.filter((c) => inSeason.has(c.toLowerCase()));
    return hits.length === 0 ? 0 : Math.min(1, hits.length / 2);
  },
};
