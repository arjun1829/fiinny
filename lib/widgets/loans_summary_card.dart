import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../themes/tokens.dart';
import '../themes/glass_card.dart';
import '../themes/badge.dart';

class LoansSummaryCard extends StatelessWidget {
  final String userId;
  final int loanCount;
  final double totalLoan;
  final VoidCallback onAddLoan;

  // NEW (already existed in your file):
  final int pendingSuggestions;               // default 0
  final VoidCallback? onReviewSuggestions;    // open review sheet
  final VoidCallback? onTap;                  // whole-card tap handler

  const LoansSummaryCard({
    required this.userId,
    required this.loanCount,
    required this.totalLoan,
    required this.onAddLoan,
    this.pendingSuggestions = 0,
    this.onReviewSuggestions,
    this.onTap,
    Key? key,
  }) : super(key: key);

  static final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

  @override
  Widget build(BuildContext context) {
    final titleStyle = Theme.of(context)
        .textTheme
        .titleMedium
        ?.copyWith(fontWeight: FontWeight.w700, fontSize: 16);
    final Widget contents = GlassCard(
      radius: Fx.r24,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            const Icon(Icons.account_balance_rounded, color: Fx.bad),
            const SizedBox(width: Fx.s8),
            Text("Loans", style: titleStyle),
            const SizedBox(width: Fx.s8),
            if (pendingSuggestions > 0)
              InkWell(
                borderRadius: BorderRadius.circular(999),
                onTap: onReviewSuggestions,
                child: PillBadge('Detected $pendingSuggestions', color: Fx.warn, icon: Icons.search_rounded),
              ),
            const Spacer(),
            IconButton(
              icon: const Icon(Icons.add_circle, color: Fx.mintDark),
              tooltip: "Add Loan",
              onPressed: onAddLoan,
            ),
          ]),
          const SizedBox(height: Fx.s6),
          Text(_inr.format(totalLoan), style: Fx.number.copyWith(color: Fx.bad)),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text("$loanCount active", style: Fx.label),
              if (onReviewSuggestions != null)
                IconButton(
                  icon: const Icon(Icons.manage_search_rounded, color: Fx.mintDark),
                  tooltip: "Review detected loans",
                  onPressed: onReviewSuggestions,
                ),
            ],
          ),
        ],
      ),
    );

    if (onTap == null) return contents;

    final radius = BorderRadius.circular(Fx.r24);
    return Material(
      color: Colors.transparent,
      borderRadius: radius,
      child: InkWell(
        borderRadius: radius,
        onTap: onTap,
        child: contents,
      ),
    );
  }
}
