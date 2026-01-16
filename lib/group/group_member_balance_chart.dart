// lib/group/group_member_balance_chart.dart
import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

/// Visualizes per-member net balances for a group.
/// netByMember: phone -> net amount (+ means they are owed money, - means they owe)
/// displayNames: phone -> short display name (e.g., "You", "Alice")
class GroupMemberBalanceChart extends StatelessWidget {
  final Map<String, double> netByMember;
  final Map<String, String> displayNames;

  const GroupMemberBalanceChart({
    Key? key,
    required this.netByMember,
    required this.displayNames,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    // Keep only meaningful non-zero entries
    final entries = netByMember.entries
        .where((e) => e.value.abs() >= 0.005)
        .toList()
      ..sort((a, b) => b.value.abs().compareTo(a.value.abs())); // by magnitude

    if (entries.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Text(
          'No member balances to show.',
          style: TextStyle(color: Colors.grey[700]),
        ),
      );
    }

    final labels = <int, String>{};
    double maxAbs = 0;
    for (var i = 0; i < entries.length; i++) {
      final e = entries[i];
      labels[i] = _shortName(displayNames[e.key] ?? e.key);
      final v = e.value.abs();
      if (v > maxAbs) maxAbs = v;
    }
    // pad a bit for headroom
    final maxY = (maxAbs == 0 ? 100.0 : maxAbs) * 1.25;

    // layout sizing
    const barWidth = 22.0;
    final groupSpacing = 20.0;
    final chartPixelWidth =
        (entries.length * (barWidth + groupSpacing)) + 40; // rough

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SizedBox(
          height: 280,
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: SizedBox(
              width: chartPixelWidth.clamp(340.0, double.infinity),
              child: BarChart(
                BarChartData(
                  minY: -maxY,
                  maxY: maxY,
                  barTouchData: BarTouchData(
                    enabled: true,
                    touchTooltipData: BarTouchTooltipData(
                      getTooltipItem: (group, groupIndex, rod, rodIndex) {
                        final phone = entries[group.x.toInt()].key;
                        final name = displayNames[phone] ?? phone;
                        final amt = rod.toY;
                        return BarTooltipItem(
                          '$name\n₹${amt.toStringAsFixed(2)}',
                          TextStyle(
                            fontWeight: FontWeight.w800,
                            color: amt >= 0
                                ? Colors.teal.shade800
                                : Colors.redAccent,
                          ),
                        );
                      },
                    ),
                  ),
                  gridData: FlGridData(
                    show: true,
                    drawVerticalLine: false,
                    getDrawingHorizontalLine: (v) => FlLine(
                      color: Colors.grey.withValues(alpha: 0.18),
                      strokeWidth: 1,
                    ),
                  ),
                  titlesData: FlTitlesData(
                    leftTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        reservedSize: 44,
                        getTitlesWidget: (v, meta) => Text(
                          '₹${v.toInt()}',
                          style:
                              TextStyle(fontSize: 11, color: Colors.grey[700]),
                        ),
                      ),
                    ),
                    rightTitles: const AxisTitles(
                      sideTitles: SideTitles(showTitles: false),
                    ),
                    topTitles: const AxisTitles(
                      sideTitles: SideTitles(showTitles: false),
                    ),
                    bottomTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        getTitlesWidget: (value, meta) {
                          final label = labels[value.toInt()] ?? '';
                          return Padding(
                            padding: const EdgeInsets.only(top: 6),
                            child: Transform.rotate(
                              angle:
                                  0, // keep horizontal; change to -0.6 for diagonal
                              child: Text(
                                label,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 11,
                                  color: Colors.grey[900],
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  ),
                  borderData: FlBorderData(show: false),
                  alignment: BarChartAlignment.spaceAround,
                  barGroups: List.generate(entries.length, (i) {
                    final v = entries[i].value;
                    final isPos = v >= 0;
                    return BarChartGroupData(
                      x: i,
                      barsSpace: 0,
                      barRods: [
                        BarChartRodData(
                          toY: v,
                          width: barWidth,
                          color: isPos ? Colors.teal : Colors.redAccent,
                          borderRadius: BorderRadius.circular(6),
                          backDrawRodData: BackgroundBarChartRodData(
                            show: true,
                            toY: isPos ? maxY : -maxY,
                            color: (isPos ? Colors.teal : Colors.redAccent)
                                .withValues(alpha: 0.10),
                          ),
                        ),
                      ],
                    );
                  }),
                ),
                duration: const Duration(milliseconds: 500),
                curve: Curves.easeInOutCubic,
              ),
            ),
          ),
        ),
        const SizedBox(height: 8),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _legendDot(color: Colors.teal),
            const SizedBox(width: 6),
            const Text('Gets (is owed)'),
            const SizedBox(width: 18),
            _legendDot(color: Colors.redAccent),
            const SizedBox(width: 6),
            const Text('Owes'),
          ],
        ),
      ],
    );
  }

  String _shortName(String name) {
    // keep labels compact
    if (name.length <= 10) return name;
    return '${name.substring(0, 9)}…';
  }

  Widget _legendDot({required Color color}) {
    return Container(
      width: 10,
      height: 10,
      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
    );
  }
}
