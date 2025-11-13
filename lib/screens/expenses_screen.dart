// lib/screens/expenses_screen.dart
import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:table_calendar/table_calendar.dart';
import 'package:intl/intl.dart';

import '../core/analytics/aggregators.dart';
import '../models/expense_item.dart';
import '../models/income_item.dart';
import '../models/friend_model.dart';
import '../services/expense_service.dart';
import '../services/income_service.dart';
import '../services/friend_service.dart';
import 'edit_expense_screen.dart';
import '../widgets/date_filter_bar.dart';
import '../widgets/chart_switcher_widget.dart';
import '../widgets/unified_transaction_list.dart';
import '../themes/custom_card.dart';
import '../themes/tokens.dart';
import '../widgets/animated_mint_background.dart';
import '../widgets/dashboard/banks_cards_summary_card.dart';

class ExpensesScreen extends StatefulWidget {
  final String userPhone;
  const ExpensesScreen({required this.userPhone, Key? key}) : super(key: key);

  @override
  State<ExpensesScreen> createState() => _ExpensesScreenState();
}

class _ExpensesScreenState extends State<ExpensesScreen> {
  // -------- UI State --------
  String _selectedFilter = "Month";
  String _chartType = "Pie";
  String _dataType = "All";
  String _viewMode = 'summary';

  // Data
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
  String? _searchCategory; // null == All categories
  DateTime? _searchFrom;
  DateTime? _searchTo;
  final TextEditingController _searchController = TextEditingController();

  String? _bankFilter;
  String? _cardLast4Filter;
  String? _instrumentFilter;
  String? _merchantFilter;

  // Subscriptions / Debounce
  StreamSubscription? _expSub, _incSub, _friendSub;
  Timer? _debounce;

