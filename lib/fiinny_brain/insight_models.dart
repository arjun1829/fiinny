/// Available categories for insights
enum InsightCategory {
  RISK,
  OPPORTUNITY,
  INFO,
}

/// Severity levels for insights
enum InsightSeverity {
  LOW,
  MEDIUM,
  HIGH,
}

/// Represents a single generated insight derived from the user snapshot.
class FiinnyInsight {
  final String id;
  final InsightCategory category;
  final InsightSeverity severity;

  /// IDs of fields/data points used to generate this insight
  final List<String> factsUsed;

  /// Snapshot values at the time of generation
  final Map<String, dynamic> values;

  /// Whether user can take direct action
  final bool actionable;

  const FiinnyInsight({
    required this.id,
    required this.category,
    required this.severity,
    required this.factsUsed,
    required this.values,
    required this.actionable,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'category': category.toString().split('.').last,
        'severity': severity.toString().split('.').last,
        'factsUsed': factsUsed,
        'values': values,
        'actionable': actionable,
      };
}
