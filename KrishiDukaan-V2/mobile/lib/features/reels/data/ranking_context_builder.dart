import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/models/reel_model.dart';
import '../../../core/models/user_model.dart';
import '../domain/ranking_context.dart';
import 'reels_repository.dart';

/// Assembles the [RankingContext] the ranker needs, in one place, so
/// `reels_provider.dart` stays a thin Riverpod wiring layer and
/// `domain/reel_ranker.dart` stays pure. Adding a new context input (a
/// viewer's saved crop preferences, say) means touching this file, not the
/// provider or the ranker.
class RankingContextBuilder {
  RankingContextBuilder(this._repo);
  final ReelsRepository _repo;

  /// Everything about the *viewer* — independent of which reels are in the
  /// candidate pool, so this can run in parallel with the feed fetch.
  Future<RankingContext> build({required UserModel? currentUser}) async {
    final viewerPhone = currentUser?.phone ?? '';
    final now = DateTime.now();

    final results = await Future.wait([
      SharedPreferences.getInstance(),
      _repo.fetchFollowedShopIds(viewerPhone),
      _repo.fetchOrderedShopIds(viewerPhone),
    ]);
    final prefs = results[0] as SharedPreferences;
    final followedShopIds = results[1] as Set<String>;
    final orderedShopIds = results[2] as Set<String>;
    final seenReelIds = (prefs.getStringList('seen_reels') ?? []).toSet();

    return RankingContext(
      viewerPhone: currentUser?.phone,
      city: currentUser?.city,
      state: currentUser?.state,
      pincode: currentUser?.pincode,
      followedShopIds: followedShopIds,
      // likedShopIds intentionally omitted: reel_likes docs carry no
      // shopOwnerId, so populating this would mean an extra reel lookup per
      // like on every feed load. Not worth it yet — follow + order affinity
      // already cover the cases that matter.
      orderedShopIds: orderedShopIds,
      seenReelIds: seenReelIds,
      seasonalCrops: cropsInSeason(now),
      now: now,
    );
  }

  /// Per-reel seller locations — depends on the fetched candidate pool, so
  /// this runs after it (unlike [build], which does not).
  Future<Map<String, SellerLocation>> sellerLocationsFor(
    List<ReelModel> candidates,
  ) {
    return _repo.fetchSellerLocations(
      candidates.map((r) => r.shopOwnerId).toSet(),
    );
  }
}
