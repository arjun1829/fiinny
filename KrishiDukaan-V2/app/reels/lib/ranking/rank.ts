/**
 * Ranks the public /reels feed.
 *
 * Mirrors mobile/lib/features/reels/domain/reel_ranker.dart's `rank()`, minus
 * the viewer-personalized signals (geo, affinity) that page has no viewer
 * identity to compute — see ./types.ts for why. Composition, diversify, and
 * exploration all match mobile's behavior so the feeds don't diverge in feel
 * just because one platform knows more about the visitor than the other.
 *
 * Runs once per ISR revalidation (app/reels/page.tsx: `revalidate = 600`),
 * not per request, so recomputing this on every rebuild is not a per-visitor
 * cost.
 */
import type { SeoReel } from "../../../lib/seo/reels-server";
import type { RankingContext, ScoredReel } from "./types";
import { RANKING_SIGNALS, WEIGHTS } from "./config";

function scoreOne(reel: SeoReel, ctx: RankingContext): number {
  let score = 0;
  for (const signal of RANKING_SIGNALS) {
    const w = WEIGHTS[signal.id] ?? 0;
    if (w <= 0) continue;
    const s = Math.min(1, Math.max(0, signal.score(reel, ctx)));
    score += s * w;
  }
  return score;
}

/**
 * No more than 2 consecutive reels from the same seller. Without this, one
 * prolific seller dominates the whole feed — mirrors `_diversify` in
 * domain/reel_ranker.dart (mobile).
 */
function diversify(sorted: ScoredReel[]): ScoredReel[] {
  const out: ScoredReel[] = [];
  const held: ScoredReel[] = [];
  let lastShop = "";
  let run = 0;

  for (const s of sorted) {
    const shop = s.reel.shopOwnerId;
    if (shop === lastShop && run >= 2) {
      held.push(s);
      continue;
    }
    if (shop === lastShop) {
      run++;
    } else {
      lastShop = shop;
      run = 1;
    }
    out.push(s);
  }
  return [...out, ...held];
}

const DAY_MS = 1000 * 60 * 60 * 24;

/**
 * Every 6th slot goes to a low-view recent reel that ranking would have
 * buried — how the system learns instead of freezing around whatever won
 * first. Mirrors `_injectExploration` in domain/reel_ranker.dart (mobile).
 */
function injectExploration(ranked: ScoredReel[], ctx: RankingContext): SeoReel[] {
  const fresh = ranked.filter(
    (s) => s.reel.viewsCount < 20 && (ctx.now - s.reel.createdAtMs) / DAY_MS < 14,
  );
  if (fresh.length === 0) return ranked.map((s) => s.reel);

  const freshIds = new Set(fresh.map((s) => s.reel.id));
  const main = ranked.filter((s) => !freshIds.has(s.reel.id));
  const out: SeoReel[] = [];
  let fi = 0;

  for (let i = 0; i < main.length; i++) {
    out.push(main[i].reel);
    if ((i + 1) % 5 === 0 && fi < fresh.length) {
      out.push(fresh[fi++].reel);
    }
  }
  while (fi < fresh.length) out.push(fresh[fi++].reel);
  return out;
}

export function rankReels(reels: SeoReel[], now: number = Date.now()): SeoReel[] {
  const ctx: RankingContext = { now };
  const scored = reels
    .map((reel) => ({ reel, score: scoreOne(reel, ctx) }))
    .sort((a, b) => b.score - a.score);

  return injectExploration(diversify(scored), ctx);
}
