import '../models/expense_item.dart';

class TrendEngine {
  // ==================== GROWTH ANALYSIS ====================

  /// Calculates month-over-month growth rate for a specific category or overall
  static double calculateGrowthRate(
    List<ExpenseItem> currentMonthExpenses,
    List<ExpenseItem> lastMonthExpenses,
  ) {
    final currentTotal = _sum(currentMonthExpenses);
    final lastTotal = _sum(lastMonthExpenses);

    if (lastTotal == 0) return currentTotal > 0 ? 100.0 : 0.0;
    return ((currentTotal - lastTotal) / lastTotal) * 100;
  }

  static String analyzeTrendDirection(double growthRate) {
    if (growthRate > 10) return "increasing rapidly 📈";
    if (growthRate > 0) return "increasing slightly ↗️";
    if (growthRate < -10) return "decreasing significantly 📉";
    if (growthRate < 0) return "decreasing slightly ↘️";
    return "stable ➡️";
  }

  // ==================== ANOMALY DETECTION ====================

  /// Detects if current spending is significantly higher than average
  static Map<String, dynamic> detectAnomaly(
    List<ExpenseItem> currentExpenses,
    List<ExpenseItem> historicalExpenses, {
    String? category, 
  }) {
    // Filter by category if provided
    var current = currentExpenses;
    var history = historicalExpenses;

    if (category != null) {
      current = current.where((e) => e.category?.toLowerCase() == category.toLowerCase()).toList();
      history = history.where((e) => e.category?.toLowerCase() == category.toLowerCase()).toList();
    }

    final currentTotal = _sum(current);
    
    // Calculate historical monthly average (excluding current month)
    if (history.isEmpty) return {'isAnomaly': false, 'message': 'No history'};

    final months = history.map((e) => "${e.date.year}-${e.date.month}").toSet().length;
    final historyTotal = _sum(history);
    final average = months > 0 ? historyTotal / months : 0.0;

    if (average == 0) return {'isAnomaly': true, 'message': 'First time spending'};

    final deviation = ((currentTotal - average) / average) * 100;
    final isSpike = deviation > 50; // >50% increase is a spike

    return {
      'isAnomaly': isSpike,
      'deviation': deviation,
      'average': average,
      'current': currentTotal,
      'message': isSpike 
          ? "Unusual spike! ${deviation.toStringAsFixed(0)}% higher than average (₹${average.toStringAsFixed(0)})"
          : "Normal spending range",
    };
  }

  static double _sum(List<ExpenseItem> list) => list.fold(0, (sum, e) => sum + e.amount);
}
