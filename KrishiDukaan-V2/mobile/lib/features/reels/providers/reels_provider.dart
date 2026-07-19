import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/models/reel_model.dart';
import '../../../core/models/reel_comment_model.dart';
import '../../../core/models/user_model.dart';
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
  // Firestore and SharedPreferences are independent — awaiting them in sequence
  // added the disk read to the critical path before a single video byte was
  // requested. The feed cannot start loading video until this future resolves,
  // so everything here is directly in front of the user's first frame.
  final results = await Future.wait([
    _repo.fetchFeed(limit: 50),
    SharedPreferences.getInstance(),
  ]);
  final reels = results[0] as List<ReelModel>;
  final prefs = results[1] as SharedPreferences;
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

final sellerReelsProvider =
    FutureProvider.family<List<ReelModel>, String>((ref, phone) {
  return _repo.fetchSellerReels(phone);
});

final productReelsProvider =
    FutureProvider.family<List<ReelModel>, String>((ref, productId) {
  return _repo.fetchProductReels(productId);
});

final followerCountProvider =
    FutureProvider.family<int, String>((ref, shopId) {
  return _repo.countFollowers(shopId);
});

final reelCommentsProvider =
    StreamProvider.family<List<ReelCommentModel>, String>(
        (ref, reelId) => _repo.watchComments(reelId));

/// Fetches any seller's UserModel by phone for the shop profile header.
final shopUserProvider =
    FutureProvider.family<UserModel?, String>((ref, phone) async {
  final doc = await FirebaseFirestore.instance
      .collection('users')
      .doc(phone)
      .get();
  if (!doc.exists) return null;
  return UserModel.fromFirestore(doc);
});
