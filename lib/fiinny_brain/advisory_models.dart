/// A single actionable recommendation
class Recommendation {
  final String id;
  final String category;                // REDUCE_EXPENSE, INCREASE_SAVINGS, SETTLE_SPLITS, etc.
  final String action;                  // "Reduce food spending by 20%"
  final double impact;                  // Estimated monthly savings (₹)
  final String reasoning;               // Why this matters

  const Recommendation({
    required this.id,
    required this.category,
    required this.action,
    required this.impact,
    required this.reasoning,
  });

  Map<String, dynamic> toJson() => {
    'id': id,
    'category': category,
    'action': action,
    'impact': impact,
    'reasoning': reasoning,
  };
}

/// Report containing actionable recommendations
class AdvisoryReport {
  final List<Recommendation> recommendations;
  final String priorityAction;          // Most important action
  final List<String> quickWins;         // Easy improvements
  final double potentialMonthlySavings; // If recommendations followed

  const AdvisoryReport({
    required this.recommendations,
    required this.priorityAction,
    required this.quickWins,
    required this.potentialMonthlySavings,
  });

  Map<String, dynamic> toJson() => {
    'recommendations': recommendations.map((r) => r.toJson()).toList(),
    'priorityAction': priorityAction,
    'quickWins': quickWins,
    'potentialMonthlySavings': potentialMonthlySavings,
  };

  /// Empty report when no recommendations
  static AdvisoryReport empty() => const AdvisoryReport(
    recommendations: [],
    priorityAction: 'Keep up the good work!',
    quickWins: [],
    potentialMonthlySavings: 0.0,
  );
}
