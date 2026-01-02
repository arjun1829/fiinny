/// Report containing timeline projections and scenario analysis
class ForecastReport {
  final int monthsToTarget;             // Months to reach target amount
  final double projectedSavings;        // Savings after N months
  final bool isAchievable;              // Can reach target in reasonable time (<= 60 months)
  final List<String> assumptions;       // What we assumed (constant income, etc.)
  final Map<String, double> scenarios;  // best/worst/likely case timelines

  const ForecastReport({
    required this.monthsToTarget,
    required this.projectedSavings,
    required this.isAchievable,
    required this.assumptions,
    required this.scenarios,
  });

  Map<String, dynamic> toJson() => {
    'monthsToTarget': monthsToTarget,
    'projectedSavings': projectedSavings,
    'isAchievable': isAchievable,
    'assumptions': assumptions,
    'scenarios': scenarios,
  };
}
