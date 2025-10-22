// lib/widgets/charts/bar_chart_simple.dart
import 'package:flutter/material.dart';

import '../../core/analytics/aggregators.dart';
import '../../themes/tokens.dart';

class BarChartSimple extends StatelessWidget {
  final List<SeriesPoint> data;
  final double height;
  final EdgeInsets padding;
  const BarChartSimple({
    super.key,
    required this.data,
    this.height = 160,
    this.padding = const EdgeInsets.all(12),
  });

  @override
  Widget build(BuildContext context) {
    if (data.isEmpty) {
      return SizedBox(height: height, child: Center(child: Text('No data', style: Fx.label)));
    }
    final maxY = data.map((e) => e.y).fold<double>(0, (a, b) => b > a ? b : a);
    return SizedBox(
      height: height,
      child: Padding(
        padding: padding,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            for (final p in data)
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    Flexible(
                      child: Align(
                        alignment: Alignment.bottomCenter,
                        child: Container(
                          height: maxY <= 0 ? 0 : (p.y / maxY) * (height - 40),
                          decoration: BoxDecoration(
                            color: Fx.mintDark.withOpacity(.18),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: Fx.mintDark.withOpacity(.28)),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      p.x,
                      style: Fx.label.copyWith(fontSize: 10),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
