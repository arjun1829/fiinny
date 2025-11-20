// lib/screens/expenses_screen.dart
import 'dart:async';
import 'dart:math' as math;

import 'package:characters/characters.dart';
import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:table_calendar/table_calendar.dart';
import 'package:intl/intl.dart';

import '../core/analytics/aggregators.dart';
import '../models/expense_item.dart';
import '../models/income_item.dart';
import '../models/friend_model.dart';
import '../models/group_model.dart';
import '../services/expense_service.dart';
import '../services/income_service.dart';
import '../services/friend_service.dart';
import '../services/group_service.dart';
import 'edit_expense_screen.dart';
import '../widgets/date_filter_bar.dart';
import '../widgets/chart_switcher_widget.dart';
import '../widgets/unified_transaction_list.dart';
import '../themes/custom_card.dart';
import '../themes/tokens.dart';

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
  List<GroupModel> _groups = [];

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
  DateTime? _searchFrom;
  DateTime? _searchTo;
  final TextEditingController _searchController = TextEditingController();

  Set<String> _selectedCategories = {};
  Set<String> _selectedMerchants = {};
  Set<String> _selectedBanks = {};
  Set<String> _friendFilterPhones = {};
  Set<String> _groupFilterIds = {};

  // Subscriptions / Debounce
  StreamSubscription<List<ExpenseItem>>? _expSub;
  StreamSubscription<List<IncomeItem>>? _incSub;
  StreamSubscription<List<FriendModel>>? _friendSub;
  StreamSubscription<List<GroupModel>>? _groupSub;
  Timer? _debounce;

  // Prevent multiple recomputes inside the same frame (avoids re-entrant layout)
  bool _pendingRecompute = false;

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
    _groupSub?.cancel();
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
      _scheduleRecompute();
    });

    _incSub = IncomeService().getIncomesStream(widget.userPhone).listen((incomes) {
      if (!mounted) return;
      allIncomes = incomes;
      _scheduleRecompute();
    });

    _friendSub = FriendService().streamFriends(widget.userPhone).listen((friends) {
      if (!mounted) return;
      setState(() {
        _friendsById = {for (var f in friends) f.phone: f};
      });
    });

    _groupSub = GroupService().streamGroups(widget.userPhone).listen((groups) {
      if (!mounted) return;
      setState(() {
        _groups = groups;
      });
    });
  }

  void _recomputeInternal() {
    _applyFilter();
    _generateDailyTotals();
    _updateExpensesForSelectedDay(_selectedDay ?? DateTime.now());
  }

  void _scheduleRecompute() {
    if (!mounted) return;
    if (_pendingRecompute) return;
    _pendingRecompute = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _pendingRecompute = false;
      _recomputeInternal();
      setState(() {});
    });
  }

  String _normalizeBank(String? bank) {
    final value = (bank ?? '').trim();
    return value.isEmpty ? '' : value.toUpperCase();
  }

  String _encodeBankSelection(String bank, [String? cardLast4]) {
    final normalized = _normalizeBank(bank);
    if (normalized.isEmpty) return normalized;
    final l4 = (cardLast4 ?? '').trim();
    if (l4.isEmpty) return normalized;
    return '$normalized|$l4';
  }

  bool _matchesBankFilters(String? bank, String? cardLast4) {
    if (_selectedBanks.isEmpty) return true;
    final normalizedBank = _normalizeBank(bank);
    if (normalizedBank.isEmpty) return false;
    if (_selectedBanks.contains(normalizedBank)) return true;
    final l4 = (cardLast4 ?? '').trim();
    if (l4.isEmpty) return false;
    return _selectedBanks.contains('$normalizedBank|$l4');
  }

  String _displayBankName(String normalized) {
    if (normalized.isEmpty) return 'Unknown Bank';
    for (final e in allExpenses) {
      final candidate = _normalizeBank(e.issuerBank);
      if (candidate == normalized) {
        return (e.issuerBank ?? '').trim();
      }
    }
    for (final i in allIncomes) {
      final candidate = _normalizeBank(i.issuerBank);
      if (candidate == normalized) {
        return (i.issuerBank ?? '').trim();
      }
    }
    final lower = normalized.toLowerCase();
    return lower
        .split(RegExp(r'[_\s]+'))
        .where((part) => part.isNotEmpty)
        .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
        .join(' ');
  }

  String _displayBankSelectionLabel(String selection) {
    if (selection.isEmpty) return 'Bank';
    final parts = selection.split('|');
    final bankLabel = _displayBankName(parts.first);
    if (parts.length > 1 && parts[1].isNotEmpty) {
      return '$bankLabel • ••${parts[1]}';
    }
    return bankLabel;
  }

  String _normalizeMerchantKey(String raw) {
    final key = AnalyticsAgg.displayMerchantKey(raw).trim();
    return key.toUpperCase();
  }

  bool _matchesMerchantFilters(String? raw) {
    if (_selectedMerchants.isEmpty) return true;
    final source = (raw ?? '').trim();
    if (source.isEmpty) return false;
    final normalized = _normalizeMerchantKey(source);
    if (normalized.isEmpty) return false;
    return _selectedMerchants.contains(normalized);
  }

  String _displayMerchantSelectionLabel(String selection) {
    final normalized = selection.toUpperCase();
    final byMerchant = AnalyticsAgg.byMerchant(allExpenses);
    for (final key in byMerchant.keys) {
      if (key.toUpperCase() == normalized) {
        return _formatMerchantName(key);
      }
    }
    return _formatMerchantName(selection);
  }

  String _transactionPanelKey() {
    final parts = [
      _selectedFilter,
      _searchFrom?.toIso8601String() ?? '',
      _searchTo?.toIso8601String() ?? '',
      _selectedCategories.join(','),
      _selectedMerchants.join(','),
      _selectedBanks.join(','),
      _friendFilterPhones.join(','),
      _groupFilterIds.join(','),
      _dataType,
      filteredExpenses.length.toString(),
      filteredIncomes.length.toString(),
    ];
    return parts.join('|');
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
      if (_selectedCategories.isNotEmpty) {
        final cat = e.type.trim().isEmpty ? 'Other' : e.type.trim();
        if (!_selectedCategories.contains(cat)) return false;
      }
      if (_searchFrom != null && _searchTo != null) {
        final d = _d(e.date);
        if (d.isBefore(_d(_searchFrom!)) || d.isAfter(_d(_searchTo!))) return false;
      }
      if (!_matchesBankFilters(e.issuerBank, e.cardLast4)) {
        return false;
      }
      if (!_matchesMerchantFilters(e.counterparty ?? e.upiVpa ?? e.label ?? '')) {
        return false;
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
      if (_searchFrom != null && _searchTo != null) {
        return true;
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
      if (_selectedCategories.isNotEmpty) {
        final cat = i.type.trim().isEmpty ? 'Other' : i.type.trim();
        if (!_selectedCategories.contains(cat)) return false;
      }
      if (_searchFrom != null && _searchTo != null) {
        final d = _d(i.date);
        if (d.isBefore(_d(_searchFrom!)) || d.isAfter(_d(_searchTo!))) return false;
      }
      if (!_matchesBankFilters(i.issuerBank, null)) {
        return false;
      }
      if (!_matchesMerchantFilters(i.counterparty ?? i.upiVpa ?? i.label ?? '')) {
        return false;
      }
      if (_searchFrom != null && _searchTo != null) {
        return true;
      }
      return inMainRange(i.date);
    }

    filteredExpenses = allExpenses.where(searchMatchExpense).toList();
    filteredIncomes = allIncomes.where(searchMatchIncome).toList();
    periodTotalExpense = filteredExpenses.fold(0.0, (a, b) => a + b.amount);
    periodTotalIncome = filteredIncomes.fold(0.0, (a, b) => a + b.amount);

    final catsNow = _expenseCategories().toSet();
    _selectedCategories =
        _selectedCategories.where((cat) => catsNow.contains(cat)).toSet();
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
      _selectedCategories.isNotEmpty ||
      _selectedMerchants.isNotEmpty ||
      _selectedBanks.isNotEmpty ||
      _friendFilterPhones.isNotEmpty ||
      _groupFilterIds.isNotEmpty ||
      _searchFrom != null ||
      _searchTo != null;

  Widget _buildActiveFiltersWrap() {
    final chips = _activeFilterChips();
    if (chips.isEmpty) {
      return const SizedBox(height: 8);
    }
    return Padding(
      padding: const EdgeInsets.only(top: 4, left: 4, right: 4),
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
          _scheduleRecompute();
        },
      ));
    }

    if (_selectedCategories.isNotEmpty) {
      final sorted = _selectedCategories.toList()..sort();
      final first = sorted.first;
      final label = sorted.length == 1 ? first : '$first + ${sorted.length - 1} more';
      chips.add(InputChip(
        label: Text(label),
        onDeleted: () {
          setState(() => _selectedCategories = {});
          _scheduleRecompute();
        },
      ));
    }

    if (_selectedMerchants.isNotEmpty) {
      final sorted = _selectedMerchants.toList()..sort();
      final firstLabel = _displayMerchantSelectionLabel(sorted.first);
      final label = sorted.length == 1
          ? firstLabel
          : '$firstLabel + ${sorted.length - 1} more';
      chips.add(InputChip(
        label: Text(label),
        onDeleted: () {
          setState(() => _selectedMerchants = {});
          _scheduleRecompute();
        },
      ));
    }

    if (_selectedBanks.isNotEmpty) {
      final sorted = _selectedBanks.toList()..sort();
      final firstLabel = _displayBankSelectionLabel(sorted.first);
      final label = sorted.length == 1
          ? firstLabel
          : '$firstLabel + ${sorted.length - 1} more';
      chips.add(InputChip(
        label: Text(label),
        onDeleted: () {
          setState(() => _selectedBanks = {});
          _scheduleRecompute();
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
          _scheduleRecompute();
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
          _scheduleRecompute();
        },
      ));
    }

    return chips;
  }

  void _clearAllFilters() {
    setState(() {
      _selectedFilter = 'Month';
      _selectedCategories = {};
      _selectedMerchants = {};
      _selectedBanks = {};
      _friendFilterPhones = {};
      _groupFilterIds = {};
      _searchFrom = null;
      _searchTo = null;
    });
    _scheduleRecompute();
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
          child: SingleChildScrollView(
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
                      _scheduleRecompute();
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
            categories: _selectedCategories,
            merchants: _selectedMerchants,
            banks: _selectedBanks,
            friendPhones: _friendFilterPhones,
            groupIds: _groupFilterIds,
          ),
          expenses: allExpenses,
          incomes: allIncomes,
          friendsById: _friendsById,
          groups: _groups,
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
        _selectedCategories = {...config.categories};
        _selectedMerchants = config.merchants
            .map((m) => m.trim().toUpperCase())
            .where((m) => m.isNotEmpty)
            .toSet();
        _selectedBanks = config.banks
            .map((b) {
              final trimmed = b.trim();
              if (trimmed.isEmpty) return '';
              if (!trimmed.contains('|')) {
                return _normalizeBank(trimmed);
              }
              final parts = trimmed.split('|');
              final bankPart = _normalizeBank(parts.first);
              final cardPart = parts.length > 1 ? parts[1].trim() : '';
              if (cardPart.isEmpty) return bankPart;
              return '$bankPart|$cardPart';
            })
            .where((value) => value.isNotEmpty)
            .toSet();
        _friendFilterPhones = {...config.friendPhones};
        _groupFilterIds = {...config.groupIds};
      });
      _scheduleRecompute();
    }
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

  Widget _buildTxTypeChipsRow() {
    const types = ['All', 'Expense', 'Income'];
    return Wrap(
      spacing: 8,
      children: types.map((type) {
        final selected = _dataType == type;
        return ChoiceChip(
          label: Text(
            type,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: selected ? Colors.white : Colors.black87,
            ),
          ),
          selected: selected,
          selectedColor: Fx.mintDark,
          backgroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
            side: BorderSide(
              color: selected ? Fx.mintDark : Colors.black12,
            ),
          ),
          onSelected: (_) {
            setState(() => _dataType = type);
          },
        );
      }).toList(),
    );
  }

  Widget _buildFiltersButton() {
    return ElevatedButton.icon(
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
      child: FloatingActionButton(
        onPressed: () async {
          await Navigator.pushNamed(
            context,
            '/add',
            arguments: widget.userPhone,
          );
        },
        backgroundColor: Colors.white,
        foregroundColor: Colors.teal,
        elevation: 6,
        child: Container(
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

    // 🔁 Whole summary view scrolls as a ListView.
    // No inner Column+Expanded, so no re-entrant layout.
    return ListView(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 16),
      children: [
        // --- Summary ring card ---
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
        const SizedBox(height: 8),

        // --- Filters + tx type chips ---
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
          child: Row(
            children: [
              _buildFiltersButton(),
              const SizedBox(width: 8),
              Expanded(child: _buildTxTypeChipsRow()),
            ],
          ),
        ),

        // --- Active filter chips row ---
        _buildActiveFiltersWrap(),
        const SizedBox(height: 4),

        // --- Bulk Actions Bar ---
        if (_multiSelectMode)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 6),
            child: Row(
              children: [
                Text(
                  "${_selectedTxIds.length} selected",
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.label, color: Colors.amber),
                  tooltip: "Edit Label (Bulk)",
                  onPressed: _selectedTxIds.isEmpty
                      ? null
                      : () async {
                    final newLabel = await _showLabelDialog();
                    if (newLabel != null && newLabel.trim().isNotEmpty) {
                      // Expenses
                      for (final tx in filteredExpenses
                          .where((e) => _selectedTxIds.contains(e.id))) {
                        await ExpenseService().updateExpense(
                          widget.userPhone,
                          tx.copyWith(label: newLabel),
                        );
                      }
                      // Incomes
                      for (final inc in filteredIncomes
                          .where((i) => _selectedTxIds.contains(i.id))) {
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
                    final confirmed =
                    await _confirmBulkDelete(_selectedTxIds.length);
                    if (!confirmed) return;

                    for (final tx in filteredExpenses
                        .where((e) => _selectedTxIds.contains(e.id))) {
                      await ExpenseService().deleteExpense(
                        widget.userPhone,
                        tx.id,
                      );
                    }
                    for (final inc in filteredIncomes
                        .where((i) => _selectedTxIds.contains(i.id))) {
                      await IncomeService().deleteIncome(
                        widget.userPhone,
                        inc.id,
                      );
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
                  onPressed: () {
                    setState(() {
                      _multiSelectMode = false;
                      _selectedTxIds.clear();
                    });
                  },
                ),
              ],
            ),
          ),

        // --- Search & Multi-select toggle ---
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 6),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _searchController,
                  style: const TextStyle(
                    color: Colors.black,
                    fontWeight: FontWeight.w600,
                  ),
                  cursorColor: Colors.black,
                  decoration: InputDecoration(
                    hintText: 'Search by note, label, type...',
                    hintStyle: const TextStyle(
                      color: Colors.black54,
                      fontWeight: FontWeight.w500,
                    ),
                    prefixIcon: const Icon(
                      Icons.search,
                      color: Colors.black54,
                    ),
                    suffixIcon: _searchQuery.isNotEmpty
                        ? IconButton(
                      icon: const Icon(
                        Icons.close,
                        color: Colors.black45,
                      ),
                      onPressed: () {
                        _searchController.clear();
                        _debounce?.cancel();
                        setState(() => _searchQuery = '');
                        _scheduleRecompute();
                      },
                    )
                        : null,
                    filled: true,
                    fillColor: Colors.white,
                    contentPadding: const EdgeInsets.symmetric(
                      vertical: 0,
                      horizontal: 6,
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(13),
                      borderSide: const BorderSide(color: Colors.black26),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(13),
                      borderSide: const BorderSide(color: Colors.black54),
                    ),
                  ),
                  onChanged: (val) {
                    _debounce?.cancel();
                    _debounce = Timer(
                      const Duration(milliseconds: 200),
                          () {
                        if (!mounted) return;
                        setState(() => _searchQuery = val);
                        _scheduleRecompute();
                      },
                    );
                  },
                ),
              ),
              const SizedBox(width: 7),
              SizedBox(
                width: 36,
                child: Center(
                  child: Checkbox(
                    value: _multiSelectMode,
                    onChanged: (val) {
                      setState(() {
                        _multiSelectMode = val ?? false;
                        if (!_multiSelectMode) {
                          _selectedTxIds.clear();
                        }
                      });
                    },
                    checkColor: Colors.black,
                    fillColor: MaterialStateProperty.resolveWith<Color>(
                          (states) => Colors.white,
                    ),
                    side: const BorderSide(color: Color(0xFF7C3AED)),
                    visualDensity: VisualDensity.compact,
                    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 6),

        // --- Transaction List Unified (Expense+Income) ---
        KeyedSubtree(
          key: ValueKey(_transactionPanelKey()),
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
                _scheduleRecompute();
              }
            },
            onDelete: (tx) async {
              if (_multiSelectMode) return;
              if (tx is ExpenseItem) {
                await ExpenseService().deleteExpense(
                  widget.userPhone,
                  tx.id,
                );
              } else if (tx is IncomeItem) {
                await IncomeService().deleteIncome(
                  widget.userPhone,
                  tx.id,
                );
              }
              _scheduleRecompute();
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
                _scheduleRecompute();
              }
            },
          ),
        ),
      ],
    );
  }






  Widget _calendarView(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(10, 12, 10, 16),
      child: Column(
        children: [
          CustomDiamondCard(
            borderRadius: 26,
            padding: const EdgeInsets.all(10),
            glassGradient: const [
              Colors.white,
              Colors.white,
            ],
            child: Column(
              children: [
                // Date picker icon row
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    IconButton(
                      icon: const Icon(
                        Icons.today_rounded,
                        color: Colors.teal,
                        size: 24,
                      ),
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

          const SizedBox(height: 16),

          // Day's transactions – scroll inside this card only
          Expanded(
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 220),
              transitionBuilder: (child, animation) => FadeTransition(
                opacity: animation,
                child: SlideTransition(
                  position: Tween<Offset>(
                    begin: const Offset(0, 0.04),
                    end: Offset.zero,
                  ).animate(animation),
                  child: child,
                ),
              ),
              child: CustomDiamondCard(
                key: ValueKey(
                  'day-${_selectedDay?.toIso8601String() ?? ''}-${_expensesForSelectedDay.length}-${_transactionPanelKey()}',
                ),
                borderRadius: 24,
                glassGradient: const [
                  Colors.white,
                  Colors.white,
                ],
                padding:
                const EdgeInsets.symmetric(vertical: 8, horizontal: 0),
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
                      _scheduleRecompute();
                    }
                  },
                  onDelete: (tx) async {
                    if (_multiSelectMode) return;
                    if (tx is ExpenseItem) {
                      await ExpenseService()
                          .deleteExpense(widget.userPhone, tx.id);
                      _scheduleRecompute();
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
                      _scheduleRecompute();
                    }
                  },
                ),
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
            Colors.white.withOpacity(0.06),
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
            padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 10),
            glassGradient: [
              Colors.white.withOpacity(0.19),
              Colors.white.withOpacity(0.08),
            ],
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  "Expense Breakdown",
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17),
                ),
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
              Colors.white.withOpacity(0.08),
            ],
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  "Income Breakdown",
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17),
                ),
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
              Colors.white.withOpacity(0.08),
            ],
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  "Expense by Category",
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17),
                ),
                const SizedBox(height: 10),
                AspectRatio(
                  aspectRatio: 1.8,
                  child: BarChart(
                    BarChartData(
                      barGroups: _expenseCategoryBarGroups(),
                      titlesData: FlTitlesData(
                        leftTitles: AxisTitles(
                          sideTitles: SideTitles(
                            showTitles: true,
                            reservedSize: 36,
                          ),
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
                      gridData: FlGridData(
                        show: true,
                        horizontalInterval:
                            (_expenseMaxAmount() / 4).clamp(1, double.infinity),
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
            _chartType == "Bar")
          CustomDiamondCard(
            borderRadius: 26,
            padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 10),
            glassGradient: [
              Colors.white.withOpacity(0.19),
              Colors.white.withOpacity(0.08),
            ],
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  "Income by Category",
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17),
                ),
                const SizedBox(height: 10),
                AspectRatio(
                  aspectRatio: 1.8,
                  child: BarChart(
                    BarChartData(
                      barGroups: _incomeCategoryBarGroups(),
                      titlesData: FlTitlesData(
                        leftTitles: AxisTitles(
                          sideTitles: SideTitles(
                            showTitles: true,
                            reservedSize: 36,
                          ),
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
                      gridData: FlGridData(
                        show: true,
                        horizontalInterval:
                            (_incomeMaxAmount() / 4).clamp(1, double.infinity),
                      ),
                    ),
                    swapAnimationDuration: const Duration(milliseconds: 650),
                    swapAnimationCurve: Curves.easeOutCubic,
                  ),
                ),
              ],
            ),
          ),

        SizedBox(
          width: double.infinity,
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 220),
            transitionBuilder: (child, animation) => FadeTransition(
              opacity: animation,
              child: SlideTransition(
                position: Tween<Offset>(
                  begin: const Offset(0, 0.04),
                  end: Offset.zero,
                ).animate(animation),
                child: child,
              ),
            ),
            child: CustomDiamondCard(
              key: ValueKey(
                'summary-${_transactionPanelKey()}-${filteredExpenses.length}-${filteredIncomes.length}-${_dataType}',
              ),
              borderRadius: 24,
              glassGradient: [
                Colors.white.withOpacity(0.23),
                Colors.white.withOpacity(0.09),
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
                  _scheduleRecompute();
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
                _scheduleRecompute();
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
                _scheduleRecompute();
              }
            },
          ),
        ),
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

    double chartSpent = spentValue;
    double chartIncome = incomeValue;

    if (!hasData) {
      chartSpent = 1;
      chartIncome = 1;
    } else {
      if (chartSpent <= 0) {
        chartSpent = 0.001;
      }
      if (chartIncome <= 0) {
        chartIncome = 0.001;
      }
    }

    final bool valuesEqual = spentValue == incomeValue;
    final bool spentIsBigger = spentValue > incomeValue;
    final bool incomeIsBigger = incomeValue > spentValue;
    const double bigSize = 20;
    const double smallSize = 16;
    const double equalSize = 18;

    final spentStyle = TextStyle(
      fontWeight: FontWeight.w700,
      fontSize: valuesEqual ? equalSize : (spentIsBigger ? bigSize : smallSize),
      color: Colors.red.shade600,
    );

    final incomeStyle = TextStyle(
      fontWeight: FontWeight.w700,
      fontSize: valuesEqual ? equalSize : (incomeIsBigger ? bigSize : smallSize),
      color: Colors.green.shade600,
    );

    return Material(
      color: Colors.white,
      elevation: 3,
      borderRadius: BorderRadius.circular(24),
      child: InkWell(
        borderRadius: BorderRadius.circular(24),
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 140),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 20),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                const SizedBox(width: 14),
                SizedBox(
                  width: 96,
                  height: 96,
                  child: PieChart(
                    PieChartData(
                      sectionsSpace: 0,
                      centerSpaceRadius: 34,
                      startDegreeOffset: -90,
                      sections: [
                        PieChartSectionData(
                          value: chartSpent,
                          color: Fx.mintDark,
                          title: '',
                          radius: 38,
                        ),
                        PieChartSectionData(
                          value: chartIncome,
                          color: Fx.mint.withOpacity(0.24),
                          title: '',
                          radius: 38,
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.end,
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
                      const SizedBox(height: 10),
                      Text(
                        formatter.format(spentValue),
                        style: spentStyle,
                        textAlign: TextAlign.right,
                      ),
                      const SizedBox(height: 6),
                      Text(
                        formatter.format(incomeValue),
                        style: incomeStyle,
                        textAlign: TextAlign.right,
                      ),
                      const SizedBox(height: 10),
                      Text(
                        'Banks: $bankCount · Cards: $cardCount · Tx: $txCount',
                        style: Fx.label.copyWith(
                          fontSize: 12,
                          color: Colors.grey[600],
                          fontWeight: FontWeight.w500,
                        ),
                        textAlign: TextAlign.right,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
              ],
            ),
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
  final Set<String> categories;
  final Set<String> merchants;
  final Set<String> banks;
  final Set<String> friendPhones;
  final Set<String> groupIds;

  static const _sentinel = Object();

  ExpenseFilterConfig({
    required this.periodToken,
    this.customRange,
    Set<String>? categories,
    Set<String>? merchants,
    Set<String>? banks,
    Set<String>? friendPhones,
    Set<String>? groupIds,
  })  : categories = Set<String>.from(categories ?? const <String>{}),
        merchants = Set<String>.from(merchants ?? const <String>{}),
        banks = Set<String>.from(banks ?? const <String>{}),
        friendPhones = Set<String>.from(friendPhones ?? const <String>{}),
        groupIds = Set<String>.from(groupIds ?? const <String>{});

  ExpenseFilterConfig copyWith({
    String? periodToken,
    Object? customRange = _sentinel,
    Set<String>? categories,
    Set<String>? merchants,
    Set<String>? banks,
    Set<String>? friendPhones,
    Set<String>? groupIds,
  }) {
    return ExpenseFilterConfig(
      periodToken: periodToken ?? this.periodToken,
      customRange: customRange == _sentinel
          ? this.customRange
          : customRange as DateTimeRange?,
      categories: categories ?? this.categories,
      merchants: merchants ?? this.merchants,
      banks: banks ?? this.banks,
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
  final List<GroupModel> groups;

  const ExpenseFiltersScreen({
    Key? key,
    required this.initialConfig,
    required this.expenses,
    required this.incomes,
    this.friendsById = const {},
    this.groups = const [],
  }) : super(key: key);

  @override
  State<ExpenseFiltersScreen> createState() => _ExpenseFiltersScreenState();
}

enum FilterSection {
  date,
  categories,
  merchant,
  bankCards,
  friends,
  groups,
}

class _ExpenseFiltersScreenState extends State<ExpenseFiltersScreen> {
  late String _periodToken;
  DateTimeRange? _customRange;
  late Set<String> _selectedCategories;
  late Set<String> _selectedMerchants;
  late Set<String> _selectedBanks;
  late Set<String> _friendPhones;
  late Set<String> _groupIds;
  FilterSection _selectedSection = FilterSection.date;

  late final List<String> _categoryOptions;
  late final Map<String, Set<String>> _bankToCards;
  late final Map<String, String> _bankDisplayNames;
  late final Map<String, String?> _bankLogos;
  late final Map<String, String?> _merchantLogos;
  late final List<String> _bankOptions;
  late final Map<String, String?> _bankPrimaryNetworks;
  late final Map<String, String?> _cardNetworks;
  late final Map<String, double> _brandMerchantTotals;
  late final Map<String, double> _peopleMerchantTotals;
  late final Set<String> _friendNameTokens;
  late final Set<String> _friendPhoneSet;
  late final List<String> _groupOptions;
  late final Map<String, GroupModel> _groupsById;
  late final NumberFormat _amountFormat;

  List<FriendModel> get _friends => widget.friendsById.values.toList()
    ..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));

  @override
  void initState() {
    super.initState();
    _periodToken = widget.initialConfig.periodToken;
    _customRange = widget.initialConfig.customRange;
    _selectedCategories = Set<String>.from(widget.initialConfig.categories);
    _selectedMerchants = widget.initialConfig.merchants
        .map((m) => m.trim().toUpperCase())
        .where((m) => m.isNotEmpty)
        .toSet();
    _selectedBanks = widget.initialConfig.banks
        .map((b) => b.trim())
        .where((b) => b.isNotEmpty)
        .map((b) {
          if (!b.contains('|')) return _normalizeBank(b);
          final parts = b.split('|');
          final bank = _normalizeBank(parts.first);
          final card = parts.length > 1 ? parts[1].trim() : '';
          return card.isEmpty ? bank : '$bank|$card';
        })
        .toSet();
    _friendPhones = Set<String>.from(widget.initialConfig.friendPhones);
    _groupIds = Set<String>.from(widget.initialConfig.groupIds);

    final categorySet = <String>{};
    for (final expense in widget.expenses) {
      final type = (expense.category ?? '').trim();
      if (type.isNotEmpty) {
        categorySet.add(_titleCase(type.toLowerCase()));
      }
    }
    _categoryOptions = categorySet.toList()..sort();

    _friendNameTokens = widget.friendsById.values
        .map((f) => f.name.trim().toLowerCase())
        .where((name) => name.isNotEmpty)
        .toSet();
    _friendPhoneSet = widget.friendsById.keys.toSet();

    final merchantMap = AnalyticsAgg.byMerchant(widget.expenses);
    _merchantLogos = {
      for (final key in merchantMap.keys) key.toUpperCase(): _merchantLogoAsset(key),
    };

    final brandEntries = <String, double>{};
    final peopleEntries = <String, double>{};
    merchantMap.forEach((key, value) {
      if (_isPersonLikeMerchant(key)) {
        peopleEntries[key] = value;
      } else {
        brandEntries[key] = value;
      }
    });
    _brandMerchantTotals = brandEntries;
    _peopleMerchantTotals = peopleEntries;

    final bankMap = <String, Set<String>>{};
    final bankNames = <String, String>{};
    final bankLogos = <String, String?>{};
    final bankNetworks = <String, String?>{};
    final cardNetworks = <String, String?>{};

    void addBank(String? bank, {String? cardLast4, String? logo, String? network}) {
      final normalized = _normalizeBank(bank);
      if (normalized.isEmpty) return;
      final cards = bankMap.putIfAbsent(normalized, () => <String>{});
      final last4 = (cardLast4 ?? '').trim();
      if (last4.isNotEmpty) {
        cards.add(last4);
        final net = (network ?? '').trim();
        if (net.isNotEmpty) {
          cardNetworks['$normalized|$last4'] = net;
        }
      }
      final display = (bank ?? '').trim();
      if (display.isNotEmpty && !bankNames.containsKey(normalized)) {
        bankNames[normalized] = display;
      }
      final logoPath = (logo ?? '').trim();
      if (logoPath.isNotEmpty && !bankLogos.containsKey(normalized)) {
        bankLogos[normalized] = logoPath;
      }
      final networkTrimmed = (network ?? '').trim();
      if (networkTrimmed.isNotEmpty && !bankNetworks.containsKey(normalized)) {
        bankNetworks[normalized] = networkTrimmed;
      }
    }

    for (final e in widget.expenses) {
      addBank(
        e.issuerBank,
        cardLast4: e.cardLast4,
        logo: e.bankLogo,
        network: e.instrumentNetwork,
      );
    }
    for (final i in widget.incomes) {
      addBank(i.issuerBank, logo: i.bankLogo, network: i.instrumentNetwork);
    }

    _bankToCards = bankMap;
    _bankDisplayNames = bankNames;
    _bankLogos = bankLogos;
    _bankPrimaryNetworks = bankNetworks;
    _cardNetworks = cardNetworks;
    _bankOptions = bankMap.keys.toList()..sort();

    _groupsById = {for (final g in widget.groups) g.id: g};
    final groupIdSet = <String>{..._groupsById.keys};
    for (final e in widget.expenses) {
      final gid = (e.groupId ?? '').trim();
      if (gid.isNotEmpty) {
        groupIdSet.add(gid);
      }
    }
    _groupOptions = groupIdSet.toList()
      ..sort((a, b) => _groupNameForId(a).toLowerCase().compareTo(_groupNameForId(b).toLowerCase()));

    _amountFormat = NumberFormat.compactCurrency(locale: 'en_IN', symbol: '₹');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: const Text('Filters', style: TextStyle(color: Colors.black)),
        backgroundColor: Colors.white,
        foregroundColor: Colors.black,
        elevation: 0.5,
        iconTheme: const IconThemeData(color: Colors.black),
      ),
      body: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: 150,
            child: Container(
              color: Colors.white,
              child: _buildLeftMenu(),
            ),
          ),
          SizedBox(
            height: double.infinity,
            child: VerticalDivider(
              width: 1,
              thickness: 1,
              color: Colors.grey.shade300,
            ),
          ),
          Expanded(child: _buildRightPanel()),
        ],
      ),
      bottomNavigationBar: _buildBottomBar(),
    );
  }

  Widget _buildLeftMenu() {
    const items = <FilterSection, String>{
      FilterSection.date: 'Date / Period',
      FilterSection.categories: 'Categories',
      FilterSection.merchant: 'Merchant',
      FilterSection.bankCards: 'Bank & Cards',
      FilterSection.friends: 'Friends',
      FilterSection.groups: 'Groups',
    };

    return ListView(
      padding: const EdgeInsets.fromLTRB(8, 12, 8, 96),
      children: items.entries.map((entry) {
        final section = entry.key;
        final label = entry.value;
        final bool selected = _selectedSection == section;
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 2),
          child: ListTile(
            dense: true,
            contentPadding: const EdgeInsets.symmetric(horizontal: 12),
            title: Text(
              label,
              style: TextStyle(
                fontSize: 14,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                color: selected ? Colors.black : Colors.black54,
              ),
            ),
            selected: selected,
            selectedTileColor: Colors.grey.shade200,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            onTap: () {
              setState(() {
                _selectedSection = section;
              });
            },
          ),
        );
      }).toList(),
    );
  }

  Widget _buildRightPanel() {
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 200),
      child: SingleChildScrollView(
        key: ValueKey<FilterSection>(_selectedSection),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
        child: _buildSectionContent(_selectedSection),
      ),
    );
  }

  Widget _buildSectionContent(FilterSection section) {
    switch (section) {
      case FilterSection.date:
        return _buildDateSection();
      case FilterSection.categories:
        return _buildCategorySection();
      case FilterSection.merchant:
        return _buildMerchantSection();
      case FilterSection.bankCards:
        return _buildBankCardsSection();
      case FilterSection.friends:
        return _buildFriendsSection();
      case FilterSection.groups:
        return _buildGroupsSection();
    }
  }

  Widget _buildSectionTitle(String title) {
    return Text(
      title,
      style: const TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.w700,
        color: Colors.black,
      ),
    );
  }

  Widget _buildDateSection() {
    const periodOptions = <MapEntry<String, String>>[
      MapEntry('Today', 'Day'),
      MapEntry('Yesterday', 'Yesterday'),
      MapEntry('Last 2 Days', '2D'),
      MapEntry('This Week', 'Week'),
      MapEntry('This Month', 'Month'),
      MapEntry('Last Month', 'Last Month'),
      MapEntry('This Quarter', 'Quarter'),
      MapEntry('This Year', 'Year'),
      MapEntry('All Time', 'All'),
    ];
    final currentValue = _currentPeriodValue();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionTitle('Date / Period'),
        const SizedBox(height: 6),
        for (final option in periodOptions)
          RadioListTile<String>(
            dense: true,
            contentPadding: EdgeInsets.zero,
            value: option.value,
            groupValue: currentValue,
            title: Text(option.key, style: const TextStyle(color: Colors.black)),
            onChanged: (_) => _selectPeriod(option.value),
          ),
        RadioListTile<String>(
          dense: true,
          contentPadding: EdgeInsets.zero,
          value: 'Custom',
          groupValue: currentValue,
          title: const Text(
            'Custom range',
            style: TextStyle(color: Colors.black),
          ),
          subtitle: Text(
            _customRange != null
                ? '${DateFormat('d MMM y').format(_customRange!.start)} – ${DateFormat('d MMM y').format(_customRange!.end)}'
                : 'Choose a date range',
            style: const TextStyle(color: Colors.black54, fontSize: 12),
          ),
          onChanged: (_) => _pickCustomRange(),
        ),
      ],
    );
  }

  String _currentPeriodValue() {
    if (_isYesterdaySelected()) {
      return 'Yesterday';
    }
    if (_customRange != null) {
      return 'Custom';
    }
    return _periodToken;
  }

  void _selectPeriod(String token) {
    if (token == 'Custom') {
      _pickCustomRange();
      return;
    }
    if (token == 'Yesterday') {
      final now = DateTime.now();
      final today = DateTime(now.year, now.month, now.day);
      final yesterday = today.subtract(const Duration(days: 1));
      setState(() {
        _periodToken = 'Custom';
        _customRange = DateTimeRange(start: yesterday, end: yesterday);
      });
      return;
    }
    setState(() {
      _periodToken = token;
      _customRange = null;
    });
  }

  Widget _buildCategorySection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionTitle('Categories'),
        const SizedBox(height: 6),
        CheckboxListTile(
          dense: true,
          contentPadding: EdgeInsets.zero,
          value: _selectedCategories.isEmpty,
          secondary: const Icon(Icons.category_rounded, color: Colors.black54),
          title: const Text('All categories', style: TextStyle(color: Colors.black)),
          subtitle: const Text('Show everything', style: TextStyle(color: Colors.black54, fontSize: 12)),
          onChanged: (val) {
            if (val == true) {
              setState(() => _selectedCategories = {});
            }
          },
        ),
        if (_categoryOptions.isEmpty)
          const Padding(
            padding: EdgeInsets.only(top: 8),
            child: Text('No categories found', style: TextStyle(color: Colors.black54)),
          )
        else
          ..._categoryOptions.map((category) {
            final selected = _selectedCategories.contains(category);
            return CheckboxListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              value: selected,
              secondary: Icon(_categoryIcon(category), color: Colors.black54),
              title: Text(category, style: const TextStyle(color: Colors.black)),
              onChanged: (val) {
                setState(() {
                  if (val == true) {
                    _selectedCategories = {..._selectedCategories, category};
                  } else {
                    _selectedCategories = {..._selectedCategories}..remove(category);
                  }
                });
              },
            );
          }),
      ],
    );
  }

  Widget _buildMerchantSection() {
    final brandEntries = _brandMerchantTotals.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    final peopleEntries = _peopleMerchantTotals.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionTitle('Merchant'),
        const SizedBox(height: 6),
        CheckboxListTile(
          dense: true,
          contentPadding: EdgeInsets.zero,
          value: _selectedMerchants.isEmpty,
          secondary: const Icon(Icons.store_mall_directory_rounded, color: Colors.black54),
          title: const Text('All merchants', style: TextStyle(color: Colors.black)),
          subtitle: const Text('Show everything', style: TextStyle(color: Colors.black54, fontSize: 12)),
          onChanged: (val) {
            if (val == true) {
              setState(() => _selectedMerchants = {});
            }
          },
        ),
        if (brandEntries.isEmpty && peopleEntries.isEmpty)
          const Padding(
            padding: EdgeInsets.only(top: 8),
            child: Text('No merchants available', style: TextStyle(color: Colors.black54)),
          )
        else ...[
          if (brandEntries.isNotEmpty) ...[
            const SizedBox(height: 8),
            const Text('Brands', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Colors.black)),
            const SizedBox(height: 4),
            ...brandEntries.map((entry) => _buildMerchantTile(entry, isPerson: false)),
          ],
          if (peopleEntries.isNotEmpty) ...[
            const SizedBox(height: 12),
            const Text('People', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Colors.black)),
            const SizedBox(height: 4),
            ...peopleEntries.map((entry) => _buildMerchantTile(entry, isPerson: true)),
          ],
        ],
      ],
    );
  }

  Widget _buildMerchantTile(MapEntry<String, double> entry, {required bool isPerson}) {
    final key = entry.key.trim().toUpperCase();
    final selected = _selectedMerchants.contains(key);
    return CheckboxListTile(
      dense: true,
      contentPadding: EdgeInsets.zero,
      value: selected,
      secondary: _merchantAvatar(entry.key, isPerson: isPerson),
      title: Text(_formatMerchant(entry.key), style: const TextStyle(color: Colors.black)),
      subtitle: Text(_formatAmount(entry.value), style: const TextStyle(color: Colors.black54, fontSize: 12)),
      onChanged: (val) {
        setState(() {
          if (val == true) {
            _selectedMerchants = {..._selectedMerchants, key};
          } else {
            _selectedMerchants = {..._selectedMerchants}..remove(key);
          }
        });
      },
    );
  }

  Widget _buildBankCardsSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionTitle('Bank & Cards'),
        const SizedBox(height: 6),
        CheckboxListTile(
          dense: true,
          contentPadding: EdgeInsets.zero,
          value: _selectedBanks.isEmpty,
          secondary: const Icon(Icons.account_balance_rounded, color: Colors.black54),
          title: const Text('All banks', style: TextStyle(color: Colors.black)),
          subtitle: const Text('Show everything', style: TextStyle(color: Colors.black54, fontSize: 12)),
          onChanged: (val) {
            if (val == true) {
              setState(() => _selectedBanks = {});
            }
          },
        ),
        if (_bankOptions.isEmpty)
          const Padding(
            padding: EdgeInsets.only(top: 8),
            child: Text('No banks detected', style: TextStyle(color: Colors.black54)),
          )
        else
          ..._bankOptions.map((bank) {
            final isBankSelected = _selectedBanks.contains(bank);
            final cards = List<String>.from(_bankToCards[bank] ?? const <String>{})..sort();
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CheckboxListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  value: isBankSelected,
                  secondary: _bankLogo(
                    _displayBankName(bank),
                    network: _bankPrimaryNetworks[bank],
                    overrideLogo: _bankLogos[bank],
                    size: 40,
                  ),
                  title: Text(_displayBankName(bank), style: const TextStyle(color: Colors.black)),
                  onChanged: (val) {
                    setState(() {
                      if (val == true) {
                        _selectedBanks = {..._selectedBanks, bank};
                      } else {
                        final updated = {..._selectedBanks};
                        updated.remove(bank);
                        updated.removeWhere((entry) => entry.startsWith('$bank|'));
                        _selectedBanks = updated;
                      }
                    });
                  },
                ),
                for (final card in cards)
                  Padding(
                    padding: const EdgeInsets.only(left: 32),
                    child: CheckboxListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      value: _selectedBanks.contains(_encodeBankSelection(bank, card)),
                      secondary: _bankLogo(
                        _displayBankName(bank),
                        network: _cardNetworks['$bank|$card'] ?? _bankPrimaryNetworks[bank],
                        overrideLogo: _bankLogos[bank],
                        size: 32,
                      ),
                      title: Text('••$card', style: const TextStyle(color: Colors.black)),
                      subtitle: Text(_displayBankName(bank), style: const TextStyle(color: Colors.black54, fontSize: 12)),
                      onChanged: (val) {
                        final selectionKey = _encodeBankSelection(bank, card);
                        setState(() {
                          if (val == true) {
                            _selectedBanks = {..._selectedBanks, selectionKey};
                          } else {
                            _selectedBanks = {..._selectedBanks}..remove(selectionKey);
                          }
                        });
                      },
                    ),
                  ),
              ],
            );
          }),
      ],
    );
  }

  Widget _buildFriendsSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionTitle('Friends'),
        const SizedBox(height: 6),
        if (_friends.isEmpty)
          const Text('No friends added yet', style: TextStyle(color: Colors.black54))
        else
          ..._friends.map((friend) {
            final selected = _friendPhones.contains(friend.phone);
            return CheckboxListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              value: selected,
              secondary: _friendAvatar(friend),
              title: Text(
                friend.name.isEmpty ? friend.phone : friend.name,
                style: const TextStyle(color: Colors.black),
              ),
              subtitle: friend.name.isNotEmpty
                  ? Text(friend.phone, style: const TextStyle(color: Colors.black54, fontSize: 12))
                  : null,
              onChanged: (val) {
                setState(() {
                  final updated = {..._friendPhones};
                  if (val == true) {
                    updated.add(friend.phone);
                  } else {
                    updated.remove(friend.phone);
                  }
                  _friendPhones = updated;
                });
              },
            );
          }),
      ],
    );
  }

  Widget _friendAvatar(FriendModel friend) {
    final avatarValue = friend.avatar.trim();
    if (avatarValue.startsWith('http')) {
      return CircleAvatar(
        radius: 18,
        backgroundColor: Colors.grey.shade200,
        backgroundImage: NetworkImage(avatarValue),
      );
    }
    String label;
    if (avatarValue.isNotEmpty) {
      label = avatarValue.length <= 2 ? avatarValue : avatarValue.characters.first;
    } else if (friend.name.isNotEmpty) {
      label = friend.name.characters.first;
    } else {
      label = friend.phone.characters.first;
    }
    return CircleAvatar(
      radius: 18,
      backgroundColor: Colors.grey.shade200,
      child: Text(label.toUpperCase(), style: const TextStyle(color: Colors.black)),
    );
  }

  Widget _buildGroupsSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionTitle('Groups'),
        const SizedBox(height: 6),
        if (_groupOptions.isEmpty)
          const Text('No groups yet', style: TextStyle(color: Colors.black54))
        else
          ..._groupOptions.map((groupId) {
            final selected = _groupIds.contains(groupId);
            final group = _groupsById[groupId];
            final memberCount = group?.memberCount ?? 0;
            return CheckboxListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              value: selected,
              secondary: _groupAvatar(groupId, group),
              title: Text(_groupNameForId(groupId), style: const TextStyle(color: Colors.black)),
              subtitle: memberCount > 0
                  ? Text('$memberCount member${memberCount == 1 ? '' : 's'}',
                      style: const TextStyle(color: Colors.black54, fontSize: 12))
                  : null,
              onChanged: (val) {
                setState(() {
                  if (val == true) {
                    _groupIds = {..._groupIds, groupId};
                  } else {
                    _groupIds = {..._groupIds}..remove(groupId);
                  }
                });
              },
            );
          }),
      ],
    );
  }

  Widget _groupAvatar(String groupId, GroupModel? group) {
    final avatarUrl = group?.avatarUrl ?? '';
    if (avatarUrl.isNotEmpty) {
      return CircleAvatar(
        radius: 18,
        backgroundColor: Colors.grey.shade200,
        backgroundImage: NetworkImage(avatarUrl),
      );
    }
    final name = _groupNameForId(groupId);
    final label = name.isNotEmpty ? name.characters.first : groupId.characters.first;
    return CircleAvatar(
      radius: 18,
      backgroundColor: Colors.grey.shade200,
      child: Text(label.toUpperCase(), style: const TextStyle(color: Colors.black)),
    );
  }

  Widget _buildBottomBar() {
    return SafeArea(
      child: Container(
        color: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Row(
          children: [
            TextButton(
              onPressed: _resetFilters,
              style: TextButton.styleFrom(foregroundColor: Colors.black),
              child: const Text('Clear'),
            ),
            const Spacer(),
            ElevatedButton(
              onPressed: _applyFilters,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.black,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
              ),
              child: const Text('Apply'),
            ),
          ],
        ),
      ),
    );
  }

  void _resetFilters() {
    setState(() {
      _periodToken = widget.initialConfig.periodToken;
      _customRange = null;
      _selectedCategories = {};
      _selectedMerchants = {};
      _selectedBanks = {};
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
        categories: _selectedCategories,
        merchants: _selectedMerchants,
        banks: _selectedBanks,
        friendPhones: _friendPhones,
        groupIds: _groupIds,
      ),
    );
  }

  String _normalizeBank(String? bank) {
    final value = (bank ?? '').trim();
    return value.isEmpty ? '' : value.toUpperCase();
  }

  String _encodeBankSelection(String bank, [String? cardLast4]) {
    final normalized = _normalizeBank(bank);
    if (normalized.isEmpty) return normalized;
    final l4 = (cardLast4 ?? '').trim();
    if (l4.isEmpty) return normalized;
    return '$normalized|$l4';
  }

  String _displayBankName(String bank) {
    if (_bankDisplayNames.containsKey(bank)) return _bankDisplayNames[bank]!;
    return _titleCase(bank.toLowerCase());
  }

  String _titleCase(String input) {
    return input
        .split(RegExp(r'[_\s]+'))
        .where((part) => part.isNotEmpty)
        .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
        .join(' ');
  }

  String _slugBank(String s) {
    final x = s.toLowerCase();
    if (x.contains('axis')) return 'axis';
    if (x.contains('hdfc')) return 'hdfc';
    if (x.contains('icici')) return 'icici';
    if (x.contains('kotak')) return 'kotak';
    if (x.contains('sbi') || x.contains('state bank')) return 'sbi';
    if (x.contains('american express') || x.contains('amex')) return 'amex';
    return x.replaceAll(RegExp(r'[^a-z]'), '');
  }

  String? _bankLogoAsset(String? bank, {String? network}) {
    final candidates = <String>[];
    if (bank != null && bank.trim().isNotEmpty) {
      final slug = _slugBank(bank);
      if (slug.isNotEmpty) {
        candidates.addAll([
          'assets/banks/$slug.png',
          'lib/assets/banks/$slug.png',
        ]);
      }
    }
    if (network != null && network.trim().isNotEmpty) {
      final n = network.toLowerCase();
      String networkSlug = '';
      if (n.contains('visa')) {
        networkSlug = 'visa';
      } else if (n.contains('master')) {
        networkSlug = 'mastercard';
      } else if (n.contains('amex') || n.contains('american express')) {
        networkSlug = 'amex';
      } else if (n.contains('rupay')) {
        networkSlug = 'rupay';
      }
      if (networkSlug.isNotEmpty) {
        candidates.addAll([
          'assets/banks/$networkSlug.png',
          'lib/assets/banks/$networkSlug.png',
        ]);
      }
    }
    return candidates.isNotEmpty ? candidates.first : null;
  }

  Widget _bankLogo(String? bank, {String? network, String? overrideLogo, double size = 36}) {
    final asset = bank != null ? _bankLogoAsset(bank, network: network) : null;
    Widget? image;
    if (asset != null) {
      image = Image.asset(
        asset,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => overrideLogo != null
            ? _buildLogo(overrideLogo, size: size)
            : _bankLogoFallback(bank),
      );
    } else if (overrideLogo != null && overrideLogo.isNotEmpty) {
      image = _buildLogo(overrideLogo, size: size);
    }
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Colors.white,
        border: Border.all(color: Colors.black12),
      ),
      clipBehavior: Clip.antiAlias,
      child: ClipOval(
        child: image ?? _bankLogoFallback(bank),
      ),
    );
  }

  Widget _bankLogoFallback(String? bank) {
    final label = (bank ?? '').trim();
    final initials = label.isEmpty
        ? 'BK'
        : label
            .split(RegExp(r'\s+'))
            .where((p) => p.isNotEmpty)
            .take(2)
            .map((p) => p[0].toUpperCase())
            .join();
    return ColoredBox(
      color: Colors.grey.shade200,
      child: Center(
        child: Text(
          initials,
          style: const TextStyle(
            fontWeight: FontWeight.w700,
            color: Colors.black87,
          ),
        ),
      ),
    );
  }

  Widget _buildLogo(String path, {double size = 36}) {
    if (path.startsWith('http')) {
      return Image.network(
        path,
        fit: BoxFit.cover,
        width: size,
        height: size,
        errorBuilder: (_, __, ___) => _bankLogoFallback(path),
      );
    }
    return Image.asset(
      path,
      fit: BoxFit.cover,
      width: size,
      height: size,
      errorBuilder: (_, __, ___) => _bankLogoFallback(path),
    );
  }

  String? _merchantLogoAsset(String merchant) {
    final lower = merchant.toLowerCase();
    if (lower.contains('amazon')) return 'assets/brands/amazon.png';
    if (lower.contains('zomato')) return 'assets/brands/zomato.png';
    if (lower.contains('swiggy')) return 'assets/brands/swiggy.png';
    if (lower.contains('uber')) return 'assets/brands/uber.png';
    if (lower.contains('flipkart')) return 'assets/brands/flipkart.png';
    if (lower.contains('bigbasket')) return 'assets/brands/bigbasket.png';
    if (lower.contains('myntra')) return 'assets/brands/myntra.png';
    if (lower.contains('nykaa')) return 'assets/brands/nykaa.png';
    if (lower.contains('ajio')) return 'assets/brands/ajio.png';
    return null;
  }

  IconData _categoryIcon(String type) {
    final t = type.toLowerCase();
    if (t.contains('food') || t.contains('restaurant')) return Icons.restaurant_rounded;
    if (t.contains('grocery')) return Icons.shopping_cart_rounded;
    if (t.contains('rent')) return Icons.home_rounded;
    if (t.contains('fuel') || t.contains('petrol')) return Icons.local_gas_station_rounded;
    if (t.contains('shopping')) return Icons.shopping_bag_rounded;
    if (t.contains('health') || t.contains('medicine')) return Icons.local_hospital_rounded;
    if (t.contains('travel') || t.contains('flight') || t.contains('train')) return Icons.flight_takeoff_rounded;
    if (t.contains('entertainment') || t.contains('movie')) return Icons.movie_rounded;
    if (t.contains('education')) return Icons.school_rounded;
    if (t.contains('loan')) return Icons.account_balance_rounded;
    return Icons.category_rounded;
  }

  bool _isYesterdaySelected() {
    if (_customRange == null) return false;
    final start = _customRange!.start;
    final end = _customRange!.end;
    final now = DateTime.now();
    final yesterday = DateTime(now.year, now.month, now.day).subtract(const Duration(days: 1));
    return DateUtils.isSameDay(start, yesterday) && DateUtils.isSameDay(end, yesterday);
  }

  Future<void> _pickCustomRange() async {
    final now = DateTime.now();
    final initial = _customRange ??
        DateTimeRange(
          start: DateTime(now.year, now.month, now.day).subtract(const Duration(days: 6)),
          end: DateTime(now.year, now.month, now.day),
        );
    final result = await showDateRangePicker(
      context: context,
      initialDateRange: initial,
      firstDate: DateTime(now.year - 5),
      lastDate: DateTime(now.year + 5),
    );
    if (result != null) {
      setState(() {
        final start = DateTime(result.start.year, result.start.month, result.start.day);
        final end = DateTime(result.end.year, result.end.month, result.end.day);
        _customRange = DateTimeRange(start: start, end: end);
        _periodToken = 'Custom';
      });
    }
  }

  Widget _merchantAvatar(String merchant, {required bool isPerson}) {
    final key = merchant.toUpperCase();
    if (!isPerson) {
      final logo = _merchantLogos[key];
      if (logo != null) {
        return ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: _buildLogo(logo, size: 36),
        );
      }
    } else {
      final friend = _matchFriendForMerchant(merchant);
      if (friend != null) {
        return _friendAvatar(friend);
      }
    }
    return CircleAvatar(
      radius: 18,
      backgroundColor: Colors.grey.shade200,
      child: Text(
        merchant.isNotEmpty ? merchant.characters.first.toUpperCase() : 'M',
        style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.black),
      ),
    );
  }

  FriendModel? _matchFriendForMerchant(String merchant) {
    final lower = merchant.toLowerCase();
    for (final friend in _friends) {
      final nameLower = friend.name.trim().toLowerCase();
      if (nameLower.isEmpty) continue;
      if (lower == nameLower || lower.contains(nameLower) || nameLower.contains(lower)) {
        return friend;
      }
    }
    return null;
  }

  bool _isPersonLikeMerchant(String key) {
    final lower = key.toLowerCase();
    if (_friendNameTokens.any((n) => n.isNotEmpty && lower.contains(n))) {
      return true;
    }
    final digits = lower.replaceAll(RegExp(r'[^0-9]'), '');
    if (digits.length >= 8 && digits.length <= 12) return true;
    if (_friendPhoneSet.any((phone) => phone.replaceAll(RegExp(r'[^0-9]'), '').endsWith(digits) && digits.isNotEmpty)) {
      return true;
    }
    if (lower.contains('@') && !lower.contains('amazon') && !lower.contains('paytm')) {
      return true;
    }
    return false;
  }

  String _groupNameForId(String id) {
    final group = _groupsById[id];
    if (group != null && group.name.trim().isNotEmpty) {
      return group.name.trim();
    }
    return id;
  }

  String _formatAmount(double amount) => _amountFormat.format(amount);

  String _formatMerchant(String raw) {
    final trimmed = raw.trim();
    if (trimmed.isEmpty) return 'Unknown';
    return trimmed
        .split(RegExp(r'\s+'))
        .where((word) => word.isNotEmpty)
        .map((word) => '${word[0].toUpperCase()}${word.substring(1).toLowerCase()}')
        .join(' ');
  }
}
