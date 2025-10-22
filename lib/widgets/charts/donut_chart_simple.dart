// lib/widgets/charts/donut_chart_simple.dart
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../themes/tokens.dart';

class DonutSlice {
  final String label;
  final double value;
  DonutSlice(this.label, this.value);
}

class DonutChartSimple extends StatelessWidget {
  final List<DonutSlice> data;
  final double size;
  const DonutChartSimple({super.key, required this.data, this.size = 160});

  @override
  Widget build(BuildContext context) {
    final total = data.fold<double>(0, (a, b) => a + b.value);
    if (total <= 0) {
      return SizedBox(width: size, height: size, child: Center(child: Text('No data', style: Fx.label)));
    }
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(painter: _DonutPainter(data)),
    );
  }
}

class _DonutPainter extends CustomPainter {
  final List<DonutSlice> data;
  _DonutPainter(this.data);

  @override
  void paint(Canvas c, Size s) {
    final center = s.center(Offset.zero);
    final r = s.width / 2;
    final total = data.fold<double>(0, (a, b) => a + b.value);
    double start = -math.pi / 2;

    final palette = [
      Fx.mintDark,
      Fx.good,
      Fx.warn,
      Fx.bad,
      Colors.indigo,
      Colors.purple,
      Colors.cyan,
      Colors.brown,
    ];

    final bg = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 16
      ..color = Colors.black12.withOpacity(.06);

    c.drawCircle(center, r - 8, bg);

    for (int i = 0; i < data.length; i++) {
      final slice = data[i];
      if (slice.value <= 0) continue;
      final sweep = 2 * math.pi * (slice.value / total);
      final p = Paint()
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round
        ..strokeWidth = 16
        ..color = palette[i % palette.length].withOpacity(.85);
      c.drawArc(Rect.fromCircle(center: center, radius: r - 8), start, sweep, false, p);
      start += sweep;
    }
  }

  @override
  bool shouldRepaint(_DonutPainter old) => true;
}
