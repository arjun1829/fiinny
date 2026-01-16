import 'dart:math';
import 'package:flutter/material.dart';

class WeeklyPartnerRingsWidget extends StatelessWidget {
  /// Income for each day
  final List<double> dailyCredits;

  /// Expense for each day
  final List<double> dailyDebits;

  /// Optional short labels like ["1/8", "2/8", ...]
  final List<String>? dateLabels;

  /// Tap handler with day index
  final void Function(int index)? onRingTap;

  /// Optional: ring diameter (px) for each mini ring
  final double ringSize;

  /// Optional: ring stroke width (px)
  final double strokeWidth;

  /// Optional: colors
  final Color incomeColor;
  final Color expenseColor;
  final Color trackColor;

  /// Optional: animate ring sweep on first build
  final bool animate;
  final Duration animationDuration;
  final Curve animationCurve;

  const WeeklyPartnerRingsWidget({
    super.key,
    required this.dailyCredits,
    required this.dailyDebits,
    this.dateLabels,
    this.onRingTap,
    this.ringSize = 34,
    this.strokeWidth = 7,
    this.incomeColor = Colors.green,
    this.expenseColor = Colors.red,
    this.trackColor = const Color(0xFFDDDDDD),
    this.animate = true,
    this.animationDuration = const Duration(milliseconds: 650),
    this.animationCurve = Curves.easeOutCubic,
  });

  @override
  Widget build(BuildContext context) {
    assert(dailyCredits.length == dailyDebits.length,
        'dailyCredits and dailyDebits must be same length');

    final count = dailyCredits.length;

    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(count, (i) {
        final credit = _safe(dailyCredits[i]);
        final debit = _safe(dailyDebits[i]);
        final total = (credit + debit);
        final incomePercent =
            total > 0 ? (credit / total).clamp(0.0, 1.0) : 0.0;
        final expensePercent =
            total > 0 ? (debit / total).clamp(0.0, 1.0) : 0.0;

        final ring = _AnimatedMiniSplitRing(
          incomePercent: incomePercent,
          expensePercent: expensePercent,
          size: ringSize,
          strokeWidth: strokeWidth,
          incomeColor: incomeColor,
          expenseColor: expenseColor,
          trackColor: trackColor,
          animate: animate,
          duration: animationDuration,
          curve: animationCurve,
        );

        return GestureDetector(
          onTap: () => onRingTap?.call(i),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4.0),
            child: Column(
              children: [
                Semantics(
                  label:
                      'Day ${i + 1}. Income ${_asCurrency(credit)}, Expense ${_asCurrency(debit)}.',
                  child: ring,
                ),
                if (dateLabels != null && i < dateLabels!.length)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      dateLabels![i],
                      style: TextStyle(fontSize: 11, color: Colors.grey[700]),
                    ),
                  ),
              ],
            ),
          ),
        );
      }),
    );
  }

  static double _safe(double v) => (v.isFinite && v >= 0) ? v : 0.0;

  static String _asCurrency(double v) => '₹${v.toStringAsFixed(0)}';
}

class _AnimatedMiniSplitRing extends StatelessWidget {
  final double incomePercent;
  final double expensePercent;
  final double size;
  final double strokeWidth;
  final Color incomeColor;
  final Color expenseColor;
  final Color trackColor;
  final bool animate;
  final Duration duration;
  final Curve curve;

  const _AnimatedMiniSplitRing({
    required this.incomePercent,
    required this.expensePercent,
    required this.size,
    required this.strokeWidth,
    required this.incomeColor,
    required this.expenseColor,
    required this.trackColor,
    required this.animate,
    required this.duration,
    required this.curve,
  });

  @override
  Widget build(BuildContext context) {
    if (!animate) {
      return SizedBox(
        width: size,
        height: size,
        child: CustomPaint(
          painter: _MiniSplitRingPainter(
            incomePercent: incomePercent,
            expensePercent: expensePercent,
            strokeWidth: strokeWidth,
            incomeColor: incomeColor,
            expenseColor: expenseColor,
            trackColor: trackColor,
          ),
        ),
      );
    }

    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: duration,
      curve: curve,
      builder: (_, t, __) => SizedBox(
        width: size,
        height: size,
        child: CustomPaint(
          painter: _MiniSplitRingPainter(
            incomePercent: (incomePercent * t).clamp(0.0, 1.0),
            expensePercent: (expensePercent * t).clamp(0.0, 1.0),
            strokeWidth: strokeWidth,
            incomeColor: incomeColor,
            expenseColor: expenseColor,
            trackColor: trackColor,
          ),
        ),
      ),
    );
  }
}

class _MiniSplitRingPainter extends CustomPainter {
  final double incomePercent;
  final double expensePercent;
  final double strokeWidth;
  final Color incomeColor;
  final Color expenseColor;
  final Color trackColor;

  _MiniSplitRingPainter({
    required this.incomePercent,
    required this.expensePercent,
    required this.strokeWidth,
    required this.incomeColor,
    required this.expenseColor,
    required this.trackColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final radius = (size.width - strokeWidth) / 2;
    final center = Offset(size.width / 2, size.height / 2);

    final track = Paint()
      ..color = trackColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;

    // Track
    canvas.drawCircle(center, radius, track);

    // Income arc
    if (incomePercent > 0) {
      final p = Paint()
        ..color = incomeColor
        ..style = PaintingStyle.stroke
        ..strokeWidth = strokeWidth
        ..strokeCap = StrokeCap.round;
      final sweep = 2 * pi * incomePercent;
      canvas.drawArc(Rect.fromCircle(center: center, radius: radius), -pi / 2,
          sweep, false, p);
    }

    // Expense arc (starts after income arc)
    if (expensePercent > 0) {
      final p = Paint()
        ..color = expenseColor
        ..style = PaintingStyle.stroke
        ..strokeWidth = strokeWidth
        ..strokeCap = StrokeCap.round;
      final start = -pi / 2 + (2 * pi * incomePercent);
      final sweep = 2 * pi * expensePercent;
      canvas.drawArc(Rect.fromCircle(center: center, radius: radius), start,
          sweep, false, p);
    }
  }

  @override
  bool shouldRepaint(_MiniSplitRingPainter old) =>
      old.incomePercent != incomePercent ||
      old.expensePercent != expensePercent ||
      old.strokeWidth != strokeWidth ||
      old.incomeColor != incomeColor ||
      old.expenseColor != expenseColor ||
      old.trackColor != trackColor;
}
