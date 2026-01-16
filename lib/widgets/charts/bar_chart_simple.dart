// lib/widgets/charts/bar_chart_simple.dart
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/analytics/aggregators.dart'; // for SeriesPoint
import '../../themes/tokens.dart';

/// Minimal, pretty bar chart with:
/// - Responsive label thinning (via [targetXTicks])
/// - Optional grid lines
/// - Smooth height animation on updates
/// - Optional tap highlight & callback
/// - Optional nice-scaled Y labels (currency-friendly)
/// Back-compat: original constructor args still work; new props are optional.
class BarChartSimple extends StatelessWidget {
  final List<SeriesPoint> data;
  final double height;
  final EdgeInsets padding;

  /// ~how many x-axis labels to show (we'll thin to this count)
  final int targetXTicks;

  /// Show faint horizontal grid lines
  final bool showGrid;

  /// Number of grid bands (including top). Only used when [showGrid]=true.
  final int yTickCount;

  /// Index to highlight (optional)
  final int? selectedIndex;

  /// Tap callback: (barIndex, point)
  final void Function(int index, SeriesPoint point)? onBarTap;

  /// Show value text inside the bar (top).
  final bool showValues;

  // ---------------- NEW (optional) ----------------

  /// If provided, use this as chart max (helpful to align multiple charts).
  final double? maxYOverride;

  /// Show Y-axis labels on the left (uses nice scaling). Requires [showGrid]=true for best look.
  final bool showYLabels;

  /// Optional override for formatting Y labels (used when [showYLabels] is true).
  final String Function(double value)? yLabelFormatter;

  /// Fraction of each bar column to occupy (0.1 .. 1.0). 0.66 looks neat.
  final double barWidthFactor;

  /// Animation duration for bar growth.
  final Duration animationDuration;

  /// Base bar color (defaults to Fx.mintDark)
  final Color? barColor;

  const BarChartSimple({
    super.key,
    required this.data,
    this.height = 160,
    this.padding = const EdgeInsets.all(12),
    this.targetXTicks = 6,
    this.showGrid = true,
    this.yTickCount = 4,
    this.selectedIndex,
    this.onBarTap,
    this.showValues = false,
    // new
    this.maxYOverride,
    this.showYLabels = false,
    this.yLabelFormatter,
    this.barWidthFactor = 0.66,
    this.animationDuration = const Duration(milliseconds: 260),
    this.barColor,
  });

