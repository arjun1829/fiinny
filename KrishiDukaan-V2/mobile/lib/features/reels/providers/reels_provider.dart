import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/models/reel_model.dart';
import '../../../core/models/reel_comment_model.dart';
import '../../../core/models/listing_model.dart';
import '../../../core/models/user_model.dart';
import '../../dashboard/data/dashboard_repository.dart';
import '../data/reels_repository.dart';

final _repo = ReelsRepository();

final reelsRepoProvider = Provider((_) => _repo);

// Tracks when the comment sheet is open so AppShell can hide the upload FAB.
final reelCommentSheetOpenProvider =
    NotifierProvider<_CommentSheetNotifier, bool>(_CommentSheetNotifier.new);

class _CommentSheetNotifier extends Notifier<bool> {
  @override
  bool build() => false;
  void setOpen(bool open) => state = open;
}

final reelsFeedProvider = FutureProvider<List<ReelModel>>((ref) async {
  final reels = await _repo.fetchFeed(limit: 50);

  final prefs = await SharedPreferences.getInstance();
  final seenReelsIds = prefs.getStringList('seen_reels') ?? [];

  final unseenReels = <ReelModel>[];
  final seenReels = <ReelModel>[];

  for (final reel in reels) {
    if (seenReelsIds.contains(reel.id)) {
      seenReels.add(reel);
    } else {
      unseenReels.add(reel);
    }
  }

  unseenReels.shuffle();
  seenReels.shuffle();

  return [...unseenReels, ...seenReels];
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
