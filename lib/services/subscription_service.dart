import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';
import 'package:lifemap/models/subscription_model.dart';
import 'package:lifemap/models/subscription_item.dart';
import 'package:lifemap/models/expense_item.dart';
import 'package:lifemap/brain/cadence_detector.dart';

class SubscriptionService extends ChangeNotifier {
  final FirebaseFirestore _db = FirebaseFirestore.instance;
  final FirebaseFunctions _functions =
      FirebaseFunctions.instanceFor(region: 'asia-south1');

  SubscriptionModel? _currentSubscription;
  SubscriptionModel? get currentSubscription => _currentSubscription;

  bool get isPremium => _currentSubscription?.isPremium ?? false;
  bool get isPro => _currentSubscription?.isPro ?? false;

  Future<void> fetchSubscription(String uid) async {
    try {
      final doc = await _db.collection('subscriptions').doc(uid).get();
      if (doc.exists && doc.data() != null) {
        _currentSubscription = SubscriptionModel.fromMap(doc.data()!, doc.id);
      } else {
        _currentSubscription = SubscriptionModel(userId: uid); // Default free
      }
      notifyListeners();
    } catch (e) {
      // debugPrint("Error fetching subscription: $e");
    }
  }

  /// 1. Create Order on Backend
  Future<Map<String, dynamic>> createOrder(String plan, String cycle) async {
    try {
      final result = await _functions.httpsCallable('createPaymentOrder').call({
        'plan': plan,
        'cycle': cycle,
      });
      return Map<String, dynamic>.from(result.data);
    } catch (e) {
      // debugPrint("Error creating order: $e");
      rethrow;
    }
  }

  /// 2. Verify Payment on Backend
  Future<void> verifyPayment({
    required String paymentId,
    required String orderId,
    required String signature,
    required String plan,
    required String cycle,
  }) async {
    try {
      await _functions.httpsCallable('verifyPaymentSignature').call({
        'razorpay_payment_id': paymentId,
        'razorpay_order_id': orderId,
        'razorpay_signature': signature,
        'plan': plan,
        'cycle': cycle,
      });
      // Refresh subscription after verification
      if (_currentSubscription != null) {
        await fetchSubscription(_currentSubscription!.userId);
      }
    } catch (e) {
      // debugPrint("Error verifying payment: $e");
      rethrow;
    }
  }

  /// 3. Cancel Subscription (Disable Auto-Renew)
  Future<void> cancelSubscription() async {
    try {
      await _functions.httpsCallable('cancelSubscription').call();
      if (_currentSubscription != null) {
        await fetchSubscription(_currentSubscription!.userId);
      }
    } catch (e) {
      // debugPrint("Error cancelling subscription: $e");
      rethrow;
    }
  }

  String get formattedExpiry {
    if (_currentSubscription?.expiryDate == null) return "N/A";
    final date = _currentSubscription!.expiryDate!;
    return "${date.day}/${date.month}/${date.year}";
  }

  // --- CRUD for Expense Subscriptions (Netflix, etc.) ---

  Future<void> addSubscription(String userId, SubscriptionItem item) async {
    try {
      final docRef =
          _db.collection('users').doc(userId).collection('subscriptions').doc();
      final newItem = item.copyWith(id: docRef.id);
      await docRef.set(newItem.toJson());
      notifyListeners();
    } catch (e) {
      // debugPrint("Error adding subscription expense: $e");
      rethrow;
    }
  }

  Future<void> updateSubscription(String userId, SubscriptionItem item) async {
    if (item.id == null) return;
    try {
      await _db
          .collection('users')
          .doc(userId)
          .collection('subscriptions')
          .doc(item.id)
          .update(item.toJson());
      notifyListeners();
    } catch (e) {
      // debugPrint("Error updating subscription expense: $e");
      rethrow;
    }
  }

  Future<void> deleteSubscription(String userId, String itemId) async {
    try {
      await _db
          .collection('users')
          .doc(userId)
          .collection('subscriptions')
          .doc(itemId)
          .delete();
      notifyListeners();
    } catch (e) {
      // debugPrint("Error deleting subscription expense: $e");
      rethrow;
    }
  }

