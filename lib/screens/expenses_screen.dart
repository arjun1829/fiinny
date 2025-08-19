import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:table_calendar/table_calendar.dart';
import '../models/expense_item.dart';
import '../models/income_item.dart';
import '../models/friend_model.dart';
import '../services/expense_service.dart';
import '../services/income_service.dart';
import '../services/friend_service.dart';
import 'edit_expense_screen.dart';
import '../widgets/financial_ring.dart';
import '../widgets/date_filter_bar.dart';
import '../widgets/chart_switcher_widget.dart';
import '../widgets/unified_transaction_list.dart';
import '../themes/custom_card.dart';
import '../widgets/animated_mint_background.dart';
import 'dart:math'; // For max calculation in bar chart
import 'package:intl/intl.dart';

class ExpensesScreen extends StatefulWidget {
  final String userPhone;
  const ExpensesScreen({required this.userPhone, Key? key}) : super(key: key);

  @override
  State<ExpensesScreen> createState() => _ExpensesScreenState();
}

class _ExpensesScreenState extends State<ExpensesScreen> {
  String _selectedFilter = "Month";
  String _chartType = "Pie";
  String _dataType = "All";
  String _viewMode = 'summary';

  List<ExpenseItem> allExpenses = [];
  List<IncomeItem> allIncomes = [];
  List<ExpenseItem> filteredExpenses = [];
  List<IncomeItem> filteredIncomes = [];
  double periodTotalExpense = 0;
  double periodTotalIncome = 0;
  Map<String, FriendModel> _friendsById = {};

  // Calendar state
  DateTime _focusedDay = DateTime.now();
  DateTime? _selectedDay;
  Map<DateTime, double> _dailyTotals = {};
  List<ExpenseItem> _expensesForSelectedDay = [];

  // Multi-select & Bulk Edit/Delete
  bool _multiSelectMode = false;
  Set<String> _selectedTxIds = {};

