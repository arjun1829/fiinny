import '../../../../core/models/reel_model.dart';
import '../ranking_context.dart';

/// Contract every ranking signal implements.
///
/// The point of this interface is that **adding a new ranking idea is a new
/// file, not a rewrite**. A signal cannot see the other signals, cannot see the
/// final weights, and cannot reorder the feed — it answers exactly one question
/// about one reel and returns a number. Composition and weighting are the
/// ranker's job.
///
/// This keeps the scorer testable (each signal is a pure function over known
/// inputs) and keeps experiments cheap: to try "boost reels in the viewer's
/// language", you write `LanguageSignal`, register it, and give it a weight in
/// Remote Config. Nothing else changes.
abstract class RankingSignal {
  const RankingSignal();

  /// Stable identifier. Must match the key used in the Remote Config weights
  /// map and in the [ScoredReel] breakdown, so a signal can be reweighted or
  /// switched off without an app release.
  String get id;

  /// **Must return 0.0–1.0.** Signals are combined as a weighted sum, so a
  /// signal that returns 4.7 silently overpowers every other signal rather than
  /// failing loudly. Clamp before returning.
  double score(ReelModel reel, RankingContext ctx, SignalInputs inputs);

  /// Whether this signal can contribute at all right now.
  ///
  /// Returning false is different from scoring 0.0: a disabled signal has its
  /// weight redistributed across the remaining signals, whereas a 0.0 score
  /// actively drags the reel down. Signals that depend on schema which does not
  /// exist yet (crop tags, language) should report false until the data lands,
  /// so they cost nothing while dormant.
  bool isAvailable(RankingContext ctx, SignalInputs inputs) => true;
}

/// Per-reel data resolved *before* ranking begins.
///
/// Signals are deliberately synchronous and side-effect free — no Firestore
/// reads inside a scorer. Everything a signal needs is batch-fetched once per
/// feed load and handed over here. Without this rule, a 150-reel pool turns
/// into 150 sequential network round-trips and ranking becomes slower than the
/// video it is trying to rank.
class SignalInputs {
  /// Seller location, keyed upstream by `reel.shopOwnerId`.
  final SellerLocation? sellerLocation;

  /// Crop tags on the reel. Empty until the `cropTags` field ships.
  final List<String> cropTags;

  /// Reel language code ('hi' | 'mr' | 'pa' | ...). Null until the field ships.
  final String? language;

  /// True when the reel's linked product has stock available near the viewer.
  final bool productNearViewer;

  /// Cloud-precomputed aggregates from `reel_stats/{reelId}` — engagement rate,
  /// 3-second hook rate, trending velocity. Null before telemetry exists.
  final ReelStats? stats;

  const SignalInputs({
    this.sellerLocation,
    this.cropTags = const [],
    this.language,
    this.productNearViewer = false,
    this.stats,
  });
}

/// Cloud-computed engagement aggregates.
///
/// These live server-side because they depend on *all* users — the phone cannot
/// compute a hook rate from one device's history. See §2 of
/// docs/reels-ranking-architecture.md for the phone/cloud split rule.
class ReelStats {
  /// Fraction of impressions still watching at 3 seconds. The strongest single
  /// predictor of retention we expect to have.
  final double hookRate;

  /// Mean watched fraction across impressions, 0.0–1.0.
  final double completionRate;

  /// Engagement rate (actions / impressions), already normalised server-side so
  /// the client never re-derives it from raw counts.
  final double engagementRate;

  /// Recent-velocity multiplier for trending detection. 1.0 is baseline.
  final double velocity;

  const ReelStats({
    this.hookRate = 0.0,
    this.completionRate = 0.0,
    this.engagementRate = 0.0,
    this.velocity = 1.0,
  });
}
