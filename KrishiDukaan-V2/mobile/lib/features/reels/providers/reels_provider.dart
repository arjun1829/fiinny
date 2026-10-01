import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';
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

/// Phones the current user has blocked. Every reel/comment list in this
/// feature reads this to filter what it shows — the single source of truth
/// for "should this viewer see content from this shopOwnerId/userId".
///
/// block()/unblock() update [state] immediately, before the Firestore write
/// resolves — Apple's Guideline 1.2 requires blocked content to disappear
/// from the blocker's feed "instantly", and waiting on a round trip here
/// would mean the blocked user's reel is still visible for however long that
/// takes. Reverted if the write actually fails.
final blockedUserIdsProvider =
    AsyncNotifierProvider<BlockedUserIdsNotifier, Set<String>>(
  BlockedUserIdsNotifier.new,
);

class BlockedUserIdsNotifier extends AsyncNotifier<Set<String>> {
  @override
  Future<Set<String>> build() async {
    final phone = ref.watch(currentUserProvider).value?.phone;
    if (phone == null || phone.isEmpty) return const {};
    return _repo.fetchBlockedUserIds(phone);
  }

  Future<void> block({
    required String blockerId,
    required String blockedId,
    String? reelId,
    String? commentId,
    String? contentSnippet,
  }) async {
    final previous = state.value ?? const <String>{};
    state = AsyncData({...previous, blockedId});
    try {
      await _repo.blockUser(
        blockerId: blockerId,
        blockedId: blockedId,
        reelId: reelId,
        commentId: commentId,
        contentSnippet: contentSnippet,
      );
    } catch (_) {
      state = AsyncData(previous);
      rethrow;
    }
  }

  Future<void> unblock({
    required String blockerId,
    required String blockedId,
  }) async {
    final previous = state.value ?? const <String>{};
    state = AsyncData({...previous}..remove(blockedId));
    try {
      await _repo.unblockUser(blockerId: blockerId, blockedId: blockedId);
    } catch (_) {
      state = AsyncData(previous);
      rethrow;
    }
  }
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

/// Keyed by a comma-joined list of product doc ids (see product_detail_screen
/// for why) — a product's reels can be linked to the canonical id OR any
/// retailer/admin copy id merged into the card.
final productReelsProvider = FutureProvider.family<List<ReelModel>, String>((
  ref,
  productIdsKey,
) {
  final ids = productIdsKey.split(',').where((s) => s.isNotEmpty).toList();
  return _repo.fetchProductReels(ids);
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

/// The follower list behind [followerCountProvider] — powers `/followers`,
/// which is where a `reel_follow` notification lands. Paginated.
///
/// A shop with a thousand followers used to load every one of them (and each
/// one's profile) on open. This loads a page at a time and appends as the user
/// scrolls, so the screen is responsive no matter how large the following is.
class FollowersState {
  final List<FollowerProfile> followers;
  final bool isLoadingMore;
  final bool hasMore;
  final Object? error;

  const FollowersState({
    this.followers = const [],
    this.isLoadingMore = false,
    this.hasMore = true,
    this.error,
  });

  FollowersState copyWith({
    List<FollowerProfile>? followers,
    bool? isLoadingMore,
    bool? hasMore,
    Object? error,
  }) =>
      FollowersState(
        followers: followers ?? this.followers,
        isLoadingMore: isLoadingMore ?? this.isLoadingMore,
        hasMore: hasMore ?? this.hasMore,
        error: error,
      );
}

class FollowersNotifier extends StateNotifier<FollowersState> {
  final String shopId;
  DocumentSnapshot? _cursor;
  bool _initialised = false;

  FollowersNotifier(this.shopId) : super(const FollowersState()) {
    loadMore();
  }

  /// Loads the next page. Safe to call repeatedly — overlapping calls and
  /// calls past the end are ignored, so a fast scroller can't double-fetch.
  Future<void> loadMore() async {
    if (state.isLoadingMore || (!state.hasMore && _initialised)) return;
    state = state.copyWith(isLoadingMore: true, error: null);
    try {
      final page = await _repo.fetchFollowersPage(shopId, startAfter: _cursor);
      _cursor = page.cursor ?? _cursor;
      _initialised = true;
      state = FollowersState(
        followers: [...state.followers, ...page.followers],
        isLoadingMore: false,
        hasMore: page.hasMore,
      );
    } catch (e) {
      _initialised = true;
      state = state.copyWith(isLoadingMore: false, error: e);
    }
  }

  Future<void> refresh() async {
    _cursor = null;
    _initialised = false;
    state = const FollowersState();
    await loadMore();
  }

  /// True before the first page has resolved either way.
  bool get isInitialLoad => !_initialised && state.isLoadingMore;
}

final followersProvider = StateNotifierProvider.family<FollowersNotifier,
    FollowersState, String>((ref, shopId) => FollowersNotifier(shopId));


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

