// lib/widgets/charts/donut_chart_simple.dart
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart'; // listEquals

import '../../core/formatters/inr.dart';
import '../../themes/tokens.dart';

class DonutSlice {
  final String label;
  final double value;
  const DonutSlice(this.label, this.value);
}

/// Simple donut with optional slice tap + selected highlight.
class DonutChartSimple extends StatelessWidget {
  final List<DonutSlice> data;
  final double size;
  final double thickness;
  final bool showCenter;
  final List<Color>? palette;
  final int? selectedIndex;
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
    final slices = [
      for (final s in data)
        if (s.value.isFinite && s.value > 0) s,
    ];
    final total = slices.fold<double>(0, (a, b) => a + b.value);

    if (!total.isFinite || total <= 0 || slices.isEmpty) {
      // Ensure fallback is ALWAYS readable
      final style = Theme.of(context).textTheme.bodyMedium?.copyWith(
            fontWeight: FontWeight.w600,
            color: Fx.text.withOpacity(.8),
          );
      return SizedBox(
        width: size,
        height: size,
        child: Center(child: Text('No data', style: style)),
      );
    }

    const double minFrac = 0.02; // ensure tiny slices are visible
    final arcs = _computeArcsNormalized(slices, total, minFrac);

    final colors = palette ??
        const <Color>[
          Fx.mintDark,
          Fx.good,
          Fx.warn,
          Fx.bad,
          Colors.indigo,
          Colors.purple,
          Colors.cyan,
          Colors.brown,
        ];

    // Pre-calc values list so painter can deep-compare for repaints
    final values = List<double>.unmodifiable(slices.map((e) => e.value));

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
                arcs: arcs,
                thickness: thickness,
                colors: colors,
                selectedIndex: selectedIndex,
                values: values, // <- for shouldRepaint
              ),
            ),
            if (showCenter)
              Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(INR.c(total), style: Fx.number.copyWith(fontSize: 16)),
                  Text(
                    'total',
                    style: Fx.label.copyWith(fontSize: 11, color: Fx.text.withOpacity(.70)),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  /// Compute arcs with a minimum visible sweep; then normalize to <= 360° total.
  List<_Arc> _computeArcsNormalized(List<DonutSlice> data, double total, double minFrac) {
    final minSweep = 2 * math.pi * minFrac;

    // 1) initial sweeps with minimum enforced
    final sweeps = <double>[];
    for (final s in data) {
      var sw = 2 * math.pi * (s.value / total);
      if (sw < minSweep) sw = minSweep;
      sweeps.add(sw);
    }

    // 2) normalize if overshoot
    final sum = sweeps.fold<double>(0, (a, b) => a + b);
    final scale = sum > 2 * math.pi ? (2 * math.pi) / sum : 1.0;

    // 3) build arcs from -90°
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
  final List<_Arc> arcs;
  final double thickness;
  final List<Color> colors;
  final int? selectedIndex;
  final List<double> values; // deep compare hook

  const _DonutPainter({
    required this.arcs,
    required this.thickness,
    required this.colors,
    required this.selectedIndex,
    required this.values,
  });

  @override
  void paint(Canvas c, Size s) {
    final center = s.center(Offset.zero);
    final rOuter = math.min(s.width, s.height) / 2;

    // Slightly stronger bg track so it’s visible on light cards
    final bg = Paint()
      ..isAntiAlias = true
      ..style = PaintingStyle.stroke
      ..strokeWidth = thickness
      ..color = Colors.black.withOpacity(.12);
    c.drawCircle(center, rOuter - thickness / 2, bg);

    for (int i = 0; i < arcs.length; i++) {
      final arc = arcs[i];
      if (arc.sweep <= 0) continue;

      final isSel = (selectedIndex != null && i == selectedIndex);
      final p = Paint()
        ..isAntiAlias = true
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round
        ..strokeWidth = isSel ? thickness + 6 : thickness
        ..color = colors[i % colors.length].withOpacity(isSel ? 1.0 : .95);

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
    if (old.thickness != thickness) return true;
    if (old.selectedIndex != selectedIndex) return true;
    if (!listEquals(old.values, values)) return true;
    if (old.arcs.length != arcs.length) return true;
    // Also compare arc geometry when lengths match
    for (int i = 0; i < arcs.length; i++) {
      if (old.arcs[i].start != arcs[i].start || old.arcs[i].sweep != arcs[i].sweep) {
        return true;
      }
    }
    if (!listEquals(old.colors, colors)) return true;
    return false;
    // (If you want to force repaints while debugging, just return true.)
  }
}
