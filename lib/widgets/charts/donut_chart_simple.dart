// lib/widgets/charts/donut_chart_simple.dart
import 'dart:math' as math;
import 'package:flutter/material.dart';

import '../../core/formatters/inr.dart';
import '../../themes/tokens.dart';

class DonutSlice {
  final String label;
  final double value;
  const DonutSlice(this.label, this.value);
}

/// Simple, pretty donut with optional interactivity:
/// - `onSliceTap` to handle taps on slices (e.g., open drill-down sheets)
/// - `selectedIndex` to visually highlight a slice
/// - `palette` to keep colors in sync with external legends
class DonutChartSimple extends StatelessWidget {
  final List<DonutSlice> data;
  final double size;

  /// Ring thickness (px)
  final double thickness;

  /// Show center total (₹) + caption
  final bool showCenter;

  /// Optional custom colors (use to match legend order exactly)
  final List<Color>? palette;

  /// Optional highlighted slice index
  final int? selectedIndex;

  /// Optional tap callback: (index, slice)
  final void Function(int index, DonutSlice slice)? onSliceTap;

  const DonutChartSimple({
    super.key,
    required this.data,
    this.size = 160,
    this.thickness = 18,
    this.showCenter = true,
    this.palette,
    this.selectedIndex,
    this.onSliceTap,
  });

  @override
  Widget build(BuildContext context) {
    final slices = <DonutSlice>[
      for (final s in data)
        if (s.value.isFinite && s.value > 0) s,
    ];

    final total = slices.fold<double>(0, (a, b) => a + b.value);
    if (!total.isFinite || total <= 0 || slices.isEmpty) {
      return SizedBox(
        width: size,
        height: size,
        child: Center(child: Text('No data', style: Fx.label)),
      );
    }

    // Precompute arcs (start, sweep) with a minimum sweep so tiny slices are visible.
    // Then re-normalize so the sum of sweeps never exceeds 360° (prevents the “solid ring” bug).
    const double minFrac = 0.02; // 2% of the circle
    final arcs = _computeArcsNormalized(slices, total, minFrac);

    final colors = palette ??
        <Color>[
          Fx.mintDark,
          Fx.good,
          Fx.warn,
          Fx.bad,
          Colors.indigo,
          Colors.purple,
          Colors.cyan,
          Colors.brown,
        ];

    return SizedBox(
      width: size,
      height: size,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTapDown: (onSliceTap == null)
            ? null
            : (details) {
                final local = details.localPosition;
                final center = Offset(size / 2, size / 2);
                final rOuter = math.min(size, size) / 2;
                final rInner = rOuter - thickness;

                final v = local - center;
                final dist = v.distance;
                if (dist < rInner || dist > rOuter) return;

                double ang = math.atan2(v.dy, v.dx);
                ang = (ang + 2 * math.pi) % (2 * math.pi);
                double aFromTop = ang - (-math.pi / 2);
                if (aFromTop < 0) aFromTop += 2 * math.pi;

                double acc = 0.0;
                for (int i = 0; i < arcs.length; i++) {
                  final s = arcs[i];
                  if (aFromTop >= acc && aFromTop < acc + s.sweep) {
                    onSliceTap?.call(i, slices[i]);
                    break;
                  }
                  acc += s.sweep;
                }
              },
        child: Stack(
          alignment: Alignment.center,
          children: [
            CustomPaint(
              painter: _DonutPainter(
                data: slices,
                arcs: arcs,
                thickness: thickness,
                colors: colors,
                selectedIndex: selectedIndex,
              ),
            ),
            if (showCenter)
              Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    INR.c(total),
                    style: Fx.number.copyWith(fontSize: 16),
                  ),
                  Text(
                    'total',
                    style:
                        Fx.label.copyWith(fontSize: 11, color: Fx.text.withOpacity(.70)),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  /// Computes arcs with a minimum visible size for tiny slices and then
  /// re-normalizes the sweeps so the total is <= 360°.
  List<_Arc> _computeArcsNormalized(
      List<DonutSlice> data, double total, double minFrac) {
    final minSweep = 2 * math.pi * minFrac;

    // 1) initial sweeps with minimum enforced
    final sweeps = <double>[];
    for (final s in data) {
      if (s.value <= 0) {
        sweeps.add(0);
        continue;
      }
      var sw = 2 * math.pi * (s.value / total);
      if (sw < minSweep) sw = minSweep;
      sweeps.add(sw);
    }

    // 2) normalize if we overshoot 360°
    final sum = sweeps.fold<double>(0, (a, b) => a + b);
    final scale = sum > 2 * math.pi ? (2 * math.pi) / sum : 1.0;

    // 3) build arcs sequentially from top (-90°)
    double start = -math.pi / 2;
    final arcs = <_Arc>[];
    for (final sw in sweeps) {
      final sweep = sw * scale;
      arcs.add(_Arc(start: start, sweep: sweep));
      start += sweep;
    }
    return arcs;
  }
}

class _Arc {
  final double start;
  final double sweep;
  const _Arc({required this.start, required this.sweep});
}

class _DonutPainter extends CustomPainter {
  final List<DonutSlice> data;
  final List<_Arc> arcs;
  final double thickness;
  final List<Color> colors;
  final int? selectedIndex;

  const _DonutPainter({
    required this.data,
    required this.arcs,
    required this.thickness,
    required this.colors,
    required this.selectedIndex,
  });

  @override
  void paint(Canvas c, Size s) {
    final center = s.center(Offset.zero);
    final rOuter = math.min(s.width, s.height) / 2;

    // Subtle ring background
    final bg = Paint()
      ..isAntiAlias = true
      ..style = PaintingStyle.stroke
      ..strokeWidth = thickness
      ..color = Colors.black12.withOpacity(.08);
    c.drawCircle(center, rOuter - thickness / 2, bg);

    // Slices
    for (int i = 0; i < data.length; i++) {
      final arc = arcs[i];
      if (arc.sweep <= 0) continue;

      final isSel = (selectedIndex != null && i == selectedIndex);
      final p = Paint()
        ..isAntiAlias = true
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round
        ..strokeWidth = isSel ? thickness + 6 : thickness
        ..color = colors[i % colors.length].withOpacity(isSel ? 1.0 : .90);

      c.drawArc(
        Rect.fromCircle(center: center, radius: rOuter - thickness / 2),
        arc.start,
        arc.sweep,
        false,
        p,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _DonutPainter old) {
    return old.thickness != thickness ||
        old.selectedIndex != selectedIndex ||
        old.data != data ||
        old.colors != colors ||
        old.arcs.length != arcs.length;
  }
}
