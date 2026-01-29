import 'package:flutter_test/flutter_test.dart';
import 'package:lifemap/fiinny_brain/advisory_engine.dart';
import 'package:lifemap/fiinny_brain/fiinny_user_snapshot.dart';
import 'package:lifemap/fiinny_brain/insight_models.dart';
import 'package:lifemap/fiinny_brain/snapshot_models.dart';
import 'package:lifemap/fiinny_brain/phase_one_progress.dart';

void main() {
  group('AdvisoryEngine', () {
    // Helper to create snapshot
    FiinnyUserSnapshot createSnapshot({
      double income = 10000.0,
      double savingsRate = 20.0,
      Map<String, double> categoryPct = const {},
      List<String> highSpendCategories = const [],
      double totalOwedToYou = 0.0,
    }) {
      return FiinnyUserSnapshot(
        incomeSummary: IncomeSummary(
            total: income,
            salaryIncome: income,
            otherIncome: 0,
            transactionCount: 1),
        expenseSummary: const ExpenseSummary(
            total: 8000,
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
            highSpendCategories: highSpendCategories,
            categorySpendPercentage: categoryPct),
        behavior: BehaviorMetrics(
            savingsRate: savingsRate,
            expenseToIncomeRatio: 100 - savingsRate,
            riskFlags: []),
        goals: const GoalStatusSummary(
            goals: [], totalGoals: 0, onTrackGoals: 0, offTrackGoals: 0),
        splits: SplitStatusSummary(
            netBalances: {},
            totalOwedToYou: totalOwedToYou,
            totalYouOwe: 0,
            friendCount: 0),
        entityState: EntityState.empty(),
        generatedAt: DateTime.now(),
        progress: PhaseOneProgress.current(),
      );
    }

    test('Returns empty report when no insights', () {
      final snapshot = createSnapshot();
      final report = AdvisoryEngine.generateAdvice(snapshot, []);

      expect(report.recommendations, isEmpty);
      expect(report.priorityAction, 'Keep up the good work!');
      expect(report.potentialMonthlySavings, 0.0);
    });

    test('Generates recommendation for LOW_SAVINGS', () {
      final snapshot = createSnapshot(
        highSpendCategories: ['Food'],
        categoryPct: {'Food': 30.0},
      );
      final insights = [
        const FiinnyInsight(
          id: 'LOW_SAVINGS',
          category: InsightCategory.risk,
          severity: InsightSeverity.medium,
          factsUsed: ['behavior.savingsRate'],
          values: {'savingsRate': 10.0},
          actionable: true,
        ),
      ];

      final report = AdvisoryEngine.generateAdvice(snapshot, insights);

      expect(report.recommendations.length, 1);
      expect(report.recommendations.first.id, 'REDUCE_FOOD');
      expect(report.recommendations.first.category, 'REDUCE_EXPENSE');
      expect(report.recommendations.first.impact, greaterThan(0));
    });

    test('Generates recommendation for HIGH_FOOD_SPEND', () {
      final snapshot = createSnapshot(categoryPct: {'Food': 40.0});
      final insights = [
        const FiinnyInsight(
          id: 'HIGH_FOOD_SPEND',
          category: InsightCategory.info,
          severity: InsightSeverity.low,
          factsUsed: ['patterns.highSpendCategories'],
          values: {
            'categories': ['Food']
          },
          actionable: true,
        ),
      ];

      final report = AdvisoryEngine.generateAdvice(snapshot, insights);

      expect(report.recommendations.any((r) => r.id == 'REDUCE_FOOD'), true);
      expect(report.recommendations.first.action, contains('Cook at home'));
    });

    test('Generates recommendation for UNSETTLED_SPLITS', () {
      final snapshot = createSnapshot(totalOwedToYou: 1500.0);
      final insights = [
        const FiinnyInsight(
          id: 'UNSETTLED_SPLITS',
          category: InsightCategory.info,
          severity: InsightSeverity.low,
          factsUsed: ['splits.totalOwedToYou'],
          values: {'totalOwedToYou': 1500.0},
          actionable: true,
        ),
      ];

      final report = AdvisoryEngine.generateAdvice(snapshot, insights);

      expect(report.recommendations.any((r) => r.id == 'COLLECT_SPLITS'), true);
      expect(report.recommendations.first.impact, 1500.0);
    });

    test('Prioritizes highest impact recommendation', () {
      final snapshot = createSnapshot(
        categoryPct: {'Food': 30.0, 'Shopping': 20.0},
        highSpendCategories: ['Food'],
        totalOwedToYou: 5000.0,
      );
      final insights = [
        const FiinnyInsight(
          id: 'LOW_SAVINGS',
          category: InsightCategory.risk,
          severity: InsightSeverity.medium,
          factsUsed: [],
          values: {},
          actionable: true,
        ),
        const FiinnyInsight(
          id: 'UNSETTLED_SPLITS',
          category: InsightCategory.info,
          severity: InsightSeverity.low,
          factsUsed: [],
          values: {},
          actionable: true,
        ),
      ];

      final report = AdvisoryEngine.generateAdvice(snapshot, insights);

      // Collecting 5000 should be higher priority than reducing food
      expect(report.priorityAction, contains('5000'));
    });

    test('Identifies quick wins', () {
      final snapshot = createSnapshot(totalOwedToYou: 500.0);
      final insights = [
        const FiinnyInsight(
          id: 'UNSETTLED_SPLITS',
          category: InsightCategory.info,
          severity: InsightSeverity.low,
          factsUsed: [],
          values: {},
          actionable: true,
        ),
      ];

      final report = AdvisoryEngine.generateAdvice(snapshot, insights);

      expect(report.quickWins, isNotEmpty);
      expect(report.quickWins.first, contains('Collect'));
    });

    test('Calculates total potential savings', () {
      final snapshot = createSnapshot(
        categoryPct: {'Food': 30.0},
        highSpendCategories: ['Food'],
      );
      final insights = [
        const FiinnyInsight(
          id: 'LOW_SAVINGS',
          category: InsightCategory.risk,
          severity: InsightSeverity.medium,
          factsUsed: [],
          values: {},
          actionable: true,
        ),
      ];

      final report = AdvisoryEngine.generateAdvice(snapshot, insights);

      expect(report.potentialMonthlySavings, greaterThan(0));
    });
  });
}