  List<PieChartSectionData> _miniExpenseSections() {
    if (filteredExpenses.isEmpty) return [];
    final byCategory = _topN(_buildByCategory<ExpenseItem>(
      filteredExpenses,
          (e) => e.type,
          (e) => e.amount,
    ));

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
      return PieChartSectionData(
        value: e.value,
        color: colors[i++ % colors.length],
        title: '',
        radius: 34,
      );
    }).toList();
  }

  List<PieChartSectionData> _miniIncomeSections() {
    if (filteredIncomes.isEmpty) return [];
    final byCategory = _topN(_buildByCategory<IncomeItem>(
      filteredIncomes,
          (i) => i.type,
          (i) => i.amount,
    ));

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
      return PieChartSectionData(
        value: e.value,
        color: colors[i++ % colors.length],
        title: '',
        radius: 34,
      );
    }).toList();
  }

  @override
  void initState() {
    super.initState();
    _listenToData();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    _expSub?.cancel();
    _incSub?.cancel();
    _friendSub?.cancel();
    super.dispose();
  }

  // ------- Helpers (dates) -------
  DateTime _d(DateTime x) => DateTime(x.year, x.month, x.day);

  ({DateTime start, DateTime end}) _rangeForFilter(DateTime now, String f) {
    switch (f) {
      case 'Day':
      case 'D':
        final d0 = _d(now);
        return (start: d0, end: d0);
      case '2D':
        final d0 = _d(now);
        final d1 = d0.subtract(const Duration(days: 1));
        return (start: d1, end: d0);
      case 'Week':
      case 'W':
        final start = _d(now).subtract(Duration(days: now.weekday - 1)); // Monday
        final end = start.add(const Duration(days: 6));
        return (start: start, end: end);
      case 'Month':
      case 'M':
        final start = DateTime(now.year, now.month, 1);
        final end = DateTime(now.year, now.month + 1, 0);
        return (start: start, end: end);
      case 'Last Month':
      case 'LM':
        final prevStart = DateTime(now.year, now.month - 1, 1);
        final prevEnd = DateTime(prevStart.year, prevStart.month + 1, 0);
        return (start: prevStart, end: prevEnd);
      case 'Quarter':
      case 'Q':
        final q = ((now.month - 1) ~/ 3) + 1;
        final sm = (q - 1) * 3 + 1;
        final start = DateTime(now.year, sm, 1);
        final end = DateTime(now.year, sm + 3, 0);
        return (start: start, end: end);
      case 'Year':
      case 'Y':
        return (start: DateTime(now.year, 1, 1), end: DateTime(now.year, 12, 31));
      case 'All':
      default:
        return (start: DateTime(2000), end: DateTime(2100));
    }
  }

  // ------- Data wiring -------
  void _listenToData() {
    _expSub = ExpenseService().getExpensesStream(widget.userPhone).listen((expenses) {
      if (!mounted) return;
      allExpenses = expenses;
      _recompute();
    });

    _incSub = IncomeService().getIncomesStream(widget.userPhone).listen((incomes) {
      if (!mounted) return;
      allIncomes = incomes;
      _recompute();
    });

    _friendSub = FriendService().streamFriends(widget.userPhone).listen((friends) {
      if (!mounted) return;
      setState(() {
        _friendsById = {for (var f in friends) f.phone: f};
      });
    });
  }

  void _recompute() {
    _applyFilter();
    _generateDailyTotals();
    _updateExpensesForSelectedDay(_selectedDay ?? DateTime.now());
    if (mounted) setState(() {});
  }

  void _applyFilter() {
    final now = DateTime.now();
    final range = _rangeForFilter(now, _selectedFilter);
    final start = _d(range.start);
    final end = _d(range.end);

    bool inMainRange(DateTime date) {
      final d = _d(date);
      return (d.isAtSameMomentAs(start) || d.isAfter(start)) &&
          (d.isAtSameMomentAs(end) || d.isBefore(end));
    }

    bool searchMatchExpense(ExpenseItem e) {
      final q = _searchQuery.trim().toLowerCase();
      if (q.isNotEmpty) {
        final note = (e.note).toLowerCase();
        final label = (e.label ?? '').toLowerCase();
        final type = (e.type).toLowerCase();
        if (!(note.contains(q) || label.contains(q) || type.contains(q))) return false;
      }
      if (_searchCategory != null && _searchCategory!.isNotEmpty) {
        if ((e.type.isEmpty ? "Other" : e.type) != _searchCategory) return false;
      }
      if (_searchFrom != null && _searchTo != null) {
        final d = _d(e.date);
        if (d.isBefore(_d(_searchFrom!)) || d.isAfter(_d(_searchTo!))) return false;
      }
      if (_bankFilter != null && _bankFilter!.isNotEmpty) {
        if ((e.issuerBank ?? '').toUpperCase() != _bankFilter) return false;
      }
      if (_cardLast4Filter != null && _cardLast4Filter!.isNotEmpty) {
        final l4 = (e.cardLast4 ?? '').trim();
        if (l4.isEmpty || !l4.endsWith(_cardLast4Filter!)) return false;
      }
      if (_instrumentFilter != null && _instrumentFilter!.isNotEmpty) {
        final inst = _normInstrument(e.instrument);
        if (inst != _instrumentFilter) return false;
      }
      if (_merchantFilter != null && _merchantFilter!.isNotEmpty) {
        final raw = (e.counterparty ?? e.upiVpa ?? e.label ?? '').trim();
        if (raw.isEmpty) return false;
        final key = AnalyticsAgg.displayMerchantKey(raw);
        if (key.toLowerCase() != _merchantFilter!.toLowerCase()) return false;
      }
      return inMainRange(e.date);
    }

    bool searchMatchIncome(IncomeItem i) {
      final q = _searchQuery.trim().toLowerCase();
      if (q.isNotEmpty) {
        final note = (i.note).toLowerCase();
        final label = (i.label ?? '').toLowerCase();
        final type = (i.type).toLowerCase();
        if (!(note.contains(q) || label.contains(q) || type.contains(q))) return false;
      }
      if (_searchFrom != null && _searchTo != null) {
        final d = _d(i.date);
        if (d.isBefore(_d(_searchFrom!)) || d.isAfter(_d(_searchTo!))) return false;
      }
      if (_bankFilter != null && _bankFilter!.isNotEmpty) {
        if ((i.issuerBank ?? '').toUpperCase() != _bankFilter) return false;
      }
      if (_instrumentFilter != null && _instrumentFilter!.isNotEmpty) {
        final inst = _normInstrument(i.instrument);
        if (inst != _instrumentFilter) return false;
      }
      if (_merchantFilter != null && _merchantFilter!.isNotEmpty) {
        final raw = (i.counterparty ?? i.upiVpa ?? i.label ?? '').trim();
        if (raw.isEmpty) return false;
        final key = AnalyticsAgg.displayMerchantKey(raw);
        if (key.toLowerCase() != _merchantFilter!.toLowerCase()) return false;
      }
      return inMainRange(i.date);
    }

    filteredExpenses = allExpenses.where(searchMatchExpense).toList();
    filteredIncomes = allIncomes.where(searchMatchIncome).toList();
    periodTotalExpense = filteredExpenses.fold(0.0, (a, b) => a + b.amount);
    periodTotalIncome = filteredIncomes.fold(0.0, (a, b) => a + b.amount);

    final catsNow = _expenseCategories().toSet();
    if (_searchCategory != null && !catsNow.contains(_searchCategory)) {
      _searchCategory = null;
    }
  }

  String _normInstrument(String? raw) {
    final upper = (raw ?? '').toUpperCase();
    if (upper.contains('CREDIT')) return 'Credit Card';
    if (upper.contains('DEBIT')) return 'Debit Card';
    if (upper.contains('UPI')) return 'UPI';
    if (upper.contains('NET')) return 'NetBanking';
    if (upper.contains('IMPS')) return 'IMPS';
    if (upper.contains('NEFT')) return 'NEFT';
    if (upper.contains('RTGS')) return 'RTGS';
    if (upper.contains('ATM')) return 'ATM';
    if (upper.contains('POS')) return 'POS';
    final trimmed = (raw ?? '').trim();
    return trimmed.isEmpty ? 'Account' : trimmed;
  }

  String _formatMerchantName(String raw) {
    final trimmed = raw.trim();
    if (trimmed.isEmpty) return 'Unknown';
    return trimmed
        .split(RegExp(r'\s+'))
        .where((word) => word.isNotEmpty)
        .map((word) =>
            '${word[0].toUpperCase()}${word.substring(1).toLowerCase()}')
        .join(' ');
  }

  Widget _buildTypeChips() {
    const types = ['All', 'Expense', 'Income'];
    return Wrap(
      spacing: 8,
      children: types.map((type) {
        final selected = _dataType == type;
        return ChoiceChip(
          label: Text(type, style: const TextStyle(fontSize: 13)),
          selected: selected,
          onSelected: (_) {
            setState(() => _dataType = type);
          },
        );
      }).toList(),
    );
  }

  List<Widget> _buildInstrumentChips() {
    final counts = <String, int>{};

    void add(String? raw) {
      final inst = _normInstrument(raw);
      if (inst.isEmpty) return;
      counts[inst] = (counts[inst] ?? 0) + 1;
    }

    for (final e in filteredExpenses) {
      add(e.instrument);
    }
    for (final i in filteredIncomes) {
      add(i.instrument);
    }

    final entries = counts.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));

    return entries.map((entry) {
      final inst = entry.key;
      final selected = _instrumentFilter == inst;
      return FilterChip(
        label: Text(
          '$inst (${entry.value})',
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 13),
        ),
        selected: selected,
        onSelected: (_) {
          setState(() {
            _instrumentFilter = selected ? null : inst;
          });
          _recompute();
        },
      );
    }).toList();
  }

  List<Widget> _buildCategoryChips() {
    final cats = _expenseCategories().toSet().toList()..sort();
    return cats.map((cat) {
      final selected = _searchCategory == cat;
      return FilterChip(
        label: Text(cat, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13)),
        selected: selected,
        onSelected: (_) {
          setState(() {
            _searchCategory = selected ? null : cat;
          });
          _recompute();
        },
      );
    }).toList();
  }

  List<Widget> _buildTopMerchantChips() {
    if (filteredExpenses.isEmpty) return const [];

    final byMerchant = AnalyticsAgg.byMerchant(filteredExpenses);
    if (byMerchant.isEmpty) return const [];

    final formatter = NumberFormat.compactCurrency(
      locale: 'en_IN',
      symbol: '₹',
      decimalDigits: 0,
    );

    return byMerchant.entries.take(6).map((entry) {
      final merchant = entry.key;
      final selected =
          _merchantFilter != null && _merchantFilter!.toLowerCase() == merchant.toLowerCase();
      return FilterChip(
        label: Text(
          '${_formatMerchantName(merchant)} • ${formatter.format(entry.value.abs())}',
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 13),
        ),
        selected: selected,
        onSelected: (_) {
          setState(() {
            _merchantFilter = selected ? null : merchant;
          });
          _recompute();
        },
      );
    }).toList();
  }

  Widget _filtersAndAccountsCard() {
    final instrumentChips = _buildInstrumentChips();
    final categoryChips = _buildCategoryChips();
    final merchantChips = _buildTopMerchantChips();
    final combinedChips = <Widget>[
      ...instrumentChips,
      ...categoryChips,
      ...merchantChips,
    ];

    return CustomDiamondCard(
      borderRadius: 22,
      glassGradient: [
        Colors.white.withOpacity(0.19),
        Colors.white.withOpacity(0.08),
      ],
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Filters & Accounts', style: Fx.title.copyWith(fontSize: 18)),
          const SizedBox(height: 10),
          _buildTypeChips(),
          if (combinedChips.isNotEmpty) ...[
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: combinedChips,
            ),
          ],
          const SizedBox(height: 12),
          BanksCardsSummaryCard(
            expenses: filteredExpenses,
            incomes: filteredIncomes,
            initiallyExpanded: false,
            enableTapToOpenAnalytics: false,
            onOpenAnalytics: () {},
            activeFilter: BankInstrumentFilter(
              bank: _bankFilter,
              last4: _cardLast4Filter,
            ),
            onSelectionChanged: (filter) {
              _bankFilter = (filter.bank != null && filter.bank!.isNotEmpty)
                  ? filter.bank
                  : null;
              _cardLast4Filter =
                  (filter.last4 != null && filter.last4!.isNotEmpty)
                      ? filter.last4
                      : null;
              _instrumentFilter = null;
              _recompute();
            },
          ),
        ],
      ),
    );
  }

  void _generateDailyTotals() {
    _dailyTotals.clear();
    for (var e in allExpenses) {
      final date = _d(e.date);
      _dailyTotals[date] = (_dailyTotals[date] ?? 0) + e.amount;
    }
  }

  void _updateExpensesForSelectedDay(DateTime date) {
    final d = _d(date);
    _expensesForSelectedDay = allExpenses.where((e) => _d(e.date) == d).toList();
  }

  // ------- Build -------
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
                // HEADER ROW (unchanged)
                Padding(
                  padding: const EdgeInsets.fromLTRB(18, 18, 12, 4),
                  child: Row(
                    children: [
                      const Text(
                        "Expenses",
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 24,
                          letterSpacing: 0.4,
                          color: Color(0xFF09857a),
                        ),
                      ),
                      const Spacer(),
                      IconButton(
                        icon: const Icon(Icons.swap_horiz_rounded,
                            color: Colors.teal, size: 26),
                        tooltip: 'Transactions',
                        onPressed: () => Navigator.pushNamed(
                          context,
                          '/transactions',
                          arguments: widget.userPhone,
                        ),
                      ),
                      Tooltip(
                        message: "Calendar View",
                        child: IconButton(
                          icon: Icon(
                            Icons.calendar_today,
                            color: _viewMode == 'calendar' ? Colors.teal : Colors.grey[500],
                            size: 26,
                          ),
                          onPressed: () => setState(() => _viewMode = 'calendar'),
                        ),
                      ),
                      Tooltip(
                        message: "Summary",
                        child: IconButton(
                          icon: Icon(
                            Icons.dashboard,
                            color: _viewMode == 'summary' ? Colors.blueAccent : Colors.grey[500],
                            size: 26,
                          ),
                          onPressed: () => setState(() => _viewMode = 'summary'),
                        ),
                      ),
                      const SizedBox(width: 2),
                      Tooltip(
                        message: "Analytics",
                        child: IconButton(
                          icon: const Icon(
                            Icons.insights_rounded,
                            color: Colors.indigoAccent,
                            size: 26,
                          ),
                          onPressed: () async {
                            await Navigator.pushNamed(
                              context,
                              '/analytics',
                              arguments: widget.userPhone,
                            );
                          },
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
    final mq = MediaQuery.of(context);
    final viewInsets = mq.viewInsets.bottom;
    final bottomInset = viewInsets > 0 ? viewInsets : mq.padding.bottom;

    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: SizedBox(
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
            child: Text(
              "",
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
            ),
          ),
          backgroundColor: Colors.white,
          foregroundColor: Colors.teal,
          elevation: 6,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
        ),
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
    return RefreshIndicator(
      onRefresh: () async => _recompute(),
      child: ListView(
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
        children: [
          // MINI ANALYTICS (two donuts in one card)
          CustomDiamondCard(
            isDiamondCut: true,
            borderRadius: 22,
            padding: const EdgeInsets.symmetric(vertical: 34, horizontal: 14),
            glassGradient: [
              Colors.white.withOpacity(0.21),
              Colors.white.withOpacity(0.09),
            ],
            child: InkWell(
              // tap anywhere on the card to open Analytics
              onTap: () async {
                await Navigator.pushNamed(
                  context,
                  '/analytics',
                  arguments: widget.userPhone,
                );
              },

              borderRadius: BorderRadius.circular(5),
              child: Row(
                children: [
              Expanded(
                 child: _MiniDonutChart(
                   title: "Expenses",
                   total: periodTotalExpense,
                   sections: _miniExpenseSections(),
                   height: 110,           // a bit taller
                   ringThickness: 2,      // slim like Analytics
                   ),
              ),
                  const SizedBox(width: 18),
              Expanded(
                 child: _MiniDonutChart(
                   title: "Income",
                   total: periodTotalIncome,
                   sections: _miniIncomeSections(),
                   height: 110,
                   ringThickness: 2,
              ),
              ),
                ],
              ),
            ),
          ),

          const SizedBox(height: 14),

          // --- Bulk Actions Bar ---
          if (_multiSelectMode)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 6),
              child: Row(
                children: [
                  Text("${_selectedTxIds.length} selected",
                      style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          color: Colors.deepPurple)),
                  const Spacer(),
                  IconButton(
                    icon: const Icon(Icons.label, color: Colors.amber),
                    tooltip: "Edit Label (Bulk)",
                    onPressed: _selectedTxIds.isEmpty ? null : () async {
                      final newLabel = await _showLabelDialog();
                      if (newLabel != null && newLabel.trim().isNotEmpty) {
                        // Expenses
                        for (final tx in filteredExpenses.where((e) => _selectedTxIds.contains(e.id))) {
                          await ExpenseService().updateExpense(
                            widget.userPhone,
                            tx.copyWith(label: newLabel),
                          );
                        }
                        // Incomes (only if your IncomeItem supports label)
                        for (final inc in filteredIncomes.where((i) => _selectedTxIds.contains(i.id))) {
                          await IncomeService().updateIncome(
                            widget.userPhone,
                            inc.copyWith(label: newLabel),
                          );
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
                            final confirmed = await _confirmBulkDelete(_selectedTxIds.length);
                            if (!confirmed) return;

                            for (final tx in filteredExpenses.where(
                              (e) => _selectedTxIds.contains(e.id),
                            )) {
                              await ExpenseService().deleteExpense(widget.userPhone, tx.id);
                            }
                            for (final inc in filteredIncomes.where(
                              (i) => _selectedTxIds.contains(i.id),
                            )) {
                              await IncomeService().deleteIncome(widget.userPhone, inc.id);
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
                      prefixIcon: const Icon(Icons.search, color: Colors.teal),
                      suffixIcon: _searchQuery.isNotEmpty
                          ? IconButton(
                          icon: const Icon(Icons.close, color: Colors.grey),
                          onPressed: () {
                            _searchController.clear();
                            _debounce?.cancel();
                            setState(() => _searchQuery = '');
                            _recompute();
                          })
                          : null,
                      border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(13)),
                      contentPadding: const EdgeInsets.symmetric(
                          vertical: 0, horizontal: 6),
                    ),
                    onChanged: (val) {
                      _debounce?.cancel();
                      _debounce =
                          Timer(const Duration(milliseconds: 200), () {
                            if (!mounted) return;
                            setState(() => _searchQuery = val);
                            _recompute();
                          });
                    },
                  ),
                ),
                const SizedBox(width: 7),
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 200),
                  child: !_multiSelectMode
                      ? IconButton(
                    key: const ValueKey("multisel1"),
                    icon: const Icon(Icons.check_box_rounded,
                        color: Colors.deepPurple),
                    tooltip: "Multi-Select",
                    onPressed: () =>
                        setState(() => _multiSelectMode = true),
                  )
                      : const SizedBox(width: 36),
                ),
              ],
            ),
          ),
    // --- Search & Advanced Filter ---
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 0),
            child: Builder(
              builder: (context) {
                final cats = _expenseCategories().toSet().toList()..sort();
                final currentCat =
                (cats.contains(_searchCategory)) ? _searchCategory : null;

                final dateLabel = (_searchFrom != null && _searchTo != null)
                    ? "${DateFormat('d MMM').format(_searchFrom!)} – ${DateFormat('d MMM').format(_searchTo!)}"
                    : "Date Range";

                final yesterday = _d(DateTime.now().subtract(const Duration(days: 1)));

                bool isYesterdaySelected() {
                  if (_searchFrom == null || _searchTo == null) return false;
                  return _d(_searchFrom!) == yesterday && _d(_searchTo!) == yesterday;
                }

                Widget chip(String label, String filterValue) {
                  final selected = _selectedFilter == filterValue ||
                      (_selectedFilter == filterValue[0]); // supports D/M/Q/Y short
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(label),
                      selected: selected,
                      onSelected: (_) {
                        setState(() {
                          _selectedFilter = filterValue;
                          // Clear custom range so it doesn't intersect with preset filter
                          _searchFrom = null;
                          _searchTo = null;
                        });
                        _recompute();
                      },
                    ),
                  );
                }

                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Row: Category dropdown + Date range button (+ clear)
                    Row(
                      children: [
                        // Category dropdown (pill style, expands)
                        Expanded(
                          child: Container(
                            height: 44,
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(color: Colors.black12),
                              color: Colors.white.withOpacity(0.7),
                            ),
                            child: Row(
                              children: [
                                const Icon(Icons.category_rounded,
                                    size: 18, color: Colors.teal),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: DropdownButtonHideUnderline(
                                    child: DropdownButton<String?>(
                                      isExpanded: true,
                                      value: currentCat,
                                      hint: const Text("All"),
                                      items: <DropdownMenuItem<String?>>[
                                        const DropdownMenuItem<String?>(
                                            value: null, child: Text("All")),
                                        ...cats.map(
                                              (cat) => DropdownMenuItem<String?>(
                                            value: cat,
                                            child: Text(cat),
                                          ),
                                        ),
                                      ],
                                      onChanged: (cat) {
                                        setState(() => _searchCategory = cat);
                                        _recompute();
                                      },
                                    ),
                                  ),
                                ),
                                if (currentCat != null)
                                  InkWell(
                                    borderRadius: BorderRadius.circular(20),
                                    onTap: () {
                                      setState(() => _searchCategory = null);
                                      _recompute();
                                    },
                                    child: const Padding(
                                      padding: EdgeInsets.all(4.0),
                                      child: Icon(Icons.close_rounded,
                                          size: 18, color: Colors.grey),
                                    ),
                                  ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),

                        // Date range (outlined pill)
                        OutlinedButton.icon(
                          icon: const Icon(Icons.calendar_today_rounded, size: 18),
                          label: Text(dateLabel),
                          style: OutlinedButton.styleFrom(
                            padding:
                            const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                            shape: const StadiumBorder(),
                            side: const BorderSide(color: Colors.black12),
                            foregroundColor: Colors.black87,
                          ),
                          onPressed: () async {
                            final picked = await showDateRangePicker(
                              context: context,
                              firstDate: DateTime(2000),
                              lastDate: DateTime.now().add(const Duration(days: 1)),
                            );
                            if (picked != null) {
                              setState(() {
                                _searchFrom = picked.start;
                                _searchTo = picked.end;
                              });
                              _recompute();
                            }
                          },

                        ),

                        if (_searchFrom != null || _searchTo != null)
                          IconButton(
                            tooltip: "Clear Date Range",
                            icon: const Icon(Icons.close_rounded, color: Colors.grey),
                            onPressed: () {
                              setState(() {
                                _searchFrom = null;
                                _searchTo = null;
                              });
                              _recompute();
                            },
                          ),
                      ],
                    ),

                    const SizedBox(height: 8),

                    // Row: Preset filter chips (Day / Yesterday / 2D / Week / Month / Last Month / Quarter / Year / All)
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: [
                          chip('Day', 'Day'),
                          // Special "Yesterday" uses custom date range so it works independently
                          Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: ChoiceChip(
                              label: const Text('Yesterday'),
                              selected: isYesterdaySelected(),
                              onSelected: (_) {
                                setState(() {
                                  _selectedFilter = 'All'; // avoid intersecting with "today"
                                  _searchFrom = yesterday;
                                  _searchTo = yesterday;
                                });
                                _recompute();
                              },
                            ),
                          ),
                          chip('2D', '2D'),
                          chip('Week', 'Week'),
                          chip('Month', 'Month'),
                          chip('Last Month', 'Last Month'),
                          chip('Quarter', 'Quarter'),
                          chip('Year', 'Year'),
                          chip('All', 'All'),
                        ],
                      ),
                    ),
                  ],
                );
              },
          ),
        ),


          const SizedBox(height: 12),
          _filtersAndAccountsCard(),

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
              userPhone: widget.userPhone,
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
                      builder: (context) => EditExpenseScreen(
                        userPhone: widget.userPhone,
                        expense: tx,
                      ),
                    ),
                  );
                  _recompute();
                }
              },

              onDelete: (tx) async {
                if (_multiSelectMode) return;
                if (tx is ExpenseItem) {
                  await ExpenseService()
                      .deleteExpense(widget.userPhone, tx.id);
                } else if (tx is IncomeItem) {
                  await IncomeService()
                      .deleteIncome(widget.userPhone, tx.id);
                }
                _recompute();
              },
              onSplit: (tx) async {
                if (_multiSelectMode) return;
                if (tx is ExpenseItem) {
                  await Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (context) => EditExpenseScreen(
                        userPhone: widget.userPhone,
                        expense: tx,
                        initialStep: 1,
                      ),
                    ),
                  );
                  _recompute();
                }
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
                        icon: const Icon(Icons.today_rounded,
                            color: Colors.teal, size: 24),
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
                            });
                            _updateExpensesForSelectedDay(picked);
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
                      });
                      _updateExpensesForSelectedDay(selectedDay);
                    },
                    calendarBuilders: CalendarBuilders(
                      defaultBuilder: (context, date, focusedDay) {
                        final key = _d(date);
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
                        final key = _d(date);
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
                userPhone: widget.userPhone,
                incomes: const [],
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
                        builder: (context) => EditExpenseScreen(
                          userPhone: widget.userPhone,
                          expense: tx,
                        ),
                      ),
                    );
                    _recompute();
                  }
                },

                onDelete: (tx) async {
                  if (_multiSelectMode) return;
                  if (tx is ExpenseItem) {
                    await ExpenseService()
                        .deleteExpense(widget.userPhone, tx.id);
                    _recompute();
                  }
                },
                onSplit: (tx) async {
                  if (_multiSelectMode) return;
                  if (tx is ExpenseItem) {
                    await Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (context) => EditExpenseScreen(
                          userPhone: widget.userPhone,
                          expense: tx,
                          initialStep: 1,
                        ),
                      ),
                    );
                    _recompute();
                  }
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
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 10),
          glassGradient: [
            Colors.white.withOpacity(0.16),
            Colors.white.withOpacity(0.06)
          ],
          child: ChartSwitcherWidget(
            chartType: _chartType,
            dataType: _dataType,
            onChartTypeChanged: (val) => setState(() => _chartType = val),
            onDataTypeChanged: (val) => setState(() => _dataType = val),
          ),
        ),
        const SizedBox(height: 16),

        if ((_dataType == "All" || _dataType == "Expense") &&
            filteredExpenses.isNotEmpty &&
            _chartType == "Pie" &&
            _hasExpenseCategoryData())
          CustomDiamondCard(
            borderRadius: 26,
            padding:
            const EdgeInsets.symmetric(vertical: 18, horizontal: 10),
            glassGradient: [
              Colors.white.withOpacity(0.19),
              Colors.white.withOpacity(0.08)
            ],
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text("Expense Breakdown",
                    style:
                    TextStyle(fontWeight: FontWeight.bold, fontSize: 17)),
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
                    swapAnimationDuration:
                    const Duration(milliseconds: 650),
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
            padding:
            const EdgeInsets.symmetric(vertical: 18, horizontal: 10),
            glassGradient: [
              Colors.white.withOpacity(0.19),
              Colors.white.withOpacity(0.08)
            ],
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text("Income Breakdown",
                    style:
                    TextStyle(fontWeight: FontWeight.bold, fontSize: 17)),
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
                    swapAnimationDuration:
                    const Duration(milliseconds: 650),
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
            padding:
            const EdgeInsets.symmetric(vertical: 18, horizontal: 10),
            glassGradient: [
              Colors.white.withOpacity(0.19),
              Colors.white.withOpacity(0.08)
            ],
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text("Expense by Category",
                    style:
                    TextStyle(fontWeight: FontWeight.bold, fontSize: 17)),
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
                            getTitlesWidget:
                                (double value, TitleMeta meta) {
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
                      gridData: FlGridData(
                        show: true,
                        horizontalInterval:
                        (_expenseMaxAmount() / 4).clamp(1, double.infinity),
                      ),
                    ),
                    swapAnimationDuration:
                    const Duration(milliseconds: 650),
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
            padding:
            const EdgeInsets.symmetric(vertical: 18, horizontal: 10),
            glassGradient: [
              Colors.white.withOpacity(0.19),
              Colors.white.withOpacity(0.08)
            ],
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text("Income by Category",
                    style:
                    TextStyle(fontWeight: FontWeight.bold, fontSize: 17)),
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
                            getTitlesWidget:
                                (double value, TitleMeta meta) {
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
                      gridData: FlGridData(
                        show: true,
                        horizontalInterval:
                        (_incomeMaxAmount() / 4).clamp(1, double.infinity),
                      ),
                    ),
                    swapAnimationDuration:
                    const Duration(milliseconds: 650),
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
            userPhone: widget.userPhone,
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
                    builder: (context) => EditExpenseScreen(
                      userPhone: widget.userPhone,
                      expense: tx,
                    ),
                  ),
                );
                _recompute();
              }
            },

            onDelete: (tx) async {
              if (_multiSelectMode) return;
              if (tx is ExpenseItem) {
                await ExpenseService()
                    .deleteExpense(widget.userPhone, tx.id);
              } else if (tx is IncomeItem) {
                await IncomeService()
                    .deleteIncome(widget.userPhone, tx.id);
              }
              _recompute();
            },
            onSplit: (tx) async {
              if (_multiSelectMode) return;
              if (tx is ExpenseItem) {
                await Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) => EditExpenseScreen(
                      userPhone: widget.userPhone,
                      expense: tx,
                      initialStep: 1,
                    ),
                  ),
                );
                _recompute();
              }
            },
          ),
        ),
      ],
    );
  }

  // ---------- Chart helpers (with Top-N + "Other") ----------
  Map<String, double> _buildByCategory<T>(Iterable<T> items,
      String Function(T) typeOf, double Function(T) amountOf) {
    final Map<String, double> byCategory = {};
    for (final t in items) {
      final key = (typeOf(t).isEmpty ? "Other" : typeOf(t));
      byCategory[key] = (byCategory[key] ?? 0) + amountOf(t);
    }
    return byCategory;
  }

  Map<String, double> _topN(Map<String, double> map, {int n = 6}) {
    final entries = map.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    final top = entries.take(n).toList();
    final rest =
    entries.skip(n).fold<double>(0, (s, e) => s + e.value);
    return {
      for (final e in top) e.key: e.value,
      if (rest > 0) 'Other': rest,
    };
  }

  List<PieChartSectionData> _expenseCategorySections() {
    if (filteredExpenses.isEmpty) return [];
    final byCategory = _topN(
      _buildByCategory<ExpenseItem>(
        filteredExpenses,
            (e) => e.type,
            (e) => e.amount,
      ),
    );

    final total = byCategory.values.fold<double>(0, (s, v) => s + v);
    if (total == 0) return [];

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
      final percent = (e.value / total * 100);
      final label = e.key.length > 9 ? '${e.key.substring(0, 8)}…' : e.key;
      return PieChartSectionData(
        value: e.value,
        color: colors[i++ % colors.length],
        radius: 44,
        title: '$label\n${percent.toStringAsFixed(1)}%',
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
    if (filteredIncomes.isEmpty) return [];
    final byCategory = _topN(
      _buildByCategory<IncomeItem>(
        filteredIncomes,
            (i) => i.type,
            (i) => i.amount,
      ),
    );

    final total = byCategory.values.fold<double>(0, (s, v) => s + v);
    if (total == 0) return [];

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
      final percent = (e.value / total * 100);
      final label = e.key.length > 9 ? '${e.key.substring(0, 8)}…' : e.key;
      return PieChartSectionData(
        value: e.value,
        color: colors[i++ % colors.length],
        radius: 44,
        title: '$label\n${percent.toStringAsFixed(1)}%',
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
    final byCategory = _topN(
      _buildByCategory<ExpenseItem>(
        filteredExpenses,
            (e) => e.type,
            (e) => e.amount,
      ),
    ).entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value)); // desc

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
    final maxY = byCategory.isEmpty
        ? 100.0
        : byCategory.map((e) => e.value).reduce(math.max).toDouble();

    return List<BarChartGroupData>.generate(byCategory.length, (i) {
      final e = byCategory[i];
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
              toY: maxY,
              color: colors[i % colors.length].withOpacity(0.12),
            ),
          ),
        ],
      );
    });
  }

  double _expenseMaxAmount() {
    if (filteredExpenses.isEmpty) return 100.0;
    final byCategory = _buildByCategory<ExpenseItem>(
      filteredExpenses,
          (e) => e.type,
          (e) => e.amount,
    );
    final double maxVal = byCategory.isEmpty
        ? 0.0
        : byCategory.values.reduce(math.max).toDouble();

    return maxVal < 100.0 ? 100.0 : maxVal;
  }

  List<String> _expenseCategories() {
    final byCategory = _buildByCategory<ExpenseItem>(
      filteredExpenses,
          (e) => e.type,
          (e) => e.amount,
    );
    return byCategory.keys.toList();
  }

  List<BarChartGroupData> _incomeCategoryBarGroups() {
    final byCategory = _topN(
      _buildByCategory<IncomeItem>(
        filteredIncomes,
            (i) => i.type,
            (i) => i.amount,
      ),
    ).entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value)); // desc

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
    final maxY = byCategory.isEmpty
        ? 100.0
        : byCategory.map((e) => e.value).reduce(math.max).toDouble();

    return List<BarChartGroupData>.generate(byCategory.length, (i) {
      final e = byCategory[i];
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
              toY: maxY,
              color: colors[i % colors.length].withOpacity(0.12),
            ),
          ),
        ],
      );
    });
  }

  double _incomeMaxAmount() {
    if (filteredIncomes.isEmpty) return 100.0;
    final byCategory = _buildByCategory<IncomeItem>(
      filteredIncomes,
          (i) => i.type,
          (i) => i.amount,
    );
    final double maxVal = byCategory.isEmpty
        ? 0.0
        : byCategory.values.reduce(math.max).toDouble();
    return maxVal < 100.0 ? 100.0 : maxVal;
  }

  List<String> _incomeCategories() {
    final byCategory = _buildByCategory<IncomeItem>(
      filteredIncomes,
          (i) => i.type,
          (i) => i.amount,
    );
    return byCategory.keys.toList();
  }

  Future<bool> _confirmBulkDelete(int count) async {
    final theme = Theme.of(context);
    final plural = count == 1 ? '' : 's';
    final subject = 'delete $count selected transaction$plural';
    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete transactions?'),
        content: Text('Are you sure you want to $subject? This cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: theme.colorScheme.error),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    return result ?? false;
  }

  Future<String?> _showLabelDialog() async {
    String? result;
    final controller = TextEditingController();
    await showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Set Label'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(hintText: 'Enter new label…'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () {
              result = controller.text.trim();
              Navigator.pop(ctx);
            },
            child: const Text('Apply'),
          ),
        ],
      ),
    );
    return result;
  }
}
class _MiniDonutChart extends StatelessWidget {
  final String title;
  final double total;
  final List<PieChartSectionData> sections;

