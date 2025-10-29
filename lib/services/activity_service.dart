// lib/services/activity_service.dart

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:rxdart/rxdart.dart';

import '../details/models/shared_item.dart';
import '../models/expense_item.dart';
import '../models/income_item.dart';

enum ActivityType { expense, income, settleup }

class ActivityItem {
  final String id;
  final ActivityType type;
  final double amount;
  final String label;
  final String? note;
  final DateTime date;
  final String? friendId;
  final String? groupId;
  final String? payerId;
  final String? receiverId;
  final bool isSettleUp;

  ActivityItem({
    required this.id,
    required this.type,
    required this.amount,
    required this.label,
    this.note,
    required this.date,
    this.friendId,
    this.groupId,
    this.payerId,
    this.receiverId,
    this.isSettleUp = false,
  });
}

class ActivityService {
  final _expensesRef = FirebaseFirestore.instance.collection('expenses');
  final _incomesRef = FirebaseFirestore.instance.collection('incomes');

  // --- Unified activity stream (merges expenses & incomes by user) ---
  Stream<List<ActivityItem>> streamUserActivity(String userId) {
    // Listen to expenses and incomes for this user
    final expensesStream = _expensesRef
        .where('friendIds', arrayContains: userId)
        .snapshots()
        .map((snap) => snap.docs.map((doc) {
      final item = ExpenseItem.fromFirestore(doc);
      return ActivityItem(
        id: item.id,
        type: item.isBill || (item.label ?? '').toLowerCase().contains('settle')
            ? ActivityType.settleup
            : ActivityType.expense,
        amount: item.amount,
        label: item.label ?? item.type,
        note: item.note,
        date: item.date,
        friendId: item.friendIds.isNotEmpty ? item.friendIds.first : null,
        groupId: item.groupId,
        payerId: item.payerId,
        receiverId: null, // For settleup, fill appropriately if you store
        isSettleUp: item.isBill || (item.label ?? '').toLowerCase().contains('settle'),
      );
    }).toList());

    final incomesStream = _incomesRef
        .where('source', isEqualTo: userId)
        .snapshots()
        .map((snap) => snap.docs.map((doc) {
      final item = IncomeItem.fromJson(doc.data());
      return ActivityItem(
        id: item.id,
        type: ActivityType.income,
        amount: item.amount,
        label: item.label ?? item.type,
        note: item.note,
        date: item.date,
        friendId: null,
        groupId: null,
        payerId: null,
        receiverId: item.source,
        isSettleUp: (item.label ?? '').toLowerCase().contains('settle'),
      );
    }).toList());

    final recurringStream = FirebaseFirestore.instance
        .collectionGroup('recurring')
        .where('ownerUserId', isEqualTo: userId)
        .snapshots()
        .map((snap) {
      return snap.docs.map((doc) {
        try {
          final data = doc.data();
          final item = SharedItem.fromJson(doc.id, data);

          DateTime? createdAt;
          final rawCreated = data['createdAt'];
          if (rawCreated is Timestamp) {
            createdAt = rawCreated.toDate();
          } else if (rawCreated is DateTime) {
            createdAt = rawCreated;
          } else if (rawCreated is String) {
            createdAt = DateTime.tryParse(rawCreated);
          }
          createdAt ??= item.nextDueAt ?? item.rule.anchorDate;

          final segments = doc.reference.path.split('/');
          String? friendId;
          String? groupId = item.groupId;
          if (segments.length >= 4 && segments[0] == 'users' && segments[2] == 'friends') {
            friendId = segments[3];
          } else if (segments.length >= 2 && segments[0] == 'groups') {
            groupId ??= segments[1];
          }

          double amount = item.rule.amount;
          if (amount.isNaN || amount.isInfinite) {
            amount = item.amount ?? 0.0;
          }

          return ActivityItem(
            id: doc.id,
            type: ActivityType.expense,
            amount: amount,
            label: item.title?.trim().isNotEmpty == true
                ? item.title!.trim()
                : 'Recurring payment',
            note: item.note,
            date: createdAt,
            friendId: friendId,
            groupId: groupId,
            payerId: userId,
            receiverId: null,
            isSettleUp: false,
          );
        } catch (_) {
          return null;
        }
      }).whereType<ActivityItem>().toList();
    });

    // Combine streams and sort by date descending
    return Rx.combineLatest3<List<ActivityItem>, List<ActivityItem>, List<ActivityItem>, List<ActivityItem>>(
      expensesStream,
      incomesStream,
      recurringStream,
      (expenses, incomes, recurring) {
        final all = <ActivityItem>[];
        all
          ..addAll(expenses)
          ..addAll(incomes)
          ..addAll(recurring);
        all.sort((a, b) => b.date.compareTo(a.date));
        return all;
      },
    );
  }
}
