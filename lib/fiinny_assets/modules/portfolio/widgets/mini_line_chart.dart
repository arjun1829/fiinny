import 'package:flutter/material.dart';
import 'dart:math' as math;

/// Minimal sparkline for quick trend visuals.
/// Pass a small list of values; it auto-scales. Not interactive.
class MiniLineChart extends StatelessWidget {
  final List<double> values;
  final double height;
  final EdgeInsets padding;

  const MiniLineChart({
    super.key,
    required this.values,
    this.height = 36,
    this.padding = const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
  });

  @override
  Widget build(BuildContext context) {
    if (values.length < 2) {
      return SizedBox(height: height);
    }
    final minV = values.reduce(math.min);
    final maxV = values.reduce(math.max);
    final range = (maxV - minV).abs() < 1e-6 ? 1.0 : (maxV - minV);

    return SizedBox(
      height: height,
      child: Padding(
        padding: padding,
        child: CustomPaint(
          painter: _SparkPainter(values, minV, range),
          size: Size.infinite,
        ),
      ),
    );
  }
}

class _SparkPainter extends CustomPainter {
  final List<double> values;
  final double minV;
  final double range;

  _SparkPainter(this.values, this.minV, this.range);

  @override
  void paint(Canvas canvas, Size size) {
    final path = Path();
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;

    // Use theme-based color if available via a passed Paint?—keep simple here.
    // (The parent can wrap this in a ColoredBox or Theme to control color.)
    paint.color = const Color(0xFF4CAF50); // green-ish line

    final w = size.width;
    final h = size.height;
    final dx = w / (values.length - 1);

    for (int i = 0; i < values.length; i++) {
      final x = i * dx;
      final y = h - ((values[i] - minV) / range) * h;
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant _SparkPainter oldDelegate) {
    return oldDelegate.values != values ||
        oldDelegate.minV != minV ||
        oldDelegate.range != range;
  }
}
