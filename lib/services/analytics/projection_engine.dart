class ProjectionEngine {
  /// Simple linear projection of balance for the next [days] days.
  ///
  /// [currentBalance]: Today's bank balance
  /// [recurringBills]: Known upcoming fixed costs (Rent, Netflix, EMI)
  /// [avgDailySpend]: Discretionary spend rate (Food, Travel) calculated from 30-day moving average.
  List<ProjectionPoint> projectBalance({
    required double currentBalance,
    required List<RecurringBill> recurringBills,
    required double avgDailySpend,
    int days = 30,
  }) {
    double runningBalance = currentBalance;
    final points = <ProjectionPoint>[
      ProjectionPoint(date: DateTime.now(), balance: runningBalance),
    ];

    final now = DateTime.now();

    for (int i = 1; i <= days; i++) {
      final date = now.add(Duration(days: i));

      // 1. Subtract discretionary spend
      runningBalance -= avgDailySpend;

      // 2. Subtract fixed bills due on this specific day
      final billsDue = recurringBills.where((b) => _isDueOn(b, date));
      for (final bill in billsDue) {
        runningBalance -= bill.amount;
      }

      points.add(ProjectionPoint(
        date: date,
        balance: runningBalance,
        billsDue: billsDue.map((e) => e.label).toList(),
      ));
    }

    return points;
  }

  /// Calculates "Safe to Spend" amount.
  /// Min balance in the next 30 days. If negative, you are "Broke" even if you have cash now.
  double safeToSpend(List<ProjectionPoint> points) {
    if (points.isEmpty) {
      return 0.0;
    }
    double minBal = points.first.balance;
    for (var p in points) {
      if (p.balance < minBal) {
        minBal = p.balance;
      }
    }
    // If minBal is negative, you have NO safe money. You need to save -minBal.
    // If minBal is positive, that's your true "free cash".
    return minBal;
  }

  bool _isDueOn(RecurringBill bill, DateTime date) {
    // Simple logic: if bill.day == date.day
    // Enhance later for frequency (monthly, weekly)
    return bill.dayOfMonth == date.day;
  }
}

class RecurringBill {
  final String label;
  final double amount;
  final int dayOfMonth; // e.g. 5 for 5th of every month

  RecurringBill(this.label, this.amount, this.dayOfMonth);
}

class ProjectionPoint {
  final DateTime date;
  final double balance;
  final List<String> billsDue;

  ProjectionPoint({
    required this.date,
    required this.balance,
    this.billsDue = const [],
  });
}
