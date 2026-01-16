// lib/services/balance_service.dart

import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/expense_item.dart';
import '../models/income_item.dart';
import 'package:rxdart/rxdart.dart'; // Needed for Rx.combineLatest2


class BalanceResult {
  final double netBalance; // +ve means user is owed, -ve means user owes
  final double totalOwe;
  final double totalOwedTo;
  final Map<String, double> perFriendNet; // friendId -> amount (positive: they owe you, negative: you owe them)
  final Map<String, double> perGroupNet; // groupId -> amount

  BalanceResult({
    required this.netBalance,
    required this.totalOwe,
    required this.totalOwedTo,
    required this.perFriendNet,
    required this.perGroupNet,
  });
}

class BalanceService {
  final _expensesRef = FirebaseFirestore.instance.collection('expenses');
  final _incomesRef = FirebaseFirestore.instance.collection('incomes');

  // Stream for a user's total balance, per friend, per group
  Stream<BalanceResult> streamUserBalances(String userId) {
    // Listen to both expenses and incomes
    final expensesStream = _expensesRef
        .where('friendIds', arrayContains: userId)
        .snapshots()
        .map((snap) => snap.docs.map((doc) => ExpenseItem.fromFirestore(doc)).toList());

    final incomesStream = _incomesRef
        .where('source', isEqualTo: userId)
        .snapshots()
        .map((snap) => snap.docs.map((doc) => IncomeItem.fromJson(doc.data())).toList());

    return Rx.combineLatest2<List<ExpenseItem>, List<IncomeItem>, BalanceResult>(
      expensesStream,
      incomesStream,
          (expenses, incomes) => _calculateBalances(userId, expenses, incomes),
    );
  }

  // Internal balance calculation function
  BalanceResult _calculateBalances(
      String userId, List<ExpenseItem> expenses, List<IncomeItem> incomes) {
    double totalOwe = 0.0;
    double totalOwedTo = 0.0;
    final Map<String, double> perFriendNet = {};
    final Map<String, double> perGroupNet = {};

    for (final e in expenses) {
      final participants = e.friendIds + [e.payerId];
      final split = e.customSplits ??
          Map.fromIterable(participants,
              key: (id) => id,
              value: (id) => e.amount / participants.length);

      // If you are a payer, others owe you. If you are a participant, you owe payer.
      for (final id in split.keys) {
        if (id == userId) {
          if (e.payerId == userId) {
            // You paid for others
            final othersShare = split.values.reduce((a, b) => a + b) - split[userId]!;
            totalOwedTo += othersShare;
            // Update perFriend/perGroup
            if (e.groupId != null) {
              perGroupNet[e.groupId!] = (perGroupNet[e.groupId!] ?? 0) + othersShare;
            }
            for (final friendId in e.friendIds) {
              perFriendNet[friendId] = (perFriendNet[friendId] ?? 0) + (split[friendId] ?? 0);
            }
          } else {
            // Someone else paid for you
            final yourShare = split[userId]!;
            totalOwe += yourShare;
            if (e.groupId != null) {
              perGroupNet[e.groupId!] = (perGroupNet[e.groupId!] ?? 0) - yourShare;
            }
            perFriendNet[e.payerId] = (perFriendNet[e.payerId] ?? 0) - yourShare;
          }
        }
      }
    }

    // Incomes: money received (like settleups), only counts if not part of expense
    for (final inc in incomes) {
      totalOwedTo += inc.amount;
      // Can also update perFriendNet if needed, if income has friendId/source
    }

    final netBalance = totalOwedTo - totalOwe;

    return BalanceResult(
      netBalance: netBalance,
      totalOwe: totalOwe,
      totalOwedTo: totalOwedTo,
      perFriendNet: perFriendNet,
      perGroupNet: perGroupNet,
    );
  }
}

// Add this import to your pubspec.yaml if not already:
