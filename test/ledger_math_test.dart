import 'package:test/test.dart';

import 'package:lifemap/group/ledger_math.dart';
import 'package:lifemap/models/expense_item.dart';

ExpenseItem expense({
  required String id,
  required String payer,
  required double amount,
  List<String> friends = const [],
  Map<String, double>? splits,
  String? groupId,
  String type = 'Expense',
  String? label,
  bool isBill = false,
}) {
  return ExpenseItem(
    id: id,
    type: type,
    amount: amount,
    note: '',
    date: DateTime(2024, 1, 1),
    friendIds: friends,
    groupId: groupId,
    settledFriendIds: const [],
    payerId: payer,
    customSplits: splits,
    isBill: isBill,
    label: label,
  );
}

void main() {
  group('netBetween', () {
    test('equal split between two friends', () {
      final e1 = expense(id: 'e1', payer: 'alice', amount: 100, friends: ['bob']);
      expect(netBetween('alice', 'bob', [e1]), 50);
    });

    test('custom split respected', () {
      final e1 = expense(
        id: 'e1',
        payer: 'alice',
        amount: 100,
        friends: ['bob'],
        splits: {'alice': 40, 'bob': 60},
      );
      expect(netBetween('alice', 'bob', [e1]), 60);
    });

    test('settlement adjusts net directly', () {
      final e1 = expense(
        id: 'e1',
        payer: 'alice',
        amount: 80,
        friends: ['bob'],
        type: 'Settlement',
        isBill: true,
      );
      expect(netBetween('alice', 'bob', [e1]), 80);
    });

    test('multiple expenses balance correctly', () {
      final tx = [
        expense(id: 'e1', payer: 'alice', amount: 120, friends: ['bob']),
        expense(id: 'e2', payer: 'bob', amount: 90, friends: ['alice']),
      ];
      expect(netBetween('alice', 'bob', tx), 15);
    });
  });

  group('pairwiseNetForUserInGroup', () {
    test('computes map for multi member group', () {
      final tx = [
        expense(
          id: 'e1',
          payer: 'alice',
          amount: 120,
          friends: ['bob', 'carol'],
          groupId: 'g1',
        ),
        expense(
          id: 'e2',
          payer: 'bob',
          amount: 90,
          friends: ['alice', 'carol'],
          groupId: 'g1',
        ),
        expense(
          id: 'e3',
          payer: 'carol',
          amount: 60,
          friends: ['alice', 'bob'],
          groupId: 'g1',
        ),
      ];

      final map = pairwiseNetForUserInGroup(tx, 'alice', 'g1');
      expect(map['bob'], 10);
      expect(map['carol'], 20);
    });
  });

  test('summarizeForHeader aggregates correctly', () {
    final summary = summarizeForHeader({'bob': 10.009, 'carol': 20.0, 'dave': -5});
    expect(summary.youOwe, 5);
    expect(summary.owedToYou, 30);
    expect(summary.net, 25);
  });
}
