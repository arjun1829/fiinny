import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

import '../app/theme.dart';
import '../core/format.dart';
import '../features/analytics/models.dart';

const _plotHeight = 168.0;

/// Stacked daily revenue by channel. Bars are capped thin with a 4px rounded
/// data-end, and touching segments are separated by a 2px gap in the surface
/// colour — converted into data units since fl_chart stacks in data space.
class RevenueChart extends StatelessWidget {
  const RevenueChart({super.key, required this.points});

  final List<DailyPoint> points;

  @override
  Widget build(BuildContext context) {
    if (points.isEmpty) {
      return SizedBox(
        height: _plotHeight,
        child: Center(
          child: Text(
            'No billing in this period',
            style: TextStyle(color: AppColors.inkMute, fontSize: 12),
          ),
        ),
      );
    }

    // Keep bars legible on a phone: the most recent 14 days.
    final shown =
        points.length > 14 ? points.sublist(points.length - 14) : points;
    final maxY = shown.fold<double>(0, (m, p) => p.total > m ? p.total : m);
    final top = maxY == 0 ? 1.0 : maxY * 1.18;
    final gap = top * (2 / _plotHeight);

    return SizedBox(
      height: _plotHeight,
      child: BarChart(
        BarChartData(
          alignment: BarChartAlignment.spaceAround,
          maxY: top,
          barTouchData: BarTouchData(
            touchTooltipData: BarTouchTooltipData(
              getTooltipColor: (_) => AppColors.cardHi,
              tooltipBorder: BorderSide(color: AppColors.borderHi),
              tooltipBorderRadius: BorderRadius.all(Radius.circular(10)),
              tooltipPadding:
                  const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
              getTooltipItem: (group, _, __, ___) {
                final p = shown[group.x];
                return BarTooltipItem(
                  '${fmtDayMonth(p.date)}\n',
                  TextStyle(
                      color: AppColors.inkDim,
                      fontSize: 10,
                      fontWeight: FontWeight.w600),
                  children: [
                    TextSpan(
                      text: fmtInr(p.total),
                      style: TextStyle(
                          color: AppColors.ink,
                          fontSize: 13,
                          fontWeight: FontWeight.w700),
                    ),
                  ],
                );
              },
            ),
          ),
          gridData: FlGridData(
            drawVerticalLine: false,
            getDrawingHorizontalLine: (_) =>
                FlLine(color: AppColors.border, strokeWidth: 1),
          ),
          borderData: FlBorderData(show: false),
          titlesData: FlTitlesData(
            topTitles:
                const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            rightTitles:
                const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            leftTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                reservedSize: 42,
                getTitlesWidget: (v, _) => Text(
                  v == 0 ? '' : fmtInrCompact(v),
                  style: kMicro.copyWith(letterSpacing: 0.2),
                ),
              ),
            ),
            bottomTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                reservedSize: 26,
                interval: 1,
                getTitlesWidget: (v, _) {
                  final i = v.toInt();
                  if (i < 0 || i >= shown.length) {
                    return const SizedBox.shrink();
                  }
                  final step = (shown.length / 5).ceil();
                  if (i % step != 0) return const SizedBox.shrink();
                  return Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(fmtDayMonth(shown[i].date), style: kMicro),
                  );
                },
              ),
            ),
          ),
          barGroups: [
            for (var i = 0; i < shown.length; i++)
              BarChartGroupData(
                x: i,
                barRods: [
                  BarChartRodData(
                    toY: shown[i].total,
                    width: 11,
                    color: Colors.transparent,
                    borderRadius: const BorderRadius.vertical(
                      top: Radius.circular(4),
                    ),
                    rodStackItems: _stack(shown[i], gap),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  /// Builds the stack bottom-up, inserting the surface gap only between two
  /// segments that are both actually present.
  List<BarChartRodStackItem> _stack(DailyPoint p, double gap) {
    final segments = <(double, Color)>[
      (p.b2b, AppColors.b2b),
      (p.b2c, AppColors.pos),
      (p.online, AppColors.online),
    ].where((s) => s.$1 > 0).toList();

    final items = <BarChartRodStackItem>[];
    var cursor = 0.0;
    for (var i = 0; i < segments.length; i++) {
      final (value, color) = segments[i];
      final end = cursor + value;
      items.add(BarChartRodStackItem(cursor, end, color));
      cursor = end + (i < segments.length - 1 ? gap : 0);
    }
    return items;
  }
}

/// Identity is never colour alone: every series in the chart is named here.
class ChartLegend extends StatelessWidget {
  const ChartLegend({super.key, required this.items});

  final List<(String, Color)> items;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 14,
      runSpacing: 6,
      children: [
        for (final (label, color) in items)
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: color,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(width: 6),
              Text(label, style: kMicro),
            ],
          ),
      ],
    );
  }
}
