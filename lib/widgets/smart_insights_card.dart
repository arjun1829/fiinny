import 'package:flutter/material.dart';
import '../models/goal_model.dart';

class SmartInsightCard extends StatelessWidget {
  final double income;
  final double expense;
  final double savings;
  final GoalModel? goal;
  final double? totalLoan;      // Pass as 0 if not using loans
  final double? totalAssets;    // Pass as 0 if not using assets
  final bool showToday;

  const SmartInsightCard({
    Key? key,
    required this.income,
    required this.expense,
    required this.savings,
    this.goal,
    this.totalLoan,
    this.totalAssets,
    this.showToday = false,
  }) : super(key: key);

  String getInsight() {
    // Debug print for rebuilds
    print('[SmartInsightCard] build: income=$income, expense=$expense, savings=$savings, '
        'loan=${totalLoan ?? 0}, assets=${totalAssets ?? 0}');

    // Net Worth Insights (Assets and Loans)
    if ((totalLoan ?? 0) > 0 || (totalAssets ?? 0) > 0) {
      double netWorth = (totalAssets ?? 0) - (totalLoan ?? 0);
      if ((totalLoan ?? 0) > 0 && (totalAssets ?? 0) == 0) {
        return "You have ₹${(totalLoan ?? 0).toStringAsFixed(0)} in loans. Try to reduce debt and build assets!";
      }
      if ((totalAssets ?? 0) > 0 && (totalLoan ?? 0) == 0) {
        return "Your assets total ₹${(totalAssets ?? 0).toStringAsFixed(0)}. Great, keep building your wealth!";
      }
      if (netWorth < 0) {
        return "Your net worth is negative (₹${netWorth.toStringAsFixed(0)}). Try to pay off your loans and grow your assets. 🔄";
      } else if (netWorth == 0) {
        return "Your assets and loans balance each other. Work towards a positive net worth!";
      } else if (netWorth < 50000) {
        return "Your net worth is ₹${netWorth.toStringAsFixed(0)}. Keep going! 💪";
      } else {
        return "Awesome! Your net worth is ₹${netWorth.toStringAsFixed(0)}. You're building real wealth! 🚀";
      }
    }

    // General Finance/Spending Insights
    if (income == 0 && expense == 0) {
      return "Add your first transaction to get insights! 🌱";
    }
    if (expense > income && income > 0) {
      return "Uh oh, you spent more than you earned this month. Watch out! 😬";
    }
    if (income > 0 && (savings / income) > 0.3) {
      return "Great job! You’ve saved over 30% of your income. Keep it up! 🚀";
    }
    if (goal != null && goal!.targetAmount > 0 && savings > 0) {
      double months = ((goal!.targetAmount - goal!.savedAmount) / (savings == 0 ? 1 : savings)).clamp(1, 36);
      return "At this pace, you'll reach your goal '${goal!.title}' in about ${months.toStringAsFixed(0)} months! 🏆";
    }
    return "You’re tracking your finances like a pro! 💪";
  }

  @override
  Widget build(BuildContext context) {
    print("[SmartInsightCard] Widget rebuild triggered");

    return Card(
      elevation: 4,
      color: Theme.of(context).cardColor.withOpacity(0.98),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      child: Padding(
        padding: const EdgeInsets.all(18.0),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.auto_graph_rounded, color: Colors.teal[700], size: 34),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    getInsight(),
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                  ),
                  if (showToday)
                    Padding(
                      padding: const EdgeInsets.only(top: 8.0),
                      child: Text(
                        "Today: ${_prettyDate(DateTime.now())}",
                        style: TextStyle(
                          fontSize: 13,
                          color: Colors.teal[600],
                          fontWeight: FontWeight.w400,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _prettyDate(DateTime date) {
    return "${date.day}/${date.month}/${date.year}";
  }
}
