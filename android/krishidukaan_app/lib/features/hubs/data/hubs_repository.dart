import 'package:cloud_firestore/cloud_firestore.dart';
import '../../../core/models/blog_post_model.dart';

class HubsRepository {
  final _db = FirebaseFirestore.instance;

  Future<List<BlogPostModel>> fetchPosts() async {
    final snap = await _db
        .collection('blogPosts')
        .where('status', isEqualTo: 'published')
        .orderBy('publishedAt', descending: true)
        .get();
    return snap.docs.map(BlogPostModel.fromFirestore).toList();
  }

  Future<BlogPostModel?> fetchPostBySlug(String slug) async {
    final snap = await _db
        .collection('blogPosts')
        .where('slug', isEqualTo: slug)
        .where('status', isEqualTo: 'published')
        .limit(1)
        .get();
    if (snap.docs.isEmpty) return null;
    return BlogPostModel.fromFirestore(snap.docs.first);
  }

  Future<BlogPostModel?> fetchPostById(String id) async {
    final doc = await _db.collection('blogPosts').doc(id).get();
    if (!doc.exists) return null;
    return BlogPostModel.fromFirestore(doc);
  }

  Future<List<BlogPostModel>> fetchRelated(BlogPostModel post) async {
    if (post.tags.isEmpty) return [];
    final snap = await _db
        .collection('blogPosts')
        .where('status', isEqualTo: 'published')
        .where('tags', arrayContainsAny: post.tags.take(3).toList())
        .limit(6)
        .get();
    return snap.docs
        .map(BlogPostModel.fromFirestore)
        .where((p) => p.id != post.id)
        .take(3)
        .toList();
  }
}
