import 'fiinny_user_snapshot.dart';
import 'comparison_models.dart';

class HistoricalComparisonEngine {
  /// Compare current snapshot against previous month's snapshot
  /// Returns empty report if previousSnapshot is null
  static ComparisonReport compare(
    FiinnyUserSnapshot current,
    FiinnyUserSnapshot? previous,
  ) {
    if (previous == null) {
      return ComparisonReport.empty();
    }

    // 1. Savings Rate Trend
    final currentSavings = current.behavior.savingsRate;
    final previousSavings = previous.behavior.savingsRate;
    final savingsRateTrend = _calculatePercentChange(previousSavings, currentSavings);

    // 2. Expense Growth
    final currentExpense = current.expenseSummary.total;
    final previousExpense = previous.expenseSummary.total;
    final expenseGrowth = _calculatePercentChange(previousExpense, currentExpense);

    // 3. Category Trends
    final categoryTrends = <String, double>{};
    final improvingCategories = <String>[];
    final worseningCategories = <String>[];

    final currentCategories = current.patterns.categorySpendPercentage;
    final previousCategories = previous.patterns.categorySpendPercentage;

    // Analyze each category
    final allCategories = {...currentCategories.keys, ...previousCategories.keys};
    
    for (final category in allCategories) {
      final currentPct = currentCategories[category] ?? 0.0;
      final previousPct = previousCategories[category] ?? 0.0;
      
      if (previousPct > 0) {
        final change = _calculatePercentChange(previousPct, currentPct);
        categoryTrends[category] = change;
        
        // Improving = spending less (negative change)
        // Worsening = spending more (positive change > 10%)
        if (change < -5.0) {
          improvingCategories.add(category);
        } else if (change > 10.0) {
          worseningCategories.add(category);
        }
      }
    }

    // 4. Overall Progress
    // Progressing if: savings improved or stable AND expense growth is controlled
    final isProgressingOverall = savingsRateTrend >= 0 && expenseGrowth < 5.0;

    return ComparisonReport(
      savingsRateTrend: savingsRateTrend,
      expenseGrowth: expenseGrowth,
      improvingCategories: improvingCategories,
      worseningCategories: worseningCategories,
      isProgressingOverall: isProgressingOverall,
      categoryTrends: categoryTrends,
    );
  }

  /// Calculate percentage change from old to new value
  /// Returns 0 if old value is 0 (to avoid division by zero)
  static double _calculatePercentChange(double oldValue, double newValue) {
    if (oldValue == 0) return 0.0;
    return ((newValue - oldValue) / oldValue.abs()) * 100.0;
  }
}
