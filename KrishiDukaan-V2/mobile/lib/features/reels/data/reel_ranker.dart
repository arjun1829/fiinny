/// Ranks the AgriReels feed.
///
/// Replaces the previous `shuffle()` in `reelsFeedProvider`, which showed every
/// user the same 50 newest reels in random order.
///
/// **The objective is not watch time.** Instagram ranks for time-on-app because
/// it sells ads; KrishiDukaan earns when a farmer finds a product and orders it.
/// So the scorer weights geography and commercial intent far above raw
/// engagement — a viral reel from a shop 400km away that cannot deliver to the
/// viewer is worth less than a modest reel from the shop in their taluka.
///
/// Ranking runs **client-side** over a candidate pool. At current scale this is
/// deliberate: no Cloud Function invocations, no extra infra bill, and no
/// composite Firestore indexes (this repo has been bitten by undeployed indexes
/// before — see ReelsRepository.fetchSellerReels). Move it server-side only when
/// the candidate pool outgrows a single query.
library;

import 'dart:math';
import '../../../core/models/reel_model.dart';

/// Signal weights. These sum to 1.0 and are the main tuning surface — start
/// here before changing any scoring logic.
class RankingWeights {
  final double geo;
  final double freshness;
  final double engagement;
  final double affinity;
  final double commercial;
  final double season;

  const RankingWeights({
    this.geo = 0.30,
    this.freshness = 0.20,
    this.affinity = 0.20,
    this.engagement = 0.15,
    this.commercial = 0.10,
    this.season = 0.05,
  });

  /// Weighting for a brand-new user we know nothing about: lean hard on
  /// locality and recency, since affinity signals are all empty anyway.
  static const coldStart = RankingWeights(
    geo: 0.40,
    freshness: 0.30,
    affinity: 0.0,
    engagement: 0.20,
    commercial: 0.10,
    season: 0.0,
  );
}

/// Everything the scorer knows about the viewer. Assembled once per feed load.
class RankingContext {
  final String? viewerPhone;
  final String? city;
  final String? state;
  final String? pincode;

  /// shopOwnerIds the viewer follows — from the `follows` collection.
  final Set<String> followedShopIds;

  /// shopOwnerIds whose reels the viewer has liked before.
  final Set<String> likedShopIds;

  /// shopOwnerIds the viewer has actually purchased from. The strongest
  /// affinity signal we have, because it is money rather than a tap.
  final Set<String> orderedShopIds;

  /// Reel ids already seen, from SharedPreferences 'seen_reels'.
  final Set<String> seenReelIds;

  /// Crops currently in season for the viewer's region. See [cropsInSeason].
  final Set<String> seasonalCrops;

  final DateTime now;

  const RankingContext({
    this.viewerPhone,
    this.city,
    this.state,
    this.pincode,
    this.followedShopIds = const {},
    this.likedShopIds = const {},
    this.orderedShopIds = const {},
    this.seenReelIds = const {},
    this.seasonalCrops = const {},
    required this.now,
  });

  bool get isColdStart =>
      followedShopIds.isEmpty && likedShopIds.isEmpty && orderedShopIds.isEmpty;

  bool get hasLocation =>
      (pincode ?? '').isNotEmpty ||
      (city ?? '').isNotEmpty ||
      (state ?? '').isNotEmpty;
}

/// India's crop calendar, used to surface season-relevant reels. A wheat reel
/// in June is noise; the same reel in November is the most useful thing we can
/// show. Kept as a plain map rather than Firestore config because it changes
/// roughly never.
Set<String> cropsInSeason(DateTime date) {
  final m = date.month;
  if (m >= 6 && m <= 10) {
    // Kharif — sown with the monsoon.
    return const {'rice', 'paddy', 'cotton', 'soybean', 'maize', 'bajra',
                  'jowar', 'groundnut', 'tur', 'moong'};
  }
  if (m >= 11 || m <= 3) {
    // Rabi — winter sown.
    return const {'wheat', 'mustard', 'gram', 'chana', 'barley', 'peas',
                  'lentil', 'masoor', 'potato', 'onion'};
  }
  // Zaid — short summer season.
  return const {'watermelon', 'muskmelon', 'cucumber', 'fodder', 'vegetables'};
}

// ── Individual signals ──────────────────────────────────────────────────────
// Each returns 0.0–1.0 so weights stay comparable.

