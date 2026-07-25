import type { RankingSignal } from "./types";
import { freshnessSignal } from "./signals/freshness";
import { engagementSignal } from "./signals/engagement";
import { commercialSignal } from "./signals/commercial";
import { seasonSignal } from "./signals/season";

/**
 * Weights for the anonymous web feed. This is mobile's
 * `RankingWeights.standard` (domain/ranking_config.dart) with `geo` (0.30)
 * and `affinity` (0.20) dropped — there's no viewer to key them off (see
 * types.ts) — and the remaining four renormalized over the weight that
 * freed up, so freshness/engagement/commercial/season keep the same
 * *relative* priority mobile gives them:
 *
 *   freshness  0.20 / 0.50 = 0.40
 *   engagement 0.15 / 0.50 = 0.30
 *   commercial 0.10 / 0.50 = 0.20
 *   season     0.05 / 0.50 = 0.10
 */
export const WEIGHTS: Record<string, number> = {
  freshness: 0.40,
  engagement: 0.30,
  commercial: 0.20,
  season: 0.10,
};

/**
 * Every signal the web ranker scores with.
 *
 * **To add a new ranking idea:** write a file under `signals/` exporting a
 * `RankingSignal`, add it here, and give it a weight above. This list
 * mirrors mobile/lib/features/reels/domain/ranking_config.dart's
 * `rankingSignals` so a contributor who's touched one knows the other.
 */
export const RANKING_SIGNALS: RankingSignal[] = [
  freshnessSignal,
  engagementSignal,
  commercialSignal,
  seasonSignal,
];
