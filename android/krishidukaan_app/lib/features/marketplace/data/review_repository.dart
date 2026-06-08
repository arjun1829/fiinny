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
}
