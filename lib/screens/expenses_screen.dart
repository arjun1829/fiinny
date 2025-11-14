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
  Set<String> _friendFilterPhones = {};
  Set<String> _groupFilterIds = {};

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
      if (_friendFilterPhones.isNotEmpty) {
        final ids = e.friendIds.toSet();
        if (ids.isEmpty || ids.intersection(_friendFilterPhones).isEmpty) {
          return false;
        }
      }
      if (_groupFilterIds.isNotEmpty) {
        final gid = (e.groupId ?? '').trim();
        if (gid.isEmpty || !_groupFilterIds.contains(gid)) {
          return false;
        }
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

  (int banks, int cards) _computeBankCardStats() {
    final bankSet = <String>{};
    final cardSet = <String>{};

    void addBankCard({String? bank, String? last4}) {
      final bankName = (bank ?? '').trim();
      if (bankName.isNotEmpty) {
        bankSet.add(bankName.toUpperCase());
      }
      final l4 = (last4 ?? '').trim();
      if (bankName.isNotEmpty && l4.isNotEmpty) {
        cardSet.add('${bankName.toUpperCase()}-$l4');
      }
    }

    for (final e in filteredExpenses) {
      addBankCard(bank: e.issuerBank, last4: e.cardLast4);
    }
    for (final i in filteredIncomes) {
      addBankCard(bank: i.issuerBank);
    }

    return (bankSet.length, cardSet.length);
  }

  String _periodLabelFor(String token) {
    switch (token) {
      case 'Day':
      case 'D':
        return 'Today';
      case '2D':
        return 'Last 2 Days';
      case 'Week':
      case 'W':
        return 'This Week';
      case 'Last Month':
      case 'LM':
        return 'Last Month';
      case 'Quarter':
      case 'Q':
        return 'This Quarter';
      case 'Year':
      case 'Y':
        return 'This Year';
      case 'Month':
      case 'M':
        return 'This Month';
      case 'All':
      default:
        return 'All Time';
    }
  }

  String _currentPeriodLabel() {
    if (_searchFrom != null && _searchTo != null) {
      final start = _d(_searchFrom!);
      final end = _d(_searchTo!);
      final yesterday = _d(DateTime.now().subtract(const Duration(days: 1)));
      if (start == yesterday && end == yesterday) {
        return 'Yesterday';
      }
      if (start == end) {
        return DateFormat('d MMM y').format(start);
      }
      final sameYear = start.year == end.year;
      final startFormat = DateFormat(sameYear ? 'd MMM' : 'd MMM y').format(start);
      final endFormat = DateFormat('d MMM y').format(end);
      return '$startFormat – $endFormat';
    }
    return _periodLabelFor(_selectedFilter);
  }

  bool get _hasActiveFilters =>
      (_searchCategory != null && _searchCategory!.isNotEmpty) ||
      (_merchantFilter != null && _merchantFilter!.isNotEmpty) ||
      (_bankFilter != null && _bankFilter!.isNotEmpty) ||
      (_cardLast4Filter != null && _cardLast4Filter!.isNotEmpty) ||
      (_instrumentFilter != null && _instrumentFilter!.isNotEmpty) ||
      _friendFilterPhones.isNotEmpty ||
      _groupFilterIds.isNotEmpty ||
      _searchFrom != null ||
      _searchTo != null;

  Widget _buildActiveFiltersWrap() {
    final chips = _activeFilterChips();
    if (chips.isEmpty) {
      return const SizedBox(height: 12);
    }
    return Padding(
      padding: const EdgeInsets.only(top: 12, left: 4, right: 4),
      child: Wrap(
        spacing: 8,
        runSpacing: 6,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          ...chips,
          if (_hasActiveFilters)
            Padding(
              padding: const EdgeInsets.only(left: 4),
              child: TextButton(
                onPressed: _clearAllFilters,
                child: const Text('Clear filters'),
              ),
            ),
        ],
      ),
    );
  }

  List<Widget> _activeFilterChips() {
    final chips = <Widget>[];

    if (_searchFrom != null && _searchTo != null) {
      final label = _currentPeriodLabel();
      chips.add(InputChip(
        label: Text(label),
        onDeleted: () {
          setState(() {
            _searchFrom = null;
            _searchTo = null;
          });
          _recompute();
        },
      ));
    }

    if (_searchCategory != null && _searchCategory!.isNotEmpty) {
      chips.add(InputChip(
        label: Text(_searchCategory!),
        onDeleted: () {
          setState(() => _searchCategory = null);
          _recompute();
        },
      ));
    }

    if (_merchantFilter != null && _merchantFilter!.isNotEmpty) {
      final merchantName = _formatMerchantName(_merchantFilter!);
      chips.add(InputChip(
        label: Text(merchantName),
        onDeleted: () {
          setState(() => _merchantFilter = null);
          _recompute();
        },
      ));
    }

    if (_bankFilter != null && _bankFilter!.isNotEmpty) {
      final bank = _bankFilter!;
      final label = (_cardLast4Filter != null && _cardLast4Filter!.isNotEmpty)
          ? '$bank • ••${_cardLast4Filter!}'
          : bank;
      chips.add(InputChip(
        label: Text(label),
        onDeleted: () {
          setState(() {
            _bankFilter = null;
            _cardLast4Filter = null;
          });
          _recompute();
        },
      ));
    } else if (_cardLast4Filter != null && _cardLast4Filter!.isNotEmpty) {
      chips.add(InputChip(
        label: Text('••${_cardLast4Filter!}'),
        onDeleted: () {
          setState(() => _cardLast4Filter = null);
          _recompute();
        },
      ));
    }

    if (_instrumentFilter != null && _instrumentFilter!.isNotEmpty) {
      chips.add(InputChip(
        label: Text(_instrumentFilter!),
        onDeleted: () {
          setState(() => _instrumentFilter = null);
          _recompute();
        },
      ));
    }

    final friendPhones = _friendFilterPhones.toList()..sort();
    for (final phone in friendPhones) {
      final friendName = _friendsById[phone]?.name.trim();
      final label = (friendName != null && friendName.isNotEmpty) ? friendName : phone;
      chips.add(InputChip(
        label: Text(label),
        onDeleted: () {
          setState(() {
            _friendFilterPhones = {..._friendFilterPhones}..remove(phone);
          });
          _recompute();
        },
      ));
    }

    final groupIds = _groupFilterIds.toList()..sort();
    for (final groupId in groupIds) {
      final label = groupId.isEmpty ? 'Group' : 'Group $groupId';
      chips.add(InputChip(
        label: Text(label),
        onDeleted: () {
          setState(() {
            _groupFilterIds = {..._groupFilterIds}..remove(groupId);
          });
          _recompute();
        },
      ));
    }

    return chips;
  }

  void _clearAllFilters() {
    setState(() {
      _selectedFilter = 'Month';
      _searchCategory = null;
      _merchantFilter = null;
      _bankFilter = null;
      _cardLast4Filter = null;
      _instrumentFilter = null;
      _friendFilterPhones = {};
      _groupFilterIds = {};
      _searchFrom = null;
      _searchTo = null;
    });
    _recompute();
  }

  Future<void> _showPeriodPickerBottomSheet() async {
    final now = DateTime.now();
    final yesterday = _d(now.subtract(const Duration(days: 1)));

    bool isYesterdaySelected() {
      if (_searchFrom == null || _searchTo == null) return false;
      return _d(_searchFrom!) == yesterday && _d(_searchTo!) == yesterday;
    }

    bool isTokenSelected(String token) {
      switch (token) {
        case 'Day':
          return (_selectedFilter == 'Day' || _selectedFilter == 'D') &&
              _searchFrom == null &&
              _searchTo == null;
        case '2D':
          return _selectedFilter == '2D' && _searchFrom == null && _searchTo == null;
        case 'Week':
          return (_selectedFilter == 'Week' || _selectedFilter == 'W') &&
              _searchFrom == null &&
              _searchTo == null;
        case 'Month':
          return (_selectedFilter == 'Month' || _selectedFilter == 'M') &&
              _searchFrom == null &&
              _searchTo == null;
        case 'Last Month':
          return (_selectedFilter == 'Last Month' || _selectedFilter == 'LM') &&
              _searchFrom == null &&
              _searchTo == null;
        case 'Quarter':
          return (_selectedFilter == 'Quarter' || _selectedFilter == 'Q') &&
              _searchFrom == null &&
              _searchTo == null;
        case 'Year':
          return (_selectedFilter == 'Year' || _selectedFilter == 'Y') &&
              _searchFrom == null &&
              _searchTo == null;
        case 'All':
          return _selectedFilter == 'All' &&
              _searchFrom == null &&
              _searchTo == null;
        default:
          return false;
      }
    }

    await showModalBottomSheet<void>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: Colors.grey[300],
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Text('Select period',
                    style: Fx.label.copyWith(fontSize: 16, fontWeight: FontWeight.w600)),
                const SizedBox(height: 12),
                ...[
                  ('Day', 'Day'),
                  ('Yesterday', 'Yesterday'),
                  ('2D', '2D'),
                  ('Week', 'Week'),
                  ('Month', 'Month'),
                  ('Last Month', 'Last Month'),
                  ('Quarter', 'Quarter'),
                  ('Year', 'Year'),
                  ('All Time', 'All'),
                ].map((entry) {
                  final label = entry.$1;
                  final token = entry.$2;
                  final selected = token == 'Yesterday'
                      ? isYesterdaySelected()
                      : isTokenSelected(token);
                  return ListTile(
                    title: Text(label),
                    trailing: selected
                        ? const Icon(Icons.check_circle, color: Colors.teal)
                        : null,
                    onTap: () {
                      Navigator.pop(ctx);
                      setState(() {
                        if (token == 'Yesterday') {
                          _selectedFilter = 'All';
                          _searchFrom = yesterday;
                          _searchTo = yesterday;
                        } else {
                          _selectedFilter = token;
                          _searchFrom = null;
                          _searchTo = null;
                        }
                      });
                      _recompute();
                    },
                  );
                }).toList(),
                const SizedBox(height: 12),
              ],
            ),
          ),
        );
      },
    );
  }

  Future<void> _openFiltersScreen() async {
    final config = await Navigator.push<ExpenseFilterConfig>(
      context,
      MaterialPageRoute(
        builder: (_) => ExpenseFiltersScreen(
          initialConfig: ExpenseFilterConfig(
            periodToken: _selectedFilter,
            customRange: _searchFrom != null && _searchTo != null
                ? DateTimeRange(start: _searchFrom!, end: _searchTo!)
                : null,
            category: _searchCategory,
            merchantKey: _merchantFilter,
            bank: _bankFilter,
            cardLast4: _cardLast4Filter,
            friendPhones: _friendFilterPhones,
            groupIds: _groupFilterIds,
          ),
          expenses: allExpenses,
          incomes: allIncomes,
          friendsById: _friendsById,
        ),
      ),
    );

    if (config != null) {
      setState(() {
        _selectedFilter = config.periodToken;
        if (config.customRange != null) {
          _searchFrom = config.customRange!.start;
          _searchTo = config.customRange!.end;
        } else {
          _searchFrom = null;
          _searchTo = null;
        }
        _searchCategory = config.category;
        _merchantFilter = config.merchantKey;
        _bankFilter = config.bank;
        _cardLast4Filter = config.cardLast4;
        _friendFilterPhones = {...config.friendPhones};
        _groupFilterIds = {...config.groupIds};
      });
      _recompute();
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
      backgroundColor: Colors.transparent,
      floatingActionButton: _buildFAB(context),
      body: Stack(
        children: [
          Container(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Color(0xFF00423D),
                  Color(0xFF006D64),
                  Colors.white,
                ],
                stops: const [0.0, 0.45, 1.0],
              ),
            ),
          ),
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
                          color: Colors.white,
                        ),
                      ),
                      const Spacer(),
                      Tooltip(
                        message: "Calendar View",
                        child: IconButton(
                          icon: Icon(
                            Icons.calendar_today,
                            color:
                                _viewMode == 'calendar' ? Colors.white : Colors.white70,
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
                            color:
                                _viewMode == 'summary' ? Colors.white : Colors.white70,
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
                            color: Colors.white,
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
    final bankCardStats = _computeBankCardStats();
    final periodLabel = _currentPeriodLabel();
    final txCount = filteredExpenses.length + filteredIncomes.length;
    return RefreshIndicator(
      onRefresh: () async => _recompute(),
      child: ListView(
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
        children: [
          _SummaryRingCard(
            spent: periodTotalExpense,
            received: periodTotalIncome,
            bankCount: bankCardStats.$1,
            cardCount: bankCardStats.$2,
            txCount: txCount,
            periodLabel: periodLabel,
            onTapPeriod: _showPeriodPickerBottomSheet,
            onTap: () async {
              await Navigator.pushNamed(
                context,
                '/analytics',
                arguments: widget.userPhone,
              );
            },
          ),

          const SizedBox(height: 12),

          Align(
            alignment: Alignment.centerLeft,
            child: ElevatedButton.icon(
              icon: const Icon(Icons.filter_alt_rounded, size: 18),
              label: const Text('Filters'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Fx.mintDark,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(22),
                ),
              ),
              onPressed: _openFiltersScreen,
            ),
          ),

          _buildActiveFiltersWrap(),

          const SizedBox(height: 8),

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

class _SummaryRingCard extends StatelessWidget {
  final double spent;
  final double received;
  final int bankCount;
  final int cardCount;
  final int txCount;
  final String periodLabel;
  final VoidCallback onTapPeriod;
  final VoidCallback? onTap;

  const _SummaryRingCard({
    required this.spent,
    required this.received,
    required this.bankCount,
    required this.cardCount,
    required this.txCount,
    required this.periodLabel,
    required this.onTapPeriod,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final formatter = NumberFormat.currency(
      locale: 'en_IN',
      symbol: '₹',
      decimalDigits: 0,
    );

    final spentValue = spent.abs();
    final incomeValue = received.abs();
    final hasData = spentValue > 0 || incomeValue > 0;
    final chartSpent = spentValue == 0 && !hasData ? 0.01 : spentValue;
    double chartRemainder;
    if (!hasData) {
      chartRemainder = 1;
    } else if (incomeValue <= 0) {
      chartRemainder = spentValue > 0 ? spentValue : 1;
    } else {
      chartRemainder = incomeValue;
    }

    return Material(
      color: Colors.white,
      elevation: 3,
      borderRadius: BorderRadius.circular(24),
      child: InkWell(
        borderRadius: BorderRadius.circular(24),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 18),
          child: Row(
            children: [
              SizedBox(
                width: 120,
                height: 120,
                child: PieChart(
                  PieChartData(
                    sectionsSpace: 0,
                    centerSpaceRadius: 48,
                    startDegreeOffset: -90,
                    sections: [
                      PieChartSectionData(
                        value: chartSpent <= 0 ? 0.01 : chartSpent,
                        color: Fx.mintDark,
                        title: '',
                        radius: 60,
                      ),
                      PieChartSectionData(
                        value: chartRemainder <= 0 ? 0.01 : chartRemainder,
                        color: Fx.mint.withOpacity(0.2),
                        title: '',
                        radius: 60,
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 20),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton(
                        style: TextButton.styleFrom(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          minimumSize: Size.zero,
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          backgroundColor: Colors.grey[100],
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(20),
                          ),
                        ),
                        onPressed: onTapPeriod,
                        child: Text(
                          periodLabel,
                          style: Fx.label.copyWith(fontWeight: FontWeight.w600),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Text('Spent', style: Fx.label.copyWith(color: Fx.text)),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            formatter.format(spentValue),
                            textAlign: TextAlign.right,
                            style: Fx.number.copyWith(fontSize: 24),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Text('Received', style: Fx.label.copyWith(color: Fx.text)),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            formatter.format(incomeValue),
                            textAlign: TextAlign.right,
                            style: Fx.label.copyWith(fontSize: 18, fontWeight: FontWeight.w600),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'Banks: $bankCount · Cards: $cardCount · Tx: $txCount',
                      style: Fx.label.copyWith(
                        fontSize: 12,
                        color: Colors.grey[600],
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
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

class ExpenseFilterConfig {
  final String periodToken;
  final DateTimeRange? customRange;
  final String? category;
  final String? merchantKey;
  final String? bank;
  final String? cardLast4;
  final Set<String> friendPhones;
  final Set<String> groupIds;

  static const _sentinel = Object();

  ExpenseFilterConfig({
    required this.periodToken,
    this.customRange,
    this.category,
    this.merchantKey,
    this.bank,
    this.cardLast4,
    Set<String>? friendPhones,
    Set<String>? groupIds,
  })  : friendPhones = Set<String>.from(friendPhones ?? const <String>{}),
        groupIds = Set<String>.from(groupIds ?? const <String>{});

  ExpenseFilterConfig copyWith({
    String? periodToken,
    Object? customRange = _sentinel,
    Object? category = _sentinel,
    Object? merchantKey = _sentinel,
    Object? bank = _sentinel,
    Object? cardLast4 = _sentinel,
    Set<String>? friendPhones,
    Set<String>? groupIds,
  }) {
    return ExpenseFilterConfig(
      periodToken: periodToken ?? this.periodToken,
      customRange: customRange == _sentinel
          ? this.customRange
          : customRange as DateTimeRange?,
      category:
          category == _sentinel ? this.category : category as String?,
      merchantKey: merchantKey == _sentinel
          ? this.merchantKey
          : merchantKey as String?,
      bank: bank == _sentinel ? this.bank : bank as String?,
      cardLast4: cardLast4 == _sentinel
          ? this.cardLast4
          : cardLast4 as String?,
      friendPhones: friendPhones ?? this.friendPhones,
      groupIds: groupIds ?? this.groupIds,
    );
  }
}

class ExpenseFiltersScreen extends StatefulWidget {
  final ExpenseFilterConfig initialConfig;
  final List<ExpenseItem> expenses;
  final List<IncomeItem> incomes;
  final Map<String, FriendModel> friendsById;

  const ExpenseFiltersScreen({
    required this.initialConfig,
    required this.expenses,
    required this.incomes,
    required this.friendsById,
    Key? key,
  }) : super(key: key);

  @override
  State<ExpenseFiltersScreen> createState() => _ExpenseFiltersScreenState();
}

class _ExpenseFiltersScreenState extends State<ExpenseFiltersScreen> {
  late String _periodToken;
  DateTimeRange? _customRange;
  String? _category;
  String? _merchantKey;
  String? _bank;
  String? _cardLast4;
  late Set<String> _friendPhones;
  late Set<String> _groupIds;

  int _selectedCategoryIndex = 0;

  late final List<String> _categoryOptions;
  late final List<String> _merchantOptions;
  late final Map<String, Set<String>> _bankToCards;
  late final List<String> _bankOptions;
  late final List<String> _groupOptions;

  List<FriendModel> get _friends => widget.friendsById.values.toList()
    ..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));

  @override
  void initState() {
    super.initState();
    _periodToken = widget.initialConfig.periodToken;
    _customRange = widget.initialConfig.customRange;
    _category = widget.initialConfig.category;
    _merchantKey = widget.initialConfig.merchantKey;
    _bank = widget.initialConfig.bank;
    _cardLast4 = widget.initialConfig.cardLast4;
    _friendPhones = Set<String>.from(widget.initialConfig.friendPhones);
    _groupIds = Set<String>.from(widget.initialConfig.groupIds);

    final categorySet = <String>{};
    for (final e in widget.expenses) {
      final type = e.type.trim().isEmpty ? 'Other' : e.type.trim();
      if (type.isNotEmpty) {
        categorySet.add(type);
      }
    }
    _categoryOptions = categorySet.toList()..sort();

    final merchantMap = AnalyticsAgg.byMerchant(widget.expenses);
    _merchantOptions = merchantMap.keys.toList()
      ..sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));

    final bankMap = <String, Set<String>>{};
    void addBank(String? bank, [String? last4]) {
      final b = (bank ?? '').trim();
      if (b.isEmpty) return;
      final upper = b.toUpperCase();
      final set = bankMap.putIfAbsent(upper, () => <String>{});
      final l4 = (last4 ?? '').trim();
      if (l4.isNotEmpty) {
        set.add(l4);
      }
    }

    for (final e in widget.expenses) {
      addBank(e.issuerBank, e.cardLast4);
    }
    for (final i in widget.incomes) {
      addBank(i.issuerBank);
    }

    _bankToCards = bankMap;
    _bankOptions = bankMap.keys.toList()..sort();

    final groups = <String>{};
    for (final e in widget.expenses) {
      final gid = (e.groupId ?? '').trim();
      if (gid.isNotEmpty) {
        groups.add(gid);
      }
    }
    _groupOptions = groups.toList()..sort();
  }

  void _resetFilters() {
    setState(() {
      _periodToken = widget.initialConfig.periodToken;
      _customRange = null;
      _category = null;
      _merchantKey = null;
      _bank = null;
      _cardLast4 = null;
      _friendPhones = {};
      _groupIds = {};
    });
  }

  void _applyFilters() {
    Navigator.pop(
      context,
      ExpenseFilterConfig(
        periodToken: _periodToken,
        customRange: _customRange,
        category: _category,
        merchantKey: _merchantKey,
        bank: _bank,
        cardLast4: _cardLast4,
        friendPhones: _friendPhones,
        groupIds: _groupIds,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final menuItems = [
      'Date',
      'Category',
      'Merchant',
      'Bank & Cards',
      'Friends',
      'Groups',
    ];

    return Scaffold(
      appBar: AppBar(title: const Text('Filters')),
      body: Row(
        children: [
          Container(
            width: 140,
            color: Colors.grey[100],
            child: ListView.builder(
              itemCount: menuItems.length,
              itemBuilder: (context, index) {
                final selected = _selectedCategoryIndex == index;
                return Material(
                  color: selected ? Fx.mint.withOpacity(0.12) : Colors.transparent,
                  child: ListTile(
                    title: Text(
                      menuItems[index],
                      style: TextStyle(
                        fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
                        color: selected ? Fx.textStrong : Fx.text,
                      ),
                    ),
                    onTap: () => setState(() => _selectedCategoryIndex = index),
                  ),
                );
              },
            ),
          ),
          const VerticalDivider(width: 1),
          Expanded(
            child: _buildFilterPanel(_selectedCategoryIndex),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: Colors.white,
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.06),
                blurRadius: 12,
                offset: const Offset(0, -2),
              ),
            ],
          ),
          child: Row(
            children: [
              TextButton(
                onPressed: _resetFilters,
                child: const Text('Clear'),
              ),
              const Spacer(),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: Fx.mintDark,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(22),
                  ),
                ),
                onPressed: _applyFilters,
                child: const Text('Apply'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildFilterPanel(int index) {
    switch (index) {
      case 0:
        return _buildDatePanel();
      case 1:
        return _buildCategoryPanel();
      case 2:
        return _buildMerchantPanel();
      case 3:
        return _buildBankCardPanel();
      case 4:
        return _buildFriendsPanel();
      case 5:
      default:
        return _buildGroupsPanel();
    }
  }

  Widget _buildDatePanel() {
    bool isYesterdaySelected() {
      if (_customRange == null) return false;
      final start = _customRange!.start;
      final end = _customRange!.end;
      final now = DateTime.now();
      final yesterday = DateTime(now.year, now.month, now.day).subtract(const Duration(days: 1));
      return DateUtils.isSameDay(start, yesterday) && DateUtils.isSameDay(end, yesterday);
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            _periodChoiceChip('Day', () {
              setState(() {
                _periodToken = 'Day';
                _customRange = null;
              });
            }, selected: _periodToken == 'Day' || _periodToken == 'D'),
            _periodChoiceChip('Yesterday', () {
              final now = DateTime.now();
              final y = DateTime(now.year, now.month, now.day).subtract(const Duration(days: 1));
              setState(() {
                _periodToken = 'All';
                _customRange = DateTimeRange(start: y, end: y);
              });
            }, selected: isYesterdaySelected()),
            _periodChoiceChip('2D', () {
              setState(() {
                _periodToken = '2D';
                _customRange = null;
              });
            }, selected: _periodToken == '2D'),
            _periodChoiceChip('Week', () {
              setState(() {
                _periodToken = 'Week';
                _customRange = null;
              });
            }, selected: _periodToken == 'Week' || _periodToken == 'W'),
            _periodChoiceChip('Month', () {
              setState(() {
                _periodToken = 'Month';
                _customRange = null;
              });
            }, selected: _periodToken == 'Month' || _periodToken == 'M'),
            _periodChoiceChip('Last Month', () {
              setState(() {
                _periodToken = 'Last Month';
                _customRange = null;
              });
            }, selected: _periodToken == 'Last Month' || _periodToken == 'LM'),
            _periodChoiceChip('Quarter', () {
              setState(() {
                _periodToken = 'Quarter';
                _customRange = null;
              });
            }, selected: _periodToken == 'Quarter' || _periodToken == 'Q'),
            _periodChoiceChip('Year', () {
              setState(() {
                _periodToken = 'Year';
                _customRange = null;
              });
            }, selected: _periodToken == 'Year' || _periodToken == 'Y'),
            _periodChoiceChip('All Time', () {
              setState(() {
                _periodToken = 'All';
                _customRange = null;
              });
            }, selected: _periodToken == 'All' && _customRange == null),
          ],
        ),
        const SizedBox(height: 24),
        OutlinedButton.icon(
          icon: const Icon(Icons.date_range),
          label: Text(_customRange == null
              ? 'Pick date range'
              : '${DateFormat('d MMM y').format(_customRange!.start)} – ${DateFormat('d MMM y').format(_customRange!.end)}'),
          onPressed: () async {
            final picked = await showDateRangePicker(
              context: context,
              firstDate: DateTime(2000),
              lastDate: DateTime.now().add(const Duration(days: 1)),
              initialDateRange: _customRange,
            );
            if (picked != null) {
              setState(() {
                _periodToken = 'All';
                _customRange = picked;
              });
            }
          },
        ),
        if (_customRange != null)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: () => setState(() => _customRange = null),
              child: const Text('Clear range'),
            ),
          ),
      ],
    );
  }

  Widget _buildCategoryPanel() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        RadioListTile<String?>(
          value: null,
          groupValue: _category,
          title: const Text('All categories'),
          onChanged: (value) => setState(() => _category = value),
        ),
        ..._categoryOptions.map((cat) {
          return RadioListTile<String?>(
            value: cat,
            groupValue: _category,
            title: Text(cat),
            onChanged: (value) => setState(() => _category = value),
          );
        }),
      ],
    );
  }

  Widget _buildMerchantPanel() {
    if (_merchantOptions.isEmpty) {
      return const Center(child: Text('No merchants yet'));
    }
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        RadioListTile<String?>(
          value: null,
          groupValue: _merchantKey,
          title: const Text('All merchants'),
          onChanged: (value) => setState(() => _merchantKey = value),
        ),
        ..._merchantOptions.map((merchant) {
          final display = _formatMerchant(merchant);
          return RadioListTile<String?>(
            value: merchant,
            groupValue: _merchantKey,
            title: Text(display),
            onChanged: (value) => setState(() => _merchantKey = value),
          );
        }),
      ],
    );
  }

  Widget _buildBankCardPanel() {
    if (_bankOptions.isEmpty) {
      return const Center(child: Text('No banks detected'));
    }
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        RadioListTile<String?>(
          value: null,
          groupValue: _bank,
          title: const Text('All banks'),
          onChanged: (value) => setState(() {
            _bank = null;
            _cardLast4 = null;
          }),
        ),
        ..._bankOptions.map((bank) {
          final cards = _bankToCards[bank] ?? {};
          final isSelected = _bank == bank;
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              RadioListTile<String?>(
                value: bank,
                groupValue: _bank,
                title: Text(bank),
                onChanged: (value) => setState(() {
                  _bank = bank;
                  if (!(cards.contains(_cardLast4 ?? ''))) {
                    _cardLast4 = null;
                  }
                }),
              ),
              if (isSelected && cards.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(left: 16, bottom: 12),
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: cards.map((card) {
                      return ChoiceChip(
                        label: Text('••$card'),
                        selected: _cardLast4 == card,
                        onSelected: (selected) {
                          setState(() {
                            _cardLast4 = selected ? card : null;
                            _bank = bank;
                          });
                        },
                      );
                    }).toList(),
                  ),
                ),
            ],
          );
        }),
      ],
    );
  }

  Widget _buildFriendsPanel() {
    if (_friends.isEmpty) {
      return const Center(child: Text('No friends added yet'));
    }
    return ListView(
      padding: const EdgeInsets.all(16),
      children: _friends.map((friend) {
        final selected = _friendPhones.contains(friend.phone);
        return CheckboxListTile(
          value: selected,
          onChanged: (value) {
            setState(() {
              if (value == true) {
                _friendPhones = {..._friendPhones, friend.phone};
              } else {
                _friendPhones = {..._friendPhones}..remove(friend.phone);
              }
            });
          },
          title: Text(friend.name.isEmpty ? friend.phone : friend.name),
          subtitle: friend.name.isNotEmpty ? Text(friend.phone) : null,
        );
      }).toList(),
    );
  }

  Widget _buildGroupsPanel() {
    if (_groupOptions.isEmpty) {
      return const Center(child: Text('No groups yet'));
    }
    return ListView(
      padding: const EdgeInsets.all(16),
      children: _groupOptions.map((group) {
        final selected = _groupIds.contains(group);
        return CheckboxListTile(
          value: selected,
          onChanged: (value) {
            setState(() {
              if (value == true) {
                _groupIds = {..._groupIds, group};
              } else {
                _groupIds = {..._groupIds}..remove(group);
              }
            });
          },
          title: Text(group),
        );
      }).toList(),
    );
  }

  ChoiceChip _periodChoiceChip(String label, VoidCallback onSelected,
      {required bool selected}) {
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onSelected(),
    );
  }

  String _formatMerchant(String raw) {
    final trimmed = raw.trim();
    if (trimmed.isEmpty) return 'Unknown';
    return trimmed
        .split(RegExp(r'\s+'))
        .where((word) => word.isNotEmpty)
        .map((word) =>
            '${word[0].toUpperCase()}${word.substring(1).toLowerCase()}')
        .join(' ');
  }
}
