// lib/services/activity_service.dart

import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/expense_item.dart';
import '../models/income_item.dart';
import 'package:rxdart/rxdart.dart'; // For StreamZip
import 'package:rxdart/rxdart.dart';




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

    // Combine both streams and sort by date descending
    return Rx.combineLatest2<List<ActivityItem>, List<ActivityItem>, List<ActivityItem>>(
      expensesStream,
      incomesStream,
          (expenses, incomes) {
        final all = <ActivityItem>[];
        all.addAll(expenses);
        all.addAll(incomes);
        all.sort((a, b) => b.date.compareTo(a.date));
        return all;
      },
    );

  }
}

// You need this import:
