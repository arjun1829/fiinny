import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/blog_post_model.dart';
import '../data/hubs_repository.dart';

final _repo = HubsRepository();

final hubsListProvider = FutureProvider<List<BlogPostModel>>((ref) {
  return _repo.fetchPosts();
});

final hubPostProvider =
    FutureProvider.family<BlogPostModel?, String>((ref, id) {
  return _repo.fetchPostById(id);
});

final relatedPostsProvider =
    FutureProvider.family<List<BlogPostModel>, BlogPostModel>((ref, post) {
  return _repo.fetchRelated(post);
});
