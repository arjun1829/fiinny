// Summary models for FiinnyUserSnapshot
// These are read-only, derived data structures with no logic

class IncomeSummary {
  final double total;
  final double salaryIncome;
  final double otherIncome;
  final int transactionCount;

  const IncomeSummary({
    required this.total,
    required this.salaryIncome,
    required this.otherIncome,
    required this.transactionCount,
  });

  Map<String, dynamic> toJson() => {
    'total': total,
    'salaryIncome': salaryIncome,
    'otherIncome': otherIncome,
    'transactionCount': transactionCount,
  };
}

class ExpenseSummary {
  final double total;
  final double transferAmount;
  final int transactionCount;
  final int transferCount;

  const ExpenseSummary({
    required this.total,
    required this.transferAmount,
    required this.transactionCount,
    required this.transferCount,
  });

  Map<String, dynamic> toJson() => {
    'total': total,
    'transferAmount': transferAmount,
    'transactionCount': transactionCount,
    'transferCount': transferCount,
  };
}

class TransactionInsights {
  final Map<String, int> categoryBreakdown;
  final int totalTransactions;
  final int incomeTransactions;
  final int expenseTransactions;
  final int transferTransactions;

  const TransactionInsights({
    required this.categoryBreakdown,
    required this.totalTransactions,
    required this.incomeTransactions,
    required this.expenseTransactions,
    required this.transferTransactions,
  });

  Map<String, dynamic> toJson() => {
    'categoryBreakdown': categoryBreakdown,
    'totalTransactions': totalTransactions,
    'incomeTransactions': incomeTransactions,
    'expenseTransactions': expenseTransactions,
    'transferTransactions': transferTransactions,
  };
}

// PatternSummary wraps PatternReport for consistency
class PatternSummary {
  final List<String> subscriptions;
  final List<String> highSpendCategories;
  final Map<String, double> categorySpendPercentage;

  const PatternSummary({
    required this.subscriptions,
    required this.highSpendCategories,
    required this.categorySpendPercentage,
  });

  Map<String, dynamic> toJson() => {
    'subscriptions': subscriptions,
    'highSpendCategories': highSpendCategories,
    'categorySpendPercentage': categorySpendPercentage,
  };
}

// BehaviorMetrics wraps BehaviorReport for consistency
class BehaviorMetrics {
  final double savingsRate;
  final double expenseToIncomeRatio;
  final List<String> riskFlags;

  const BehaviorMetrics({
    required this.savingsRate,
    required this.expenseToIncomeRatio,
    required this.riskFlags,
  });

  Map<String, dynamic> toJson() => {
    'savingsRate': savingsRate,
    'expenseToIncomeRatio': expenseToIncomeRatio,
    'riskFlags': riskFlags,
  };
}

// GoalStatusSummary wraps List<GoalStatusReport> for consistency
class GoalStatusSummary {
  final List<GoalStatusReport> goals;
  final int totalGoals;
  final int onTrackGoals;
  final int offTrackGoals;

  const GoalStatusSummary({
    required this.goals,
    required this.totalGoals,
    required this.onTrackGoals,
    required this.offTrackGoals,
  });

  Map<String, dynamic> toJson() => {
    'goals': goals.map((g) => g.toJson()).toList(),
    'totalGoals': totalGoals,
    'onTrackGoals': onTrackGoals,
    'offTrackGoals': offTrackGoals,
  };
}

// SplitStatusSummary wraps SplitReport for consistency
class SplitStatusSummary {
  final Map<String, double> netBalances;
  final double totalOwedToYou;
  final double totalYouOwe;
  final int friendCount;

  const SplitStatusSummary({
    required this.netBalances,
    required this.totalOwedToYou,
    required this.totalYouOwe,
    required this.friendCount,
  });

  Map<String, dynamic> toJson() => {
    'netBalances': netBalances,
    'totalOwedToYou': totalOwedToYou,
    'totalYouOwe': totalYouOwe,
    'friendCount': friendCount,
  };

  static SplitStatusSummary empty() => const SplitStatusSummary(
    netBalances: {},
    totalOwedToYou: 0,
    totalYouOwe: 0,
    friendCount: 0,
  );
}

// Import this in goal_engine.dart for the GoalStatusReport reference
class GoalStatusReport {
  final String goalId;
  final String goalName;
  final bool onTrack;
  final double etaMonths;
  final double amountRemaining;

  const GoalStatusReport({
    required this.goalId,
    required this.goalName,
    required this.onTrack,
    required this.etaMonths,
    required this.amountRemaining,
  });

  Map<String, dynamic> toJson() => {
    'goalId': goalId,
    'goalName': goalName,
    'onTrack': onTrack,
    'etaMonths': etaMonths,
    'amountRemaining': amountRemaining,
  };
}
