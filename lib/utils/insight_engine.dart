import '../models/transaction_item.dart';
import '../models/goal_model.dart';

class SmartInsight {
  final String message;
  final String emoji;

  SmartInsight({required this.message, required this.emoji});
}

class InsightEngine {
  static SmartInsight generate({
    required List<TransactionItem> transactions,
    required List<GoalModel> goals,
  }) {
    if (transactions.isEmpty) {
      return SmartInsight(
        message: "No data yet. Start tracking your finances! 🚀",
        emoji: "🕸️",
      );
    }

    final now = DateTime.now();
    final monthTx = transactions.where((t) =>
    t.date.month == now.month && t.date.year == now.year).toList();

    final income = monthTx
        .where((t) => t.type == TransactionType.credit)
        .fold(0.0, (a, b) => a + b.amount);
    final expense = monthTx
        .where((t) => t.type == TransactionType.debit)
        .fold(0.0, (a, b) => a + b.amount);

    if (income == 0 && expense == 0) {
      return SmartInsight(
        message: "Add your first transaction to see insights!",
        emoji: "👀",
      );
    }

    final percent = income == 0 ? 0 : (expense / income * 100).round();
    if (income > 0 && percent < 60) {
      return SmartInsight(
        message: "Great job! You saved ₹${(income - expense).toStringAsFixed(0)} this month.",
        emoji: "🎉",
      );
    } else if (income > 0 && percent >= 90) {
      return SmartInsight(
        message: "Caution! Expenses are ${percent}% of your income.",
        emoji: "⚠️",
      );
    }

    // Highest expense category
    final byCategory = <String, double>{};
    for (final t in monthTx.where((t) => t.type == TransactionType.debit)) {
      byCategory[t.category] = (byCategory[t.category] ?? 0) + t.amount;
    }
    String? topCat;
    double maxAmt = 0;
    byCategory.forEach((cat, amt) {
      if (amt > maxAmt) {
        maxAmt = amt;
        topCat = cat;
      }
    });

    if (topCat != null && maxAmt > 0) {
      return SmartInsight(
        message: "Most spent on $topCat (₹${maxAmt.toStringAsFixed(0)}) this month.",
        emoji: "💡",
      );
    }

    // Goal insight
    for (final g in goals) {
      if (g.savedAmount >= g.targetAmount) {
        return SmartInsight(
          message: "You achieved your goal: ${g.title}!",
          emoji: "🏆",
        );
      }
    }

    // Fallback
    return SmartInsight(
      message: "Keep tracking for more insights!",
      emoji: "📊",
    );
  }
}
