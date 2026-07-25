/// Ranks the AgriReels feed.
///
/// **The objective is not watch time.** Instagram ranks for time-on-app because
/// it sells ads; KrishiDukaan earns when a farmer finds a product and orders it.
/// So the scorer weights geography and commercial intent far above raw
/// engagement — a viral reel from a shop 400km away that cannot deliver to the
/// viewer is worth less than a modest reel from the shop in their taluka.
///
/// The actual signals live under `signals/`, one file per idea, each
/// implementing [RankingSignal]. This file only composes them: it does not
/// know what "geo" or "freshness" mean, just that [rankingSignals] lists
/// scorers and [RankingWeights] says how much each one counts. See
/// `signals/ranking_signal.dart` for why that split exists.
///
/// Ranking runs **client-side** over a candidate pool. At current scale this is
/// deliberate: no Cloud Function invocations, no extra infra bill, and no
/// composite Firestore indexes (this repo has been bitten by undeployed indexes
/// before — see ReelsRepository.fetchSellerReels). Move it server-side only when
/// the candidate pool outgrows a single query. See
/// docs/reels-ranking-architecture.md §2 for the full staging plan.
library;

import '../../../core/models/reel_model.dart';
import 'ranking_config.dart';
import 'ranking_context.dart';
import 'signals/ranking_signal.dart';

class ScoredReel {
  final ReelModel reel;
  final double score;

  /// Per-signal breakdown, kept for debugging and for tuning weights against
  /// real data later. Cheap to carry and invaluable when the feed looks wrong.
  final Map<String, double> breakdown;

  const ScoredReel(this.reel, this.score, this.breakdown);
}

class ReelRanker {
  final RankingWeights weights;
  const ReelRanker({this.weights = RankingWeights.standard});

  /// Already-seen reels are demoted hard rather than removed, so a user who has
  /// seen everything still gets a feed instead of an empty screen.
  static const _seenPenalty = 0.15;

  ScoredReel scoreOne(
    ReelModel reel,
    RankingContext ctx, {
    SellerLocation? sellerLocation,
    List<String> cropTags = const [],
    bool productNearViewer = false,
  }) {
    final w = ctx.isColdStart ? RankingWeights.coldStart : weights;
    final inputs = SignalInputs(
      sellerLocation: sellerLocation,
      cropTags: cropTags,
      productNearViewer: productNearViewer,
    );

    final breakdown = <String, double>{};
    var score = 0.0;
    for (final signal in rankingSignals) {
      if (!signal.isAvailable(ctx, inputs)) continue;
      final s = signal.score(reel, ctx, inputs).clamp(0.0, 1.0);
      breakdown[signal.id] = s;
      score += s * w[signal.id];
    }

    if (ctx.seenReelIds.contains(reel.id)) score *= _seenPenalty;

    return ScoredReel(reel, score, breakdown);
  }

  /// Ranks the full candidate pool and applies the presentation rules.
  List<ReelModel> rank(
    List<ReelModel> candidates,
    RankingContext ctx, {
    Map<String, SellerLocation> sellerLocations = const {},
    Map<String, List<String>> cropTagsByReelId = const {},
  }) {
    final scored = candidates
        .map((r) => scoreOne(
              r,
              ctx,
              sellerLocation: sellerLocations[r.shopOwnerId],
              cropTags: cropTagsByReelId[r.id] ?? const [],
            ))
        .toList()
      ..sort((a, b) => b.score.compareTo(a.score));

    return _injectExploration(_diversify(scored), ctx);
  }

  /// No more than 2 consecutive reels from the same seller.
  ///
  /// Without this, one prolific local shop dominates the entire feed — the
  /// geo weight makes that outcome very likely in a small town.
  List<ScoredReel> _diversify(List<ScoredReel> sorted) {
    final out = <ScoredReel>[];
    final held = <ScoredReel>[];
    var lastShop = '';
    var run = 0;

    for (final s in sorted) {
      if (s.reel.shopOwnerId == lastShop && run >= 2) {
        held.add(s);
        continue;
      }
      if (s.reel.shopOwnerId == lastShop) {
        run++;
      } else {
        lastShop = s.reel.shopOwnerId;
        run = 1;
      }
      out.add(s);
    }
    return [...out, ...held];
  }

  /// Every 6th slot goes to a low-view recent reel that ranking would have
  /// buried.
  ///
  /// This is not charity to new sellers — it is how the system learns. A reel
  /// that never gets shown never earns engagement data, so pure exploitation
  /// freezes the feed permanently around whatever won first.
  List<ReelModel> _injectExploration(
    List<ScoredReel> ranked,
    RankingContext ctx,
  ) {
    final fresh = ranked
        .where((s) =>
            s.reel.viewsCount < 20 &&
            ctx.now.difference(s.reel.createdAt).inDays < 14 &&
            !ctx.seenReelIds.contains(s.reel.id))
        .toList();
    if (fresh.isEmpty) return ranked.map((s) => s.reel).toList();

    final main = ranked.where((s) => !fresh.contains(s)).toList();
    final out = <ReelModel>[];
    var fi = 0;

    for (var i = 0; i < main.length; i++) {
      out.add(main[i].reel);
      if ((i + 1) % 5 == 0 && fi < fresh.length) {
        out.add(fresh[fi++].reel);
      }
    }
    while (fi < fresh.length) {
      out.add(fresh[fi++].reel);
    }
    return out;
  }
}
