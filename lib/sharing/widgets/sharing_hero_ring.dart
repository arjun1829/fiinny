import 'package:flutter/material.dart';
import 'dart:math';

class SharingHeroRing extends StatelessWidget {
  /// Income amount
  final double credit;

  /// Expense amount
  final double debit;

  /// Outer ring size (square)
  final double size;

  /// Optional: customize colors (keeps your current palette by default)
  final Color creditColor;
  final Color debitColor;

  /// Optional: animation tuning
  final Duration animationDuration;
  final Curve animationCurve;

  /// Optional: draw faint center dot
  final bool showCenterDot;

  const SharingHeroRing({
    Key? key,
    required this.credit,
    required this.debit,
    this.size = 86,
    this.creditColor = Colors.green,
    this.debitColor = Colors.red,
    this.animationDuration = const Duration(milliseconds: 900),
    this.animationCurve = Curves.easeOutCubic,
    this.showCenterDot = false,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    // Guard against NaN/inf and zero
    final safeCredit = (credit.isFinite && credit >= 0) ? credit : 0.0;
    final safeDebit  = (debit.isFinite  && debit  >= 0) ? debit  : 0.0;

    double maxValue = max(safeCredit, safeDebit);
    if (maxValue <= 0) maxValue = 1.0;

    final percentCredit = (safeCredit / maxValue).clamp(0.0, 1.0);
    final percentDebit  = (safeDebit  / maxValue).clamp(0.0, 1.0);

    // Scaled strokes that still look good at tiny/large sizes
    final outerStroke = (size * 0.16).clamp(8.0, 20.0);
    final innerStroke = (size * 0.12).clamp(6.0, 16.0);

    return Semantics(
      label:
          'Sharing ring. Credit ₹${safeCredit.toStringAsFixed(0)}, Debit ₹${safeDebit.toStringAsFixed(0)}',
      child: SizedBox(
        width: size,
        height: size,
        child: Stack(
          alignment: Alignment.center,
          children: [
            _AnimatedRing(
              percent: percentDebit,
              color: debitColor,
              size: size,
              strokeWidth: outerStroke,
              duration: animationDuration,
              curve: animationCurve,
            ),
            _AnimatedRing(
              percent: percentCredit,
              color: creditColor,
              size: size * 0.77, // inner ring
              strokeWidth: innerStroke,
              duration: animationDuration,
              curve: animationCurve,
            ),
            if (showCenterDot)
              Container(
                width: size * 0.06,
                height: size * 0.06,
                decoration: BoxDecoration(
                  color: Colors.black.withOpacity(0.08),
                  shape: BoxShape.circle,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _AnimatedRing extends StatelessWidget {
  final double percent;
  final Color color;
  final double size;
  final double strokeWidth;
  final Duration duration;
  final Curve curve;

  const _AnimatedRing({
    Key? key,
    required this.percent,
    required this.color,
    required this.size,
    required this.strokeWidth,
    this.duration = const Duration(milliseconds: 900),
    this.curve = Curves.easeOutCubic,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.0, end: percent),
      duration: duration,
      curve: curve,
      builder: (context, val, _) => CustomPaint(
        size: Size(size, size),
        painter: _RingPainter(
          color: color,
          percent: val,
          strokeWidth: strokeWidth,
        ),
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  final Color color;
  final double percent;
  final double strokeWidth;

  _RingPainter({
    required this.color,
    required this.percent,
    required this.strokeWidth,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final radius = size.width / 2;

    // Background track
    final Paint bg = Paint()
      ..color = color.withOpacity(0.13)
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;

    // Foreground arc
    final Paint fg = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;

    final rect = Rect.fromCircle(center: center, radius: radius);

    // Full track
    canvas.drawArc(rect, 0, 2 * pi, false, bg);

    // Progress arc (start at top)
    final sweep = (2 * pi) * percent;
    canvas.drawArc(rect, -pi / 2, sweep, false, fg);

    // Subtle ring shadow/glow for depth (very light)
    if (percent > 0) {
      final glow = Paint()
        ..color = color.withOpacity(0.08)
        ..style = PaintingStyle.stroke
        ..strokeWidth = max(1, strokeWidth - 2)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3);
      canvas.drawArc(rect, -pi / 2, sweep, false, glow);
    }
  }

  @override
  bool shouldRepaint(_RingPainter old) =>
      old.percent != percent ||
      old.color != color ||
      old.strokeWidth != strokeWidth;
}
