import 'package:flutter/material.dart';
import 'dart:math';
import '../themes/custom_card.dart'; // Adjust import as needed

class FinancialRingWidget extends StatelessWidget {
  final String label;
  final double value;
  final double maxValue;
  final Color color;
  final IconData icon;
  final List<Color>? gradientColors;
  final bool showPercent;
  final double ringSize;
  final double strokeWidth;

  const FinancialRingWidget({
    required this.label,
    required this.value,
    required this.maxValue,
    required this.color,
    required this.icon,
    this.gradientColors,
    this.showPercent = false,
    this.ringSize = 96,        // 👈 Bigger ring!
    this.strokeWidth = 13,     // 👈 Thicker ring!
    Key? key,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final double percent = maxValue == 0 ? 0 : (value / maxValue).clamp(0.0, 1.0);

    final ringGradients = gradientColors ??
        [
          color.withValues(alpha: 0.98),
          color.withValues(alpha: 0.60),
          color.withValues(alpha: 0.22),
        ];

    return GestureDetector(
      onLongPress: () {
        showDialog(
          context: context,
          builder: (ctx) => _RingPopup(
            label: label,
            value: value,
            maxValue: maxValue,
            color: color,
            icon: icon,
            percent: percent,
            gradientColors: ringGradients,
          ),
        );
      },
      child: CustomDiamondCard(
        isDiamondCut: true,
        borderRadius: 22,
        glassGradient: Theme.of(context).brightness == Brightness.dark
            ? [Colors.white.withValues(alpha: 0.28), Colors.white.withValues(alpha: 0.06)]
            : [Colors.black.withValues(alpha: 0.05), Colors.black.withValues(alpha: 0.01)],
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 9),
        child: SizedBox(
          width: ringSize + 14,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Stack(
                alignment: Alignment.center,
                children: [
                  TweenAnimationBuilder<double>(
                    tween: Tween(begin: 0, end: percent),
                    duration: const Duration(milliseconds: 900),
                    curve: Curves.easeOutCubic,
                    builder: (context, val, _) {
                      return CustomPaint(
                        painter: _RingPainter(
                          color: color,
                          percent: val,
                          gradientColors: ringGradients,
                          strokeWidth: strokeWidth,
                        ),
                        size: Size(ringSize, ringSize),
                      );
                    },
                  ),
                  Icon(icon, color: color, size: 36), // Bigger icon for ring!
                ],
              ),
              const SizedBox(height: 10),
              Text(
                label,
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  color: color.withValues(alpha: 0.88),
                  letterSpacing: 0.18,
                ),
              ),
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(
                  "₹${value.toStringAsFixed(0)}",
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: color,
                    fontSize: 15,
                    letterSpacing: 0.13,
                  ),
                ),
              ),
              if (showPercent)
                Padding(
                  padding: const EdgeInsets.only(top: 3.5),
                  child: Text(
                    "${(percent * 100).toStringAsFixed(0)}%",
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: color.withValues(alpha: 0.87),
                      fontSize: 13.8,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// --- POPUP: Shows Big Ring + Details on Long Press ---
class _RingPopup extends StatelessWidget {
  final String label;
  final double value;
  final double maxValue;
  final Color color;
  final IconData icon;
  final double percent;
  final List<Color> gradientColors;

  const _RingPopup({
    required this.label,
    required this.value,
    required this.maxValue,
    required this.color,
    required this.icon,
    required this.percent,
    required this.gradientColors,
    Key? key,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: Colors.white.withValues(alpha: 0.82),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(32),
      ),
      elevation: 20,
      content: SizedBox(
        width: 270,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Stack(
              alignment: Alignment.center,
              children: [
                CustomPaint(
                  painter: _RingPainter(
                    color: color,
                    percent: percent,
                    gradientColors: gradientColors,
                    strokeWidth: 23, // Extra thick for popup!
                  ),
                  size: const Size(152, 152), // Big popup ring!
                ),
                Icon(icon, color: color, size: 56),
              ],
            ),
            const SizedBox(height: 22),
            Text(
              label,
              style: TextStyle(
                fontSize: 21,
                fontWeight: FontWeight.w700,
                color: color.withValues(alpha: 0.91),
              ),
            ),
            Text(
              "₹${value.toStringAsFixed(0)}",
              style: TextStyle(
                fontWeight: FontWeight.bold,
                color: color,
                fontSize: 26,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              percent >= 0.99
                  ? "Wow! You've reached your target!"
                  : "(${(percent * 100).toStringAsFixed(1)}% of max)",
              style: TextStyle(
                fontSize: 15.5,
                fontWeight: FontWeight.w500,
                color: color.withValues(alpha: 0.7),
              ),
            ),
            const SizedBox(height: 13),
            ElevatedButton(
              onPressed: () => Navigator.pop(context),
              style: ElevatedButton.styleFrom(
                backgroundColor: color.withValues(alpha: 0.81),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(13),
                ),
                elevation: 2,
              ),
              child: const Text(
                "Close",
                style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  final Color color;
  final double percent;
  final List<Color>? gradientColors;
  final double strokeWidth;

  _RingPainter({
    required this.color,
    required this.percent,
    this.gradientColors,
    this.strokeWidth = 13,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;

    final Paint bg = Paint()
      ..color = color.withValues(alpha: 0.14)
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;

    final Paint fg = Paint()
      ..shader = SweepGradient(
        colors: gradientColors ?? [color, color.withValues(alpha: 0.48), color.withValues(alpha: 0.14)],
        startAngle: -pi / 2,
        endAngle: pi * 2,
      ).createShader(rect)
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;

    // Background arc (full)
    canvas.drawArc(
      Rect.fromCircle(center: size.center(Offset.zero), radius: size.width / 2),
      0, 2 * pi, false, bg,
    );
    // Foreground arc (progress)
    canvas.drawArc(
      Rect.fromCircle(center: size.center(Offset.zero), radius: size.width / 2),
      -pi / 2, 2 * pi * percent, false, fg,
    );
  }

  @override
  bool shouldRepaint(_RingPainter oldDelegate) =>
      oldDelegate.percent != percent ||
          oldDelegate.color != color ||
          oldDelegate.gradientColors != gradientColors ||
          oldDelegate.strokeWidth != strokeWidth;
}