/// Geographic relevance, the heaviest signal.
///
/// Uses the seller-profile fields already on `users/{phone}` (city/state/
/// pincode) rather than lat/lng, because reels carry no coordinates today and
/// most seller profiles have a city string but no GPS fix. Pincode prefix
/// matching approximates district proximity cheaply: the first 3 digits of an
/// Indian PIN share a sorting district.
double geoScore(ReelModel reel, RankingContext ctx, SellerLocation? seller) {
  if (seller == null || !ctx.hasLocation) return 0.35; // unknown — stay neutral

  final vPin = ctx.pincode ?? '';
  final sPin = seller.pincode ?? '';
  if (vPin.isNotEmpty && vPin == sPin) return 1.0;

  if (vPin.length >= 3 && sPin.length >= 3 &&
      vPin.substring(0, 3) == sPin.substring(0, 3)) {
    return 0.85;
  }

  final vCity = (ctx.city ?? '').toLowerCase().trim();
  final sCity = (seller.city ?? '').toLowerCase().trim();
  if (vCity.isNotEmpty && vCity == sCity) return 0.75;

  final vState = (ctx.state ?? '').toLowerCase().trim();
  final sState = (seller.state ?? '').toLowerCase().trim();
  if (vState.isNotEmpty && vState == sState) return 0.40;

  return 0.10; // different state — rarely actionable for a farmer
}

/// Exponential recency decay with a ~7 day half-life.
double freshnessScore(ReelModel reel, DateTime now) {
  final ageDays = now.difference(reel.createdAt).inHours / 24.0;
  if (ageDays < 0) return 1.0;
  return exp(-ageDays / 7.0);
}

/// Engagement **rate**, not raw counts.
///
/// Ranking on `likesCount` alone is a rich-get-richer trap: reels that got an
/// early boost keep winning and new sellers never surface. Dividing by views
/// measures whether people who saw it actually responded. The +50 floor stops a
/// reel with 2 views and 1 like from scoring a perfect 1.0.
double engagementScore(ReelModel reel) {
  final weighted = reel.likesCount + (reel.commentsCount * 3);
  final denom = max(reel.viewsCount, 50);
  return (weighted / denom).clamp(0.0, 1.0);
}

/// How connected the viewer already is to this seller.
double affinityScore(ReelModel reel, RankingContext ctx) {
  final shop = reel.shopOwnerId;
  if (ctx.orderedShopIds.contains(shop)) return 1.0;   // bought from them
  if (ctx.followedShopIds.contains(shop)) return 0.85; // explicit follow
  if (ctx.likedShopIds.contains(shop)) return 0.55;    // liked their content
  return 0.0;
}

/// Commercial intent — does this reel lead anywhere purchasable?
///
/// A reel with a linked product is the whole point of the feature, so it earns
/// a real boost. `productNearViewer` should be true when the linked product has
/// an availability entry from a seller in the viewer's state; wire it once the
/// availability lookup is cheap, and pass false until then.
double commercialScore(ReelModel reel, {bool productNearViewer = false}) {
  if (reel.linkedProductId == null || reel.linkedProductId!.isEmpty) return 0.0;
  return productNearViewer ? 1.0 : 0.6;
}

/// Overlap between the reel's crop tags and what is in season for the viewer.
///
/// Requires a `cropTags: []` field on reel docs, which does not exist yet — see
/// the design note. Returns neutral 0.0 until reels carry tags, so adding this
/// signal early costs nothing.
double seasonScore(ReelModel reel, RankingContext ctx, List<String> cropTags) {
  if (cropTags.isEmpty || ctx.seasonalCrops.isEmpty) return 0.0;
  final hits = cropTags.where((c) => ctx.seasonalCrops.contains(c.toLowerCase()));
  return hits.isEmpty ? 0.0 : min(1.0, hits.length / 2.0);
}

// ── Composite scoring ───────────────────────────────────────────────────────

/// Minimal seller location, resolved in one batch before ranking so the scorer
/// itself stays synchronous and testable.
class SellerLocation {
  final String? city;
  final String? state;
  final String? pincode;
  const SellerLocation({this.city, this.state, this.pincode});
}

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
  const ReelRanker({this.weights = const RankingWeights()});

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

    final signals = <String, double>{
      'geo': geoScore(reel, ctx, sellerLocation),
      'freshness': freshnessScore(reel, ctx.now),
      'engagement': engagementScore(reel),
      'affinity': affinityScore(reel, ctx),
      'commercial': commercialScore(reel, productNearViewer: productNearViewer),
      'season': seasonScore(reel, ctx, cropTags),
    };

    var score = signals['geo']! * w.geo +
        signals['freshness']! * w.freshness +
        signals['engagement']! * w.engagement +
        signals['affinity']! * w.affinity +
        signals['commercial']! * w.commercial +
        signals['season']! * w.season;

    if (ctx.seenReelIds.contains(reel.id)) score *= _seenPenalty;

    return ScoredReel(reel, score, signals);
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
  List<ReelModel> _injectExploration(List<ScoredReel> ranked, RankingContext ctx) {
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
