// lib/widgets/weekly_rings_strip.dart
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

/// Value object for a week's totals.
class WeekSummary {
  final DateTime start; // inclusive (Mon)
  final DateTime end;   // inclusive (Sun)
  final double income;
  final double expense;

  const WeekSummary({
    required this.start,
    required this.end,
    required this.income,
    required this.expense,
  });

  double get balance => income - expense;
}

/// Horizontal strip of 7 mini dual-rings (income vs expense) for recent weeks.
/// Pure widget; feed it the data computed in your screen.
class WeeklyRingsStrip extends StatelessWidget {
  final List<WeekSummary> weeks; // order agnostic
  final DateTime? selectedWeekStart; // highlight if equals a week's start
  final void Function(WeekSummary wk)? onTap;

  const WeeklyRingsStrip({
    super.key,
    required this.weeks,
    this.selectedWeekStart,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final nf = NumberFormat.compactCurrency(locale: 'en_IN', name: '₹');
    // Most-recent first
    final ordered = [...weeks]..sort((a, b) => b.start.compareTo(a.start));

    return SizedBox(
      height: 110,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        itemCount: ordered.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (_, i) {
          final w = ordered[i];
          final isSelected = selectedWeekStart != null && _d(selectedWeekStart!) == _d(w.start);

          return GestureDetector(
            onTap: () => onTap?.call(w),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              width: 110,
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: isSelected ? Colors.teal.withOpacity(0.08) : Colors.white.withOpacity(0.06),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: isSelected ? Colors.tealAccent.withOpacity(0.6) : Colors.white12,
                ),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _MiniDualRing(credit: w.income, debit: w.expense),
                  const SizedBox(height: 6),
                  Text(_label(w), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
                  Text(
                    (w.balance >= 0 ? '+' : '−') + nf.format(w.balance.abs()),
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: w.balance >= 0 ? const Color(0xFF1E88E5) : const Color(0xFFE53935),
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

  static DateTime _d(DateTime x) => DateTime(x.year, x.month, x.day);

  String _label(WeekSummary w) {
    final fmt = DateFormat('d MMM');
    return "${fmt.format(w.start)}–${fmt.format(w.end)}";
  }
}

class _MiniDualRing extends StatelessWidget {
  final double credit; // income
  final double debit;  // expense
  const _MiniDualRing({required this.credit, required this.debit});

  @override
  Widget build(BuildContext context) {
    final maxVal = max(1.0, max(credit.abs(), debit.abs()));
    final creditPct = (credit / maxVal).clamp(0.0, 1.0);
    final debitPct = (debit / maxVal).clamp(0.0, 1.0);

    return SizedBox(
      width: 44,
      height: 44,
      child: CustomPaint(
        painter: _MiniDualPainter(creditPct: creditPct, debitPct: debitPct),
      ),
    );
  }
}

class _MiniDualPainter extends CustomPainter {
  final double creditPct, debitPct;
  _MiniDualPainter({required this.creditPct, required this.debitPct});

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
      canvas.drawArc(Rect.fromCircle(center: center, radius: rOuter), start, 2 * pi * creditPct, false, pCredit);
    }
    if (debitPct > 0) {
      canvas.drawArc(Rect.fromCircle(center: center, radius: rInner), start, 2 * pi * debitPct, false, pDebit);
    }
  }

  @override
  bool shouldRepaint(covariant _MiniDualPainter old) =>
      old.creditPct != creditPct || old.debitPct != debitPct;
}
