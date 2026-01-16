// lib/widgets/hero_dual_ring.dart
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

/// What value should the hero show at center.
enum PrimaryMetric { balance, income, expense }

/// Big dual-ring: outer = Income, inner = Expense.
/// Center shows Balance/Income/Expense based on [primary].
class HeroDualRing extends StatelessWidget {
  final double credit; // income
  final double debit;  // expense
  final PrimaryMetric primary;
  final String periodLabel; // e.g. "Month", "Week 36"
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;

  /// Optional color tuning (defaults match Fiinny palette)
  final Color incomeColor;
  final Color expenseColor;
  final Color positiveBalanceColor;
  final Color negativeBalanceColor;

  const HeroDualRing({
    super.key,
    required this.credit,
    required this.debit,
    required this.primary,
    required this.periodLabel,
    this.onTap,
    this.onLongPress,
    this.incomeColor = const Color(0xFF2BBBAD),        // teal
    this.expenseColor = const Color(0xFFD81B60),       // pink/red
    this.positiveBalanceColor = const Color(0xFF1E88E5), // blue
    this.negativeBalanceColor = const Color(0xFFE53935), // red
  });

  @override
  Widget build(BuildContext context) {
    final nf = NumberFormat.simpleCurrency(locale: 'en_IN', name: '₹');
    final balance = credit - debit;
    final maxVal = [credit.abs(), debit.abs(), 1.0].reduce(max);

    final Color accent = switch (primary) {
      PrimaryMetric.balance =>
      (balance >= 0 ? positiveBalanceColor : negativeBalanceColor),
      PrimaryMetric.income => incomeColor,
      PrimaryMetric.expense => expenseColor,
    };

    final String title = switch (primary) {
      PrimaryMetric.balance => "Balance",
      PrimaryMetric.income => "Income",
      PrimaryMetric.expense => "Expense",
    };

    final double value = switch (primary) {
      PrimaryMetric.balance => balance,
      PrimaryMetric.income => credit,
      PrimaryMetric.expense => debit,
    };

    return GestureDetector(
      onTap: onTap,
      onLongPress: onLongPress,
      behavior: HitTestBehavior.opaque,
      child: Column(
        children: [
          SizedBox(
            height: 220,
            child: CustomPaint(
              painter: _DualArcPainter(
                credit: credit,
                debit: debit,
                maxVal: maxVal,
                creditColor: incomeColor,
                debitColor: expenseColor,
              ),
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      title,
                      style: TextStyle(
                        color: accent,
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      nf.format(value),
                      style: TextStyle(
                        color: accent,
                        fontSize: 24,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.2,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        _pill(Icons.arrow_downward, nf.format(credit), incomeColor),
                        const SizedBox(width: 8),
                        _pill(Icons.arrow_upward, nf.format(debit), expenseColor),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            "based on current filters • $periodLabel",
            style: TextStyle(color: Colors.grey[600], fontSize: 12),
          ),
        ],
      ),
    );
  }

  Widget _pill(IconData icon, String text, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Row(
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 4),
          Text(
            text,
            style: TextStyle(color: color, fontWeight: FontWeight.w600, fontSize: 12),
          ),
        ],
      ),
    );
  }
}

class _DualArcPainter extends CustomPainter {
  final double credit; // income
  final double debit;  // expense
  final double maxVal;
  final Color creditColor;
  final Color debitColor;

  _DualArcPainter({
    required this.credit,
    required this.debit,
    required this.maxVal,
    required this.creditColor,
    required this.debitColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final radiusOuter = (size.shortestSide / 2) - 10;
    final strokeOuter = 12.0;
    final strokeInner = 9.0;
    final gap = 6.0;
    final radiusInner = radiusOuter - (strokeOuter / 2) - (strokeInner / 2) - gap;

    final bg = Paint()
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..color = const Color(0x33000000);

    // tracks
    canvas.drawCircle(center, radiusOuter, bg..strokeWidth = strokeOuter);
    canvas.drawCircle(center, radiusInner, bg..strokeWidth = strokeInner);

    // arcs
    final start = -pi / 2;
    final creditPct = (credit / maxVal).clamp(0.0, 1.0);
    final debitPct = (debit / maxVal).clamp(0.0, 1.0);

    final pCredit = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeOuter
      ..strokeCap = StrokeCap.round
      ..color = creditColor;

    final pDebit = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeInner
      ..strokeCap = StrokeCap.round
      ..color = debitColor;

    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radiusOuter),
      start,
      2 * pi * creditPct,
      false,
      pCredit,
    );

    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radiusInner),
      start,
      2 * pi * debitPct,
      false,
      pDebit,
    );
  }

  @override
  bool shouldRepaint(covariant _DualArcPainter old) {
    return old.credit != credit ||
        old.debit != debit ||
        old.maxVal != maxVal ||
        old.creditColor != creditColor ||
        old.debitColor != debitColor;
  }
}
