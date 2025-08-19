import 'package:flutter/material.dart';
import '../services/expense_service.dart';
import '../services/income_service.dart';
import '../models/expense_item.dart';
import '../models/income_item.dart';

class TransactionAmountScreen extends StatefulWidget {
  final String userId;
  const TransactionAmountScreen({Key? key, required this.userId}) : super(key: key);

  @override
  State<TransactionAmountScreen> createState() => _TransactionAmountScreenState();
}

class _TransactionAmountScreenState extends State<TransactionAmountScreen> with SingleTickerProviderStateMixin {
  String _period = 'D'; // D/W/M/Y
  bool _loading = true;
  List<ExpenseItem> _allExpenses = [];
  List<IncomeItem> _allIncomes = [];
  double _totalAmount = 0.0;
  double _credit = 0.0;
  double _debit = 0.0;

  List<double> _barCredit = [];
  List<double> _barDebit = [];

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

    _debit = filteredExpenses.fold(0.0, (a, b) => a + b.amount);
    _credit = filteredIncomes.fold(0.0, (a, b) => a + b.amount);
    _totalAmount = _debit + _credit;

    final barPair = _barDataCreditDebit(_period, filteredExpenses, filteredIncomes);
    _barDebit = barPair[0];
    _barCredit = barPair[1];

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

  /// Returns a tuple: [barDebit, barCredit], both List<double>
  List<List<double>> _barDataCreditDebit(String period, List<ExpenseItem> expenses, List<IncomeItem> incomes) {
    DateTime now = DateTime.now();
    if (period == "D") {
      List<double> debit = List.filled(24, 0.0);
      List<double> credit = List.filled(24, 0.0);
      for (var e in expenses) { debit[e.date.hour] += e.amount; }
      for (var i in incomes) { credit[i.date.hour] += i.amount; }
      return [debit, credit];
    } else if (period == "W") {
      List<double> debit = List.filled(7, 0.0);
      List<double> credit = List.filled(7, 0.0);
      for (var e in expenses) { debit[e.date.weekday - 1] += e.amount; }
      for (var i in incomes) { credit[i.date.weekday - 1] += i.amount; }
      return [debit, credit];
    } else if (period == "M") {
      int days = DateTime(now.year, now.month + 1, 0).day;
      List<double> debit = List.filled(days, 0.0);
      List<double> credit = List.filled(days, 0.0);
      for (var e in expenses) { debit[e.date.day - 1] += e.amount; }
      for (var i in incomes) { credit[i.date.day - 1] += i.amount; }
      return [debit, credit];
    } else if (period == "Y") {
      List<double> debit = List.filled(12, 0.0);
      List<double> credit = List.filled(12, 0.0);
      for (var e in expenses) { debit[e.date.month - 1] += e.amount; }
      for (var i in incomes) { credit[i.date.month - 1] += i.amount; }
      return [debit, credit];
    }
    return [[], []];
  }

