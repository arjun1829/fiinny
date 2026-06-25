import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/reel_model.dart';
import '../../../core/models/reel_comment_model.dart';
import '../../../core/models/user_model.dart';
import '../data/reels_repository.dart';

final _repo = ReelsRepository();

final reelsRepoProvider = Provider((_) => _repo);

final reelsFeedProvider = FutureProvider<List<ReelModel>>((ref) {
  return _repo.fetchFeed();
});

final sellerReelsProvider =
    FutureProvider.family<List<ReelModel>, String>((ref, phone) {
  return _repo.fetchSellerReels(phone);
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
