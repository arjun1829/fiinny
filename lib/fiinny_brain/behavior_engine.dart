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
  static const String LOW_SAVINGS = 'LOW_SAVINGS';
  static const String HIGH_SPENDING = 'HIGH_SPENDING';
  static const String INCOME_UNSTABLE = 'INCOME_UNSTABLE';
  static const String NO_EMERGENCY_BUFFER = 'NO_EMERGENCY_BUFFER';

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
        risks.add(LOW_SAVINGS);
      }
      if (expenseRatio > 90) {
        risks.add(HIGH_SPENDING);
      }
      // TODO: INCOME_UNSTABLE requires historical data analysis
      // TODO: NO_EMERGENCY_BUFFER requires savings account balance
    } else {
      // No income scenario
      if (expense > 0) {
        risks.add(LOW_SAVINGS);
        risks.add(HIGH_SPENDING);
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
