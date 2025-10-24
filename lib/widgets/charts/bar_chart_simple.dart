// lib/widgets/charts/bar_chart_simple.dart
import 'package:flutter/material.dart';

import '../../core/analytics/aggregators.dart';
import '../../themes/tokens.dart';

/// Minimal, pretty bar chart with:
/// - Responsive label thinning (via [targetXTicks])
/// - Optional grid lines
/// - Smooth height animation on updates
/// - Optional tap highlight & callback
/// Back-compat: original constructor args still work.
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

  /// Show value text inside the bar (top). Defaults to false.
  final bool showValues;

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
  });

  @override
  Widget build(BuildContext context) {
    if (data.isEmpty) {
      return SizedBox(
        height: height,
        child: Center(child: Text('No data', style: Fx.label)),
      );
    }

    // max Y (avoid NaN/infinity)
    final double maxY = data
        .map((e) => e.y)
        .fold<double>(0, (a, b) => b.isFinite && b > a ? b : a);

    return SizedBox(
      height: height,
      child: Padding(
        padding: padding,
        child: LayoutBuilder(
          builder: (context, c) {
            // Space for labels under bars
            const double labelSpace = 24.0;
            final double drawH =
                (c.maxHeight - labelSpace).clamp(0.0, double.infinity);

            // Determine label thinning step so we show ~targetXTicks labels.
            final int n = data.length;
            final int step = (n / targetXTicks).ceil().clamp(1, n);

            return Stack(
              children: [
                // Grid (behind bars)
                if (showGrid)
                  Positioned.fill(
                    child: CustomPaint(
                      painter: _GridPainter(
                        bands: yTickCount,
                        bottomGap: labelSpace,
                      ),
                    ),
                  ),

                // Bars + labels
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: List.generate(n, (i) {
                    final SeriesPoint p = data[i];

                    // Safe bar height
                    final double h = (maxY <= 0) ? 0 : (p.y / maxY) * drawH;

                    final bool showLabel = i % step == 0 || i == n - 1;
                    final bool isSel = (selectedIndex != null && selectedIndex == i);

                    // Visuals
                    final Color base = Fx.mintDark;
                    final Color fill = isSel
                        ? base.withOpacity(.30)
                        : base.withOpacity(.18);
                    final Color stroke = isSel
                        ? base.withOpacity(.55)
                        : base.withOpacity(.28);

                    final bar = TweenAnimationBuilder<double>(
                      key: ValueKey('${p.x}_${i}_$h'), // <-- FIXED: ${i}
                      duration: const Duration(milliseconds: 260),
                      curve: Curves.easeOutCubic,
                      tween: Tween<double>(begin: 0, end: h),
                      builder: (context, value, child) {
                        return Align(
                          alignment: Alignment.bottomCenter,
                          child: Semantics(
                            label: 'Value ${p.y.toStringAsFixed(0)} for ${p.x}',
                            child: Container(
                              height: value,
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  begin: Alignment.topCenter,
                                  end: Alignment.bottomCenter,
                                  colors: [
                                    fill,
                                    base.withOpacity(isSel ? .22 : .14),
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
                                          color: Fx.text.withOpacity(.85),
                                        ),
                                      ),
                                    )
                                  : const SizedBox.shrink(),
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
                          // Bar
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
  final double bottomGap;
  _GridPainter({required this.bands, required this.bottomGap});

  @override
  void paint(Canvas canvas, Size size) {
    if (bands <= 0) return;
    final double usableH = (size.height - bottomGap).clamp(0.0, double.infinity);

    final Paint line = Paint()
      ..color = Fx.mintDark.withOpacity(.10)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;

    for (int i = 0; i <= bands; i++) {
      final double t = i / bands;
      final double y = (size.height - bottomGap) - (usableH * t);
      canvas.drawLine(Offset(0, y), Offset(size.width, y), line);
    }
  }

  @override
  bool shouldRepaint(covariant _GridPainter old) =>
      old.bands != bands || old.bottomGap != bottomGap;
}
