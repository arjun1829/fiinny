import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/goal_model.dart';
import '../themes/tokens.dart';
import '../themes/glass_card.dart';
import '../themes/badge.dart';

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

  static final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

  String getInsight() {
    final loans = (totalLoan ?? 0);
    final assets = (totalAssets ?? 0);

    // Net worth based
    if (loans > 0 || assets > 0) {
      final net = assets - loans;
      if (loans > 0 && assets == 0) {
        return "You have ${_inr.format(loans)} in loans. Reduce debt and start building assets.";
      }
      if (assets > 0 && loans == 0) {
        return "Your assets total ${_inr.format(assets)}. Great—keep compounding!";
      }
      if (net < 0) {
        return "Net worth is negative (${_inr.format(net)}). Prioritise paying EMIs and growing assets.";
      }
      if (net == 0) {
        return "Assets and loans balance out. Aim for a positive net worth.";
      }
      if (net < 50000) {
        return "Net worth: ${_inr.format(net)}. Keep going 💪";
      }
      return "Awesome! Net worth is ${_inr.format(net)} 🚀";
    }

    // General
    if (income == 0 && expense == 0) {
      return "Add your first transaction to unlock insights 🌱";
    }
    if (expense > income && income > 0) {
      return "You spent more than you earned this month. Tighten the reins.";
    }
    if (income > 0 && (savings / income) > 0.30) {
      return "Great! You saved over 30% of income this month.";
    }
    if (goal != null && goal!.targetAmount > 0 && savings > 0) {
      final remaining = (goal!.targetAmount - goal!.savedAmount).clamp(0, double.infinity);
      final months = (remaining / (savings == 0 ? 1 : savings)).clamp(1, 36);
      return "At this pace, you’ll reach '${goal!.title}' in ~${months.toStringAsFixed(0)} months.";
    }
    return "You’re tracking well. Keep logging and reviewing regularly.";
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
