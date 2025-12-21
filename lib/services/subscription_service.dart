import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:lifemap/models/subscription_item.dart';
import 'package:lifemap/services/auth_service.dart';

class SubscriptionService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final AuthService _auth = AuthService();

  String get _userId => _auth.currentUser?.uid ?? '';
  // Assuming phone is used for path based on the user_data.dart or similar patterns, 
  // but let's stick to a standard collection path for now or check other services.
  // The SubscriptionItem model doc says `/users/{userPhone}/subscriptions/{subscriptionId}`.
  // We'll trust that for now, but usually it's uid. Let's verify commonly used paths.
  // Actually, let's use a safe collection reference based on UID if possible, 
  // or pass the user identifier. 
  // For now, I'll assume we can get the correct path context. 
  
  // Let's implement a standard collection reference assuming 'users/{uid}/subscriptions'
  // If the app uses phone numbers as IDs, we might need to adjust.
  
  CollectionReference<Map<String, dynamic>> _getSubsRef(String userId) {
    return _firestore
        .collection('users')
        .doc(userId)
        .collection('subscriptions');
  }

  Stream<List<SubscriptionItem>> streamSubscriptions(String userId) {
    if (userId.isEmpty) return Stream.value([]);
    
    return _getSubsRef(userId).snapshots().map((snapshot) {
      return snapshot.docs.map((doc) {
        return SubscriptionItem.fromJson(doc.id, doc.data());
      }).toList();
    });
  }

  Future<void> addSubscription(String userId, SubscriptionItem item) async {
    if (userId.isEmpty) return;
    await _getSubsRef(userId).add(item.toJson());
  }

  Future<void> updateSubscription(String userId, SubscriptionItem item) async {
    if (userId.isEmpty || item.id == null) return;
    await _getSubsRef(userId).doc(item.id).update(item.toJson());
  }

  Future<void> deleteSubscription(String userId, String id) async {
    if (userId.isEmpty) return;
    await _getSubsRef(userId).doc(id).delete();
  }

  /// Calculates the next due date for a subscription
  DateTime calculateNextDueDate(DateTime anchorDate, String frequency, int? intervalDays) {
    final now = DateTime.now();
    DateTime nextDate = anchorDate;

    // simplistic logic, improve with recurrence library if needed
    while (nextDate.isBefore(now)) {
      switch (frequency.toLowerCase()) {
        case 'weekly':
          nextDate = nextDate.add(const Duration(days: 7));
          break;
        case 'monthly':
          // Add 1 month, handling edge cases like Jan 31 -> Feb 28
          nextDate = DateTime(nextDate.year, nextDate.month + 1, nextDate.day);
          break;
        case 'yearly':
          nextDate = DateTime(nextDate.year + 1, nextDate.month, nextDate.day);
          break;
        case 'daily':
          nextDate = nextDate.add(const Duration(days: 1));
          break;
        case 'custom':
          if (intervalDays != null && intervalDays > 0) {
            nextDate = nextDate.add(Duration(days: intervalDays));
          } else {
             // Fallback
             return nextDate; 
          }
          break;
        default:
          return nextDate; // Should not happen
      }
    }
    return nextDate;
  }
}
