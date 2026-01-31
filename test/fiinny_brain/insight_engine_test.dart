import 'package:flutter_test/flutter_test.dart';
import 'package:lifemap/fiinny_brain/fiinny_user_snapshot.dart';
import 'package:lifemap/fiinny_brain/insight_engine.dart';
import 'package:lifemap/fiinny_brain/insight_models.dart';
import 'package:lifemap/fiinny_brain/snapshot_models.dart';
import 'package:lifemap/fiinny_brain/phase_one_progress.dart';
import 'package:lifemap/fiinny_brain/behavior_engine.dart';
// Note: We need minimal mocking of Snapshot. Since it's immutable, we can just instantiate it with desired values.

void main() {
  // Helper to create a partial snapshot with default "safe" values
  FiinnyUserSnapshot createSnapshot({
    double savingsRate = 50.0,
    double expenseToIncomeRatio = 50.0,
    List<String> highSpendCategories = const [],
    double totalOwedToYou = 0.0,
    double totalYouOwe = 0.0,
    int offTrackGoals = 0,
    List<String> riskFlags = const [],
    // Dummy required fields
    double income = 1000,
    double expense = 500,
  }) {
    return FiinnyUserSnapshot(
      incomeSummary: IncomeSummary(
          total: income,
          salaryIncome: income,
          otherIncome: 0,
          transactionCount: 1),
      expenseSummary: ExpenseSummary(
          total: expense,
          transferAmount: 0,
          transactionCount: 1,
          transferCount: 0),
      transactionInsights: const TransactionInsights(
          categoryBreakdown: {},
          totalTransactions: 2,
          incomeTransactions: 1,
          expenseTransactions: 1,
          transferTransactions: 0),
      patterns: PatternSummary(
          subscriptions: [],
          highSpendCategories: highSpendCategories,
          categorySpendPercentage: {}),
      behavior: BehaviorMetrics(
          savingsRate: savingsRate,
          expenseToIncomeRatio: expenseToIncomeRatio,
          riskFlags: riskFlags),
      goals: GoalStatusSummary(
          goals: [],
          totalGoals: offTrackGoals,
          onTrackGoals: 0,
          offTrackGoals:
              offTrackGoals), // We cheat slightly since we only check count
      splits: SplitStatusSummary(
          netBalances: {},
          totalOwedToYou: totalOwedToYou,
          totalYouOwe: totalYouOwe,
          friendCount: 0),
      entityState: EntityState.empty(),
      generatedAt: DateTime.now(),
      progress: PhaseOneProgress.current(),
    );
  }

  // Helper for GOAL_OFF_TRACK which needs names in 'values'
  FiinnyUserSnapshot createSnapshotWithGoalObjects(
      List<GoalStatusReport> goals) {
    final offTrackCount = goals.where((g) => !g.onTrack).length;
    return FiinnyUserSnapshot(
      incomeSummary: const IncomeSummary(
          total: 0, salaryIncome: 0, otherIncome: 0, transactionCount: 0),
      expenseSummary: const ExpenseSummary(
          total: 0, transferAmount: 0, transactionCount: 0, transferCount: 0),
      transactionInsights: const TransactionInsights(
          categoryBreakdown: {},
          totalTransactions: 0,
          incomeTransactions: 0,
          expenseTransactions: 0,
          transferTransactions: 0),
      patterns: const PatternSummary(
          subscriptions: [],
          highSpendCategories: [],
          categorySpendPercentage: {}),
      behavior: const BehaviorMetrics(
          savingsRate: 50.0, expenseToIncomeRatio: 0, riskFlags: []),
      goals: GoalStatusSummary(
          goals: goals,
          totalGoals: goals.length,
          onTrackGoals: goals.length - offTrackCount,
          offTrackGoals: offTrackCount),
      splits: SplitStatusSummary.empty(),
      entityState: EntityState.empty(),
      generatedAt: DateTime.now(),
      progress: PhaseOneProgress.current(),
    );
  }

  group('InsightEngine', () {
    test('Empty/Healthy snapshot returns zero insights', () {
      final snapshot = createSnapshot(
        savingsRate: 50.0, // Healthy
        expenseToIncomeRatio: 50.0, // Healthy
        highSpendCategories: [],
        totalOwedToYou: 0,
        offTrackGoals: 0,
        riskFlags: [],
      );
      final insights = InsightEngine.analyze(snapshot);
      expect(insights, isEmpty);
    });

    test('Detects LOW_SAVINGS', () {
      final snapshot = createSnapshot(savingsRate: 10.0); // < 20%
      final insights = InsightEngine.analyze(snapshot);
      expect(insights.length, 1);
      final insight = insights.first;
      expect(insight.id, 'LOW_SAVINGS');
      expect(insight.category, InsightCategory.risk);
      expect(insight.severity, InsightSeverity.medium);
      expect(insight.values['savingsRate'], 10.0);
    });

    test('Does NOT detect LOW_SAVINGS if exactly on boundary or above', () {
      final snapshot = createSnapshot(savingsRate: 20.0); // == 20%
      final insights = InsightEngine.analyze(snapshot);
      expect(insights, isEmpty);
    });

    test('Detects HIGH_SPENDING', () {
      final snapshot = createSnapshot(expenseToIncomeRatio: 90.0); // > 80%
      final insights = InsightEngine.analyze(snapshot);
      expect(insights.length, 1);
      expect(insights.first.id, 'HIGH_SPENDING');
      expect(insights.first.severity, InsightSeverity.high);
    });

    test('Detects DOMINANT_EXPENSE_CATEGORY', () {
      final snapshot = createSnapshot(highSpendCategories: ['Food', 'Travel']);
      final insights = InsightEngine.analyze(snapshot);
      // Now expecting 2 insights: DOMINANT_EXPENSE_CATEGORY + HIGH_FOOD_SPEND (because of 'Food')
      expect(insights.length, 2);
      expect(insights.map((i) => i.id), contains('DOMINANT_EXPENSE_CATEGORY'));
      expect(insights.map((i) => i.id), contains('HIGH_FOOD_SPEND'));

      // Verify dominant categories logic specifically
      final dominant =
          insights.firstWhere((i) => i.id == 'DOMINANT_EXPENSE_CATEGORY');
      expect(dominant.values['dominantCategories'],
          containsAll(['Food', 'Travel']));
    });

    test('Detects UNSETTLED_SPLITS (Owe)', () {
      final snapshot = createSnapshot(totalYouOwe: 100.0);
      final insights = InsightEngine.analyze(snapshot);
      expect(insights.length, 1);
      expect(insights.first.id, 'UNSETTLED_SPLITS');
      expect(insights.first.values['totalYouOwe'], 100.0);
    });

    test('Detects UNSETTLED_SPLITS (Owed)', () {
      final snapshot = createSnapshot(totalOwedToYou: 50.0);
      final insights = InsightEngine.analyze(snapshot);
      expect(insights.length, 1);
      expect(insights.first.id, 'UNSETTLED_SPLITS');
      expect(insights.first.values['totalOwedToYou'], 50.0);
    });

    // MVP Mode: GOAL_OFF_TRACK should be disabled
    test('Does NOT detect GOAL_OFF_TRACK when MVP_GOALS_ENABLED is false', () {
      // Assuming const is false. If we were mocking we'd flip it.
      // Since it's a const in code, this test verifies the code state.
      final g1 = const GoalStatusReport(
          goalId: '1',
          goalName: 'Car',
          onTrack: false,
          etaMonths: 10,
          amountRemaining: 1000);

      final snapshot = createSnapshotWithGoalObjects([g1]);
      final insights = InsightEngine.analyze(snapshot);

      // Should be empty because MVP_GOALS_ENABLED = false
      expect(insights, isEmpty);
    });

    test('Detects HIGH_FOOD_SPEND', () {
      final snapshot = createSnapshot(highSpendCategories: ['Food']);
      final insights = InsightEngine.analyze(snapshot);

      // Should find DOMINANT_EXPENSE_CATEGORY and HIGH_FOOD_SPEND
      expect(insights.length, 2);
      expect(insights.map((i) => i.id), contains('HIGH_FOOD_SPEND'));
      expect(insights.map((i) => i.id), contains('DOMINANT_EXPENSE_CATEGORY'));
    });

    test('Detects UNPLANNED_SHOPPING_SPIKE', () {
      final snapshot = createSnapshot(highSpendCategories: ['Shopping']);
      final insights = InsightEngine.analyze(snapshot);

      expect(insights.map((i) => i.id), contains('UNPLANNED_SHOPPING_SPIKE'));
    });

    test('Detects PAYCHECK_TO_PAYCHECK', () {
      final snapshot = createSnapshot(expenseToIncomeRatio: 96.0); // > 95%
      final insights = InsightEngine.analyze(snapshot);

      expect(insights.map((i) => i.id), contains('PAYCHECK_TO_PAYCHECK'));
      expect(insights.map((i) => i.id),
          contains('HIGH_SPENDING')); // > 80% rule also fires
    });

    test('Detects FRIENDS_PENDING_HIGH', () {
      final snapshot = createSnapshot(
          totalYouOwe: 600, totalOwedToYou: 500); // Sum 1100 > 1000
      final insights = InsightEngine.analyze(snapshot);

      expect(insights.map((i) => i.id), contains('FRIENDS_PENDING_HIGH'));
      expect(insights.map((i) => i.id),
          contains('UNSETTLED_SPLITS')); // Sum > 0 also fires
    });

    test('Detects INCOME_UNSTABLE', () {
      final snapshot =
          createSnapshot(riskFlags: [BehaviorEngine.incomeUnstable]);
      final insights = InsightEngine.analyze(snapshot);
      expect(insights.length, 1);
      expect(insights.first.id, 'INCOME_UNSTABLE');
      expect(insights.first.severity, InsightSeverity.high);
    });

    test('Multiple insights coexist', () {
      final snapshot = createSnapshot(
        savingsRate: 10.0, // LOW_SAVINGS
        expenseToIncomeRatio: 90.0, // HIGH_SPENDING
        highSpendCategories: ['Food'], // DOMINANT + HIGH_FOOD
      );
      final insights = InsightEngine.analyze(snapshot);
      // LOW_SAVINGS, HIGH_SPENDING, DOMINANT_EXPENSE_CATEGORY, HIGH_FOOD_SPEND
      // Note: HIGH_FOOD_SPEND logic checks highSpendCategories for 'Food'.
      expect(insights.length, 4);
      expect(
          insights.map((i) => i.id),
          containsAll([
            'LOW_SAVINGS',
            'HIGH_SPENDING',
            'DOMINANT_EXPENSE_CATEGORY',
            'HIGH_FOOD_SPEND'
          ]));
    });

    test('Determinism check', () {
      final snapshot = createSnapshot(savingsRate: 15.0);
      final insights1 = InsightEngine.analyze(snapshot);
      final insights2 = InsightEngine.analyze(snapshot);

      expect(insights1.length, insights2.length);
      expect(insights1.first.id, insights2.first.id);
      expect(insights1.first.values['savingsRate'],
          insights2.first.values['savingsRate']);
    });
  });
}