  String _xLabel(int idx, int barCount) {
    if (barCount == 24) {
      // Only 5 evenly distributed labels (not all)
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
        if (!labelIndices.contains(nextIdx)) {
          labelIndices.add(nextIdx);
        }
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
    final int barCount = _barDebit.length;
    double maxVal = 1.0;
    for (int i = 0; i < barCount; i++) {
      final total = _barDebit[i] + _barCredit[i];
      if (total > maxVal) maxVal = total;
    }
    final int ySteps = 5;
    List<double> yAxisVals = List.generate(
      ySteps,
          (i) => (maxVal / (ySteps - 1)) * i,
    );

    Widget filterBar = Container(
      margin: const EdgeInsets.symmetric(vertical: 7),
      decoration: BoxDecoration(
        color: Color(0xFFF2FBFB), // Light finance blueish
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.tealAccent.withOpacity(0.08),
            blurRadius: 7,
            offset: const Offset(0, 4),
          ),
        ],
        border: Border.all(
          color: Color(0xFFB3E0E6),
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
                  color: selected ? const Color(0xFF2C5AFF) : Colors.transparent,
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
                      color: selected ? Colors.white : Color(0xFF37536B),
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
      backgroundColor: Color(0xFFF9FAFB), // Almost white
      appBar: AppBar(
        title: const Text('Transaction Amount'),
        backgroundColor: Colors.white,
        elevation: 0.5,
        foregroundColor: Color(0xFF334155),
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
                '₹${_totalAmount.toStringAsFixed(0)}',
                style: TextStyle(
                  fontSize: 30,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF2C5AFF), // Clean finance blue
                  letterSpacing: 1.2,
                ),
                textAlign: TextAlign.center,
              ),
              Padding(
                padding: const EdgeInsets.only(top: 3, bottom: 5),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    _miniAmount("Credit", _credit, Color(0xFF13CE66)),
                    const SizedBox(width: 15),
                    _miniAmount("Debit", _debit, Color(0xFFF85149)),
                  ],
                ),
              ),
              const Text(
                'Transaction Amount',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: Color(0xFF37536B)),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 25),
              // --- GRAPH AREA (ALWAYS FIXED HEIGHT, NEVER EXPANDED) ---
              barCount == 0
                  ? Padding(
                padding: const EdgeInsets.all(40),
                child: Text('No transactions for this period!',
                    style: TextStyle(color: Color(0xFFB4BCC5))),
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
                                      '₹${val.toInt()}',
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: i == 0
                                            ? Color(0xFF13CE66)
                                            : Color(0xFF66788A),
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
                                    color: Color(0xFFE3EAF2),
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
                                  // Dynamically shrink bar width for high barCount
                                  double autoBarWidth = barWidth;
                                  double minBarWidth = 8.0;
                                  if (barCount >= 28) {
                                    double maxGraphWidth = MediaQuery.of(context).size.width - 95;
                                    autoBarWidth = (maxGraphWidth / barCount).clamp(minBarWidth, barWidth);
                                  }
                                  return Stack(
                                    children: [
                                      // Y-axis grid lines (vertical)
                                      Positioned.fill(
                                        child: CustomPaint(
                                          painter: _VerticalGridLinesPainter(barCount: barCount, barWidth: autoBarWidth),
                                        ),
                                      ),
                                      // X-axis grid lines (horizontal, dotted)
                                      Positioned.fill(
                                        child: CustomPaint(
                                          painter: _HorizontalDottedLinesPainter(ySteps: ySteps),
                                        ),
                                      ),
                                      Row(
                                        crossAxisAlignment: CrossAxisAlignment.end,
                                        children: List.generate(barCount, (idx) {
                                          final double valDebit = _barDebit[idx];
                                          final double valCredit = _barCredit[idx];
                                          final double normDebit = maxVal == 0 ? 0 : valDebit / maxVal;
                                          final double normCredit = maxVal == 0 ? 0 : valCredit / maxVal;
                                          return Column(
                                            mainAxisAlignment: MainAxisAlignment.end,
                                            children: [
                                              SizedBox(
                                                width: autoBarWidth,
                                                height: chartHeight - 20,
                                                child: Stack(
                                                  alignment: Alignment.bottomCenter,
                                                  children: [
                                                    // Debit (red, bottom)
                                                    if (valDebit > 0)
                                                      AnimatedContainer(
                                                        duration: const Duration(milliseconds: 550),
                                                        curve: Curves.easeInOut,
                                                        width: autoBarWidth,
                                                        height: _animation.value * normDebit * (chartHeight - 20),
                                                        margin: EdgeInsets.symmetric(horizontal: spacing / 2),
                                                        decoration: BoxDecoration(
                                                          borderRadius: BorderRadius.vertical(
                                                            top: Radius.circular(valCredit > 0 ? 0 : 7),
                                                            bottom: Radius.circular(7),
                                                          ),
                                                          color: Color(0xFFF85149).withOpacity(0.78),
                                                        ),
                                                      ),
                                                    // Credit (green, above)
                                                    if (valCredit > 0)
                                                      Positioned(
                                                        bottom: _animation.value * normDebit * (chartHeight - 20),
                                                        child: AnimatedContainer(
                                                          duration: const Duration(milliseconds: 550),
                                                          curve: Curves.easeInOut,
                                                          width: autoBarWidth,
                                                          height: _animation.value * normCredit * (chartHeight - 20),
                                                          decoration: BoxDecoration(
                                                            borderRadius: BorderRadius.vertical(
                                                              top: Radius.circular(7),
                                                              bottom: Radius.circular(valDebit > 0 ? 0 : 7),
                                                            ),
                                                            color: Color(0xFF13CE66).withOpacity(0.85),
                                                          ),
                                                        ),
                                                      ),
                                                  ],
                                                ),
                                              ),
                                            ],
                                          );
                                        }),
                                      ),
                                    ],
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
                    color: Color(0xFFE3EAF2),
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
                                      color: Color(0xFF334155),
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
                    backgroundColor: const Color(0xFF09857a), // Mint
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 38, vertical: 17),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    elevation: 7,
                    shadowColor: Colors.teal[100],
                  ),
                  icon: const Icon(Icons.bar_chart_rounded),
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

  Widget _miniAmount(String label, double value, Color color) {
    return Row(
      children: [
        Icon(label == "Credit" ? Icons.arrow_downward : Icons.arrow_upward,
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
          '₹${value.toStringAsFixed(0)}',
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

// --- Custom painters for grid lines ---

class _VerticalGridLinesPainter extends CustomPainter {
  final int barCount;
  final double barWidth;
  _VerticalGridLinesPainter({required this.barCount, required this.barWidth});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Color(0xFFE3EAF2)
      ..strokeWidth = 1
      ..style = PaintingStyle.stroke;

    for (int i = 0; i < barCount; i++) {
      double x = barWidth * i + barWidth / 2;
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _HorizontalDottedLinesPainter extends CustomPainter {
  final int ySteps;
  _HorizontalDottedLinesPainter({required this.ySteps});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Color(0xFFE3EAF2)
      ..strokeWidth = 1
      ..style = PaintingStyle.stroke;
    final double gap = 5.0;
    for (int i = 0; i < ySteps; i++) {
      double y = size.height * i / (ySteps - 1);
      // Draw dotted line
      double startX = 0;
      while (startX < size.width) {
        canvas.drawLine(Offset(startX, y), Offset(startX + gap, y), paint);
        startX += 2 * gap;
      }
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
