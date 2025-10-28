// lib/details/services/subscriptions_service.dart
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:intl/intl.dart';

import 'package:lifemap/details/models/recurring_rule.dart';
import 'package:lifemap/details/models/shared_item.dart';
import 'package:lifemap/details/services/recurring_service.dart';
import 'package:lifemap/models/subscription_item.dart';

/// User-centric service for managing documents stored in
/// `/users/{userPhone}/subscriptions`.
///
/// The friend/group "recurring" service remains untouched; this class bridges
/// those personal docs into the existing `SharedItem`-driven UI so both trees can
/// coexist. The model mirrors the recurring schema which keeps downstream
/// widgets working without any additional knowledge of the storage location.
class UserSubscriptionsService {
  UserSubscriptionsService({FirebaseFirestore? firestore})
      : _db = firestore ?? FirebaseFirestore.instance;

  final FirebaseFirestore _db;
  final RecurringService _recurringHelper = RecurringService();

  static const String originKey = 'userSubscriptions';

  CollectionReference<Map<String, dynamic>> _collection(String userPhone) =>
      _db.collection('users').doc(userPhone).collection('subscriptions');

  /// Stream raw [SubscriptionItem] documents for the given user.
  Stream<List<SubscriptionItem>> watchSubscriptions(String userPhone) {
    return _collection(userPhone).snapshots().map((snapshot) {
      return snapshot.docs
          .map((doc) => SubscriptionItem.fromJson(doc.id, doc.data()))
          .toList();
    });
  }

  /// Convenience stream that maps subscriptions to [SharedItem] so the existing
  /// dashboard can consume them without additional plumbing.
  Stream<List<SharedItem>> watchAsSharedItems(String userPhone) {
    return watchSubscriptions(userPhone).map((items) {
      final shared = <SharedItem>[];
      for (final item in items) {
        if (item.id == null) continue;
        shared.add(item.toSharedItem(ownerUserId: userPhone));
      }
      shared.sort((a, b) {
        final ax = a.nextDueAt?.millisecondsSinceEpoch ?? 0;
        final bx = b.nextDueAt?.millisecondsSinceEpoch ?? 0;
        return ax.compareTo(bx);
      });
      return shared;
    });
  }

  /// Detect whether a [SharedItem] originated from this service.
  bool isUserSubscription(SharedItem item) =>
      (item.meta?['origin'] ?? '').toString() == originKey;

  Future<String> addSubscription({
    required String userPhone,
    required SubscriptionItem item,
  }) async {
    final payload = item
        .copyWith(
          nextDueAt: item.nextDueAt ?? item.anchorDate,
          participants: item.participants.isNotEmpty
              ? item.participants
              : [ParticipantShare(userId: userPhone)],
        )
        .toJson();
    payload['rule'] = _buildRuleMap(item, userPhone);
    payload['ownerUserId'] = userPhone;
    payload['createdAt'] = FieldValue.serverTimestamp();
    payload['updatedAt'] = FieldValue.serverTimestamp();

    final doc = _collection(userPhone).doc();
    await doc.set(payload);
    return doc.id;
  }

  Future<void> updateSubscription({
    required String userPhone,
    required SubscriptionItem item,
  }) async {
    final id = item.id;
    if (id == null || id.isEmpty) {
      throw ArgumentError('updateSubscription requires an id');
    }

    final payload = item.toJson();
    payload['rule'] = _buildRuleMap(item, userPhone);
    payload['updatedAt'] = FieldValue.serverTimestamp();

    await _collection(userPhone).doc(id).set(payload, SetOptions(merge: true));
  }

  Future<void> deleteSubscription({
    required String userPhone,
    required SharedItem item,
  }) async {
    await _collection(userPhone).doc(item.id).delete();
  }

  Future<void> pause({
    required String userPhone,
    required SharedItem item,
  }) async {
    await _setStatus(userPhone, item.id, paused: true);
  }

  Future<void> resume({
    required String userPhone,
    required SharedItem item,
  }) async {
    await _setStatus(userPhone, item.id, paused: false);
  }

  Future<void> _setStatus(String userPhone, String id, {required bool paused}) {
    final payload = {
      'paused': paused,
      'rule': {
        'status': paused ? 'paused' : 'active',
      },
      'updatedAt': FieldValue.serverTimestamp(),
    };
    return _collection(userPhone).doc(id).set(payload, SetOptions(merge: true));
  }

  Future<void> markPaid({
    required String userPhone,
    required SharedItem item,
    DateTime? paidAt,
    double? amount,
  }) async {
    final ref = _collection(userPhone).doc(item.id);
    final snap = await ref.get();
    if (!snap.exists) return;
    final data = snap.data() ?? const <String, dynamic>{};
    final subscription = SubscriptionItem.fromJson(snap.id, data);

    final rule = subscription.toRecurringRule(ownerUserId: userPhone);
    final now = paidAt ?? DateTime.now();
    final next = _recurringHelper.computeNextDue(rule, from: now);

    final update = <String, dynamic>{
      'nextDueAt': Timestamp.fromDate(next),
      'updatedAt': FieldValue.serverTimestamp(),
    };
    await ref.set(update, SetOptions(merge: true));

    if (amount != null) {
      await ref.collection('payments').add({
        'amount': amount,
        'paidAt': Timestamp.fromDate(now),
        'createdAt': FieldValue.serverTimestamp(),
      });
    }
  }

  Future<void> setReminder({
    required String userPhone,
    required SharedItem item,
    int? daysBefore,
    String? time,
  }) async {
    final payload = <String, dynamic>{
      'reminderDaysBefore': daysBefore,
      'reminderTime': time,
      'updatedAt': FieldValue.serverTimestamp(),
    };
    await _collection(userPhone).doc(item.id).set(payload, SetOptions(merge: true));
  }

  Map<String, dynamic> _buildRuleMap(SubscriptionItem item, String owner) {
    final rule = item.toRecurringRule(ownerUserId: owner);
    final map = rule.toJson();
    if (item.reminderDaysBefore != null) {
      map['remindAt'] = [
        '-${item.reminderDaysBefore!.clamp(0, 90)}h',
      ];
    }
    return map;
  }

  String formatDueDate(DateTime? due) {
    if (due == null) return 'No due date';
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final target = DateTime(due.year, due.month, due.day);
    if (target == today) return 'Due today';
    if (target.isBefore(today)) {
      final diff = today.difference(target).inDays;
      return 'Overdue by ${diff + 1} day${diff == 0 ? '' : 's'}';
    }
    final format = DateFormat('EEE, d MMM');
    return 'Due ${format.format(due)}';
  }
}