  Stream<List<SubscriptionItem>> streamSubscriptions(String userId) {
    return _db
        .collection('users')
        .doc(userId)
        .collection('subscriptions')
        .snapshots()
        .map((snapshot) {
      return snapshot.docs.map((doc) {
        return SubscriptionItem.fromJson(doc.id, doc.data());
      }).toList();
    });
  }

  DateTime calculateNextDueDate(
      DateTime last, String frequency, int? customDays) {
    if (customDays != null && customDays > 0) {
      return last.add(Duration(days: customDays));
    }
    switch (frequency.toLowerCase()) {
      case 'yearly':
        return DateTime(last.year + 1, last.month, last.day);
      case 'quarterly':
        return DateTime(last.year, last.month + 3, last.day);
      case 'monthly':
        return DateTime(last.year, last.month + 1, last.day);
      case 'weekly':
        return last.add(const Duration(days: 7));
      case 'daily':
        return last.add(const Duration(days: 1));
      default:
        return last.add(const Duration(days: 30));
    }
  }
  // --- Auto-Discovery Logic ---

  /// Scans expenses and updates 'subscription_suggestions' collection.
  /// Returns the count of active recurring items found.
  Future<int> runDiscovery(String userId, {int daysWindow = 180}) async {
    try {
      final now = DateTime.now();
      final from = DateTime(now.year, now.month, now.day)
          .subtract(Duration(days: daysWindow));

      final all = <ExpenseItem>[];
      DocumentSnapshot? cursor;
      const pageSize = 250;

      // Fetch all expenses in window
      while (true) {
        Query q = _db
            .collection('users')
            .doc(userId)
            .collection('expenses')
            .where('date', isGreaterThanOrEqualTo: Timestamp.fromDate(from))
            .orderBy('date')
            .limit(pageSize);
        if (cursor != null) {
          q = (q).startAfterDocument(cursor);
        }

        final snap = await q.get();
        if (snap.docs.isEmpty) break;

        for (final d in snap.docs) {
          all.add(ExpenseItem.fromFirestore(d));
        }
        cursor = snap.docs.last;
      }

      // Run Detection
      final detected = CadenceDetector.detect(all);

      // Persist Results
      final suggCol = _db
          .collection('users')
          .doc(userId)
          .collection('subscription_suggestions');

      final WriteBatch batch = _db.batch();
      for (final r in detected) {
        final key =
            '${r.name.toLowerCase()}|${(r.monthlyAmount / 10).round() * 10}';
        final doc = suggCol.doc(key);
        final data = {
          'merchant': r.name,
          'amount': r.monthlyAmount,
          'type': r.type,
          'nextDue': Timestamp.fromDate(r.nextDueDate),
          'status': 'pending',
          'updatedAt': FieldValue.serverTimestamp(),
          'count': r.occurrences,
          'tags': r.tags,
        };
        batch.set(doc, data, SetOptions(merge: true));
      }

      // Update Meta
      batch.set(
          _db
              .collection('users')
              .doc(userId)
              .collection('meta')
              .doc('subs_scan'),
          {
            'lastRunAt': FieldValue.serverTimestamp(),
            'scannedFrom': Timestamp.fromDate(from),
            'foundCount': detected.length,
          },
          SetOptions(merge: true));

      await batch.commit();
      notifyListeners();

      return detected.length;
    } catch (e) {
      debugPrint("Error running subscription discovery: $e");
      rethrow;
    }
  }

  Stream<List<RecurringItem>> streamSuggestions(String userId) {
    return _db
        .collection('users')
        .doc(userId)
        .collection('subscription_suggestions')
        .where('status',
            isEqualTo: 'pending') // Only show active/pending suggestions
        .snapshots()
        .map((snap) {
      return snap.docs.map((d) {
        final data = d.data();
        return RecurringItem(
          key: d.id,
          name: data['merchant'] ?? 'Unknown',
          type: data['type'] ?? 'subscription',
          monthlyAmount: (data['amount'] as num?)?.toDouble() ?? 0.0,
          lastDate: DateTime
              .now(), // Not stored in suggestion currently, ignored for simple display
          nextDueDate:
              (data['nextDue'] as Timestamp?)?.toDate() ?? DateTime.now(),
          tags: List<String>.from(data['tags'] ?? []),
          occurrences: data['count'] ?? 0,
        );
      }).toList();
    });
  }
}
