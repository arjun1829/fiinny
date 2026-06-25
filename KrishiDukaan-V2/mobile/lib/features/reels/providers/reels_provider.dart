import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/reel_model.dart';
import '../../../core/models/reel_comment_model.dart';
import '../data/reels_repository.dart';

final _repo = ReelsRepository();

final reelsRepoProvider = Provider((_) => _repo);

final reelsFeedProvider = FutureProvider<List<ReelModel>>((ref) {
  return _repo.fetchFeed();
});

final reelCommentsProvider =
    StreamProvider.family<List<ReelCommentModel>, String>(
        (ref, reelId) => _repo.watchComments(reelId));
