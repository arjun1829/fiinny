import 'package:cloud_firestore/cloud_firestore.dart';

class ReviewModel {
  final String id;
  final String catalogId;
  final String storePhone;
  final double rating;
  final String? reviewText;
  final String reviewerPhone;
  final String reviewerName;
  final DateTime? createdAt;

  const ReviewModel({
    required this.id,
    this.catalogId = '',
    this.storePhone = '',
    required this.rating,
    this.reviewText,
    required this.reviewerPhone,
    required this.reviewerName,
    this.createdAt,
  });

  factory ReviewModel.fromFirestore(DocumentSnapshot doc) {
    final d = doc.data() as Map<String, dynamic>;
    return ReviewModel(
      id: doc.id,
      catalogId: d['catalogId'] as String? ?? '',
      storePhone: d['storePhone'] as String? ?? '',
      rating: (d['rating'] as num?)?.toDouble() ?? 0.0,
      reviewText: d['reviewText'] as String?,
      reviewerPhone: d['reviewerPhone'] as String? ?? '',
      reviewerName: d['reviewerName'] as String? ?? 'Anonymous',
      createdAt: (d['createdAt'] as Timestamp?)?.toDate(),
    );
  }
}
