import '../models/transaction_model.dart';
import '../services/categorization/category_rules.dart';
import 'transaction_engine.dart';

class PatternReport {
  final List<String> subscriptions;
  final List<String> highSpendCategories;
  final Map<String, double> categorySpendPercentage;

  const PatternReport({
    required this.subscriptions,
    required this.highSpendCategories,
    required this.categorySpendPercentage,
  });
  
  Map<String, dynamic> toJson() => {
    'subscriptions': subscriptions,
    'highSpendCategories': highSpendCategories,
    'categorySpendPercentage': categorySpendPercentage,
  };
}

class PatternEngine {
  static PatternReport analyze(List<TransactionModel> transactions, double totalIncome) {
    // 1. Group by Normalized Merchant/Description with amount tolerance
    final Map<String, List<TransactionModel>> groups = {};
    final Map<String, double> categoryTotals = {};
    double totalExpense = 0;

    for (var t in transactions) {
      final analysis = TransactionEngine.analyze(t);
      
      // Skip income and transfers
      if (analysis.isIncome || analysis.isTransfer) continue;

      // Grouping for recurrence (simple key-based)
      final key = t.note?.trim().toUpperCase() ?? 'UNKNOWN';
      groups.putIfAbsent(key, () => []).add(t);

      // Category totals (exclude transfers)
      final cat = analysis.category;
      categoryTotals[cat] = (categoryTotals[cat] ?? 0) + t.amount;
      totalExpense += t.amount;
    }

    // 2. Identify Recurrence / Subscriptions
    final Set<String> subscriptions = {};
    
    groups.forEach((key, list) {
       // Rule: Min 3 occurrences + similar amount (±10%) + within 3 months
       if (list.length >= 3 && _isRecurring(list)) {
         subscriptions.add(key);
       } else {
         // Explicit Subscription Detection (brand-based)
         final subBrand = CategoryRules.detectSubscriptionBrand(key);
         if (subBrand != null) {
           subscriptions.add(subBrand);
         }
       }
    });

    // 3. Category % Analysis
    final Map<String, double> catPct = {};
    final List<String> highSpend = [];
    
    categoryTotals.forEach((cat, amount) {
      if (totalIncome > 0) {
        double pct = (amount / totalIncome) * 100;
        catPct[cat] = pct;
        // Changed from 20% to 30% per hardening requirements
        if (pct > 30) {
          highSpend.add(cat);
        }
      } else {
        catPct[cat] = 0.0; 
      }
    });

    return PatternReport(
      subscriptions: subscriptions.toList(),
      highSpendCategories: highSpend,
      categorySpendPercentage: catPct,
    );
  }

  // Check if transactions are recurring (similar amount + within 3 months)
  static bool _isRecurring(List<TransactionModel> transactions) {
    if (transactions.length < 3) return false;

    // Sort by date
    final sorted = List<TransactionModel>.from(transactions)
      ..sort((a, b) => a.date.compareTo(b.date));

    // Check 3-month window
    final first = sorted.first.date;
    final last = sorted.last.date;
    final daysDiff = last.difference(first).inDays;
    if (daysDiff > 90) return false; // Must be within 3 months

    // Check amount similarity (±10%)
    final amounts = sorted.map((t) => t.amount).toList();
    final avgAmount = amounts.reduce((a, b) => a + b) / amounts.length;
    final tolerance = avgAmount * 0.1;

    for (var amount in amounts) {
      if ((amount - avgAmount).abs() > tolerance) {
        return false; // Amount variance too high
      }
    }

    return true;
  }
}
