import 'package:flutter_test/flutter_test.dart';
import 'package:lifemap/fiinny_brain/fiinny_user_snapshot.dart';
import 'package:lifemap/models/transaction_model.dart';
import 'package:lifemap/models/goal_model.dart';
import 'package:lifemap/models/expense_item.dart';
import 'dart:convert';

void main() {
  test('Full Integration: Generates correct Snapshot', () {
    // 1. Mock Data
    final now = DateTime.now();

    // Transactions: 1 Income (Salary), 3 Netflix (Sub), 1 Zomato (Food), 1 Rent (Housing)
    final txs = [
      TransactionModel(
          amount: 50000,
          type: 'income',
          category: 'Inc',
          date: now.subtract(Duration(days: 1)),
          note: 'SALARY CREDIT'),
      TransactionModel(
          amount: 200,
          type: 'expense',
          category: 'Ent',
          date: now.subtract(Duration(days: 5)),
          note: 'Netflix Subscription'),
      TransactionModel(
          amount: 200,
          type: 'expense',
          category: 'Ent',
          date: now.subtract(Duration(days: 35)),
          note: 'Netflix Subscription'),
      TransactionModel(
          amount: 200,
          type: 'expense',
          category: 'Ent',
          date: now.subtract(Duration(days: 65)),
          note: 'Netflix Subscription'),
      TransactionModel(
          amount: 500,
          type: 'expense',
          category: 'Food',
          date: now.subtract(Duration(days: 2)),
          note: 'Zomato'),
      TransactionModel(
          amount: 16000,
          type: 'expense',
          category: 'Travel',
          date: now.subtract(Duration(days: 3)),
          note: 'Uber Rides'),
    ];
    // Total Income: 50000
    // Total Expense: 600 + 500 + 16000 = 17100
    // Savings: 32900 => Rate: 65.8%

    // Goals: Check logic
    final goals = [
      GoalModel(
          id: 'g1',
          title: 'Car',
          targetAmount: 200000,
          savedAmount: 0,
          targetDate: now.add(Duration(days: 300))),
    ];
    // 10 months. Need 20k/mo.
    // Our derived monthly saving (approx): 33900 / 3 months (span ~65 days = ~2.1 months) = ~16000 ?
    // Logic in Snapshot: (Income - Expense) / Months.
    // Income 50k - Exp 16.1k = 33.9k.
    // Time span: ~65 days = 2.16 months.
    // Monthly Savings = 33900 / 2.16 = ~15694.
    // Goal needs ~20k.
    // ETA = 200000 / 15694 = 12.7 months.
    // Remaining time = 10 months.
    // Should be OFF TRACK.

    // Splits
    final expenses = [
      ExpenseItem(
          id: 'e1',
          type: 'exp',
          amount: 1000,
          note: 'Dinner',
          date: now,
          payerId: 'me',
          friendIds: ['bob']), // Bob owes 500
    ];

    // 2. Generate
    final snapshot = FiinnyUserSnapshot.generate(
        transactions: txs, goals: goals, expenses: expenses, myUserId: 'me');

    // 3. Verify
    // Totals
    // Totals
    expect(snapshot.incomeSummary.total, 50000);
    expect(snapshot.expenseSummary.total, 17100);

    // Patterns
    expect(snapshot.patterns.subscriptions, contains('NETFLIX SUBSCRIPTION'));
    expect(snapshot.patterns.highSpendCategories,
        contains('Travel')); // 16k is 32% of 50k income

    // Behavior
    expect(snapshot.behavior.savingsRate, closeTo(65.8, 0.1));
    expect(snapshot.behavior.riskFlags, isEmpty);

    // Goals
    expect(snapshot.goals.goals.first.onTrack,
        false); // Calc above implies off track
    expect(snapshot.goals.goals.first.etaMonths, greaterThan(10));

    // Splits
    expect(snapshot.splits.netBalances['bob'], 500.0);

    // Print for visual check
    print(JsonEncoder.withIndent('  ').convert(snapshot.toJson()));
  });
}
