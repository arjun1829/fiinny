import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/reel_model.dart';
import '../../../core/models/reel_comment_model.dart';
import '../../../core/models/listing_model.dart';
import '../../../core/models/user_model.dart';
import '../../../core/providers/user_provider.dart';
import '../../dashboard/data/dashboard_repository.dart';
import '../data/ranking_context_builder.dart';
import '../data/reels_repository.dart';
import '../domain/ranking_context.dart';
import '../domain/reel_ranker.dart';

final _repo = ReelsRepository();
final _rankingContextBuilder = RankingContextBuilder(_repo);

final reelsRepoProvider = Provider((_) => _repo);

// Tracks when the comment sheet is open so AppShell can hide the upload FAB.
final reelCommentSheetOpenProvider =
    NotifierProvider<_CommentSheetNotifier, bool>(_CommentSheetNotifier.new);

class _CommentSheetNotifier extends Notifier<bool> {
  @override
  bool build() => false;
  void setOpen(bool open) => state = open;
}

/// Ranked feed, replacing the old shuffle-newest-50. See
/// domain/reel_ranker.dart for why: geography and commercial intent matter
/// more here than raw engagement. The scoring logic itself lives entirely
/// under domain/ — this provider only fetches, hands off, and returns.
final reelsFeedProvider = FutureProvider<List<ReelModel>>((ref) async {
  // Watched (not read) so the feed re-ranks once the user doc arrives — on a
  // cold app start this provider can build before currentUserProvider's first
  // snapshot lands, and without watching it the feed would be stuck on
  // cold-start weights for the rest of the session.
  final currentUser = ref.watch(currentUserProvider).value;

  // Independent reads fired together — sequencing either in front of the
  // other would add pure latency before a single video byte is requested.
  final results = await Future.wait([
    _repo.fetchFeed(limit: 50),
    _rankingContextBuilder.build(currentUser: currentUser),
  ]);
  final reels = results[0] as List<ReelModel>;
  final ctx = results[1] as RankingContext;

  final sellerLocations =
      await _rankingContextBuilder.sellerLocationsFor(reels);

  return const ReelRanker().rank(reels, ctx, sellerLocations: sellerLocations);
});

final sellerReelsProvider = FutureProvider.family<List<ReelModel>, String>((
  ref,
  phone,
) {
  return _repo.fetchSellerReels(phone);
});

final productReelsProvider = FutureProvider.family<List<ReelModel>, String>((
  ref,
  productId,
) {
  return _repo.fetchProductReels(productId);
});

/// Fetches a single reel by id — powers the `/reel/:id` deep-link screen
/// (shared reel links open this reel directly instead of the general feed).
final reelByIdProvider = FutureProvider.family<ReelModel?, String>((
  ref,
  reelId,
) {
  return _repo.fetchReelById(reelId);
});

final followerCountProvider = FutureProvider.family<int, String>((ref, shopId) {
  return _repo.countFollowers(shopId);
});

final reelCommentsProvider =
    StreamProvider.family<List<ReelCommentModel>, String>(
      (ref, reelId) => _repo.watchComments(reelId),
    );

/// Fetches any seller's UserModel by phone for the shop profile header.
final shopUserProvider = FutureProvider.family<UserModel?, String>((
  ref,
  phone,
) async {
  final doc = await FirebaseFirestore.instance
      .collection('users')
      .doc(phone)
      .get();
  if (!doc.exists) return null;
  return UserModel.fromFirestore(doc);
});

/// Fetches a seller's listings by phone only — safe to use on *any* shop
/// profile because it never mixes in the current user's uid.
final shopListingsProvider =
    FutureProvider.family<List<ListingModel>, String>((ref, phone) {
  return DashboardRepository().fetchSellerListings(phone);
});

final reelsFeedPlaybackActiveProvider =
    NotifierProvider<_ReelsFeedPlaybackActiveNotifier, bool>(
  _ReelsFeedPlaybackActiveNotifier.new,
);

class _ReelsFeedPlaybackActiveNotifier extends Notifier<bool> {
  @override
  bool build() => true;

  void setPlayable(bool playable) => state = playable;
}

