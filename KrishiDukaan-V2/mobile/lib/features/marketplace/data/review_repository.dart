import 'package:cloud_firestore/cloud_firestore.dart';
import '../../../core/models/review_model.dart';

class ReviewRepository {
  final _db = FirebaseFirestore.instance;

  Future<List<ReviewModel>> fetchProductReviews(String catalogId) async {
    // No orderBy — avoids requiring a composite index that may not exist.
    // Sort client-side instead.
    final snap = await _db
        .collection('productReviews')
        .where('catalogId', isEqualTo: catalogId)
        .limit(20)
        .get();
    final reviews = snap.docs.map(ReviewModel.fromFirestore).toList();
    reviews.sort((a, b) {
      if (a.createdAt == null) return 1;
      if (b.createdAt == null) return -1;
      return b.createdAt!.compareTo(a.createdAt!);
    });
    return reviews;
  }

  Future<List<ReviewModel>> fetchStoreReviews(String storePhone) async {
    final snap = await _db
        .collection('storeReviews')
        .where('storePhone', isEqualTo: storePhone)
        .limit(20)
        .get();
    final reviews = snap.docs.map(ReviewModel.fromFirestore).toList();
    reviews.sort((a, b) {
      if (a.createdAt == null) return 1;
      if (b.createdAt == null) return -1;
      return b.createdAt!.compareTo(a.createdAt!);
    });
    return reviews;
  }

  Future<ReviewModel?> getUserProductReview(
      String catalogId, String reviewerPhone) async {
    final snap = await _db
        .collection('productReviews')
        .where('catalogId', isEqualTo: catalogId)
        .where('reviewerPhone', isEqualTo: reviewerPhone)
        .limit(1)
        .get();
    if (snap.docs.isEmpty) return null;
    return ReviewModel.fromFirestore(snap.docs.first);
  }

  Future<ReviewModel?> getUserStoreReview(
      String storePhone, String reviewerPhone) async {
    final snap = await _db
        .collection('storeReviews')
        .where('storePhone', isEqualTo: storePhone)
        .where('reviewerPhone', isEqualTo: reviewerPhone)
        .limit(1)
        .get();
    if (snap.docs.isEmpty) return null;
    return ReviewModel.fromFirestore(snap.docs.first);
  }

  Future<void> addProductReview({
    required String catalogId,
    required String reviewerPhone,
    required String reviewerName,
    required double rating,
    required String reviewText,
  }) async {
    await _db.collection('productReviews').add({
      'catalogId': catalogId,
      'reviewerPhone': reviewerPhone,
      'reviewerName': reviewerName,
      'rating': rating,
      'reviewText': reviewText,
      'createdAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> addStoreReview({
    required String storePhone,
    required String reviewerPhone,
    required String reviewerName,
    required double rating,
    required String reviewText,
  }) async {
    await _db.collection('storeReviews').add({
      'storePhone': storePhone,
      'reviewerPhone': reviewerPhone,
      'reviewerName': reviewerName,
      'rating': rating,
      'reviewText': reviewText,
      'createdAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> updateProductReview({
    required String reviewId,
    required double rating,
    required String reviewText,
  }) async {
    await _db.collection('productReviews').doc(reviewId).update({
      'rating': rating,
      'reviewText': reviewText,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> updateStoreReview({
    required String reviewId,
    required double rating,
    required String reviewText,
  }) async {
    await _db.collection('storeReviews').doc(reviewId).update({
      'rating': rating,
      'reviewText': reviewText,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }
}
