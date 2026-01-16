// lib/widgets/charts/pie_chart_glossy.dart
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../core/formatters/inr.dart';
import '../../themes/tokens.dart';

class DonutSlice {
  final String label;
  final double value;
  const DonutSlice(this.label, this.value);
}

/// Radial pie chart with tap interaction + subtle glossy highlight.
class PieChartGlossy extends StatelessWidget {
  final List<DonutSlice> data;
  final double size;
  final bool showCenter;
  final List<Color>? palette;
  final int? selectedIndex;
  final void Function(int index, DonutSlice slice)? onSliceTap;

  const PieChartGlossy({
    super.key,
    required this.data,
    this.size = 200,
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
      final style = Theme.of(context).textTheme.bodyMedium?.copyWith(
            fontWeight: FontWeight.w600,
            color: Fx.text.withValues(alpha: .8),
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

    final values = List<double>.unmodifiable(slices.map((e) => e.value));

    return RepaintBoundary(
      child: SizedBox(
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

                  final v = local - center;
                  final dist = v.distance;
                  if (dist > rOuter) return;

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
                painter: _PiePainter(
                  arcs: arcs,
                  colors: colors,
                  selectedIndex: selectedIndex,
                  values: values,
                ),
              ),
              if (showCenter)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    color: Colors.white.withValues(alpha: .72),
                    boxShadow: const [
                      BoxShadow(
                        blurRadius: 12,
                        color: Colors.black26,
                        offset: Offset(0, 4),
                      )
                    ],
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(INR.c(total), style: Fx.number.copyWith(fontSize: 16)),
                      Text(
                        'total',
                        style:
                            Fx.label.copyWith(fontSize: 11, color: Fx.text.withValues(alpha: .70)),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  List<_Arc> _computeArcsNormalized(List<DonutSlice> data, double total, double minFrac) {
    final minSweep = 2 * math.pi * minFrac;

    final sweeps = <double>[];
    for (final s in data) {
      var sw = 2 * math.pi * (s.value / total);
      if (sw < minSweep) sw = minSweep;
      sweeps.add(sw);
    }

    final sum = sweeps.fold<double>(0, (a, b) => a + b);
    final scale = sum > 2 * math.pi ? (2 * math.pi) / sum : 1.0;

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

class _PiePainter extends CustomPainter {
  final List<_Arc> arcs;
  final List<Color> colors;
  final int? selectedIndex;
  final List<double> values;

  const _PiePainter({
    required this.arcs,
    required this.colors,
    required this.selectedIndex,
    required this.values,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final radius = math.min(size.width, size.height) / 2;
    final rect = Rect.fromCircle(center: center, radius: radius);

    for (int i = 0; i < arcs.length; i++) {
      final arc = arcs[i];
      if (arc.sweep <= 0) continue;

      final base = colors[i % colors.length];
      final isSelected = (selectedIndex != null && i == selectedIndex);
      final fillColor = isSelected ? _tint(base, .06) : base;

      final paint = Paint()
        ..isAntiAlias = true
        ..style = PaintingStyle.fill
        ..color = fillColor;

      canvas.drawArc(rect, arc.start, arc.sweep, true, paint);

      final border = Paint()
        ..isAntiAlias = true
        ..style = PaintingStyle.stroke
        ..strokeWidth = isSelected ? 2.2 : 1.0
        ..color = Colors.white.withValues(alpha: isSelected ? .55 : .35);
      canvas.drawArc(rect, arc.start, arc.sweep, true, border);
    }

    final clipPath = Path()..addOval(rect);

    // Add glossy overlay on the top half of the pie.
    final glossPaint = Paint()
      ..isAntiAlias = true
      ..style = PaintingStyle.fill
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [
          Colors.white.withValues(alpha: .12),
          Colors.white.withValues(alpha: .04),
          Colors.transparent,
        ],
        stops: const [0.0, 0.45, 1.0],
      ).createShader(rect);
    canvas.save();
    canvas.clipPath(clipPath);
    canvas.drawRect(rect, glossPaint);
    canvas.restore();

    final sparklePaint = Paint()
      ..isAntiAlias = true
      ..style = PaintingStyle.fill
      ..shader = RadialGradient(
        center: const Alignment(0, -0.65),
        radius: 0.6,
        colors: [
          Colors.white.withValues(alpha: .08),
          Colors.white.withValues(alpha: .03),
          Colors.transparent,
        ],
      ).createShader(rect);
    canvas.save();
    canvas.clipPath(clipPath);
    canvas.drawRect(rect, sparklePaint);
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _PiePainter oldDelegate) {
    if (oldDelegate.selectedIndex != selectedIndex) return true;
    if (!listEquals(oldDelegate.values, values)) return true;
    if (oldDelegate.arcs.length != arcs.length) return true;
    for (int i = 0; i < arcs.length; i++) {
      if (oldDelegate.arcs[i].start != arcs[i].start ||
          oldDelegate.arcs[i].sweep != arcs[i].sweep) {
        return true;
      }
    }
    if (!listEquals(oldDelegate.colors, colors)) return true;
    return false;
  }

  Color _tint(Color color, double amount) {
    final hsl = HSLColor.fromColor(color);
    final light = (hsl.lightness + amount).clamp(0.0, 1.0);
    return hsl.withLightness(light).toColor();
  }
}
