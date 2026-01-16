import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:intl/intl.dart';
import '../../models/expense_item.dart';

class SpendSummaryCard extends StatelessWidget {
  final double totalSpent;
  final List<ExpenseItem> expenses;
  final DateTime startDate;
  final DateTime endDate;

  const SpendSummaryCard({
    super.key,
    required this.totalSpent,
    required this.expenses,
    required this.startDate,
    required this.endDate,
  });

  @override
  Widget build(BuildContext context) {
    final currencyFormat =
        NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 20,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Total Spent',
            style: TextStyle(
              color: Colors.grey,
              fontSize: 14,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            currencyFormat.format(totalSpent),
            style: const TextStyle(
              color: Colors.black,
              fontSize: 32,
              fontWeight: FontWeight.bold,
              letterSpacing: -0.5,
            ),
          ),
          const SizedBox(height: 24),
          SizedBox(
            height: 180,
            child: _DailyBarChart(
              expenses: expenses,
              startDate: startDate,
              endDate: endDate,
            ),
          ),
        ],
      ),
    );
  }
}

class _DailyBarChart extends StatelessWidget {
  final List<ExpenseItem> expenses;
  final DateTime startDate;
  final DateTime endDate;

  const _DailyBarChart({
    required this.expenses,
    required this.startDate,
    required this.endDate,
  });

  @override
  Widget build(BuildContext context) {
    if (expenses.isEmpty) {
      return const Center(child: Text('No data'));
    }

    // Group expenses by day index (0 to days-1)
    final Map<int, double> dailyTotals = {};

    final days = endDate.difference(startDate).inDays + 1;

    for (int i = 0; i < days; i++) {
      dailyTotals[i] = 0; // Initialize
    }

    for (var e in expenses) {
      if (e.date.isAfter(startDate.subtract(const Duration(seconds: 1))) &&
          e.date.isBefore(endDate.add(const Duration(seconds: 1)))) {
        final index = e.date.difference(startDate).inDays;
        if (index >= 0 && index < days) {
          dailyTotals[index] = (dailyTotals[index] ?? 0) + e.amount;
        }
      }
    }

    final List<BarChartGroupData> barGroups = [];
    double maxY = 0;

    for (int i = 0; i < days; i++) {
      final amount = dailyTotals[i] ?? 0;
      if (amount > maxY) maxY = amount;

      barGroups.add(
        BarChartGroupData(
          x: i,
          barRods: [
            BarChartRodData(
              toY: amount,
              color: const Color(0xFF159E8A),
              width: days > 20 ? 6 : 12,
              borderRadius: BorderRadius.circular(4),
              backDrawRodData: BackgroundBarChartRodData(
                show: true,
                toY: maxY * 1.1 == 0 ? 100 : maxY * 1.1,
                color: const Color(0xFFF0FDF4),
              ),
            ),
          ],
        ),
      );
    }

    if (maxY == 0) maxY = 100;

    return BarChart(
      BarChartData(
        alignment: BarChartAlignment.spaceAround,
        maxY: maxY * 1.2,
        barGroups: barGroups,
        barTouchData: BarTouchData(
          touchTooltipData: BarTouchTooltipData(
            getTooltipColor: (_) => Colors.black87,
            getTooltipItem: (group, groupIndex, rod, rodIndex) {
              final day = startDate.add(Duration(days: group.x.toInt()));
              return BarTooltipItem(
                '${DateFormat('MMM d').format(day)}\n₹${rod.toY.round()}',
                const TextStyle(
                    color: Colors.white, fontWeight: FontWeight.bold),
              );
            },
          ),
        ),
        titlesData: FlTitlesData(
          show: true,
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              getTitlesWidget: (value, meta) {
                final index = value.toInt();
                if (index < 0 || index >= days) return const SizedBox.shrink();

                final day = startDate.add(Duration(days: index));

                // Show label every 5 days or if total days is small
                bool showLabel = false;
                if (days <= 7) {
                  showLabel = true;
                } else if (days <= 31) {
                  showLabel = index % 5 == 0;
                } else {
                  showLabel = index % 10 == 0;
                }

                if (showLabel) {
                  return Padding(
                    padding: const EdgeInsets.only(top: 8.0),
                    child: Text(
                      DateFormat('d').format(day),
                      style: const TextStyle(
                        color: Colors.grey,
                        fontSize: 10,
                      ),
                    ),
                  );
                }
                return const SizedBox.shrink();
              },
            ),
          ),
          leftTitles:
              const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          topTitles:
              const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          rightTitles:
              const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        ),
        gridData: const FlGridData(show: false),
        borderData: FlBorderData(show: false),
      ),
    );
  }
}
