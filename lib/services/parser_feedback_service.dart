import 'dart:convert';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:crypto/crypto.dart';

import '../fiinny_brain/parser_feedback.dart';

class ParserFeedbackService {
  ParserFeedbackService._();
  static final ParserFeedbackService instance = ParserFeedbackService._();

  CollectionReference _collection(String userId) {
    return FirebaseFirestore.instance
        .collection('users')
        .doc(userId)
        .collection('parser_feedback');
  }

  /// Generates a safe document ID from the raw key.
  String _hashKey(String rawKey) {
    final bytes = utf8.encode(rawKey.trim().toUpperCase());
    return sha256.convert(bytes).toString();
  }

  /// Records user feedback for a specific raw merchant string.
  Future<void> recordFeedback(
    String userId,
    String rawKey, {
    String? name,
    String? category,
    String? subcategory,
  }) async {
    if (rawKey.trim().isEmpty) return;

    final id = _hashKey(rawKey);
    final ref = _collection(userId).doc(id);

    final correction = MerchantCorrection(
      name: name,
      category: category,
      subcategory: subcategory,
      isJunk: false,
    );

    final feedback = ParserFeedback(
      id: id,
      rawKey: rawKey.trim(),
      correction: correction,
      updatedAt: DateTime.now(),
    );

    // Merge to preserve existing fields if partial updates ever happen (though we overwrite here mostly)
    await ref.set(feedback.toJson(), SetOptions(merge: true));
  }

  /// Reports a raw merchant string as junk/spam.
  Future<void> reportJunk(String userId, String rawKey) async {
    if (rawKey.trim().isEmpty) return;

    final id = _hashKey(rawKey);
    final ref = _collection(userId).doc(id);

    final correction = const MerchantCorrection(isJunk: true);

    final feedback = ParserFeedback(
      id: id,
      rawKey: rawKey.trim(),
      correction: correction,
      updatedAt: DateTime.now(),
    );

    await ref.set(feedback.toJson(), SetOptions(merge: true));
  }

  /// Retrieves feedback for a specific raw merchant string.
  Future<ParserFeedback?> getFeedback(String userId, String rawKey) async {
    if (rawKey.trim().isEmpty) return null;

    final id = _hashKey(rawKey);
    final doc = await _collection(userId).doc(id).get();

    if (!doc.exists) return null;
    return ParserFeedback.fromFirestore(doc);
  }
}
