import '../models/transaction_model.dart';
import '../models/goal_model.dart';
import '../models/expense_item.dart';
import 'transaction_engine.dart';
import 'pattern_engine.dart';
import 'behavior_engine.dart';
import 'goal_engine.dart';
import 'split_engine.dart';
import 'snapshot_models.dart';
import 'phase_one_progress.dart';

/// Immutable snapshot of the user's financial state after Phase One.
/// No logic is performed here; it only assembles outputs from the hardened engines.
class FiinnyUserSnapshot {
  final IncomeSummary incomeSummary;
  final ExpenseSummary expenseSummary;
  final TransactionInsights transactionInsights;
  final PatternSummary patterns;
  final BehaviorMetrics behavior;
  final GoalStatusSummary goals;
  final SplitStatusSummary splits;

  final DateTime generatedAt;
  final PhaseOneProgress progress;

  const FiinnyUserSnapshot({
    required this.incomeSummary,
    required this.expenseSummary,
    required this.transactionInsights,
    required this.patterns,
    required this.behavior,
    required this.goals,
    required this.splits,
    required this.generatedAt,
    required this.progress,
  });

  Map<String, dynamic> toJson() => {
        'incomeSummary': incomeSummary.toJson(),
        'expenseSummary': expenseSummary.toJson(),
        'transactionInsights': transactionInsights.toJson(),
        'patterns': patterns.toJson(),
        'behavior': behavior.toJson(),
        'goals': goals.toJson(),
        'splits': splits.toJson(),
        'generatedAt': generatedAt.toIso8601String(),
        'progress': progress.progressPercentage,
      };

  /// Factory to generate a snapshot from raw data.
  /// This method only orchestrates calls to existing engines and aggregates results.
  static FiinnyUserSnapshot generate({
    required List<TransactionModel> transactions,
    required List<GoalModel> goals,
    required List<ExpenseItem> expenses,
    String myUserId = 'me',
  }) {
    // ---- Transaction classification ----
    double incomeTotal = 0;
    double salaryIncome = 0;
    double expenseTotal = 0;
    double transferTotal = 0;
    int incomeCount = 0;
    int expenseCount = 0;
    int transferCount = 0;
    final Map<String, int> categoryCounts = {};

    for (var t in transactions) {
      final classification = TransactionEngine.analyze(t);
      // Count categories for insights
      categoryCounts.update(classification.category, (c) => c + 1, ifAbsent: () => 1);

      if (classification.isTransfer) {
        transferTotal += t.amount;
        transferCount++;
        continue;
      }

      if (classification.isIncome) {
        incomeTotal += t.amount;
        incomeCount++;
        if (classification.isSalary) {
          salaryIncome += t.amount;
        }
      } else {
        expenseTotal += t.amount;
        expenseCount++;
      }
    }

    // ---- Assemble summary objects ----
    final incomeSummary = IncomeSummary(
      total: incomeTotal,
      salaryIncome: salaryIncome,
      otherIncome: incomeTotal - salaryIncome,
      transactionCount: incomeCount,
    );

    final expenseSummary = ExpenseSummary(
      total: expenseTotal,
      transferAmount: transferTotal,
      transactionCount: expenseCount,
      transferCount: transferCount,
    );

    final transactionInsights = TransactionInsights(
      categoryBreakdown: categoryCounts,
      totalTransactions: transactions.length,
      incomeTransactions: incomeCount,
      expenseTransactions: expenseCount,
      transferTransactions: transferCount,
    );

    // ---- Engine analyses that operate on the raw lists ----
    final patternReport = PatternEngine.analyze(transactions, incomeTotal);
    final patterns = PatternSummary(
      subscriptions: patternReport.subscriptions,
      highSpendCategories: patternReport.highSpendCategories,
      categorySpendPercentage: patternReport.categorySpendPercentage,
    );

    final behaviorReport = BehaviorEngine.analyze(incomeTotal, expenseTotal);
    final behavior = BehaviorMetrics(
      savingsRate: behaviorReport.savingsRate,
      expenseToIncomeRatio: behaviorReport.expenseToIncomeRatio,
      riskFlags: behaviorReport.riskFlags,
    );

    // Goal status – use monthly savings derived from income/expense
    double monthlySavings = 0;
    if (transactions.isNotEmpty) {
      // Treat the provided list as one month for simplicity.
      monthlySavings = incomeTotal - expenseTotal;
    }
    final goalReports = goals.map((g) => GoalEngine.checkStatus(g, monthlySavings)).toList();
    final goalsSummary = GoalStatusSummary(
      goals: goalReports,
      totalGoals: goalReports.length,
      onTrackGoals: goalReports.where((r) => r.onTrack).length,
      offTrackGoals: goalReports.where((r) => !r.onTrack).length,
    );

    final splitReport = SplitEngine.calculate(expenses, myUserId);
    
    // Calculate derived split metrics
    double totalOwedToYou = 0;
    double totalYouOwe = 0;
    splitReport.netBalances.forEach((friendId, balance) {
      if (balance > 0) {
        totalOwedToYou += balance;
      } else {
        totalYouOwe += balance.abs();
      }
    });

    final splits = SplitStatusSummary(
      netBalances: splitReport.netBalances,
      totalOwedToYou: totalOwedToYou,
      totalYouOwe: totalYouOwe,
      friendCount: splitReport.netBalances.length,
    );

    return FiinnyUserSnapshot(
      incomeSummary: incomeSummary,
      expenseSummary: expenseSummary,
      transactionInsights: transactionInsights,
      patterns: patterns,
      behavior: behavior,
      goals: goalsSummary,
      splits: splits,
      generatedAt: DateTime.now(),
      progress: PhaseOneProgress.current(),
    );
  }
}


