import 'package:cloud_firestore/cloud_firestore.dart';

class BlogPostModel {
  final String id;
  final String title;
  final String slug;
  final String excerpt;
  final String content;
  final String? coverImage;
  final List<String> tags;
  final String author;
  final int? readTime;
  final DateTime? publishedAt;

  const BlogPostModel({
    required this.id,
    required this.title,
    required this.slug,
    required this.excerpt,
    required this.content,
    this.coverImage,
    required this.tags,
    required this.author,
    this.readTime,
    this.publishedAt,
  });

  factory BlogPostModel.fromFirestore(DocumentSnapshot doc) {
    final d = doc.data() as Map<String, dynamic>;
    return BlogPostModel(
      id: doc.id,
      title: d['title'] as String? ?? '',
      slug: d['slug'] as String? ?? doc.id,
      excerpt: d['excerpt'] as String? ?? '',
      content: d['content'] as String? ?? '',
      coverImage: d['coverImage'] as String?,
      tags: List<String>.from(d['tags'] as List? ?? []),
      author: d['author'] as String? ?? 'KrishiDukaan',
      readTime: (d['readTime'] as num?)?.toInt(),
      publishedAt: (d['publishedAt'] as Timestamp?)?.toDate(),
    );
  }
}
