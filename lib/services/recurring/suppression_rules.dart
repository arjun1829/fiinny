// lib/services/recurring/suppression_rules.dart
import 'package:cloud_firestore/cloud_firestore.dart';

/// Lightweight per-user suppression rules to avoid noisy suggestions.
/// Shape:
/// users/<u>/suppressions/<autoId> { type: 'subscription'|'emi', merchantKey: 'NETFLIX', amountTol: 0.0 }
class SuppressionRules {
  static CollectionReference<Map<String, dynamic>> _col(String u) =>
      FirebaseFirestore.instance
          .collection('users')
          .doc(u)
          .collection('suppressions');

  static Future<void> add({
    required String userId,
    required String type, // 'subscription' or 'emi'
    required String merchantKey,
    double amountTolerance = 0.0,
  }) async {
    await _col(userId).add({
      'type': type,
      'merchantKey': merchantKey.toUpperCase(),
      'amountTol': amountTolerance,
      'createdAt': FieldValue.serverTimestamp(),
    });
  }

  /// Return true if this (merchant, amount) should be suppressed for the given type.
  static Future<bool> shouldSuppress({
    required String userId,
    required String type,
    required String merchantKey,
    required double amount,
  }) async {
    QuerySnapshot<Map<String, dynamic>>? snap;
    try {
      snap = await _col(userId)
          .where('type', isEqualTo: type)
          .where('merchantKey', isEqualTo: merchantKey.toUpperCase())
          .limit(10)
          .get(const GetOptions(source: Source.serverAndCache));
    } catch (_) {
      snap = null;
    }

    if (snap == null || snap.docs.isEmpty) return false;
    for (final d in snap.docs) {
      final tol = (d.data()['amountTol'] ?? 0.0) as num;
      if (tol <= 0) return true; // blanket suppression
      // amount within tolerance ⇒ suppress
      if ((amount - 0).abs() <= tol.toDouble())
        return true; // tol as absolute ₹
    }
    return false;
  }
}
