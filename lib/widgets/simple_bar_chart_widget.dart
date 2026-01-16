// lib/widgets/simple_bar_chart_widget.dart

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

// Optional: pass expenses to enable filters + summary
import '../models/expense_item.dart';

class SimpleBarChartWidget extends StatefulWidget {
  final double owe;
  final double owed;

  /// Optional: provide expenses to enable filters + summary
  final List<ExpenseItem>? expenses;

  /// Optional: preset category options; if not provided, derived from expenses
  final List<String>? categoryOptions;

  /// Show filters & summary if expenses are provided (default true when expenses != null)
  final bool? showFilters;

  const SimpleBarChartWidget({
    super.key,
    required this.owe,
    required this.owed,
    this.expenses,
    this.categoryOptions,
    this.showFilters,
  });

  @override
  State<SimpleBarChartWidget> createState() => _SimpleBarChartWidgetState();
}

class _SimpleBarChartWidgetState extends State<SimpleBarChartWidget> {
  String _selectedCategory = 'All';
  DateTimeRange? _range;

  List<String> get _categories {
    if (widget.categoryOptions != null && widget.categoryOptions!.isNotEmpty) {
      return ['All', ...widget.categoryOptions!];
    }
    final ex = widget.expenses ?? [];
    final set = <String>{};
    for (final e in ex) {
      final c =
          (e.category?.trim().isNotEmpty == true ? e.category : e.type)?.trim();
      if (c != null && c.isNotEmpty) set.add(c);
    }
    final list = set.toList()..sort();
    return ['All', ...list];
  }

  List<ExpenseItem> get _filteredExpenses {
    final ex = widget.expenses ?? [];
    if (ex.isEmpty) return ex;

    return ex.where((e) {
      final cat =
          (e.category?.trim().isNotEmpty == true ? e.category : e.type) ?? '';
      final catOk = _selectedCategory == 'All' || cat == _selectedCategory;

      final d = e.date;
      final rangeOk = _range == null ||
          (d.isAfter(_range!.start.subtract(const Duration(milliseconds: 1))) &&
              d.isBefore(_range!.end.add(const Duration(milliseconds: 1))));

      return catOk && rangeOk;
    }).toList();
  }

  double get _sumAmount {
    double total = 0;
    for (final e in _filteredExpenses) {
      total += e.amount;
    }
    return total;
  }

  String _money(double v) => "₹${v.toStringAsFixed(2)}";

  Future<void> _pickRange() async {
    final now = DateTime.now();
    final first = DateTime(now.year - 3, 1, 1);
    final last = DateTime(now.year + 1, 12, 31);
    final picked = await showDateRangePicker(
      context: context,
      firstDate: first,
      lastDate: last,
      initialDateRange: _range ??
          DateTimeRange(
            start: DateTime(now.year, now.month, 1),
            end: now,
          ),
    );
    if (picked != null) {
      setState(() => _range = picked);
    }
  }

  void _quickRange(String key) {
    final now = DateTime.now();
    DateTime start;
    final DateTime end = now;
    if (key == '7') {
      start = now.subtract(const Duration(days: 6));
    } else if (key == '30') {
      start = now.subtract(const Duration(days: 29));
    } else if (key == 'all') {
      setState(() => _range = null);
      return;
    } else {
      // This month
      start = DateTime(now.year, now.month, 1);
    }
    setState(() => _range = DateTimeRange(start: start, end: end));
  }

