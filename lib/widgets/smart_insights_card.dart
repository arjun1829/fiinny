import 'package:flutter/material.dart';
import '../models/goal_model.dart';
import '../themes/tokens.dart';
import '../themes/glass_card.dart';
import '../themes/badge.dart';
import '../brain/insight_microcopy.dart';

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
    final loans = (totalLoan ?? 0);
    final assets = (totalAssets ?? 0);

    if (loans > 0 || assets > 0) {
      return InsightMicrocopy.netWorth(assets: assets, loans: loans);
    }

    final svi = InsightMicrocopy.spendVsIncome(income: income, expense: expense);
    if (svi.isNotEmpty) return svi;

    final sr = InsightMicrocopy.savingsRate(income: income, savings: savings);
    if (sr.isNotEmpty) return sr;

    if (goal != null && goal!.targetAmount > 0 && savings > 0) {
      final remaining = (goal!.targetAmount - goal!.savedAmount).clamp(0, double.infinity);
      return InsightMicrocopy.goalPace(title: goal!.title, remaining: remaining, monthlySavings: savings);
    }

    return InsightMicrocopy.fallback();
  }

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      radius: Fx.r24,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.auto_graph_rounded, color: Fx.mintDark, size: 34),
          const SizedBox(width: Fx.s16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(getInsight(), style: Fx.label.copyWith(fontSize: 16, fontWeight: FontWeight.w700, color: Fx.textStrong)),
                if (showToday) ...[
                  const SizedBox(height: Fx.s8),
                  Row(
                    children: [
                      PillBadge("Today", color: Fx.mintDark, icon: Icons.today_rounded),
                      const SizedBox(width: Fx.s8),
                      Text(_prettyDate(DateTime.now()), style: Fx.label.copyWith(fontSize: 12)),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _prettyDate(DateTime date) => "${date.day}/${date.month}/${date.year}";
}
