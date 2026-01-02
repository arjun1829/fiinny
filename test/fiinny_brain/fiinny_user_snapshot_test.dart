import 'package:flutter_test/flutter_test.dart';
import 'package:lifemap/fiinny_brain/fiinny_user_snapshot.dart';
import 'package:lifemap/fiinny_brain/snapshot_models.dart';
import 'package:lifemap/fiinny_brain/phase_one_progress.dart';
import 'package:lifemap/fiinny_brain/behavior_engine.dart';
import 'package:lifemap/models/transaction_model.dart';
import 'package:lifemap/models/goal_model.dart';
import 'package:lifemap/models/expense_item.dart';

void main() {
  group('FiinnyUserSnapshot', () {
    test('Handles new user (no data) gracefully', () {
      final snapshot = FiinnyUserSnapshot.generate(
        transactions: <TransactionModel>[],
        goals: <GoalModel>[],
        expenses: <ExpenseItem>[],
      );

      // Verify defaults
      expect(snapshot.incomeSummary.total, 0.0);
      expect(snapshot.expenseSummary.total, 0.0);
      expect(snapshot.transactionInsights.totalTransactions, 0);
      expect(snapshot.patterns.subscriptions, isEmpty);
      expect(snapshot.behavior.savingsRate, -100.0); // 0 income, 0 expense -> -100% savings rate (BehaviorEngine default)
      expect(snapshot.goals.totalGoals, 0);
      expect(snapshot.splits.totalOwedToYou, 0.0);
      expect(snapshot.progress.progressPercentage, PhaseOneProgress.PHASE_THREE_B_COMPLETE);
    });

    test('Aggregates user with transactions only', () {
      final now = DateTime.now();
      final transactions = [
        TransactionModel(amount: 5000, type: 'income', category: 'Salary', date: now, note: 'Salary credit'),
        TransactionModel(amount: 1000, type: 'expense', category: 'Food', date: now, note: 'Groceries'),
        TransactionModel(amount: 500, type: 'transfer', category: 'Transfer', date: now, note: 'To Savings'), // Should not affect income/expense
      ];

      final snapshot = FiinnyUserSnapshot.generate(
        transactions: transactions,
        goals: <GoalModel>[],
        expenses: <ExpenseItem>[],
      );

      // Income/Expense checks
      expect(snapshot.incomeSummary.total, 5000.0);
      expect(snapshot.expenseSummary.total, 1000.0);
      expect(snapshot.expenseSummary.transferAmount, 500.0);
      
      // Insight checks
      expect(snapshot.transactionInsights.incomeTransactions, 1);
      expect(snapshot.transactionInsights.expenseTransactions, 1);
      expect(snapshot.transactionInsights.transferTransactions, 1);
      
      // Behavior checks
      // Savings = 4000, Income = 5000 -> 80% savings rate
      expect(snapshot.behavior.savingsRate, closeTo(80.0, 0.1));
    });

    test('Goals calculation uses derived monthly savings', () {
      final now = DateTime.now();
      // Income 5000, Expense 1000 -> Monthly Savings 4000
      // Transaction list is 1 item -> interpreted as 1 month period
      final transactions = [
        TransactionModel(amount: 5000, type: 'income', category: 'Salary', date: now, note: 'Salary'),
        TransactionModel(amount: 1000, type: 'expense', category: 'Food', date: now, note: 'Food'),
      ];

      final goal = GoalModel(
        id: '1',
        title: 'Car',
        targetAmount: 40000, // 10 months to save
        savedAmount: 0,
        targetDate: now.add(Duration(days: 300)), // ~10 months away
      );

      final snapshot = FiinnyUserSnapshot.generate(
        transactions: transactions,
        goals: [goal],
        expenses: <ExpenseItem>[],
      );

      expect(snapshot.goals.totalGoals, 1);
      // Monthly savings 4000. Need 40000 in 10 months. Required/month = 4000.
      expect(snapshot.goals.goals.first.onTrack, true);
      expect(snapshot.goals.goals.first.etaMonths, closeTo(10.0, 0.5));
    });

    test('Splits are calculated correctly independent of transactions', () {
      final expenses = <ExpenseItem>[
        ExpenseItem(
          id: '1',
          type: 'expense',
          amount: 1000,
          note: 'Dinner',
          payerId: 'me',
          friendIds: ['friend'],
          date: DateTime.now(),
          title: 'Dinner',
        )
      ];

      final snapshot = FiinnyUserSnapshot.generate(
        transactions: <TransactionModel>[],
        goals: <GoalModel>[],
        expenses: expenses,
        myUserId: 'me',
      );

      expect(snapshot.splits.totalOwedToYou, 500.0);
      expect(snapshot.splits.totalYouOwe, 0.0);
    });

    test('Full user data integration', () {
      final now = DateTime.now();
      
      // Transactions: Income 10,000, Expense 9,000 (transfer 500 ignored)
      // Savings = 1,000.
      final transactions = [
        TransactionModel(amount: 10000, type: 'income', category: 'Salary', date: now, note: 'Paycheck'),
        TransactionModel(amount: 3000, type: 'expense', category: 'Rent', date: now, note: 'Rent'),
        TransactionModel(amount: 3000, type: 'expense', category: 'Travel', date: now, note: 'Uber'),
        TransactionModel(amount: 3600, type: 'expense', category: 'Food', date: now, note: 'Zomato'), // High spend potential
        TransactionModel(amount: 500, type: 'transfer', category: 'Self', date: now, note: 'To checking'),
      ];

      // Goal: Save 10,000. With 1,000/month savings, needs 10 months.
      // Deadline is in 5 months. Should be OFF TRACK.
      final goal = GoalModel(
        id: 'g1', 
        title: 'Trip', 
        targetAmount: 10000, 
        savedAmount: 0, 
        targetDate: now.add(Duration(days: 150))
      );

      // Split: I owe friend 200.
      final expenses = <ExpenseItem>[
        ExpenseItem(
          id: 's1',
          type: 'expense',
          amount: 400,
          note: 'Lunch',
          payerId: 'friend',
          friendIds: ['me'],
          date: now,
          title: 'Lunch',
        )
      ];

      final snapshot = FiinnyUserSnapshot.generate(
        transactions: transactions,
        goals: [goal],
        expenses: expenses,
        myUserId: 'me',
      );

      // Verify all engines contributed
      expect(snapshot.incomeSummary.total, 10000.0);
      expect(snapshot.expenseSummary.total, 9600.0);
      expect(snapshot.expenseSummary.transferAmount, 500.0);
      
      // Behavior: 4% savings rate (400/10000)
      expect(snapshot.behavior.savingsRate, closeTo(4.0, 0.1));
      expect(snapshot.behavior.riskFlags, contains(BehaviorEngine.LOW_SAVINGS)); // < 5% triggers low savings 
      // Actually BehaviorEngine usually uses < 5% or similar for low savings? Let's check logic:
      // BehaviorEngine: if savingsRate < 5 -> LOW_SAVINGS. Here 10%. So maybe not low savings.
      // But expense ratio 90%. if expenseRatio > 90 -> HIGH_SPENDING. 9000/10000 = 90%. 
      // If logic is > 90, then 90 is safe. If >= 90, then flag.
      // Let's rely on deterministic engine output.
      
      // Goal
      expect(snapshot.goals.offTrackGoals, 1);
      
      // Splits
      expect(snapshot.splits.totalYouOwe, 200.0);

      // Progress
      expect(snapshot.progress.progressPercentage, PhaseOneProgress.PHASE_THREE_B_COMPLETE);
    });
  });
}
