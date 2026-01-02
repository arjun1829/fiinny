/// Report comparing current snapshot against historical data
class ComparisonReport {
  final double savingsRateTrend;        // % change vs last month (positive = improving)
  final double expenseGrowth;           // % change vs last month (positive = increasing)
  final List<String> improvingCategories;
  final List<String> worseningCategories;
  final bool isProgressingOverall;
  final Map<String, double> categoryTrends; // category -> % change

  const ComparisonReport({
    required this.savingsRateTrend,
    required this.expenseGrowth,
    required this.improvingCategories,
    required this.worseningCategories,
    required this.isProgressingOverall,
    required this.categoryTrends,
  });

  Map<String, dynamic> toJson() => {
    'savingsRateTrend': savingsRateTrend,
    'expenseGrowth': expenseGrowth,
    'improvingCategories': improvingCategories,
    'worseningCategories': worseningCategories,
    'isProgressingOverall': isProgressingOverall,
    'categoryTrends': categoryTrends,
  };

  /// Empty report when no historical data exists
  static ComparisonReport empty() => const ComparisonReport(
    savingsRateTrend: 0.0,
    expenseGrowth: 0.0,
    improvingCategories: [],
    worseningCategories: [],
    isProgressingOverall: false,
    categoryTrends: {},
  );
}
