import 'package:cloud_firestore/cloud_firestore.dart';

class UserOverrides {
  static Future<String?> getCategoryForMerchant(
      String userId, String merchantKey) async {
    final ref = FirebaseFirestore.instance
        .collection('users')
        .doc(userId)
        .collection('overrides')
        .doc('merchant_categories');

    final snap = await ref.get();
    final data = snap.data() as Map<String, dynamic>?;
    if (data == null) return null;

    final key = merchantKey.toUpperCase();
    final value = data[key];
    return (value is String && value.trim().isNotEmpty) ? value : null;
  }

  static Future<void> setCategoryForMerchant(
      String userId, String merchantKey, String category) {
    final ref = FirebaseFirestore.instance
        .collection('users')
        .doc(userId)
        .collection('overrides')
        .doc('merchant_categories');

    return ref.set({merchantKey.toUpperCase(): category},
        SetOptions(merge: true));
  }
}
