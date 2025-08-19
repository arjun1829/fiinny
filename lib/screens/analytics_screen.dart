import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import '../models/transaction_item.dart';
import '../services/sqlite_service.dart';

class AnalyticsScreen extends StatefulWidget {
  const AnalyticsScreen({Key? key}) : super(key: key);

  @override
  State<AnalyticsScreen> createState() => _AnalyticsScreenState();
}

class _AnalyticsScreenState extends State<AnalyticsScreen> {
  List<TransactionItem> allTransactions = [];
  List<TransactionItem> filteredTransactions = [];
  double income = 0;
  double expense = 0;
  String _selectedFilter = "Month";

  Map<String, double> expenseByCategory = {};

  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadTransactions();
  }

  Future<void> _loadTransactions() async {
    setState(() => _loading = true);
    allTransactions = await SQLiteService().getTransactions();
    if (!mounted) return;
    _applyFilter();
  }

  void _applyFilter() {
    final now = DateTime.now();
    List<TransactionItem> filtered = [];
    if (_selectedFilter == "All") {
      filtered = allTransactions;
    } else if (_selectedFilter == "Month") {
      filtered = allTransactions
          .where((t) => t.date.month == now.month && t.date.year == now.year)
          .toList();
    } else if (_selectedFilter == "Week") {
      final thisWeek = now.subtract(Duration(days: now.weekday - 1));
      filtered = allTransactions
          .where((t) =>
      t.date.isAfter(thisWeek.subtract(const Duration(days: 1))) &&
          t.date.isBefore(now.add(const Duration(days: 1))))
          .toList();
    } else if (_selectedFilter == "Quarter") {
      final currentQuarter = ((now.month - 1) ~/ 3) + 1;
      final startMonth = (currentQuarter - 1) * 3 + 1;
      final quarterStart = DateTime(now.year, startMonth, 1);
      filtered = allTransactions
          .where((t) =>
      t.date.isAfter(quarterStart.subtract(const Duration(days: 1))) &&
          t.date.isBefore(now.add(const Duration(days: 1))))
          .toList();
    } else if (_selectedFilter == "Year") {
      filtered = allTransactions.where((t) => t.date.year == now.year).toList();
    }

    income = filtered
        .where((t) => t.type == TransactionType.credit)
        .fold(0.0, (a, b) => a + b.amount);
    expense = filtered
        .where((t) => t.type == TransactionType.debit)
        .fold(0.0, (a, b) => a + b.amount);

    _updateExpenseByCategory(filtered);

    setState(() {
      filteredTransactions = filtered;
      _loading = false;
    });
  }

  void _updateExpenseByCategory(List<TransactionItem> tx) {
    expenseByCategory.clear();
    for (final t in tx) {
      if (t.type == TransactionType.debit) {
        expenseByCategory[t.category] = (expenseByCategory[t.category] ?? 0) + t.amount;
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("Analytics"),
        backgroundColor: Colors.deepPurple,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : filteredTransactions.isEmpty
          ? Center(child: Text("No data to analyze for $_selectedFilter."))
          : Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          children: [
            // --- Filter Dropdown ---
            Row(
              children: [
                const Text("Show:",
                    style: TextStyle(
                        fontWeight: FontWeight.bold, fontSize: 16)),
                const SizedBox(width: 12),
                DropdownButton<String>(
                  value: _selectedFilter,
                  items: ["Week", "Month", "Quarter", "Year", "All"]
                      .map((e) =>
                      DropdownMenuItem(value: e, child: Text(e)))
                      .toList(),
                  onChanged: (val) {
                    if (val != null) {
                      setState(() => _selectedFilter = val);
                      _applyFilter();
                    }
                  },
                ),
              ],
            ),
            const SizedBox(height: 16),
            // --- Summary Tile ---
            Card(
              color: Colors.white,
              elevation: 3,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(18)),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                    vertical: 12.0, horizontal: 16.0),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    _summaryStat("Income", income, Colors.green),
                    _summaryStat("Expense", expense, Colors.red),
                    _summaryStat(
                        "Savings", income - expense, Colors.blue),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),
            // --- Income vs Expenses Pie ---
            const Text("Income vs Expenses",
                style:
                TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 18),
            AspectRatio(
              aspectRatio: 1.5,
              child: PieChart(
                PieChartData(
                  sections: [
                    PieChartSectionData(
                      value: income,
                      color: Colors.greenAccent,
                      radius: 50,
                      badgeWidget: _pieBadge("Income", Colors.greenAccent),
                      badgePositionPercentageOffset: 0.95,
                    ),
                    PieChartSectionData(
                      value: expense,
                      color: Colors.redAccent,
                      radius: 50,
                      badgeWidget: _pieBadge("Expense", Colors.redAccent),
                      badgePositionPercentageOffset: 0.95,
                    ),
                  ],
                  sectionsSpace: 3,
                  centerSpaceRadius: 30,
                ),
              ),
            ),
            const SizedBox(height: 32),
            // --- Expense Breakdown by Category ---
            const Text("Expense Breakdown by Category",
                style: TextStyle(
                    fontSize: 18, fontWeight: FontWeight.w600)),
            const SizedBox(height: 12),
            AspectRatio(
              aspectRatio: 1.5,
              child: PieChart(
                PieChartData(
                  sections: _expenseCategorySections(),
                  sectionsSpace: 3,
                  centerSpaceRadius: 28,
                  pieTouchData: PieTouchData(
                    touchCallback: (event, response) {
                      if (response != null &&
                          response.touchedSection != null) {
                        final index =
                            response.touchedSection!.touchedSectionIndex;
                        final category =
                        expenseByCategory.keys.toList()[index];
                        _showTransactionListForCategory(category);
                      }
                    },
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _summaryStat(String label, double value, Color color) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label,
          style: TextStyle(fontWeight: FontWeight.bold, color: color),
        ),
        const SizedBox(height: 4),
        Text(
          "₹${value.toStringAsFixed(0)}",
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.bold,
            color: color,
          ),
        ),
      ],
    );
  }

  Widget _pieBadge(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withOpacity(0.8),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: const TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w500,
          fontSize: 11,
        ),
      ),
    );
  }

  List<PieChartSectionData> _expenseCategorySections() {
    final colors = [
      Colors.red,
      Colors.orange,
      Colors.purple,
      Colors.teal,
      Colors.brown,
      Colors.cyan,
      Colors.amber,
      Colors.pink
    ];
    int i = 0;
    return expenseByCategory.entries.map((e) {
      final section = PieChartSectionData(
        value: e.value,
        color: colors[i % colors.length],
        radius: 40,
        badgeWidget: Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(
            color: Colors.black.withOpacity(0.7),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(
            e.key,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w500,
              fontSize: 11,
            ),
          ),
        ),
        badgePositionPercentageOffset: 1.15,
      );
      i++;
      return section;
    }).toList();
  }

  void _showTransactionListForCategory(String category) {
    final list = filteredTransactions
        .where((t) => t.type == TransactionType.debit && t.category == category)
        .toList();

    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text("Transactions: $category",
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              const Divider(),
              ...list.map((t) => ListTile(
                leading: const Icon(Icons.circle, color: Colors.redAccent),
                title: Text("₹${t.amount.toStringAsFixed(0)}"),
                subtitle: Text(
                    "${t.note}\n${t.date.day}/${t.date.month}/${t.date.year}"),
                isThreeLine: true,
              )),
              if (list.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(12.0),
                  child: Text("No transactions found.",
                      style: TextStyle(color: Colors.grey)),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
