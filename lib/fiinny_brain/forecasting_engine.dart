import 'fiinny_user_snapshot.dart';
import 'forecast_models.dart';

class ForecastingEngine {
  static const int _kMaxReasonableMonths = 60; // 5 years

  /// Project timeline to reach a target amount based on current savings behavior
  static ForecastReport projectTimeline(
    FiinnyUserSnapshot snapshot,
    double targetAmount,
  ) {
    final income = snapshot.incomeSummary.total;
    final savingsRate = snapshot.behavior.savingsRate;

    // Calculate monthly savings
    final monthlySavings = (income * savingsRate) / 100.0;

    // Base case: likely scenario (current behavior)
    final monthsToTarget = _calculateMonths(monthlySavings, targetAmount);
    final isAchievable =
        monthsToTarget > 0 && monthsToTarget <= _kMaxReasonableMonths;

    // Scenarios
    final bestCaseSavings = monthlySavings * 1.10; // 10% improvement
    final worstCaseSavings = monthlySavings * 0.90; // 10% decline

    final scenarios = {
      'best': _calculateMonths(bestCaseSavings, targetAmount).toDouble(),
      'worst': _calculateMonths(worstCaseSavings, targetAmount).toDouble(),
      'likely': monthsToTarget.toDouble(),
    };

    // Projected savings after N months (use likely scenario)
    final projectedSavings = monthlySavings * monthsToTarget;

    // Assumptions
    final assumptions = [
      'Income remains constant at ₹${income.toStringAsFixed(0)}',
      'Savings rate remains at ${savingsRate.toStringAsFixed(1)}%',
      'No unexpected expenses or emergencies',
    ];

    return ForecastReport(
      monthsToTarget: monthsToTarget,
      projectedSavings: projectedSavings,
      isAchievable: isAchievable,
      assumptions: assumptions,
      scenarios: scenarios,
    );
  }

  /// Calculate months needed to reach target
  /// Returns -1 if impossible (zero or negative savings)
  static int _calculateMonths(double monthlySavings, double targetAmount) {
    if (monthlySavings <= 0 || targetAmount <= 0) {
      return -1;
    }
    return (targetAmount / monthlySavings).ceil();
  }

  /// Project emergency fund timeline (3-6 months of expenses)
  static ForecastReport projectEmergencyFund(
    FiinnyUserSnapshot snapshot, {
    int months = 6,
  }) {
    final monthlyExpense = snapshot.expenseSummary.total;
    final targetAmount = monthlyExpense * months;

    return projectTimeline(snapshot, targetAmount);
  }

  /// Project "survival time" if income stops (based on current savings)
  /// This would require knowing current savings balance, which we don't have in snapshot
  /// Placeholder for future implementation
  static int projectSurvivalMonths(
      double currentSavings, double monthlyExpense) {
    if (monthlyExpense <= 0) {
      return -1;
    }
    return (currentSavings / monthlyExpense).floor();
  }
}
