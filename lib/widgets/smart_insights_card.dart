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
  final String? insightText;

  const SmartInsightCard({
    Key? key,
    required this.income,
    required this.expense,
    required this.savings,
    this.goal,
    this.totalLoan,
    this.totalAssets,
    this.showToday = false,
    this.insightText,
  }) : super(key: key);

  String _resolveInsight() {
    String? sanitize(String? value) {
      final trimmed = value?.trim() ?? '';
      return trimmed.isEmpty ? null : trimmed;
    }

    try {
      // 1) Prefer preset copy if provided
      final preset = sanitize(insightText);
      if (preset != null) return preset;

      // 2) Net worth line if we have assets/loans
      final loans = (totalLoan ?? 0);
      final assets = (totalAssets ?? 0);
      if (loans > 0 || assets > 0) {
        final copy =
            sanitize(InsightMicrocopy.netWorth(assets: assets, loans: loans));
        if (copy != null) return copy;
      }

      // 3) Spend vs income
      final svi =
          sanitize(InsightMicrocopy.spendVsIncome(income: income, expense: expense));
      if (svi != null) return svi;

      // 4) Savings rate
      final sr = sanitize(InsightMicrocopy.savingsRate(income: income, savings: savings));
      if (sr != null) return sr;

      // 5) Goal pace (NULL-SAFE savedAmount!)
      if (goal != null && goal!.targetAmount > 0 && savings > 0) {
        final saved = (goal?.savedAmount ?? 0).toDouble();
        final remaining =
            (goal!.targetAmount - saved).clamp(0, double.infinity).toDouble();

        final goalCopy = sanitize(InsightMicrocopy.goalPace(
          title: goal!.title,
          remaining: remaining,
          monthlySavings: savings.toDouble(),
        ));
        if (goalCopy != null) return goalCopy;
      }

      // 6) Fallback
      return sanitize(InsightMicrocopy.fallback()) ??
          'No insights yet — add a transaction or link Gmail to unlock insights.';
    } catch (e, st) {
      debugPrint('SmartInsightCard insight error: $e\n$st');
      return 'No insights yet — add a transaction or link Gmail to unlock insights.';
    }
  }

  @override
  Widget build(BuildContext context) {
    final copy = _resolveInsight();

    return GlassCard(
      radius: Fx.r24,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(Icons.auto_graph_rounded, color: Fx.mintDark, size: 34),
            const SizedBox(width: Fx.s16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    copy,
                    style: Fx.label.copyWith(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: Fx.textStrong,
                    ),
                  ),
                  if (showToday) ...[
                    const SizedBox(height: Fx.s8),
                    Row(
                      children: [
                        PillBadge("Today", color: Fx.mintDark, icon: Icons.today_rounded),
                        const SizedBox(width: Fx.s8),
                        Text(
                          _prettyDate(DateTime.now()),
                          style: Fx.label.copyWith(fontSize: 12),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _prettyDate(DateTime date) => "${date.day}/${date.month}/${date.year}";
}