  /// visual tweaks
  final double height;        // overall height of the donut area
  final double ringThickness; // thin ring, like Analytics

  const _MiniDonutChart({
    required this.title,
    required this.total,
    required this.sections,
    this.height = 150,
    this.ringThickness = 9, // slim & sexy 😏
  });

  @override
  Widget build(BuildContext context) {
    final inr0 = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

    if (sections.isEmpty) {
      return SizedBox(
        height: height,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.w600, color: Colors.black54)),
            const SizedBox(height: 6),
            const Text("No data", style: TextStyle(fontWeight: FontWeight.w600)),
          ],
        ),
      );
    }

    return SizedBox(
      height: height,
      child: LayoutBuilder(
        builder: (ctx, c) {
          // compute a clean radius and center gap so the ring is thin
          final size = math.min(c.maxWidth, height).toDouble();

          final outerRadius = size / 2 - 8;              // padding from edges
          final centerSpace = (outerRadius - ringThickness).clamp(0.0, outerRadius).toDouble();


          // rebuild sections with our desired radius (keeps colors/values)
          final slimSections = sections.map((s) {
            return PieChartSectionData(
              value: s.value,
              color: s.color,
              title: '',                 // keep donut clean (labels in center)
              radius: outerRadius,       // uniform radius for all slices
            );
          }).toList();

          return Stack(
            alignment: Alignment.center,
            children: [
              PieChart(
                PieChartData(
                  sections: slimSections,
                  sectionsSpace: 2,                 // subtle separation
                  startDegreeOffset: -90,           // 12 o'clock start
                  centerSpaceRadius: centerSpace,   // makes it a slim ring
                  pieTouchData: PieTouchData(enabled: false),
                  borderData: FlBorderData(show: false),
                ),
                swapAnimationDuration: const Duration(milliseconds: 450),
                swapAnimationCurve: Curves.easeOutCubic,
              ),
              Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 12,
                      color: Colors.black54,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.2,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    inr0.format(total),
                    style: const TextStyle(
                      fontSize: 14.5,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ],
          );
        },
      ),
    );
  }
}