  // Search & Filters
  String _searchQuery = '';
  String? _searchCategory;
  DateTime? _searchFrom;
  DateTime? _searchTo;
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _listenToData();
  }

  void _listenToData() {
    ExpenseService().getExpensesStream(widget.userPhone).listen((expenses) {
      setState(() {
        allExpenses = expenses;
        _applyFilter();
        _generateDailyTotals();
        _updateExpensesForSelectedDay(_selectedDay ?? DateTime.now());
      });
    });

    IncomeService().getIncomesStream(widget.userPhone).listen((incomes) {
      setState(() {
        allIncomes = incomes;
        _applyFilter();
      });
    });

    FriendService()..streamFriends(widget.userPhone)
        .listen((friends) {
      setState(() {
        _friendsById = {for (var f in friends) f.phone: f};
      });
    });
  }

  void _applyFilter() {
    final now = DateTime.now();

    bool filterDate(DateTime date) {
      switch (_selectedFilter) {
        case "All":
          return true;
        case "Day":
        case "D":
          return date.day == now.day && date.month == now.month &&
              date.year == now.year;
        case "2D":
          final twoDaysAgo = now.subtract(const Duration(days: 1));
          return (date.isAtSameMomentAs(now) ||
              date.isAtSameMomentAs(twoDaysAgo)) ||
              (date.day == now.day || date.day == twoDaysAgo.day) &&
                  date.month == now.month &&
                  date.year == now.year;
        case "Month":
        case "M":
          return date.month == now.month && date.year == now.year;
        case "Week":
        case "W":
          final thisWeek = now.subtract(Duration(days: now.weekday - 1));
          return date.isAfter(thisWeek.subtract(const Duration(days: 1))) &&
              date.isBefore(now.add(const Duration(days: 1)));
        case "Quarter":
        case "Q":
          final qtr = ((now.month - 1) ~/ 3) + 1;
          final startMonth = (qtr - 1) * 3 + 1;
          final quarterStart = DateTime(now.year, startMonth, 1);
          return date.isAfter(quarterStart.subtract(const Duration(days: 1))) &&
              date.isBefore(now.add(const Duration(days: 1)));
        case "Year":
        case "Y":
          return date.year == now.year;
        default:
          return true;
      }
    }

    bool searchMatch(ExpenseItem e) {
      final q = _searchQuery.trim().toLowerCase();
      if (q.isNotEmpty &&
          !(e.note.toLowerCase().contains(q) ||
              (e.label ?? '').toLowerCase().contains(q) ||
              e.type.toLowerCase().contains(q))) {
        return false;
      }
      if (_searchCategory != null && _searchCategory!.isNotEmpty && e.type != _searchCategory) {
        return false;
      }
      if (_searchFrom != null && _searchTo != null) {
        final d = DateTime(e.date.year, e.date.month, e.date.day);
        if (d.isBefore(_searchFrom!) || d.isAfter(_searchTo!)) return false;
      }
      return filterDate(e.date);
    }

    bool searchIncomeMatch(IncomeItem i) {
      final q = _searchQuery.trim().toLowerCase();
      if (q.isNotEmpty &&
          !(i.note.toLowerCase().contains(q) ||
              (i.label ?? '').toLowerCase().contains(q) ||
              i.type.toLowerCase().contains(q))) {
        return false;
      }
      if (_searchFrom != null && _searchTo != null) {
        final d = DateTime(i.date.year, i.date.month, i.date.day);
        if (d.isBefore(_searchFrom!) || d.isAfter(_searchTo!)) return false;
      }
      return filterDate(i.date);
    }

    filteredExpenses = allExpenses.where(searchMatch).toList();
    filteredIncomes = allIncomes.where(searchIncomeMatch).toList();
    periodTotalExpense = filteredExpenses.fold(0.0, (a, b) => a + b.amount);
    periodTotalIncome = filteredIncomes.fold(0.0, (a, b) => a + b.amount);
  }

  void _generateDailyTotals() {
    _dailyTotals.clear();
    for (var e in allExpenses) {
      final date = DateTime(e.date.year, e.date.month, e.date.day);
      _dailyTotals[date] = (_dailyTotals[date] ?? 0) + e.amount;
    }
  }

  void _updateExpensesForSelectedDay(DateTime date) {
    final d = DateTime(date.year, date.month, date.day);
    _expensesForSelectedDay = allExpenses.where((e) =>
    e.date.year == d.year && e.date.month == d.month && e.date.day == d.day
    ).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      floatingActionButton: _buildFAB(context),
      body: Stack(
        children: [
          const AnimatedMintBackground(),
          SafeArea(
            child: Column(
              children: [
                // HEADER ROW
                Padding(
                  padding: const EdgeInsets.fromLTRB(18, 18, 12, 4),
                  child: Row(
                    children: [
                      Text(
                        "Expenses",
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 28,
                          letterSpacing: 0.5,
                          color: Color(0xFF09857a),
                        ),
                      ),
                      const Spacer(),
                      Tooltip(
                        message: "Calendar View",
                        child: IconButton(
                          icon: Icon(Icons.calendar_today,
                            color: _viewMode == 'calendar'
                                ? Colors.teal
                                : Colors.grey[500],
                            size: 26,
                          ),
                          onPressed: () =>
                              setState(() => _viewMode = 'calendar'),
                        ),
                      ),
                      Tooltip(
                        message: "Charts",
                        child: IconButton(
                          icon: Icon(Icons.pie_chart_rounded,
                            color: _viewMode == 'charts'
                                ? Colors.pinkAccent
                                : Colors.grey[500],
                            size: 26,
                          ),
                          onPressed: () => setState(() => _viewMode = 'charts'),
                        ),
                      ),
                      Tooltip(
                        message: "Summary",
                        child: IconButton(
                          icon: Icon(Icons.dashboard,
                            color: _viewMode == 'summary'
                                ? Colors.blueAccent
                                : Colors.grey[500],
                            size: 26,
                          ),
                          onPressed: () =>
                              setState(() => _viewMode = 'summary'),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 2),
                Expanded(child: _getCurrentView(context)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFAB(BuildContext context) {
    return SizedBox(
      height: 66,
      child: FloatingActionButton.extended(
        onPressed: () async {
          await Navigator.pushNamed(
            context,
            '/add',
            arguments: widget.userPhone,
          );
        },
        icon: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(100),
            boxShadow: [
              BoxShadow(
                color: Colors.tealAccent.withOpacity(0.45),
                blurRadius: 12,
                offset: const Offset(0, 6),
              )
            ],
          ),
          child: const Icon(Icons.add_circle_rounded, size: 30),
        ),
        label: const Padding(
          padding: EdgeInsets.symmetric(horizontal: 6, vertical: 6),
          child: Text("",
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
        ),
        backgroundColor: Colors.white,
        foregroundColor: Colors.teal,
        elevation: 6,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
      ),
    );
  }

  Widget _getCurrentView(BuildContext context) {
    switch (_viewMode) {
      case 'calendar':
        return _calendarView(context);
      case 'charts':
        return _chartsView(context);
      default:
        return _summaryView(context);
    }
  }

  Widget _summaryView(BuildContext context) {
    double balance = periodTotalIncome - periodTotalExpense;
    double maxValue = [
      periodTotalIncome,
      periodTotalExpense,
      balance.abs(),
    ].reduce((a, b) => a > b ? a : b);

    return RefreshIndicator(
      onRefresh: () async {
        _applyFilter();
        setState(() {});
      },
      child: ListView(
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
        children: [
          // FINANCIAL RINGS AS CARDS
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              CustomDiamondCard(
                isDiamondCut: true,
                borderRadius: 22,
                padding: const EdgeInsets.all(6),
                glassGradient: [
                  Colors.white.withOpacity(0.21),
                  Colors.white.withOpacity(0.09)
                ],
                child: FinancialRingWidget(
                  label: "Income",
                  value: periodTotalIncome,
                  maxValue: maxValue == 0 ? 1 : maxValue,
                  color: Colors.green,
                  icon: Icons.arrow_downward,
                  gradientColors: [Colors.green, Colors.tealAccent],
                  ringSize: 62,
                  strokeWidth: 8.5,
                ),
              ),
              CustomDiamondCard(
                isDiamondCut: true,
                borderRadius: 22,
                padding: const EdgeInsets.all(6),
                glassGradient: [
                  Colors.white.withOpacity(0.21),
                  Colors.white.withOpacity(0.09)
                ],
                child: FinancialRingWidget(
                  label: "Expense",
                  value: periodTotalExpense,
                  maxValue: maxValue == 0 ? 1 : maxValue,
                  color: Colors.pinkAccent,
                  icon: Icons.arrow_upward,
                  gradientColors: [Colors.pinkAccent, Colors.redAccent],
                  ringSize: 62,
                  strokeWidth: 8.5,
                ),
              ),
              CustomDiamondCard(
                isDiamondCut: true,
                borderRadius: 22,
                padding: const EdgeInsets.all(6),
                glassGradient: [
                  Colors.white.withOpacity(0.21),
                  Colors.white.withOpacity(0.09)
                ],
                child: FinancialRingWidget(
                  label: "Balance",
                  value: balance,
                  maxValue: maxValue == 0 ? 1 : maxValue,
                  color: balance >= 0 ? Colors.blue : Colors.red,
                  icon: balance >= 0 ? Icons.savings : Icons.warning,
                  gradientColors: balance >= 0
                      ? [Colors.blueAccent, Colors.lightBlueAccent]
                      : [Colors.red, Colors.orange],
                  ringSize: 62,
                  strokeWidth: 8.5,
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),

          // --- Bulk Actions Bar ---
          if (_multiSelectMode)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 6),
              child: Row(
                children: [
                  Text("${_selectedTxIds.length} selected", style: TextStyle(fontWeight: FontWeight.bold, color: Colors.deepPurple)),
                  const Spacer(),
                  IconButton(
                    icon: const Icon(Icons.label, color: Colors.amber),
                    tooltip: "Edit Label (Bulk)",
                    onPressed: _selectedTxIds.isEmpty
                        ? null
                        : () async {
                      final newLabel = await _showLabelDialog();
                      if (newLabel != null && newLabel.trim().isNotEmpty) {
                        for (final tx in filteredExpenses.where((e) => _selectedTxIds.contains(e.id))) {
                          await ExpenseService().updateExpense(widget.userPhone, tx.copyWith(label: newLabel));
                        }
                        setState(() {
                          _selectedTxIds.clear();
                          _multiSelectMode = false;
                        });
                      }
                    },
                  ),
                  IconButton(
                    icon: const Icon(Icons.delete_forever, color: Colors.red),
                    tooltip: "Delete Selected",
                    onPressed: _selectedTxIds.isEmpty
                        ? null
                        : () async {
                      for (final tx in filteredExpenses.where((e) => _selectedTxIds.contains(e.id))) {
                        await ExpenseService().deleteExpense(widget.userPhone, tx.id);
                      }
                      setState(() {
                        _selectedTxIds.clear();
                        _multiSelectMode = false;
                      });
                    },
                  ),
                  IconButton(
                    icon: const Icon(Icons.close_rounded),
                    tooltip: "Exit Multi-Select",
                    onPressed: () => setState(() {
                      _multiSelectMode = false;
                      _selectedTxIds.clear();
                    }),
                  ),
                ],
              ),
            ),

          // --- Search & Advanced Filter ---
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 6),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _searchController,
                    decoration: InputDecoration(
                      hintText: 'Search by note, label, type…',
                      prefixIcon: Icon(Icons.search, color: Colors.teal),
                      suffixIcon: _searchQuery.isNotEmpty
                          ? IconButton(
                          icon: Icon(Icons.close, color: Colors.grey),
                          onPressed: () {
                            _searchController.clear();
                            setState(() {
                              _searchQuery = '';
                              _applyFilter();
                            });
                          })
                          : null,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(13)),
                      contentPadding: const EdgeInsets.symmetric(vertical: 0, horizontal: 6),
                    ),
                    onChanged: (val) {
                      setState(() {
                        _searchQuery = val;
                        _applyFilter();
                      });
                    },
                  ),
                ),
                const SizedBox(width: 7),
                AnimatedSwitcher(
                  duration: Duration(milliseconds: 200),
                  child: !_multiSelectMode
                      ? IconButton(
                    key: ValueKey("multisel1"),
                    icon: Icon(Icons.check_box_rounded, color: Colors.deepPurple),
                    tooltip: "Multi-Select",
                    onPressed: () => setState(() => _multiSelectMode = true),
                  )
                      : SizedBox(width: 36),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 0),
            child: Row(
              children: [
                DropdownButton<String>(
                  value: _searchCategory,
                  hint: Text("Filter Category"),
                  items: [
                    DropdownMenuItem(child: Text("All"), value: null),
                    ..._expenseCategories().map((cat) =>
                        DropdownMenuItem(child: Text(cat), value: cat))
                  ],
                  onChanged: (cat) {
                    setState(() {
                      _searchCategory = cat;
                      _applyFilter();
                    });
                  },
                ),
                const Spacer(),
                TextButton.icon(
                  icon: Icon(Icons.calendar_today_rounded, size: 18),
                  label: Text(_searchFrom != null && _searchTo != null
                      ? "${DateFormat('d MMM').format(_searchFrom!)} - ${DateFormat('d MMM').format(_searchTo!)}"
                      : "Date Range"),
                  onPressed: () async {
                    DateTimeRange? picked = await showDateRangePicker(
                      context: context,
                      firstDate: DateTime(2000),
                      lastDate: DateTime.now().add(Duration(days: 1)),
                    );
                    if (picked != null) {
                      setState(() {
                        _searchFrom = picked.start;
                        _searchTo = picked.end;
                        _applyFilter();
                      });
                    }
                  },
                ),
                if (_searchFrom != null || _searchTo != null)
                  IconButton(
                    icon: Icon(Icons.close, color: Colors.grey),
                    tooltip: "Clear Date Range",
                    onPressed: () {
                      setState(() {
                        _searchFrom = null;
                        _searchTo = null;
                        _applyFilter();
                      });
                    },
                  ),
              ],
            ),
          ),

          // Date Filter Bar
          CustomDiamondCard(
            borderRadius: 20,
            padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 10),
            glassGradient: [
              Colors.white.withOpacity(0.16),
              Colors.white.withOpacity(0.06)
            ],
            child: DateFilterBar(
              selected: _selectedFilter,
              onChanged: (v) {
                setState(() {
                  _selectedFilter = v;
                  _applyFilter();
                });
              },
            ),
          ),
          const SizedBox(height: 12),

          // Transaction List Unified (Expense+Income)
          CustomDiamondCard(
            borderRadius: 22,
            glassGradient: [
              Colors.white.withOpacity(0.23),
              Colors.white.withOpacity(0.09)
            ],
            padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 2),
            child: UnifiedTransactionList(
              expenses: _dataType == "Income" ? [] : filteredExpenses,
              incomes: _dataType == "Expense" ? [] : filteredIncomes,
              filterType: _dataType,
              previewCount: 15,
              friendsById: _friendsById,
              showBillIcon: true,
              multiSelectEnabled: _multiSelectMode,
              selectedIds: _selectedTxIds,
              onSelectTx: (txId, selected) {
                setState(() {
                  if (selected) {
                    _selectedTxIds.add(txId);
                  } else {
                    _selectedTxIds.remove(txId);
                  }
                });
              },
              onEdit: (tx) async {
                if (_multiSelectMode) return;
                if (tx is ExpenseItem) {
                  await Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (context) =>
                          EditExpenseScreen(
                            userPhone: widget.userPhone,
                            expense: tx,
                          ),
                    ),
                  );
                  _applyFilter();
                  setState(() {});
                }
                // For income edit, implement similarly if needed
              },
              onDelete: (tx) async {
                if (_multiSelectMode) return;
                if (tx is ExpenseItem) {
                  await ExpenseService().deleteExpense(widget.userPhone, tx.id);
                } else if (tx is IncomeItem) {
                  await IncomeService().deleteIncome(widget.userPhone, tx.id);
                }
                _applyFilter();
                setState(() {});
              },
              onSplit: (tx) {
                // TODO: Implement split logic for all
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _calendarView(BuildContext context) {
    return SingleChildScrollView(
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 12, left: 10, right: 10),
            child: CustomDiamondCard(
              borderRadius: 26,
              padding: const EdgeInsets.all(10),
              glassGradient: [
                Colors.white.withOpacity(0.19),
                Colors.white.withOpacity(0.08)
              ],
              child: Column(
                children: [
                  // Date picker icon row
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      IconButton(
                        icon: const Icon(
                            Icons.today_rounded, color: Colors.teal, size: 24),
                        tooltip: "Pick Date",
                        onPressed: () async {
                          final picked = await showDatePicker(
                            context: context,
                            initialDate: _focusedDay,
                            firstDate: DateTime(2000),
                            lastDate: DateTime(2100),
                          );
                          if (picked != null) {
                            setState(() {
                              _selectedDay = picked;
                              _focusedDay = picked;
                              _updateExpensesForSelectedDay(picked);
                            });
                          }
                        },
                      ),
                    ],
                  ),
                  TableCalendar(
                    focusedDay: _focusedDay,
                    firstDay: DateTime(2000),
                    lastDay: DateTime(2100),
                    calendarFormat: CalendarFormat.month,
                    availableCalendarFormats: const {
                      CalendarFormat.month: 'Month',
                    },
                    selectedDayPredicate: (day) {
                      return _selectedDay != null &&
                          day.year == _selectedDay!.year &&
                          day.month == _selectedDay!.month &&
                          day.day == _selectedDay!.day;
                    },
                    onDaySelected: (selectedDay, focusedDay) {
                      setState(() {
                        _selectedDay = selectedDay;
                        _focusedDay = focusedDay;
                        _updateExpensesForSelectedDay(selectedDay);
                      });
                    },
                    calendarBuilders: CalendarBuilders(
                      defaultBuilder: (context, date, focusedDay) {
                        final key = DateTime(date.year, date.month, date.day);
                        final total = _dailyTotals[key] ?? 0;
                        return Center(
                          child: FittedBox(
                            fit: BoxFit.scaleDown,
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  '${date.day}',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w600,
                                    fontSize: 13,
                                  ),
                                ),
                                if (total > 0)
                                  Text(
                                    '₹${total.toStringAsFixed(0)}',
                                    style: TextStyle(
                                      fontSize: 10.5,
                                      color: Colors.red[400],
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                              ],
                            ),
                          ),
                        );
                      },
                      todayBuilder: (context, date, focusedDay) {
                        final key = DateTime(date.year, date.month, date.day);
                        final total = _dailyTotals[key] ?? 0;
                        return Container(
                          decoration: BoxDecoration(
                            color: Colors.teal[100],
                            shape: BoxShape.circle,
                          ),
                          child: Center(
                            child: FittedBox(
                              fit: BoxFit.scaleDown,
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(
                                    '${date.day}',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.bold,
                                      color: Colors.black,
                                      fontSize: 13,
                                    ),
                                  ),
                                  if (total > 0)
                                    Text(
                                      '₹${total.toStringAsFixed(0)}',
                                      style: TextStyle(
                                        fontSize: 10.5,
                                        color: Colors.red[800],
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
          ),

          const SizedBox(height: 16),
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 350),
            child: CustomDiamondCard(
              borderRadius: 24,
              glassGradient: [
                Colors.white.withOpacity(0.23),
                Colors.white.withOpacity(0.09)
              ],
              padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 0),
              child: UnifiedTransactionList(
                expenses: _expensesForSelectedDay,
                incomes: [],
                previewCount: 15,
                filterType: "Expense",
                friendsById: _friendsById,
                showBillIcon: true,
                multiSelectEnabled: _multiSelectMode,
                selectedIds: _selectedTxIds,
                onSelectTx: (txId, selected) {
                  setState(() {
                    if (selected) {
                      _selectedTxIds.add(txId);
                    } else {
                      _selectedTxIds.remove(txId);
                    }
                  });
                },
                onEdit: (tx) async {
                  if (_multiSelectMode) return;
                  if (tx is ExpenseItem) {
                    await Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (context) =>
                            EditExpenseScreen(
                              userPhone: widget.userPhone,
                              expense: tx,
                            ),
                      ),
                    );
                    _applyFilter();
                    setState(() {});
                  }
                },
                onDelete: (tx) async {
                  if (_multiSelectMode) return;
                  if (tx is ExpenseItem) {
                    await ExpenseService().deleteExpense(widget.userPhone, tx.id);
                    _applyFilter();
                    setState(() {});
                  }
                },
                onSplit: (tx) {
                  // TODO: Implement split logic for all
                },
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _chartsView(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 12),
      children: [
        CustomDiamondCard(
          borderRadius: 24,
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 10),
          glassGradient: [
            Colors.white.withOpacity(0.16),
            Colors.white.withOpacity(0.06)
          ],
          child: ChartSwitcherWidget(
            chartType: _chartType,
            dataType: _dataType,
            onChartTypeChanged: (val) {
              setState(() => _chartType = val);
            },
            onDataTypeChanged: (val) {
              setState(() => _dataType = val);
            },
          ),
        ),
        const SizedBox(height: 16),

        if ((_dataType == "All" || _dataType == "Expense") &&
            filteredExpenses.isNotEmpty &&
            _chartType == "Pie" &&
            _hasExpenseCategoryData())
          CustomDiamondCard(
            borderRadius: 26,
            padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 10),
            glassGradient: [
              Colors.white.withOpacity(0.19),
              Colors.white.withOpacity(0.08)
            ],
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text("Expense Breakdown", style: TextStyle(
                    fontWeight: FontWeight.bold, fontSize: 17)),
                const SizedBox(height: 10),
                AspectRatio(
                  aspectRatio: 1.6,
                  child: PieChart(
                    PieChartData(
                      sections: _expenseCategorySections(),
                      sectionsSpace: 3,
                      centerSpaceRadius: 28,
                      pieTouchData: PieTouchData(
                        touchCallback: (event, response) {},
                      ),
                    ),
                    swapAnimationDuration: const Duration(milliseconds: 650),
                    swapAnimationCurve: Curves.easeOutCubic,
                  ),
                ),
              ],
            ),
          ),

        if ((_dataType == "All" || _dataType == "Income") &&
            filteredIncomes.isNotEmpty &&
            _chartType == "Pie")
          CustomDiamondCard(
            borderRadius: 26,
            padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 10),
            glassGradient: [
              Colors.white.withOpacity(0.19),
              Colors.white.withOpacity(0.08)
            ],
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text("Income Breakdown", style: TextStyle(
                    fontWeight: FontWeight.bold, fontSize: 17)),
                const SizedBox(height: 10),
                AspectRatio(
                  aspectRatio: 1.6,
                  child: PieChart(
                    PieChartData(
                      sections: _incomeCategorySections(),
                      sectionsSpace: 3,
                      centerSpaceRadius: 28,
                      pieTouchData: PieTouchData(),
                    ),
                    swapAnimationDuration: const Duration(milliseconds: 650),
                    swapAnimationCurve: Curves.easeOutCubic,
                  ),
                ),
              ],
            ),
          ),

        if ((_dataType == "All" || _dataType == "Expense") &&
            filteredExpenses.isNotEmpty &&
            _chartType == "Bar")
          CustomDiamondCard(
            borderRadius: 26,
            padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 10),
            glassGradient: [
              Colors.white.withOpacity(0.19),
              Colors.white.withOpacity(0.08)
            ],
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text("Expense by Category", style: TextStyle(
                    fontWeight: FontWeight.bold, fontSize: 17)),
                const SizedBox(height: 10),
                AspectRatio(
                  aspectRatio: 1.8,
                  child: BarChart(
                    BarChartData(
                      barGroups: _expenseCategoryBarGroups(),
                      titlesData: FlTitlesData(
                        leftTitles: AxisTitles(
                          sideTitles: SideTitles(
                              showTitles: true, reservedSize: 36),
                        ),
                        bottomTitles: AxisTitles(
                          sideTitles: SideTitles(
                            showTitles: true,
                            getTitlesWidget: (double value, TitleMeta meta) {
                              final cats = _expenseCategories();
                              if (value.toInt() >= 0 &&
                                  value.toInt() < cats.length) {
                                return Text(
                                  cats[value.toInt()],
                                  style: const TextStyle(fontSize: 12),
                                  overflow: TextOverflow.ellipsis,
                                );
                              }
                              return const SizedBox();
                            },
                          ),
                        ),
                      ),
                      borderData: FlBorderData(show: false),
                      gridData: FlGridData(show: true,
                          horizontalInterval: _expenseMaxAmount() / 4),
                    ),
                    swapAnimationDuration: const Duration(milliseconds: 650),
                    swapAnimationCurve: Curves.easeOutCubic,
                  ),
                ),
              ],
            ),
          ),

        if ((_dataType == "All" || _dataType == "Income") &&
            filteredIncomes.isNotEmpty &&
            _chartType == "Bar")
          CustomDiamondCard(
            borderRadius: 26,
            padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 10),
            glassGradient: [
              Colors.white.withOpacity(0.19),
              Colors.white.withOpacity(0.08)
            ],
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text("Income by Category", style: TextStyle(
                    fontWeight: FontWeight.bold, fontSize: 17)),
                const SizedBox(height: 10),
                AspectRatio(
                  aspectRatio: 1.8,
                  child: BarChart(
                    BarChartData(
                      barGroups: _incomeCategoryBarGroups(),
                      titlesData: FlTitlesData(
                        leftTitles: AxisTitles(
                          sideTitles: SideTitles(
                              showTitles: true, reservedSize: 36),
                        ),
                        bottomTitles: AxisTitles(
                          sideTitles: SideTitles(
                            showTitles: true,
                            getTitlesWidget: (double value, TitleMeta meta) {
                              final cats = _incomeCategories();
                              if (value.toInt() >= 0 &&
                                  value.toInt() < cats.length) {
                                return Text(
                                  cats[value.toInt()],
                                  style: const TextStyle(fontSize: 12),
                                  overflow: TextOverflow.ellipsis,
                                );
                              }
                              return const SizedBox();
                            },
                          ),
                        ),
                      ),
                      borderData: FlBorderData(show: false),
                      gridData: FlGridData(show: true,
                          horizontalInterval: _incomeMaxAmount() / 4),
                    ),
                    swapAnimationDuration: const Duration(milliseconds: 650),
                    swapAnimationCurve: Curves.easeOutCubic,
                  ),
                ),
              ],
            ),
          ),

        CustomDiamondCard(
          borderRadius: 24,
          glassGradient: [
            Colors.white.withOpacity(0.23),
            Colors.white.withOpacity(0.09)
          ],
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 0),
          child: UnifiedTransactionList(
            expenses: _dataType == "Income" ? [] : filteredExpenses,
            incomes: _dataType == "Expense" ? [] : filteredIncomes,
            filterType: _dataType,
            previewCount: 15,
            friendsById: _friendsById,
            showBillIcon: true,
            multiSelectEnabled: _multiSelectMode,
            selectedIds: _selectedTxIds,
            onSelectTx: (txId, selected) {
              setState(() {
                if (selected) {
                  _selectedTxIds.add(txId);
                } else {
                  _selectedTxIds.remove(txId);
                }
              });
            },
            onEdit: (tx) async {
              if (_multiSelectMode) return;
              if (tx is ExpenseItem) {
                await Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) =>
                        EditExpenseScreen(
                          userPhone: widget.userPhone,
                          expense: tx,
                        ),
                  ),
                );
                _applyFilter();
                setState(() {});
              }
            },
            onDelete: (tx) async {
              if (_multiSelectMode) return;
              if (tx is ExpenseItem) {
                await ExpenseService().deleteExpense(widget.userPhone, tx.id);
                _applyFilter();
                setState(() {});
              }
            },
            onSplit: (tx) {
              // TODO: Implement split logic for all
            },
          ),
        ),
      ],
    );
  }

  List<PieChartSectionData> _expenseCategorySections() {
    final expenseTx = filteredExpenses;
    if (expenseTx.isEmpty) return [];
    final Map<String, double> byCategory = {};
    double total = 0.0;
    for (final t in expenseTx) {
      String type = (t.type.isEmpty) ? "Other" : t.type;
      byCategory[type] = (byCategory[type] ?? 0) + t.amount;
      total += t.amount;
    }
    final colors = [
      Colors.pinkAccent,
      Colors.deepPurpleAccent,
      Colors.lightBlue,
      Colors.teal,
      Colors.greenAccent,
      Colors.orange,
      Colors.amber,
      Colors.cyan,
      Colors.indigo,
      Colors.redAccent,
    ];
    int i = 0;
    return byCategory.entries.map((e) {
      double percent = (total == 0) ? 0 : (e.value / total * 100);
      return PieChartSectionData(
        value: e.value,
        color: colors[i++ % colors.length],
        radius: 44,
        title: '${e.key.length > 9 ? e.key.substring(0, 8) + "…" : e.key}\n${percent.toStringAsFixed(1)}%',
        titleStyle: const TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.bold,
          fontSize: 11,
          height: 1.13,
        ),
        titlePositionPercentageOffset: 0.63,
      );
    }).toList();
  }

  List<PieChartSectionData> _incomeCategorySections() {
    final incomeTx = filteredIncomes;
    if (incomeTx.isEmpty) return [];
    final Map<String, double> byCategory = {};
    double total = 0.0;
    for (final t in incomeTx) {
      String type = (t.type.isEmpty) ? "Other" : t.type;
      byCategory[type] = (byCategory[type] ?? 0) + t.amount;
      total += t.amount;
    }
    final colors = [
      Colors.green,
      Colors.lightGreen,
      Colors.amber,
      Colors.blue,
      Colors.purple,
      Colors.teal,
      Colors.orange,
      Colors.yellow,
      Colors.cyan,
      Colors.indigo,
    ];
    int i = 0;
    return byCategory.entries.map((e) {
      double percent = (total == 0) ? 0 : (e.value / total * 100);
      return PieChartSectionData(
        value: e.value,
        color: colors[i++ % colors.length],
        radius: 44,
        title: '${e.key.length > 9 ? e.key.substring(0, 8) + "…" : e.key}\n${percent.toStringAsFixed(1)}%',
        titleStyle: const TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.bold,
          fontSize: 11,
          height: 1.13,
        ),
        titlePositionPercentageOffset: 0.63,
      );
    }).toList();
  }

  bool _hasExpenseCategoryData() {
    return filteredExpenses.any((t) => t.type.isNotEmpty);
  }

  List<BarChartGroupData> _expenseCategoryBarGroups() {
    final expenseTx = filteredExpenses;
    final Map<String, double> byCategory = {};
    for (final t in expenseTx) {
      byCategory[t.type.isEmpty ? "Other" : t.type] =
          (byCategory[t.type.isEmpty ? "Other" : t.type] ?? 0) + t.amount;
    }
    final colors = [
      Colors.pinkAccent,
      Colors.deepPurpleAccent,
      Colors.lightBlue,
      Colors.teal,
      Colors.greenAccent,
      Colors.orange,
      Colors.amber,
      Colors.cyan,
      Colors.indigo,
      Colors.redAccent,
    ];
    int i = 0;
    return byCategory.entries.map((e) {
      return BarChartGroupData(
        x: i,
        barRods: [
          BarChartRodData(
            toY: e.value,
            color: colors[i % colors.length],
            width: 18,
            borderRadius: BorderRadius.circular(6),
            backDrawRodData: BackgroundBarChartRodData(
              show: true,
              toY: _expenseMaxAmount(),
              color: colors[i % colors.length].withOpacity(0.12),
            ),
          ),
        ],
      );
    }).toList();
  }

  double _expenseMaxAmount() {
    if (filteredExpenses.isEmpty) return 100;
    final maxVal = filteredExpenses.map((e) => e.amount).reduce(max);
    return maxVal < 100 ? 100 : maxVal;
  }

  List<String> _expenseCategories() {
    final Map<String, double> byCategory = {};
    for (final t in filteredExpenses) {
      byCategory[t.type.isEmpty ? "Other" : t.type] =
          (byCategory[t.type.isEmpty ? "Other" : t.type] ?? 0) + t.amount;
    }
    return byCategory.keys.toList();
  }

  List<BarChartGroupData> _incomeCategoryBarGroups() {
    final incomeTx = filteredIncomes;
    final Map<String, double> byCategory = {};
    for (final t in incomeTx) {
      byCategory[t.type.isEmpty ? "Other" : t.type] =
          (byCategory[t.type.isEmpty ? "Other" : t.type] ?? 0) + t.amount;
    }
    final colors = [
      Colors.green,
      Colors.lightGreen,
      Colors.amber,
      Colors.blue,
      Colors.purple,
      Colors.teal,
      Colors.orange,
      Colors.yellow,
      Colors.cyan,
      Colors.indigo,
    ];
    int i = 0;
    return byCategory.entries.map((e) {
      return BarChartGroupData(
        x: i,
        barRods: [
          BarChartRodData(
            toY: e.value,
            color: colors[i % colors.length],
            width: 18,
            borderRadius: BorderRadius.circular(6),
            backDrawRodData: BackgroundBarChartRodData(
              show: true,
              toY: _incomeMaxAmount(),
              color: colors[i % colors.length].withOpacity(0.12),
            ),
          ),
        ],
      );
    }).toList();
  }

  double _incomeMaxAmount() {
    if (filteredIncomes.isEmpty) return 100;
    final maxVal = filteredIncomes.map((e) => e.amount).reduce(max);
    return maxVal < 100 ? 100 : maxVal;
  }

  List<String> _incomeCategories() {
    final Map<String, double> byCategory = {};
    for (final t in filteredIncomes) {
      byCategory[t.type.isEmpty ? "Other" : t.type] =
          (byCategory[t.type.isEmpty ? "Other" : t.type] ?? 0) + t.amount;
    }
    return byCategory.keys.toList();
  }

  Future<String?> _showLabelDialog() async {
    String? result;
    final controller = TextEditingController();
    await showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Set Label'),
        content: TextField(
          controller: controller,
          decoration: InputDecoration(hintText: 'Enter new label…'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: Text('Cancel')),
          ElevatedButton(
              onPressed: () {
                result = controller.text.trim();
                Navigator.pop(ctx);
              },
              child: Text('Apply')),
        ],
      ),
    );
    return result;
  }
}
