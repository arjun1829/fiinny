import type { SeoReel } from "../../../lib/seo/reels-server";

/**
 * Contract every ranking signal implements — mirrors
 * mobile/lib/features/reels/domain/signals/ranking_signal.dart so both
 * platforms are extended the same way. A signal answers one question about
 * one reel and returns a number in [0, 1]; composition and weighting are
 * rank.ts's job, not the signal's. To add a ranking idea: write a file
 * under signals/, add it to config.ts's RANKING_SIGNALS, and give it a
 * weight in WEIGHTS. Nothing else changes.
 */
export interface RankingSignal {
  /** Stable id — must match the key used in config.ts's WEIGHTS map. */
  id: string;
  score(reel: SeoReel, ctx: RankingContext): number;
}

/**
 * What the ranker knows going in. Deliberately thin: /reels is anonymous,
 * cached SSR (ISR, revalidate 600s — see app/reels/page.tsx), so there is
 * no logged-in viewer to personalize for. Mobile has geo and affinity
 * signals (domain/signals/geo_signal.dart, affinity_signal.dart) precisely
 * because the app knows who's watching; this ranker only carries what's
 * true for every visitor to the page at once.
 */
export interface RankingContext {
  /** Date.now() in ms, threaded through rather than read per-signal so one rank() call is reproducible. */
  now: number;
}

export interface ScoredReel {
  reel: SeoReel;
  score: number;
}
