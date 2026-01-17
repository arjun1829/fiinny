class BehaviorReport {
  final double savingsRate;
  final double expenseToIncomeRatio;
  final List<String> riskFlags;

  const BehaviorReport({
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

class BehaviorEngine {
  // Risk flag constants (enum-like)
  static const String lowSavings = 'LOW_SAVINGS';
  static const String highSpending = 'HIGH_SPENDING';
  static const String incomeUnstable = 'INCOME_UNSTABLE';
  static const String noEmergencyBuffer = 'NO_EMERGENCY_BUFFER';

  static BehaviorReport analyze(double income, double expense) {
    // Guard against negative values
    income = income.clamp(0.0, double.infinity);
    expense = expense.clamp(0.0, double.infinity);

    double savingsRate = 0.0;
    double expenseRatio = 0.0;
    final risks = <String>[];

    if (income > 0) {
      // Calculate metrics
      savingsRate = ((income - expense) / income) * 100;
      expenseRatio = (expense / income) * 100;

      // Clamp to reasonable ranges
      savingsRate = savingsRate.clamp(-100.0, 100.0);
      expenseRatio = expenseRatio.clamp(0.0, 200.0);

      // Risk Flags (additive, not mutually exclusive)
      if (savingsRate < 5) {
        risks.add(lowSavings);
      }
      if (expenseRatio > 90) {
        risks.add(highSpending);
      }
      // Note: INCOME_UNSTABLE detection requires historical data analysis (future scope)
      // Note: NO_EMERGENCY_BUFFER detection requires linked savings account balance (future scope)
    } else {
      // No income scenario
      if (expense > 0) {
        risks.add(lowSavings);
        risks.add(highSpending);
      }
      // Negative savings rate when no income
      savingsRate = -100.0;
      expenseRatio = 0.0;
    }

    return BehaviorReport(
      savingsRate: savingsRate,
      expenseToIncomeRatio: expenseRatio,
      riskFlags: risks,
    );
  }
}
