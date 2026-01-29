import 'package:flutter_test/flutter_test.dart';
import 'package:lifemap/fiinny_brain/forecasting_engine.dart';
import 'package:lifemap/fiinny_brain/fiinny_user_snapshot.dart';
import 'package:lifemap/fiinny_brain/snapshot_models.dart';
import 'package:lifemap/fiinny_brain/phase_one_progress.dart';

void main() {
  group('ForecastingEngine', () {
    // Helper to create snapshot with specific values
    FiinnyUserSnapshot createSnapshot({
      double income = 10000.0,
      double savingsRate = 20.0,
      double expenseTotal = 8000.0,
    }) {
      return FiinnyUserSnapshot(
        incomeSummary: IncomeSummary(
            total: income,
            salaryIncome: income,
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
        patterns: const PatternSummary(
            subscriptions: [],
            highSpendCategories: [],
            categorySpendPercentage: {}),
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

    test('Projects correct timeline for achievable goal', () {
      // Income 10000, Savings rate 20% = 2000/month
      // Target 10000 = 5 months
      final snapshot = createSnapshot(income: 10000, savingsRate: 20.0);
      final report = ForecastingEngine.projectTimeline(snapshot, 10000);

      expect(report.monthsToTarget, 5);
      expect(report.isAchievable, true);
      expect(report.projectedSavings, 10000.0);
    });

    test('Marks goal as unachievable if takes > 60 months', () {
      // Income 10000, Savings rate 5% = 500/month
      // Target 50000 = 100 months (> 60)
      final snapshot = createSnapshot(income: 10000, savingsRate: 5.0);
      final report = ForecastingEngine.projectTimeline(snapshot, 50000);

      expect(report.monthsToTarget, 100);
      expect(report.isAchievable, false);
    });

    test('Returns -1 months for impossible goal (zero savings)', () {
      final snapshot = createSnapshot(income: 10000, savingsRate: 0.0);
      final report = ForecastingEngine.projectTimeline(snapshot, 10000);

      expect(report.monthsToTarget, -1);
      expect(report.isAchievable, false);
    });

    test('Generates best/worst/likely scenarios', () {
      final snapshot = createSnapshot(income: 10000, savingsRate: 20.0);
      final report = ForecastingEngine.projectTimeline(snapshot, 10000);

      expect(report.scenarios['likely'], 5.0);
      expect(report.scenarios['best'],
          lessThanOrEqualTo(5.0)); // 10% better savings, might round to 5
      expect(report.scenarios['worst'], greaterThan(5.0)); // 10% worse savings
    });

    test('Includes assumptions in report', () {
      final snapshot = createSnapshot(income: 10000, savingsRate: 20.0);
      final report = ForecastingEngine.projectTimeline(snapshot, 10000);

      expect(report.assumptions, isNotEmpty);
      expect(
          report.assumptions.any((a) => a.contains('Income remains constant')),
          true);
    });

    test('Projects emergency fund correctly', () {
      // Monthly expense 8000, 6 months = 48000 target
      // Savings 2000/month = 24 months
      final snapshot =
          createSnapshot(income: 10000, savingsRate: 20.0, expenseTotal: 8000);
      final report =
          ForecastingEngine.projectEmergencyFund(snapshot, months: 6);

      expect(report.monthsToTarget, 24);
    });

    test('Survival months calculation', () {
      final months = ForecastingEngine.projectSurvivalMonths(30000, 10000);
      expect(months, 3); // 30000 / 10000 = 3 months
    });

    test('Survival months returns -1 for zero expense', () {
      final months = ForecastingEngine.projectSurvivalMonths(30000, 0);
      expect(months, -1);
    });
  });
}