  @override
  Widget build(BuildContext context) {
    if (data.isEmpty) {
      return SizedBox(
        height: height,
        child: Center(
          child: Text('No data', style: Fx.label.copyWith(color: Fx.text.withValues(alpha: .8))),
        ),
      );
    }

    // Compute maxY safely (ignore non-finite)
    final rawMax = data.fold<double>(0, (a, p) => (p.y.isFinite && p.y > a) ? p.y : a);
    final hasOverride = (maxYOverride ?? 0) > 0;
    final baseMaxY = hasOverride ? maxYOverride!.abs() : rawMax;

    // Nice scale for grid/labels
    final int effectiveYTicks = math.max(1, yTickCount);
    final _NiceScale scale = _niceScale(baseMaxY, math.max(2, effectiveYTicks));
    final maxY = hasOverride ? baseMaxY : scale.niceMax; // use nice max unless caller fixed

    return SizedBox(
      height: height,
      child: Padding(
        padding: padding,
        child: LayoutBuilder(
          builder: (context, c) {
            // Space for labels under bars
            const double xLabelSpace = 24.0;

            // Reserve left gutter if we draw Y labels
            final double yLabelGutter = (showYLabels && effectiveYTicks > 0) ? 44.0 : 0.0;

            final double drawH = (c.maxHeight - xLabelSpace).clamp(0.0, double.infinity);

            // Thin X labels to ~targetXTicks
            final int n = data.length;
            final int step = (n / targetXTicks).ceil().clamp(1, n);

            // Y label formatter
            final fmt = yLabelFormatter ??
                (double v) => NumberFormat.compactCurrency(
                      locale: 'en_IN',
                      symbol: '₹',
                      decimalDigits: 0,
                    ).format(v);

            return Stack(
              children: [
                // Grid (behind bars)
                if (showGrid)
                  Positioned(
                    left: yLabelGutter, // shift grid to leave gutter for Y labels
                    right: 0,
                    top: 0,
                    bottom: xLabelSpace,
                    child: CustomPaint(
                      painter: _GridPainter(
                        bands: effectiveYTicks,
                        color: Fx.mintDark.withValues(alpha: .10),
                        strokeWidth: 1,
                      ),
                    ),
                  ),

                // Optional Y labels
                if (showYLabels && effectiveYTicks > 0)
                  ...List.generate(effectiveYTicks + 1, (i) {
                    final t = i / effectiveYTicks; // 0..1
                    final y = (drawH) - (drawH * t);
                    final value = hasOverride ? (maxY / effectiveYTicks) * i : scale.tick * i;
                    return Positioned(
                      left: 0,
                      top: y - 8, // small vertical center
                      child: SizedBox(
                        width: yLabelGutter - 6,
                        child: Text(
                          fmt(value),
                          textAlign: TextAlign.right,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Fx.label.copyWith(
                            fontSize: 10,
                            color: Fx.text.withValues(alpha: .75),
                          ),
                        ),
                      ),
                    );
                  }),

                // Bars + X labels
                Positioned(
                  left: yLabelGutter,
                  right: 0,
                  top: 0,
                  bottom: 0,
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: List.generate(n, (i) {
                      final SeriesPoint p = data[i];

                      // Safe bar height
                      final double h = (maxY <= 0) ? 0 : (p.y / maxY) * drawH;

                      final bool showLabel = i % step == 0 || i == n - 1;
                      final bool isSel = (selectedIndex != null && selectedIndex == i);

                      // Visuals
                      final Color base = barColor ?? Fx.mintDark;
                      final Color fill = isSel ? base.withValues(alpha: .32) : base.withValues(alpha: .18);
                      final Color stroke = isSel ? base.withValues(alpha: .58) : base.withValues(alpha: .28);

                      final bar = TweenAnimationBuilder<double>(
                        key: ValueKey('${p.x}_${i}_$h'),
                        duration: animationDuration,
                        curve: Curves.easeOutCubic,
                        tween: Tween<double>(begin: 0, end: h),
                        builder: (context, value, child) {
                          return Align(
                            alignment: Alignment.bottomCenter,
                            child: Semantics(
                              label: 'Value ${p.y.toStringAsFixed(0)} for ${p.x}',
                              child: FractionallySizedBox(
                                widthFactor: barWidthFactor.clamp(.1, 1.0),
                                child: Container(
                                  height: value,
                                  decoration: BoxDecoration(
                                    gradient: LinearGradient(
                                      begin: Alignment.topCenter,
                                      end: Alignment.bottomCenter,
                                      colors: [
                                        fill,
                                        base.withValues(alpha: isSel ? .24 : .14),
                                      ],
                                    ),
                                    borderRadius: BorderRadius.circular(8),
                                    border: Border.all(color: stroke),
                                  ),
                                  alignment: Alignment.topCenter,
                                  child: (showValues && value > 18)
                                      ? Padding(
                                          padding: const EdgeInsets.only(top: 2),
                                          child: Text(
                                            p.y.toStringAsFixed(0),
                                            style: Fx.label.copyWith(
                                              fontSize: 9.5,
                                              fontWeight: FontWeight.w800,
                                              color: Fx.text.withValues(alpha: .85),
                                            ),
                                          ),
                                        )
                                      : const SizedBox.shrink(),
                                ),
                              ),
                            ),
                          );
                        },
                      );

                      final barWithTap = (onBarTap == null)
                          ? bar
                          : GestureDetector(
                              behavior: HitTestBehavior.opaque,
                              onTap: () => onBarTap!(i, p),
                              child: bar,
                            );

                      return Expanded(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            // Bar area
                            Flexible(child: barWithTap),
                            const SizedBox(height: 6),
                            // X label (thinned)
                            Text(
                              showLabel ? p.x : '',
                              style: Fx.label.copyWith(fontSize: 10),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ),
                      );
                    }),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _GridPainter extends CustomPainter {
  final int bands;
  final double strokeWidth;
  final Color color;

  const _GridPainter({
    required this.bands,
    required this.color,
    required this.strokeWidth,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (bands <= 0) return;
    final Paint line = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth;

    for (int i = 0; i <= bands; i++) {
      final t = i / bands;
      final y = size.height - (size.height * t);
      canvas.drawLine(Offset(0, y), Offset(size.width, y), line);
    }
  }

  @override
  bool shouldRepaint(covariant _GridPainter old) =>
      old.bands != bands || old.color != color || old.strokeWidth != strokeWidth;
}

/// Nicely-rounded max and tick spacing for Y axis.
class _NiceScale {
  final double niceMax;
  final double tick;
  const _NiceScale(this.niceMax, this.tick);
}

_NiceScale _niceScale(double rawMax, int tickCount) {
  final double max = (rawMax.isFinite && rawMax > 0) ? rawMax : 1.0;
  final double niceTick = _niceNum(max / (tickCount), true);
  final double niceMax = (_niceNum(niceTick * (tickCount), false)).toDouble();
  return _NiceScale(niceMax, niceTick);
}

/// Classic "nice number" for axis tick spacing.
double _niceNum(double range, bool round) {
  final double expv = math.pow(10, (math.log(range) / math.ln10).floor()).toDouble();
  final double f = range / expv; // 1..10
  double nf;
  if (round) {
    if (f < 1.5) {
      nf = 1;
    } else if (f < 3) {
      nf = 2;
    } else if (f < 7) {
      nf = 5;
    } else {
      nf = 10;
    }
  } else {
    if (f <= 1) {
      nf = 1;
    } else if (f <= 2) {
      nf = 2;
    } else if (f <= 5) {
      nf = 5;
    } else {
      nf = 10;
    }
  }
  return nf * expv;
}
