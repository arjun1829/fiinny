import 'package:flutter_test/flutter_test.dart';
import 'package:lifemap/fiinny_brain/historical_comparison_engine.dart';
import 'package:lifemap/fiinny_brain/fiinny_user_snapshot.dart';
import 'package:lifemap/fiinny_brain/snapshot_models.dart';
import 'package:lifemap/fiinny_brain/phase_one_progress.dart';

void main() {
  group('HistoricalComparisonEngine', () {
    // Helper to create snapshot with specific values
    FiinnyUserSnapshot createSnapshot({
      double savingsRate = 20.0,
      double expenseTotal = 5000.0,
      Map<String, double> categoryPct = const {},
    }) {
      return FiinnyUserSnapshot(
        incomeSummary: const IncomeSummary(
            total: 10000,
            salaryIncome: 10000,
            otherIncome: 0,
            transactionCount: 1),
        expenseSummary: ExpenseSummary(
            total: expenseTotal,
            transferAmount: 0,
            transactionCount: 1,
            transferCount: 0),
        transactionInsights: const TransactionInsights(
            categoryBreakdown: {},
            totalTransactions: 1,
            incomeTransactions: 1,
            expenseTransactions: 0,
            transferTransactions: 0),
        patterns: PatternSummary(
            subscriptions: [],
            highSpendCategories: [],
            categorySpendPercentage: categoryPct),
        behavior: BehaviorMetrics(
            savingsRate: savingsRate,
            expenseToIncomeRatio: 100 - savingsRate,
            riskFlags: []),
        goals: const GoalStatusSummary(
            goals: [], totalGoals: 0, onTrackGoals: 0, offTrackGoals: 0),
        splits: SplitStatusSummary.empty(),
        entityState: EntityState.empty(),
        generatedAt: DateTime.now(),
        progress: PhaseOneProgress.current(),
      );
    }

    test('Returns empty report when no previous snapshot', () {
      final current = createSnapshot();
      final report = HistoricalComparisonEngine.compare(current, null);

      expect(report.savingsRateTrend, 0.0);
      expect(report.expenseGrowth, 0.0);
      expect(report.improvingCategories, isEmpty);
      expect(report.worseningCategories, isEmpty);
      expect(report.isProgressingOverall, false);
    });

    test('Detects savings rate improvement', () {
      final previous = createSnapshot(savingsRate: 10.0);
      final current = createSnapshot(savingsRate: 20.0);

      final report = HistoricalComparisonEngine.compare(current, previous);

      // 10 -> 20 = 100% improvement
      expect(report.savingsRateTrend, closeTo(100.0, 0.1));
    });

    test('Detects expense growth', () {
      final previous = createSnapshot(expenseTotal: 5000.0);
      final current = createSnapshot(expenseTotal: 6000.0);

      final report = HistoricalComparisonEngine.compare(current, previous);

      // 5000 -> 6000 = 20% growth
      expect(report.expenseGrowth, closeTo(20.0, 0.1));
    });

    test('Identifies improving categories', () {
      final previous =
          createSnapshot(categoryPct: {'Food': 30.0, 'Travel': 20.0});
      final current = createSnapshot(
          categoryPct: {'Food': 20.0, 'Travel': 18.0}); // Food reduced by >5%

      final report = HistoricalComparisonEngine.compare(current, previous);

      expect(report.improvingCategories, contains('Food'));
      // Travel only reduced by 10%, which is < -5% threshold? Let me check logic.
      // Change = (18-20)/20 * 100 = -10%. That's < -5, so should be improving.
      expect(report.improvingCategories, contains('Travel'));
    });

    test('Identifies worsening categories', () {
      final previous = createSnapshot(categoryPct: {'Shopping': 10.0});
      final current =
          createSnapshot(categoryPct: {'Shopping': 25.0}); // 150% increase

      final report = HistoricalComparisonEngine.compare(current, previous);

      expect(report.worseningCategories, contains('Shopping'));
    });

    test('Overall progress when savings improve and expenses controlled', () {
      final previous = createSnapshot(savingsRate: 10.0, expenseTotal: 5000.0);
      final current = createSnapshot(
          savingsRate: 15.0, expenseTotal: 5100.0); // 2% expense growth

      final report = HistoricalComparisonEngine.compare(current, previous);

      expect(report.isProgressingOverall, true);
    });

    test('Not progressing when expenses grow too much', () {
      final previous = createSnapshot(savingsRate: 10.0, expenseTotal: 5000.0);
      final current = createSnapshot(
          savingsRate: 15.0, expenseTotal: 5500.0); // 10% expense growth

      final report = HistoricalComparisonEngine.compare(current, previous);

      expect(report.isProgressingOverall, false); // Expense growth > 5%
    });

    test('Same snapshot vs itself shows zero change', () {
      final snapshot = createSnapshot(savingsRate: 20.0, expenseTotal: 5000.0);
      final report = HistoricalComparisonEngine.compare(snapshot, snapshot);

      expect(report.savingsRateTrend, 0.0);
      expect(report.expenseGrowth, 0.0);
      expect(report.isProgressingOverall, true); // 0% growth is < 5%
    });

    test('Handles zero previous values safely', () {
      final previous = createSnapshot(savingsRate: 0.0, expenseTotal: 0.0);
      final current = createSnapshot(savingsRate: 20.0, expenseTotal: 5000.0);

      final report = HistoricalComparisonEngine.compare(current, previous);

      // Should not crash, returns 0 for percent change when old value is 0
      expect(report.savingsRateTrend, 0.0);
      expect(report.expenseGrowth, 0.0);
    });
  });
}
