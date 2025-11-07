import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';

import '../../core/formatters/inr.dart';
import '../../themes/tokens.dart';

class DonutSlice {
  final String label;
  final double value;
  final Color? color;

  const DonutSlice({
    required this.label,
    required this.value,
    this.color,
  });
}

class DonutChartSimple extends StatelessWidget {
  final List<DonutSlice> slices;
  final double height;
  final double centerSpace;
  final bool showCenterTotal;
  final String? centerLabel;
  final void Function(int index, DonutSlice slice)? onSliceTap;

  const DonutChartSimple({
    super.key,
    required this.slices,
    this.height = 220,
    this.centerSpace = 48,
    this.showCenterTotal = true,
    this.centerLabel,
    this.onSliceTap,
  });

  double get total => slices.fold<double>(0, (sum, slice) {
        final value = slice.value;
        if (value.isNaN || !value.isFinite) return sum;
        if (value < 0) return sum;
        return sum + value;
      });

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final totalValue = total;
    final palette = <Color>[
      Fx.mint,
      Fx.bad,
      Fx.warn,
      Fx.good,
      const Color(0xFF3B82F6),
      const Color(0xFF6366F1),
      const Color(0xFF14B8A6),
      const Color(0xFF6B7280),
    ];

    final sections = <PieChartSectionData>[];
    final sectionToSlice = <int>[];
    for (var i = 0; i < slices.length; i++) {
      final slice = slices[i];
      final rawValue = slice.value;
      if (!rawValue.isFinite || rawValue <= 0) continue;
      final color = slice.color ?? palette[i % palette.length];
      final pct = totalValue == 0 ? 0.0 : (rawValue / totalValue);
      sections.add(
        PieChartSectionData(
          value: rawValue,
          color: color,
          radius: height * 0.35,
          title: totalValue == 0 ? '' : '${(pct * 100).clamp(0, 100).toStringAsFixed(0)}%',
          titleStyle: textTheme.labelLarge?.copyWith(
            color: Colors.white,
            fontWeight: FontWeight.w600,
          ),
        ),
      );
      sectionToSlice.add(i);
    }

    final chartSections = sections.isEmpty
        ? [
            PieChartSectionData(
              value: 1,
              color: Colors.grey.shade200,
              radius: height * 0.35,
              title: '',
            ),
          ]
        : sections;

    return SizedBox(
      height: height,
      child: Stack(
        alignment: Alignment.center,
        children: [
          PieChart(
            PieChartData(
              sections: chartSections,
              centerSpaceRadius: centerSpace,
              sectionsSpace: 2,
              startDegreeOffset: -90,
              borderData: FlBorderData(show: false),
              pieTouchData: PieTouchData(
                touchCallback: (event, response) {
                  if (onSliceTap == null) return;
                  if (!event.isInterestedForInteractions) return;
                  final index = response?.touchedSection?.touchedSectionIndex;
                  if (index == null || index < 0 || index >= sectionToSlice.length) {
                    return;
                  }
                  if (event is FlTapUpEvent) {
                    final sliceIndex = sectionToSlice[index];
                    onSliceTap?.call(sliceIndex, slices[sliceIndex]);
                  }
                },
              ),
            ),
          ),
          if (showCenterTotal)
            Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  centerLabel ?? 'Total',
                  style: textTheme.labelMedium?.copyWith(
                    color: Fx.text.withOpacity(.6),
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  INR.f(totalValue),
                  style: textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: Fx.textStrong,
                  ),
                ),
              ],
            ),
        ],
      ),
    );
  }
}