  @override
  Widget build(BuildContext context) {
    final hasData = widget.owe > 0 || widget.owed > 0;

    // colors
    final positiveColor = Colors.teal.shade400;
    final negativeColor = Colors.redAccent;

    // decide if we show filters/summary
    final showFilters =
        (widget.expenses != null) && (widget.showFilters ?? true);
    final filtered = _filteredExpenses;

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 6),
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 8),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.94),
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.teal.withValues(alpha: 0.10),
            blurRadius: 8,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Column(
        children: [
          if (showFilters) ...[
            // ---- Filter Row ----
            Padding(
              padding: const EdgeInsets.fromLTRB(6, 6, 6, 0),
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  // Category dropdown (compact)
                  SizedBox(
                    height: 40,
                    child: DropdownButtonHideUnderline(
                      child: DropdownButton<String>(
                        value: _categories.contains(_selectedCategory)
                            ? _selectedCategory
                            : 'All',
                        items: _categories
                            .map((c) => DropdownMenuItem(
                                  value: c,
                                  child: Text(
                                    c,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ))
                            .toList(),
                        onChanged: (v) =>
                            setState(() => _selectedCategory = v ?? 'All'),
                        borderRadius: BorderRadius.circular(10),
                        isDense: true,
                      ),
                    ),
                  ),

                  // Date range button
                  OutlinedButton.icon(
                    onPressed: _pickRange,
                    icon: const Icon(Icons.date_range, size: 18),
                    label: Text(
                      _range == null
                          ? "All time"
                          : "${_range!.start.day}/${_range!.start.month} – ${_range!.end.day}/${_range!.end.month}",
                      overflow: TextOverflow.ellipsis,
                    ),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 8),
                      minimumSize: const Size(0, 40),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10)),
                    ),
                  ),

                  // Quick ranges
                  PopupMenuButton<String>(
                    tooltip: 'Quick ranges',
                    onSelected: _quickRange,
                    itemBuilder: (_) => const [
                      PopupMenuItem(value: 'month', child: Text('This month')),
                      PopupMenuItem(value: '7', child: Text('Last 7 days')),
                      PopupMenuItem(value: '30', child: Text('Last 30 days')),
                      PopupMenuItem(value: 'all', child: Text('All time')),
                    ],
                    child: Container(
                      height: 40,
                      padding: const EdgeInsets.symmetric(horizontal: 10),
                      decoration: BoxDecoration(
                        border: Border.all(
                            color: Colors.grey.withValues(alpha: .4)),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Center(child: Text('Range')),
                    ),
                  ),
                ],
              ),
            ),

            // ---- Summary row ----
            Padding(
              padding: const EdgeInsets.fromLTRB(6, 8, 6, 2),
              child: Row(
                children: [
                  _MiniSummaryBox(
                    title: 'Transactions',
                    value: filtered.length.toString(),
                  ),
                  const SizedBox(width: 8),
                  _MiniSummaryBox(
                    title: 'Total',
                    value: _money(_sumAmount),
                  ),
                  const SizedBox(width: 8),
                  _MiniSummaryBox(
                    title: 'Average',
                    value: filtered.isEmpty
                        ? '—'
                        : _money(_sumAmount / filtered.length),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 4),
          ],

          // ---- The existing bar chart (owe vs owed) ----
          hasData
              ? SizedBox(
                  height: 155,
                  width: double.infinity,
                  child: BarChart(
                    BarChartData(
                      barTouchData: BarTouchData(
                        enabled: true,
                        touchTooltipData: BarTouchTooltipData(
                          // No backgroundColor or borderRadius in fl_chart 1.0.0!
                          getTooltipItem: (group, groupIndex, rod, rodIndex) {
                            return BarTooltipItem(
                              group.x == 0
                                  ? 'You Owe: ${_money(widget.owe)}'
                                  : 'Owed To You: ${_money(widget.owed)}',
                              TextStyle(
                                color: group.x == 0 ? Colors.red : Colors.green,
                                fontWeight: FontWeight.w700,
                              ),
                            );
                          },
                        ),
                      ),
                      alignment: BarChartAlignment.spaceEvenly,
                      maxY: [widget.owe, widget.owed]
                                  .reduce((a, b) => a > b ? a : b) *
                              1.35 +
                          30, // margin
                      barGroups: [
                        BarChartGroupData(
                          x: 0,
                          barRods: [
                            BarChartRodData(
                              toY: widget.owe,
                              width: 30,
                              color: negativeColor,
                              borderRadius: BorderRadius.circular(8),
                              backDrawRodData: BackgroundBarChartRodData(
                                show: true,
                                toY: (widget.owe > widget.owed
                                            ? widget.owe
                                            : widget.owed) *
                                        1.35 +
                                    20,
                                color: negativeColor.withValues(alpha: 0.12),
                              ),
                            ),
                          ],
                          showingTooltipIndicators: const [0],
                        ),
                        BarChartGroupData(
                          x: 1,
                          barRods: [
                            BarChartRodData(
                              toY: widget.owed,
                              width: 30,
                              color: positiveColor,
                              borderRadius: BorderRadius.circular(8),
                              backDrawRodData: BackgroundBarChartRodData(
                                show: true,
                                toY: (widget.owe > widget.owed
                                            ? widget.owe
                                            : widget.owed) *
                                        1.35 +
                                    20,
                                color: positiveColor.withValues(alpha: 0.12),
                              ),
                            ),
                          ],
                          showingTooltipIndicators: const [0],
                        ),
                      ],
                      titlesData: FlTitlesData(
                        leftTitles: AxisTitles(
                          sideTitles: SideTitles(
                            showTitles: true,
                            reservedSize: 38,
                            getTitlesWidget: (val, meta) {
                              if (val % 1 != 0) return const SizedBox.shrink();
                              return Text(
                                '₹${val.toInt()}',
                                style: TextStyle(
                                    fontSize: 11, color: Colors.grey[600]),
                              );
                            },
                          ),
                        ),
                        bottomTitles: AxisTitles(
                          sideTitles: SideTitles(
                            showTitles: true,
                            getTitlesWidget: (value, meta) {
                              switch (value.toInt()) {
                                case 0:
                                  return const Padding(
                                    padding: EdgeInsets.only(top: 8),
                                    child: Text(
                                      "You Owe",
                                      style: TextStyle(
                                        color: Colors.redAccent,
                                        fontWeight: FontWeight.bold,
                                        fontSize: 13,
                                      ),
                                    ),
                                  );
                                case 1:
                                  return Padding(
                                    padding: const EdgeInsets.only(top: 8),
                                    child: Text(
                                      "Owed to You",
                                      style: TextStyle(
                                        color: Colors.teal,
                                        fontWeight: FontWeight.bold,
                                        fontSize: 13,
                                      ),
                                    ),
                                  );
                              }
                              return const SizedBox.shrink();
                            },
                          ),
                        ),
                        topTitles: const AxisTitles(
                          sideTitles: SideTitles(showTitles: false),
                        ),
                        rightTitles: const AxisTitles(
                          sideTitles: SideTitles(showTitles: false),
                        ),
                      ),
                      borderData: FlBorderData(show: false),
                      gridData: FlGridData(show: false),
                    ),
                    duration: const Duration(milliseconds: 650),
                    curve: Curves.easeInOutCubic,
                  ),
                )
              : Padding(
                  padding: const EdgeInsets.all(14.0),
                  child: Center(
                    child: Text(
                      "No transactions yet for chart.",
                      style: TextStyle(color: Colors.grey[600]),
                    ),
                  ),
                ),
        ],
      ),
    );
  }
}

class _MiniSummaryBox extends StatelessWidget {
  final String title;
  final String value;
  const _MiniSummaryBox({required this.title, required this.value});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        height: 54,
        decoration: BoxDecoration(
          color: Colors.grey.withValues(alpha: .09),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: Colors.grey.withValues(alpha: .18)),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(title,
                style: TextStyle(fontSize: 11.5, color: Colors.grey[700])),
            const SizedBox(height: 2),
            Text(
              value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style:
                  const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5),
            ),
          ],
        ),
      ),
    );
  }
}
