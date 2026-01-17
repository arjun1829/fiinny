// lib/widgets/daily_rings_strip.dart
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

/// Value object for a day's totals.
class DaySummary {
  final DateTime date; // calendar day (local)
  final double income;
  final double expense;

  const DaySummary({
    required this.date,
    required this.income,
    required this.expense,
  });

  double get balance => income - expense;
}

/// Horizontal strip of 7 mini dual-rings (income vs expense) for recent days.
/// Pure widget; feed it the data computed in your screen.
class DailyRingsStrip extends StatelessWidget {
  final List<DaySummary> days; // most recent first or any order; we'll sort
  final DateTime? selectedDate; // highlight if equals a day's date
  final void Function(DaySummary day)? onTap;

  const DailyRingsStrip({
    super.key,
    required this.days,
    this.selectedDate,
    this.onTap,
  });

  static DateTime _d(DateTime x) => DateTime(x.year, x.month, x.day);

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat('d MMM');
    // Sort: most recent first
    final ordered = [...days]..sort((a, b) => b.date.compareTo(a.date));

    return SizedBox(
      height: 108,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        itemCount: ordered.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (_, i) {
          final d = ordered[i];
          final isSelected =
              selectedDate != null && _d(selectedDate!) == _d(d.date);

          final label = fmt.format(d.date);
          final net = d.balance;
          final netColor =
              net >= 0 ? const Color(0xFF1E88E5) : const Color(0xFFE53935);

          final nf = NumberFormat.compactCurrency(
            locale: 'en_IN',
            name: '₹',
          );
          return GestureDetector(
            onTap: () => onTap?.call(d),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              width: 100,
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: isSelected
                    ? Colors.teal.withValues(alpha: 0.08)
                    : Colors.white.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: isSelected
                      ? Colors.tealAccent.withValues(alpha: 0.6)
                      : Colors.white12,
                ),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _MiniDualRing(credit: d.income, debit: d.expense, net: net),
                  const SizedBox(height: 6),
                  Text(
                    label,
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    "${net >= 0 ? '+' : '−'}${nf.format(net.abs())}",
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: netColor,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _MiniDualRing extends StatelessWidget {
  final double credit; // income
  final double debit; // expense
  final double net;
  const _MiniDualRing({
    required this.credit,
    required this.debit,
    required this.net,
  });

  @override
  Widget build(BuildContext context) {
    final maxVal = max(1.0, max(credit.abs(), debit.abs()));
    final creditPct = (credit / maxVal).clamp(0.0, 1.0);
    final debitPct = (debit / maxVal).clamp(0.0, 1.0);

    return SizedBox(
      width: 44,
      height: 44,
      child: CustomPaint(
        painter: _MiniDualPainter(
          creditPct: creditPct,
          debitPct: debitPct,
          netPositive: net >= 0,
        ),
      ),
    );
  }
}

class _MiniDualPainter extends CustomPainter {
  final double creditPct, debitPct;
  final bool netPositive;
  _MiniDualPainter({
    required this.creditPct,
    required this.debitPct,
    required this.netPositive,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final rOuter = (size.shortestSide / 2) - 2;
    final strokeOuter = 6.0;
    final strokeInner = 4.0;
    final gap = 3.0;
    final rInner = rOuter - (strokeOuter / 2) - (strokeInner / 2) - gap;

    final bg = Paint()
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..color = const Color(0x22000000);

    canvas.drawCircle(center, rOuter, bg..strokeWidth = strokeOuter);
    canvas.drawCircle(center, rInner, bg..strokeWidth = strokeInner);

    final start = -pi / 2;
    final pCredit = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeOuter
      ..strokeCap = StrokeCap.round
      ..color = const Color(0xFF2BBBAD); // income
    final pDebit = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeInner
      ..strokeCap = StrokeCap.round
      ..color = const Color(0xFFD81B60); // expense

    if (creditPct > 0) {
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: rOuter),
        start,
        2 * pi * creditPct,
        false,
        pCredit,
      );
    }
    if (debitPct > 0) {
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: rInner),
        start,
        2 * pi * debitPct,
        false,
        pDebit,
      );
    }

    // Net dot at center
    final dot = Paint()
      ..style = PaintingStyle.fill
      ..color = netPositive ? const Color(0xFF1E88E5) : const Color(0xFFE53935);
    canvas.drawCircle(center, 3.2, dot);
  }

  @override
  bool shouldRepaint(covariant _MiniDualPainter old) =>
      old.creditPct != creditPct ||
      old.debitPct != debitPct ||
      old.netPositive != netPositive;
}
