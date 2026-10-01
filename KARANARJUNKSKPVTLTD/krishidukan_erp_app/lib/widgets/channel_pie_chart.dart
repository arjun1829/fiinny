import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

import '../app/theme.dart';
import '../core/format.dart';
import '../features/analytics/models.dart';

/// Share-of-total by channel. A pie earns its place here — three categories
/// that sum to a whole — unlike the daily trend, which stays a bar chart since
/// it is a time series, not a proportion.
class ChannelPieChart extends StatefulWidget {
  const ChannelPieChart({super.key, required this.byChannel});

  final Map<Channel, double> byChannel;

  @override
  State<ChannelPieChart> createState() => _ChannelPieChartState();
}

class _ChannelPieChartState extends State<ChannelPieChart> {
  int? _touchedIndex;

  static Map<Channel, Color> get _colors => {
        Channel.b2b: AppColors.b2b,
        Channel.b2c: AppColors.pos,
        Channel.online: AppColors.online,
      };

  @override
  Widget build(BuildContext context) {
    final total = widget.byChannel.values.fold<double>(0, (s, v) => s + v);
    final entries = Channel.values
        .map((c) => (c, widget.byChannel[c] ?? 0))
        .where((e) => e.$2 > 0)
        .toList();

    if (total == 0 || entries.isEmpty) {
      return SizedBox(
        height: 168,
        child: Center(
          child: Text(
            'No billing in this period',
            style: TextStyle(color: AppColors.inkMute, fontSize: 12),
          ),
        ),
      );
    }

    return Column(
      children: [
        SizedBox(
          height: 168,
          child: PieChart(
            PieChartData(
              sectionsSpace: 2,
              centerSpaceRadius: 46,
              pieTouchData: PieTouchData(
                touchCallback: (event, response) {
                  setState(() {
                    if (!event.isInterestedForInteractions ||
                        response?.touchedSection == null) {
                      _touchedIndex = null;
                      return;
                    }
                    _touchedIndex =
                        response!.touchedSection!.touchedSectionIndex;
                  });
                },
              ),
              sections: [
                for (var i = 0; i < entries.length; i++)
                  () {
                    final (channel, value) = entries[i];
                    final pct = value / total;
                    final touched = i == _touchedIndex;
                    return PieChartSectionData(
                      value: value,
                      color: _colors[channel],
                      radius: touched ? 42 : 36,
                      title: pct >= 0.08 ? '${(pct * 100).round()}%' : '',
                      titleStyle: TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w700,
                        color: AppColors.bg,
                      ),
                      // 2px surface ring separates adjacent wedges.
                      borderSide: BorderSide(color: AppColors.card, width: 2),
                    );
                  }(),
              ],
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text(fmtInr(total), style: kMicro.copyWith(fontSize: 11)),
        const SizedBox(height: 12),
        Wrap(
          spacing: 16,
          runSpacing: 8,
          alignment: WrapAlignment.center,
          children: [
            for (final (channel, value) in entries)
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: _colors[channel],
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text('${channel.label}  ${fmtInrCompact(value)}',
                      style: kMicro),
                ],
              ),
          ],
        ),
      ],
    );
  }
}
