// lib/services/util/index_helper.dart
import 'package:cloud_firestore/cloud_firestore.dart';

/// Common where/order pairs so queries consistently use the same composite indexes.
/// Each returns a query that will match the indexes provided below.
extension TxQueryHelpers on CollectionReference<Map<String, dynamic>> {
  /// users/{uid}/transactions (scoped collection ref expected)
  Query<Map<String, dynamic>> byUserOrderByTsDesc(String userId) {
    return where('userId', isEqualTo: userId).orderBy('ts', descending: true);
  }

  Query<Map<String, dynamic>> byUserAndKindOrderByTsDesc(String userId, String kind) {
    return where('userId', isEqualTo: userId)
        .where('kind', isEqualTo: kind) // 'expense' | 'income' | 'transfer'
        .orderBy('ts', descending: true);
  }

  Query<Map<String, dynamic>> byUserAndAccountOrderByTsDesc(String userId, String accountId) {
    return where('userId', isEqualTo: userId)
        .where('accountId', isEqualTo: accountId)
        .orderBy('ts', descending: true);
  }
}
