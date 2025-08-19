import 'package:flutter/material.dart';
import '../services/expense_service.dart';
import '../services/income_service.dart';
import '../models/expense_item.dart';
import '../models/income_item.dart';

class TransactionCountScreen extends StatefulWidget {
  final String userId;
  const TransactionCountScreen({Key? key, required this.userId}) : super(key: key);

  @override
  State<TransactionCountScreen> createState() => _TransactionCountScreenState();
}

class _TransactionCountScreenState extends State<TransactionCountScreen> with SingleTickerProviderStateMixin {
  String _period = 'D'; // D/W/M/Y
  bool _loading = true;
  List<ExpenseItem> _allExpenses = [];
  List<IncomeItem> _allIncomes = [];
  int _totalCount = 0;
  int _expenseCount = 0;
  int _incomeCount = 0;

  List<int> _barCount = [];

  late AnimationController _controller;
  late Animation<double> _animation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 600),
      vsync: this,
    );
    _animation = CurvedAnimation(parent: _controller, curve: Curves.easeOutCubic);
    _fetchData();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _fetchData() async {
    setState(() => _loading = true);
    _allExpenses = await ExpenseService().getExpenses(widget.userId);
    _allIncomes = await IncomeService().getIncomes(widget.userId);
    _updateForPeriod(animate: false);
    setState(() => _loading = false);
  }

  void _updateForPeriod({bool animate = true}) {
    List<ExpenseItem> filteredExpenses = _filteredExpensesForPeriod(_period);
    List<IncomeItem> filteredIncomes = _filteredIncomesForPeriod(_period);

    _expenseCount = filteredExpenses.length;
    _incomeCount = filteredIncomes.length;
    _totalCount = _expenseCount + _incomeCount;

    _barCount = _buildBarData(_period, filteredExpenses, filteredIncomes);

    if (mounted && animate) {
      _controller.forward(from: 0);
    }
  }

  List<ExpenseItem> _filteredExpensesForPeriod(String period) {
    DateTime now = DateTime.now();
    if (period == "D") {
      return _allExpenses.where((e) =>
      e.date.year == now.year && e.date.month == now.month && e.date.day == now.day
      ).toList();
    } else if (period == "W") {
      DateTime startOfWeek = now.subtract(Duration(days: now.weekday - 1));
      DateTime endOfWeek = startOfWeek.add(const Duration(days: 6));
      return _allExpenses.where((e) =>
      e.date.isAfter(startOfWeek.subtract(const Duration(days: 1))) &&
          e.date.isBefore(endOfWeek.add(const Duration(days: 1)))
      ).toList();
    } else if (period == "M") {
      return _allExpenses.where((e) =>
      e.date.year == now.year && e.date.month == now.month
      ).toList();
    } else if (period == "Y") {
      return _allExpenses.where((e) =>
      e.date.year == now.year
      ).toList();
    }
    return _allExpenses;
  }

  List<IncomeItem> _filteredIncomesForPeriod(String period) {
    DateTime now = DateTime.now();
    if (period == "D") {
      return _allIncomes.where((e) =>
      e.date.year == now.year && e.date.month == now.month && e.date.day == now.day
      ).toList();
    } else if (period == "W") {
      DateTime startOfWeek = now.subtract(Duration(days: now.weekday - 1));
      DateTime endOfWeek = startOfWeek.add(const Duration(days: 6));
      return _allIncomes.where((e) =>
      e.date.isAfter(startOfWeek.subtract(const Duration(days: 1))) &&
          e.date.isBefore(endOfWeek.add(const Duration(days: 1)))
      ).toList();
    } else if (period == "M") {
      return _allIncomes.where((e) =>
      e.date.year == now.year && e.date.month == now.month
      ).toList();
    } else if (period == "Y") {
      return _allIncomes.where((e) =>
      e.date.year == now.year
      ).toList();
    }
    return _allIncomes;
  }

  /// Returns List<int>: count for each bar (expenses+incomes)
  List<int> _buildBarData(String period, List<ExpenseItem> expenses, List<IncomeItem> incomes) {
    DateTime now = DateTime.now();
    if (period == "D") {
      List<int> count = List.filled(24, 0);
      for (var e in expenses) { count[e.date.hour] += 1; }
      for (var i in incomes) { count[i.date.hour] += 1; }
      return count;
    } else if (period == "W") {
      List<int> count = List.filled(7, 0);
      for (var e in expenses) { count[e.date.weekday - 1] += 1; }
      for (var i in incomes) { count[i.date.weekday - 1] += 1; }
      return count;
    } else if (period == "M") {
      int days = DateTime(now.year, now.month + 1, 0).day;
      List<int> count = List.filled(days, 0);
      for (var e in expenses) { count[e.date.day - 1] += 1; }
      for (var i in incomes) { count[i.date.day - 1] += 1; }
      return count;
    } else if (period == "Y") {
      List<int> count = List.filled(12, 0);
      for (var e in expenses) { count[e.date.month - 1] += 1; }
      for (var i in incomes) { count[i.date.month - 1] += 1; }
      return count;
    }
    return [];
  }

  String _xLabel(int idx, int barCount) {
    if (barCount == 24) {
      const labels = ['12AM', '6AM', '12PM', '6PM', '11PM'];
      final positions = [0, 6, 12, 18, 23];
      for (int i = 0; i < positions.length; i++) {
        if (idx == positions[i]) return labels[i];
      }
      return '';
    }
    if (barCount == 7) {
      const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
      return days[idx];
    }
    if (barCount == 12) {
      const months = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
      return months[idx];
    }
    if (barCount >= 28 && barCount <= 31) {
      int numLabels = 10;
      List<int> labelIndices = [0, barCount - 1];
      double step = (barCount - 1) / (numLabels - 1);
      for (int i = 1; i < numLabels - 1; i++) {
        int nextIdx = (i * step).round();
        if (!labelIndices.contains(nextIdx)) labelIndices.add(nextIdx);
      }
      labelIndices.sort();
      if (labelIndices.contains(idx)) return '${idx + 1}';
      return '';
    }
    return '';
  }

  @override
  Widget build(BuildContext context) {
    final double chartHeight = 200;
    final double barWidth = 22;
    final double spacing = 8;
    final int barCount = _barCount.length;
    int maxVal = 1;
    for (int i = 0; i < barCount; i++) {
      if (_barCount[i] > maxVal) maxVal = _barCount[i];
    }
    final int ySteps = 5;
    List<int> yAxisVals = List.generate(
      ySteps,
          (i) => ((maxVal / (ySteps - 1)) * i).round(),
    );

    Widget filterBar = Container(
      margin: const EdgeInsets.symmetric(vertical: 7),
      decoration: BoxDecoration(
        color: Colors.grey[50],
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.tealAccent.withOpacity(0.13),
            blurRadius: 9,
            offset: const Offset(0, 6),
          ),
        ],
        border: Border.all(
          color: Colors.teal[100]!,
          width: 1.0,
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: ['D', 'W', 'M', 'Y'].map((p) {
          final selected = _period == p;
          return Expanded(
            child: GestureDetector(
              onTap: () {
                setState(() {
                  _period = p;
                  if (mounted) _updateForPeriod();
                });
              },
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                padding: const EdgeInsets.symmetric(vertical: 7),
                decoration: BoxDecoration(
                  color: selected ? const Color(0xFF6C63FF) : Colors.transparent,
                  borderRadius: BorderRadius.only(
                    topLeft: Radius.circular(p == 'D' ? 18 : 0),
                    bottomLeft: Radius.circular(p == 'D' ? 18 : 0),
                    topRight: Radius.circular(p == 'Y' ? 18 : 0),
                    bottomRight: Radius.circular(p == 'Y' ? 18 : 0),
                  ),
                ),
                child: Center(
                  child: Text(
                    p,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: selected ? Colors.white : Colors.teal[800],
                      letterSpacing: 1.2,
                    ),
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );

    return Scaffold(
      appBar: AppBar(
        title: const Text('Transaction Count'),
        backgroundColor: Colors.white,
        elevation: 0.5,
        foregroundColor: Colors.teal[900],
        centerTitle: true,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              filterBar,
              const SizedBox(height: 40),
              Text(
                _totalCount.toString(),
                style: TextStyle(
                  fontSize: 30,
                  fontWeight: FontWeight.bold,
                  color: const Color(0xFF09857a), // Dark teal for count
                  letterSpacing: 1.2,
                ),
                textAlign: TextAlign.center,
              ),
              Padding(
                padding: const EdgeInsets.only(top: 3, bottom: 5),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    _miniAmount("Income", _incomeCount, Colors.green[700]!),
                    const SizedBox(width: 15),
                    _miniAmount("Expense", _expenseCount, Colors.red[600]!),
                  ],
                ),
              ),
              const Text(
                'Number of Transactions',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 25),
              barCount == 0
                  ? Padding(
                padding: const EdgeInsets.all(40),
                child: Text('No transactions for this period!',
                    style: TextStyle(color: Colors.teal[300])),
              )
                  : Column(
                children: [
                  // The graph area
                  SizedBox(
                    height: chartHeight,
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        // --- Y Axis Labels & Lines ---
                        Column(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: List.generate(ySteps, (i) {
                            final val = yAxisVals[ySteps - 1 - i];
                            return SizedBox(
                              height: (chartHeight-50)/ (ySteps - 1),
                              child: Row(
                                children: [
                                  SizedBox(
                                    width: 52,
                                    child: Text(
                                      val.toString(),
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: i == 0
                                            ? Colors.teal[300]
                                            : Colors.teal[700],
                                        fontWeight: i == 0
                                            ? FontWeight.w800
                                            : FontWeight.w500,
                                      ),
                                      textAlign: TextAlign.right,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                  const SizedBox(width: 6),
                                  Container(
                                    width: 2.2,
                                    height: 1,
                                    color: Colors.teal[100],
                                  ),
                                ],
                              ),
                            );
                          }),
                        ),
                        const SizedBox(width: 7),
                        // --- BAR GRAPH ---
                        Expanded(
                          child: SingleChildScrollView(
                            scrollDirection: Axis.horizontal,
                            child: SizedBox(
                              height: chartHeight,
                              child: AnimatedBuilder(
                                animation: _animation,
                                builder: (context, child) {
                                  double autoBarWidth = barWidth;
                                  double minBarWidth = 8.0;
                                  if (barCount >= 28) {
                                    double maxGraphWidth = MediaQuery.of(context).size.width - 95;
                                    autoBarWidth = (maxGraphWidth / barCount).clamp(minBarWidth, barWidth);
                                  }
                                  return Row(
                                    crossAxisAlignment: CrossAxisAlignment.end,
                                    children: List.generate(barCount, (idx) {
                                      final int val = _barCount[idx];
                                      final double normVal = maxVal == 0 ? 0 : val / maxVal;
                                      return Column(
                                        mainAxisAlignment: MainAxisAlignment.end,
                                        children: [
                                          SizedBox(
                                            width: autoBarWidth,
                                            height: chartHeight - 20,
                                            child: Stack(
                                              alignment: Alignment.bottomCenter,
                                              children: [
                                                if (val > 0)
                                                  AnimatedContainer(
                                                    duration: const Duration(milliseconds: 550),
                                                    curve: Curves.easeInOut,
                                                    width: autoBarWidth,
                                                    height: _animation.value * normVal * (chartHeight - 20),
                                                    margin: EdgeInsets.symmetric(horizontal: spacing / 2),
                                                    decoration: BoxDecoration(
                                                      borderRadius: BorderRadius.circular(7),
                                                      color: Colors.teal[400]!.withOpacity(0.84),
                                                    ),
                                                  ),
                                              ],
                                            ),
                                          ),
                                        ],
                                      );
                                    }),
                                  );
                                },
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  // X AXIS LINE
                  Container(
                    height: 1.7,
                    color: Colors.grey[300],
                    margin: const EdgeInsets.symmetric(vertical: 2),
                  ),
                  // --- X AXIS LABELS (ALWAYS BELOW AXIS LINE) ---
                  Padding(
                    padding: const EdgeInsets.only(top: 0),
                    child: Row(
                      children: [
                        const SizedBox(width: 60), // Space for Y axis
                        Expanded(
                          child: SingleChildScrollView(
                            scrollDirection: Axis.horizontal,
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: List.generate(barCount, (idx) {
                                double autoBarWidth = barWidth;
                                double minBarWidth = 8.0;
                                if (barCount >= 28) {
                                  double maxGraphWidth = MediaQuery.of(context).size.width - 95;
                                  autoBarWidth = (maxGraphWidth / barCount).clamp(minBarWidth, barWidth);
                                }
                                if (barCount == 24) {
                                  autoBarWidth = 17;
                                }
                                return Container(
                                  alignment: Alignment.topCenter,
                                  width: (barCount == 24) ? 32 : autoBarWidth,
                                  child: _xLabel(idx, barCount).isNotEmpty
                                      ? Text(
                                    _xLabel(idx, barCount),
                                    style: TextStyle(
                                      color: Colors.teal[700],
                                      fontSize: barCount == 24 ? 9 : (barCount >= 28 ? 8 : 13),
                                      fontWeight: FontWeight.w700,
                                      letterSpacing: 0.3,
                                    ),
                                    textAlign: TextAlign.center,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  )
                                      : const SizedBox.shrink(),
                                );
                              }),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 40),
              Center(
                child: ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.teal[600],
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 38, vertical: 17),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    elevation: 7,
                    shadowColor: Colors.teal[200],
                  ),
                  icon: const Icon(Icons.numbers_rounded),
                  label: const Text("View all Transactions"),
                  onPressed: () {
                    Navigator.pushNamed(context, '/expenses', arguments: widget.userId);
                  },
                ),
              ),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }

  Widget _miniAmount(String label, int value, Color color) {
    return Row(
      children: [
        Icon(label == "Income" ? Icons.arrow_downward : Icons.arrow_upward,
            size: 15, color: color.withOpacity(0.83)),
        const SizedBox(width: 2),
        Text(
          '$label:',
          style: TextStyle(
            fontSize: 11.2,
            fontWeight: FontWeight.w600,
            color: color.withOpacity(0.90),
          ),
        ),
        const SizedBox(width: 2),
        Text(
          value.toString(),
          style: TextStyle(
            fontSize: 12.2,
            fontWeight: FontWeight.bold,
            color: color,
            letterSpacing: 0.3,
          ),
        ),
      ],
    );
  }
}
