// ignore_for_file: prefer_final_fields, library_private_types_in_public_api

import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../core/ads/ads_banner_card.dart';
import '../core/ads/ads_shell.dart';
import '../core/analytics/aggregators.dart';
import '../core/formatters/inr.dart';
import '../models/expense_item.dart';
import '../models/friend_model.dart';
import '../models/income_item.dart';
import '../services/expense_service.dart';
import '../services/income_service.dart';
import '../themes/glass_card.dart';
import '../themes/tokens.dart';
import '../widgets/charts/bar_chart_simple.dart';
import '../widgets/unified_transaction_list.dart';
import 'edit_expense_screen.dart';
import 'expenses_screen.dart'
    show ExpenseFilterConfig, ExpenseFiltersScreen;

class _MonthSpend {
  final int year;
  final int month;
  final double totalExpense;

  const _MonthSpend(this.year, this.month, this.totalExpense);
}

class _CategoryStackSegment {
  final String category;
  final double value;

  const _CategoryStackSegment(this.category, this.value);
}

class _MonthlyCategoryStack {
  final int year;
  final int month;
  final List<_CategoryStackSegment> segments;

  const _MonthlyCategoryStack(this.year, this.month, this.segments);
}

class _SubcategoryBucket {
  final String name;
  final double amount;
  final int txCount;

  const _SubcategoryBucket({
    required this.name,
    required this.amount,
    required this.txCount,
  });
}

enum _SubcategorySort { amountDesc, amountAsc, alphaAsc, alphaDesc }

class _TrendAxisScale {
  final double maxY;
  final double tick;
  const _TrendAxisScale(this.maxY, this.tick);
}

class _CardGroup {
  final String bank;
  final String instrument;
  final String? last4;
  final String? network;
  double debitTotal;
  double creditTotal;
  int txCount;

  _CardGroup({
    required this.bank,
    required this.instrument,
    required this.last4,
    required this.network,
    this.debitTotal = 0,
    this.creditTotal = 0,
    this.txCount = 0,
  });

  double get netOutflow => debitTotal - creditTotal;
}

class _CategoryInsights {
  final String? highestCategory;
  final double highestAmount;
  final String? lowestCategory;
  final double lowestAmount;
  final List<String> zeroCategories;
  const _CategoryInsights({
    required this.highestCategory,
    required this.highestAmount,
    required this.lowestCategory,
    required this.lowestAmount,
    required this.zeroCategories,
  });
}

const List<String> _kMainExpenseCategories = <String>[
  'Food & Dining',
  'Groceries',
  'Transport',
  'Fuel',
  'Shopping',
  'Bills & Utilities',
  'Rent',
  'EMI & Loans',
  'Subscriptions',
  'Health',
  'Education',
  'Travel',
  'Entertainment',
  'Fees & Charges',
  'Investments',
  'Transfers (Self)',
  'Other',
];

String _formatBankLabel(String bank) {
  if (bank.isEmpty || bank == 'UNKNOWN') return 'Unknown Bank';
  final parts = bank
      .split(' ')
      .where((part) => part.isNotEmpty)
      .map((part) {
        final first = part.substring(0, 1).toUpperCase();
        final rest = part.length > 1 ? part.substring(1).toLowerCase() : '';
        return first + rest;
      })
      .toList();
  return parts.isEmpty ? 'Unknown Bank' : parts.join(' ');
}

class AnalyticsScreen extends StatefulWidget {
  final String userPhone;
  const AnalyticsScreen({super.key, required this.userPhone});

  @override
  State<AnalyticsScreen> createState() => _AnalyticsScreenState();
}

class _AnalyticsScreenState extends State<AnalyticsScreen> {
  final _expenseSvc = ExpenseService();
  final _incomeSvc = IncomeService();
  bool _loading = true;

  List<ExpenseItem> _allExp = [];
  List<IncomeItem> _allInc = [];
  Period _period = Period.month;
  String _periodToken = 'M';
  DateTimeRange? _range;

  // NEW: window for "Last X months spends" card (only for that card)
  String _spendWindow = '1Y';

  // NEW: view selector for last months spends card
  String _lastMonthsView = 'Trend';

  // NEW: selected month for "Spends by Category" list
  DateTime? _selectedCategoryMonth;

  // Bottom list filter chips
  String _txnFilter = "All";

  // Calendar / custom filter
  CustomRange? _custom;

  // NEW: transaction type / instrument filter (for this screen)
  String _instrumentFilter = 'All';

  int _aggRev = 0;
  final Map<String, Map<String, double>> _aggCache = {};

  // caches
  final Map<String, List<SeriesPoint>> _seriesCache = {};
  final Map<String, Map<String, double>> _rollCache = {};
  final Map<String, dynamic> _heavyAggCache = {};
  int _rev = 0;

  static const Map<String, Color> _categoryColors = {
    'Fund Transfers': Colors.deepPurple,
    'Payments': Colors.indigo,
    'Shopping': Colors.teal,
    'Travel': Colors.orange,
    'Food': Colors.redAccent,
    'Entertainment': Colors.pink,
    'Healthcare': Colors.green,
    'Education': Colors.blueGrey,
    'Investments': Colors.brown,
    'Others': Colors.grey,
  };

  // Banks & Cards selection (screen-wide filter)
  String? _bankFilter;   // normalized uppercase bank name
  String? _last4Filter;  // last 4 digits for specific account

  // Filters from the expense Filters screen
  Set<String> _selectedCategories = {};
  Set<String> _selectedMerchants = {};
  Set<String> _selectedBanks = {};
  Set<String> _friendFilterPhones = {};
  Set<String> _groupFilterIds = {};
  final ScrollController _scrollCtrl = ScrollController();

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
          'assets/banks/' + slug + '.png',
          'lib/assets/banks/' + slug + '.png',
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
          'assets/banks/' + networkSlug + '.png',
          'lib/assets/banks/' + networkSlug + '.png',
        ]);
      }
    }

    return candidates.isNotEmpty ? candidates.first : null;
  }

  String _normalizeBank(String? bank) => (bank ?? '').trim().toUpperCase();

  bool get _hasActiveFilters =>
      _selectedCategories.isNotEmpty ||
      _selectedMerchants.isNotEmpty ||
      _selectedBanks.isNotEmpty ||
      _friendFilterPhones.isNotEmpty ||
      _groupFilterIds.isNotEmpty ||
      _bankFilter != null ||
      _last4Filter != null ||
      _custom != null ||
      _range != null;

  String _bankInitials(String? bank) {
    final safeBank = (bank ?? '').trim();
    final label =
        _formatBankLabel(safeBank.isEmpty ? 'Unknown Bank' : safeBank);
    final parts =
        label.split(RegExp(r'\s+')).where((part) => part.isNotEmpty).toList();
    if (parts.isEmpty) return 'BK';
    if (parts.length == 1) {
      final word = parts.first;
      if (word.length >= 2) return word.substring(0, 2).toUpperCase();
      return word.substring(0, 1).toUpperCase();
    }
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  Widget _bankLogoFallback(String? bank) {
    return ColoredBox(
      color: Colors.teal.shade50,
      child: Center(
        child: Text(
          _bankInitials(bank),
          style: const TextStyle(
            fontWeight: FontWeight.w700,
            color: Colors.teal,
          ),
        ),
      ),
    );
  }

  Widget _bankLogo(String? bank, {String? network, double size = 36}) {
    final asset = _bankLogoAsset(bank, network: network);
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
        child: asset != null
            ? Image.asset(
                asset,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => _bankLogoFallback(bank),
              )
            : _bankLogoFallback(bank),
      ),
    );
  }

  void _invalidateAggCache() {
    _aggRev++;
    _aggCache.clear();
    _seriesCache.clear();
    _rollCache.clear();
    _heavyAggCache.clear();
  }

  Period _periodForToken(String token) {
    switch (token) {
      case 'D':
        return Period.day;
      case 'W':
        return Period.week;
      case 'Y':
        return Period.year;
      case 'All Time':
        return Period.all;
      case 'M':
      default:
        return Period.month;
    }
  }

  ({DateTime start, DateTime end}) _rangeForFilterToken(
    DateTime now,
    String token,
  ) {
    switch (token) {
      case 'Day':
      case 'D':
        final d0 = DateTime(now.year, now.month, now.day);
        return (start: d0, end: d0);
      case 'Yesterday':
        final d0 = DateTime(now.year, now.month, now.day - 1);
        return (start: d0, end: d0);
      case '2D':
        final d0 = DateTime(now.year, now.month, now.day);
        final d1 = d0.subtract(const Duration(days: 1));
        return (start: d1, end: d0);
      case 'Week':
      case 'W':
        final start =
            DateTime(now.year, now.month, now.day).subtract(Duration(days: now.weekday - 1));
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

  String _mapExpensePeriodToAnalytics(String token) {
    switch (token) {
      case 'Day':
      case 'D':
        return 'D';
      case 'Week':
      case 'W':
        return 'W';
      case 'Year':
      case 'Y':
        return 'Y';
      case 'All':
        return 'All Time';
      default:
        return 'M';
    }
  }

  String _mapAnalyticsPeriodToExpense() {
    switch (_periodToken) {
      case 'D':
        return 'Day';
      case 'W':
        return 'Week';
      case 'Y':
        return 'Year';
      case 'All Time':
        return 'All';
      default:
        return 'Month';
    }
  }

  DateTimeRange _inclusiveToExclusive(DateTimeRange range) {
    return DateTimeRange(
      start: range.start,
      end: range.end.add(const Duration(days: 1)),
    );
  }

  Future<void> _openFiltersScreen() async {
    final initialRange = _range == null
        ? null
        : DateTimeRange(
            start: _range!.start,
            end: _range!.end.subtract(const Duration(days: 1)),
          );

    final config = await Navigator.push<ExpenseFilterConfig>(
      context,
      MaterialPageRoute(
        builder: (_) => ExpenseFiltersScreen(
          initialConfig: ExpenseFilterConfig(
            periodToken: _mapAnalyticsPeriodToExpense(),
            customRange: initialRange,
            categories: _selectedCategories,
            merchants: _selectedMerchants,
            banks: _selectedBanks,
            friendPhones: _friendFilterPhones,
            groupIds: _groupFilterIds,
          ),
          expenses: _allExp,
          incomes: _allInc,
          friendsById: const {},
          groups: const [],
        ),
      ),
    );

    if (config != null) {
      final now = DateTime.now();
      final inclusiveRange = config.customRange ??
          DateTimeRange(
            start: _rangeForFilterToken(now, config.periodToken).start,
            end: _rangeForFilterToken(now, config.periodToken).end,
          );

      setState(() {
        _periodToken = _mapExpensePeriodToAnalytics(config.periodToken);
        _period =
            config.customRange != null ? Period.custom : _periodForToken(_periodToken);
        _custom = config.customRange != null
            ? CustomRange(inclusiveRange.start, inclusiveRange.end)
            : null;
        _range = _inclusiveToExclusive(inclusiveRange);
        _selectedCategories = {
          for (final c in config.categories) _normalizeMainCategory(c)
        };
        _selectedMerchants = {
          for (final m in config.merchants) m.trim().toUpperCase()
        }..removeWhere((m) => m.isEmpty);
        _selectedBanks = {
          for (final b in config.banks) b.trim().toUpperCase()
        }..removeWhere((b) => b.isEmpty);
        _friendFilterPhones = {...config.friendPhones};
        _groupFilterIds = {...config.groupIds};

        // Keep the single bank chip in sync when only one selection exists.
        if (_selectedBanks.length == 1) {
          final only = _selectedBanks.first;
          final parts = only.split('|');
          _bankFilter = parts.first.trim().isEmpty ? null : parts.first.trim();
          _last4Filter = parts.length > 1 && parts[1].trim().isNotEmpty
              ? parts[1].trim()
              : null;
        } else {
          _bankFilter = null;
          _last4Filter = null;
        }

        _invalidateAggCache();
      });
    }
  }

  DateTimeRange _rangeOrDefault() {
    if (_range != null) return _range!;

    final now = DateTime.now();
    DateTime sod(DateTime d) => DateTime(d.year, d.month, d.day);

    switch (_periodToken) {
      case 'D':
        final s = sod(now);
        return DateTimeRange(start: s, end: s.add(const Duration(days: 1)));
      case 'W':
        final monday = sod(now).subtract(Duration(days: now.weekday - 1));
        return DateTimeRange(start: monday, end: monday.add(const Duration(days: 7)));
      case 'Y':
        final start = DateTime(now.year, 1, 1);
        return DateTimeRange(start: start, end: DateTime(now.year + 1, 1, 1));
      case 'All Time':
        if (_allExp.isEmpty && _allInc.isEmpty) {
          final fallbackStart = sod(now).subtract(const Duration(days: 30));
          return DateTimeRange(
            start: fallbackStart,
            end: fallbackStart.add(const Duration(days: 30)),
          );
        }
        DateTime? minD;
        DateTime? maxD;
        for (final e in _allExp) {
          final d = sod(e.date);
          minD = (minD == null || d.isBefore(minD!)) ? d : minD;
          maxD = (maxD == null || d.isAfter(maxD!)) ? d : maxD;
        }
        for (final i in _allInc) {
          final d = sod(i.date);
          minD = (minD == null || d.isBefore(minD!)) ? d : minD;
          maxD = (maxD == null || d.isAfter(maxD!)) ? d : maxD;
        }
        final start = minD ?? sod(now);
        final end = (maxD ?? sod(now)).add(const Duration(days: 1));
        return DateTimeRange(start: start, end: end);
      case 'M':
      default:
        final start = DateTime(now.year, now.month, 1);
        return DateTimeRange(start: start, end: DateTime(now.year, now.month + 1, 1));
    }
  }

  bool _inRange(DateTime date, DateTimeRange range) {
    return !date.isBefore(range.start) && date.isBefore(range.end);
  }

  Map<String, double> _memo(String key, Map<String, double> Function() build) {
    final cacheKey = [
      key,
      _aggRev,
      _range?.start.millisecondsSinceEpoch,
      _range?.end.millisecondsSinceEpoch,
      _periodToken,
      _bankFilter,
      _last4Filter,
      _instrumentFilter, // NEW: make cache sensitive to instrument filter
    ].join('|');

    final cached = _aggCache[cacheKey];
    if (cached != null) return cached;

    final built = Map<String, double>.from(build());
    _aggCache[cacheKey] = built;
    return built;
  }

  Map<String, double> sumExpenseByCategory() {
    final range = _rangeOrDefault();
    return _memo('expByCat', () {
      final out = <String, double>{};
      for (final e in _applyBankFiltersToExpenses(_allExp)) {
        if (!_inRange(e.date, range)) continue;
        final legacy = AnalyticsAgg.resolveExpenseCategory(e);
        final cat = _normalizeMainCategory(legacy);
        out[cat] = (out[cat] ?? 0) + e.amount;
      }
      final sorted = out.entries.toList()
        ..sort((a, b) => b.value.compareTo(a.value));
      return Map.fromEntries(sorted);
    });
  }

  Map<String, double> sumIncomeByCategory() {
    final range = _rangeOrDefault();
    return _memo('incByCat', () {
      final out = <String, double>{};
      for (final i in _applyBankFiltersToIncomes(_allInc)) {
        if (!_inRange(i.date, range)) continue;
        final cat = AnalyticsAgg.resolveIncomeCategory(i);
        out[cat] = (out[cat] ?? 0) + i.amount;
      }
      final sorted = out.entries.toList()
        ..sort((a, b) => b.value.compareTo(a.value));
      return Map.fromEntries(sorted);
    });
  }

  _CategoryInsights _buildCategoryInsightsForCurrentRange() {
    final totals = sumExpenseByCategory();
    String? highestCategory;
    double highestAmount = 0;
    String? lowestCategory;
    double lowestAmount = 0;
    final zeroCategories = <String>[];

    for (final category in _kMainExpenseCategories) {
      final amount = totals[category] ?? 0;
      if (amount <= 0) {
        zeroCategories.add(category);
        continue;
      }
      if (highestCategory == null || amount > highestAmount) {
        highestCategory = category;
        highestAmount = amount;
      }
      if (lowestCategory == null || amount < lowestAmount) {
        lowestCategory = category;
        lowestAmount = amount;
      }
    }

    return _CategoryInsights(
      highestCategory: highestCategory,
      highestAmount: highestAmount,
      lowestCategory: lowestCategory,
      lowestAmount: lowestAmount,
      zeroCategories: zeroCategories,
    );
  }

  Map<String, double> topMerchantsForCategory({
    required bool expense,
    required String category,
    int top = 8,
  }) {
    final range = _rangeOrDefault();
    return _memo('${expense ? 'exp' : 'inc'}|merch|$category', () {
      final out = <String, double>{};
      if (expense) {
        for (final e in _applyBankFiltersToExpenses(_allExp)) {
          if (!_inRange(e.date, range)) continue;
          final legacy = AnalyticsAgg.resolveExpenseCategory(e);
          final cat = _normalizeMainCategory(legacy);
          if (cat != category) continue;
          final merch = (e.counterparty ?? e.upiVpa ?? e.label ?? 'MERCHANT')
              .toString()
              .trim();
          final normalized = merch.isEmpty ? 'MERCHANT' : merch.toUpperCase();
          out[normalized] = (out[normalized] ?? 0) + e.amount;
        }
      } else {
        for (final i in _applyBankFiltersToIncomes(_allInc)) {
          if (!_inRange(i.date, range)) continue;
          final cat = AnalyticsAgg.resolveIncomeCategory(i);
          if (cat != category) continue;
          final merch = (i.counterparty ?? i.label ?? i.source ?? 'SENDER')
              .toString()
              .trim();
          final normalized = merch.isEmpty ? 'SENDER' : merch.toUpperCase();
          out[normalized] = (out[normalized] ?? 0) + i.amount;
        }
      }
      final sorted = out.entries.toList()
        ..sort((a, b) => b.value.compareTo(a.value));
      return Map.fromEntries(sorted.take(top));
    });
  }

  String _formatMerchantName(String raw) {
    if (raw.trim().isEmpty) return 'Merchant';
    final parts = raw.toLowerCase().split(RegExp(r'[\s_]+'));
    return parts
        .where((p) => p.isNotEmpty)
        .map((p) => p[0].toUpperCase() + p.substring(1))
        .join(' ');
  }

  Future<void> _openCategoryDrilldown({
    required bool expense,
    required String category,
    required double total,
    DateTimeRange? overrideRange,
  }) async {
    final range = overrideRange ?? _rangeOrDefault();
    if (expense) {
      final matches = _applyBankFiltersToExpenses(_allExp)
          .where((e) =>
              _inRange(e.date, range) &&
              _normalizeMainCategory(
                AnalyticsAgg.resolveExpenseCategory(e),
              ) ==
                  category)
          .toList();
      await _openTxDrilldown(
        title: 'Expense • $category · ${INR.f(total)}',
        exp: matches,
        inc: const [],
      );
    } else {
      final matches = _applyBankFiltersToIncomes(_allInc)
          .where((i) =>
              _inRange(i.date, range) &&
              AnalyticsAgg.resolveIncomeCategory(i) == category)
          .toList();
      await _openTxDrilldown(
        title: 'Income • $category · ${INR.f(total)}',
        exp: const [],
        inc: matches,
      );
    }
  }

  Future<void> _openCategoryDetailForMonth({
    required String category,
    required DateTime month,
  }) async {
    final buckets = _buildLastMonthSpends(monthCount: 12);
    if (buckets.isEmpty) return;

    final monthDates = <DateTime>[
      for (final b in buckets) DateTime(b.year, b.month, 1),
    ];

    DateTime selected = DateTime(month.year, month.month, 1);
    if (!monthDates.any(
        (m) => m.year == selected.year && m.month == selected.month)) {
      selected = monthDates.last;
    }

    _SubcategorySort sort = _SubcategorySort.amountDesc;
    Set<String> filter = <String>{};

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setSheetState) {
            final monthLabel = DateFormat('MMM y').format(selected);
            final monthTotals = _categoryTotalsForMonth(selected);
            final monthTotal = monthTotals[category] ?? 0;

            final subBuckets =
                _subcategoryBucketsForMonthAndCategory(selected, category);
            final allSubs = subBuckets.map((b) => b.name).toSet();

            List<_SubcategoryBucket> visible = subBuckets
                .where((b) => filter.isEmpty || filter.contains(b.name))
                .toList();

            int _cmp(String a, String b) => a.toLowerCase().compareTo(b.toLowerCase());

            visible.sort((a, b) {
              switch (sort) {
                case _SubcategorySort.amountAsc:
                  return a.amount.compareTo(b.amount);
                case _SubcategorySort.alphaAsc:
                  return _cmp(a.name, b.name);
                case _SubcategorySort.alphaDesc:
                  return _cmp(b.name, a.name);
                case _SubcategorySort.amountDesc:
                default:
                  return b.amount.compareTo(a.amount);
              }
            });

            Future<void> _pickSort() async {
              final chosen = await showModalBottomSheet<_SubcategorySort>(
                context: context,
                builder: (context) {
                  return SafeArea(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        ListTile(
                          title: const Text('Amount: High to Low'),
                          onTap: () => Navigator.pop(
                              context, _SubcategorySort.amountDesc),
                        ),
                        ListTile(
                          title: const Text('Amount: Low to High'),
                          onTap: () => Navigator.pop(
                              context, _SubcategorySort.amountAsc),
                        ),
                        ListTile(
                          title: const Text('Alphabetical: A to Z'),
                          onTap: () =>
                              Navigator.pop(context, _SubcategorySort.alphaAsc),
                        ),
                        ListTile(
                          title: const Text('Alphabetical: Z to A'),
                          onTap: () =>
                              Navigator.pop(context, _SubcategorySort.alphaDesc),
                        ),
                      ],
                    ),
                  );
                },
              );
              if (chosen != null && chosen != sort) {
                setSheetState(() => sort = chosen);
              }
            }

            Future<void> _pickFilters() async {
              final temp = filter.isEmpty ? Set<String>.from(allSubs) : Set<String>.from(filter);
              await showModalBottomSheet<void>(
                context: context,
                builder: (context) {
                  return StatefulBuilder(
                    builder: (context, setFilterState) {
                      return SafeArea(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Padding(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 16, vertical: 10),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  TextButton(
                                    onPressed: () {
                                      setFilterState(() {
                                        temp
                                          ..clear()
                                          ..addAll(allSubs);
                                      });
                                    },
                                    child: const Text('Select all'),
                                  ),
                                  TextButton(
                                    onPressed: () {
                                      setFilterState(temp.clear);
                                    },
                                    child: const Text('Clear all'),
                                  ),
                                ],
                              ),
                            ),
                            const Divider(height: 1),
                            SizedBox(
                              height: math.min(360, allSubs.length * 56).toDouble(),
                              child: ListView(
                                children: [
                                  for (final sub in allSubs)
                                    CheckboxListTile(
                                      value: temp.contains(sub),
                                      title: Text(sub),
                                      onChanged: (_) {
                                        setFilterState(() {
                                          if (temp.contains(sub)) {
                                            temp.remove(sub);
                                          } else {
                                            temp.add(sub);
                                          }
                                        });
                                      },
                                    ),
                                ],
                              ),
                            ),
                            Padding(
                              padding: const EdgeInsets.all(12),
                              child: ElevatedButton(
                                onPressed: () {
                                  Navigator.pop(context);
                                  setSheetState(() {
                                    if (temp.length == allSubs.length || temp.isEmpty) {
                                      filter = <String>{};
                                    } else {
                                      filter = Set<String>.from(temp);
                                    }
                                  });
                                },
                                child: const Text('Apply filters'),
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  );
                },
              );
            }

            return SafeArea(
              child: FractionallySizedBox(
                heightFactor: 0.95,
                child: Padding(
                  padding: EdgeInsets.only(
                    left: 16,
                    right: 16,
                    top: 14,
                    bottom: MediaQuery.of(context).viewInsets.bottom + 16,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              category,
                              style: Fx.title.copyWith(fontSize: 20),
                            ),
                          ),
                          IconButton(
                            icon: const Icon(Icons.sort_rounded),
                            tooltip: 'Sort',
                            onPressed: _pickSort,
                          ),
                          IconButton(
                            icon: const Icon(Icons.filter_alt_outlined),
                            tooltip: 'Filter',
                            onPressed: _pickFilters,
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Total for $monthLabel: ${INR.f(monthTotal)}',
                        style: Fx.label.copyWith(color: Fx.text.withOpacity(.75)),
                      ),
                      const SizedBox(height: 8),
                      SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Row(
                          children: [
                            for (final m in monthDates)
                              Padding(
                                padding: const EdgeInsets.only(right: 6),
                                child: ChoiceChip(
                                  label: Text(DateFormat('MMM').format(m)),
                                  selected: m.year == selected.year &&
                                      m.month == selected.month,
                                  onSelected: (_) {
                                    setSheetState(() {
                                      selected = m;
                                      _selectedCategoryMonth = m;
                                      filter = <String>{};
                                    });
                                    setState(() => _selectedCategoryMonth = m);
                                  },
                                ),
                              ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      Expanded(
                        child: visible.isEmpty
                            ? Center(
                                child: Text(
                                  'No subcategories for this month with current filters.',
                                  style: Fx.label.copyWith(
                                      color: Fx.text.withOpacity(.7)),
                                ),
                              )
                            : ListView.separated(
                                itemBuilder: (_, index) {
                                  final bucket = visible[index];
                                  final start =
                                      DateTime(selected.year, selected.month, 1);
                                  final end =
                                      DateTime(selected.year, selected.month + 1, 1);
                                  final range = DateTimeRange(
                                      start: start, end: end);

                                  return ListTile(
                                    contentPadding: EdgeInsets.zero,
                                    title: Text(
                                      bucket.name,
                                      style: Fx.label
                                          .copyWith(fontWeight: FontWeight.w600),
                                    ),
                                    subtitle: Text(
                                      '${bucket.txCount} tx',
                                      style: Fx.label
                                          .copyWith(color: Fx.text.withOpacity(.7)),
                                    ),
                                    trailing: Text(
                                      INR.f(bucket.amount),
                                      style: Fx.number.copyWith(
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                    onTap: () {
                                      final matches = _applyBankFiltersToExpenses(
                                        _allExp,
                                      ).where((e) {
                                        return !e.date.isBefore(start) &&
                                            e.date.isBefore(end) &&
                                            _normalizeMainCategory(
                                                  AnalyticsAgg
                                                      .resolveExpenseCategory(e),
                                                ) ==
                                                category &&
                                            _resolveExpenseSubcategory(e) ==
                                                bucket.name;
                                      }).toList();

                                      _openTxDrilldown(
                                        title:
                                            '$category • ${bucket.name} • $monthLabel · ${INR.f(bucket.amount)}',
                                        exp: matches,
                                        inc: const [],
                                      );
                                    },
                                  );
                                },
                                separatorBuilder: (_, __) => const Divider(height: 1),
                                itemCount: visible.length,
                              ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }

  Widget _periodFilterRow() {
    const periods = ['D', 'W', 'M', 'Y', 'All Time'];
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Flexible(
            child: Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final token in periods)
                  ChoiceChip(
                    label: Text(token == 'All Time' ? 'All' : token),
                    selected: _range == null && _periodToken == token,
                    onSelected: (_) {
                      setState(() {
                        _periodToken = token;
                        _period = _periodForToken(token);
                        _range = null;
                        _custom = null;
                        _invalidateAggCache();
                      });
                    },
                  ),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Custom range',
            icon: const Icon(Icons.calendar_month_rounded),
            onPressed: () async {
              final now = DateTime.now();
              final firstDate = now.subtract(const Duration(days: 180));
              final active = _range ?? _rangeOrDefault();
              final initial = DateTimeRange(
                start: active.start,
                end: active.end.subtract(const Duration(days: 1)),
              );

              final picked = await showDateRangePicker(
                context: context,
                firstDate: firstDate,
                lastDate: now.add(const Duration(days: 1)),
                initialDateRange: initial,
                helpText: 'Pick date range',
              );

              if (picked != null) {
                final start = DateTime(picked.start.year, picked.start.month, picked.start.day);
                final endInclusive = DateTime(picked.end.year, picked.end.month, picked.end.day);
                setState(() {
                  _range = DateTimeRange(
                    start: start,
                    end: endInclusive.add(const Duration(days: 1)),
                  );
                  _period = Period.custom;
                  _custom = CustomRange(start, endInclusive);
                  _invalidateAggCache();
                });
              }
            },
          ),
        ],
      ),
    );
  }

  Widget _instrumentFilterRow() {
    const options = <String>[
      'All',
      'UPI',
      'Debit Card',
      'Credit Card',
      'NetBanking',
      'IMPS',
      'NEFT',
      'RTGS',
      'ATM/POS',
      'Others',
    ];

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            for (final opt in options)
              Padding(
                padding: const EdgeInsets.only(right: 6),
                child: ChoiceChip(
                  label: Text(opt),
                  selected: _instrumentFilter == opt,
                  onSelected: (_) {
                    if (_instrumentFilter == opt) return;
                    setState(() {
                      _instrumentFilter = opt;
                      _invalidateAggCache();
                    });
                  },
                ),
              ),
          ],
        ),
      ),
    );
  }

  List<ExpenseItem> _applyBankFiltersToExpenses(List<ExpenseItem> list) {
    return list.where((e) {
      if (_bankFilter != null &&
          (e.issuerBank ?? '').toUpperCase() != _bankFilter) {
        return false;
      }
      if (_last4Filter != null) {
        final l4 = (e.cardLast4 ?? '').trim();
        if (l4.isEmpty || !l4.endsWith(_last4Filter!)) {
          return false;
        }
      }
      if (_selectedBanks.isNotEmpty) {
        final normalized = _normalizeBank(e.issuerBank);
        final last4 = (e.cardLast4 ?? '').trim();
        bool bankMatch = false;
        for (final bank in _selectedBanks) {
          final parts = bank.split('|');
          final bankPart = parts.first.trim();
          final cardPart = parts.length > 1 ? parts[1].trim() : '';
          if (bankPart.isNotEmpty && normalized != bankPart) continue;
          if (cardPart.isNotEmpty && !last4.endsWith(cardPart)) continue;
          bankMatch = true;
          break;
        }
        if (!bankMatch) return false;
      }
      if (_selectedCategories.isNotEmpty) {
        final cat = _normalizeMainCategory(
          AnalyticsAgg.resolveExpenseCategory(e),
        );
        if (!_selectedCategories.contains(cat)) return false;
      }
      if (_selectedMerchants.isNotEmpty) {
        final merch =
            (e.counterparty ?? e.upiVpa ?? e.label ?? '').trim().toUpperCase();
        if (merch.isEmpty || !_selectedMerchants.contains(merch)) return false;
      }
      if (_friendFilterPhones.isNotEmpty) {
        final ids = e.friendIds.toSet();
        if (ids.isEmpty || ids.intersection(_friendFilterPhones).isEmpty) {
          return false;
        }
      }
      if (_groupFilterIds.isNotEmpty) {
        final gid = (e.groupId ?? '').trim();
        if (gid.isEmpty || !_groupFilterIds.contains(gid)) return false;
      }
      // NEW: transaction type / instrument filter
      if (!_matchesInstrumentFilter(e.instrument)) {
        return false;
      }
      return true;
    }).toList();
  }

  List<IncomeItem> _applyBankFiltersToIncomes(List<IncomeItem> list) {
    return list.where((i) {
      if (_bankFilter != null &&
          (i.issuerBank ?? '').toUpperCase() != _bankFilter) {
        return false;
      }
      if (_last4Filter != null) {
        return false; // incomes don't have cardLast4 currently
      }
      if (_selectedBanks.isNotEmpty) {
        final normalized = _normalizeBank(i.issuerBank);
        bool bankMatch = false;
        for (final bank in _selectedBanks) {
          final parts = bank.split('|');
          final bankPart = parts.first.trim();
          if (bankPart.isEmpty || normalized == bankPart) {
            bankMatch = true;
            break;
          }
        }
        if (!bankMatch) return false;
      }
      if (_selectedMerchants.isNotEmpty) {
        final merch =
            (i.counterparty ?? i.label ?? i.source ?? '').trim().toUpperCase();
        if (merch.isEmpty || !_selectedMerchants.contains(merch)) return false;
      }
      if (_selectedCategories.isNotEmpty) {
        final cat = AnalyticsAgg.resolveIncomeCategory(i);
        if (!_selectedCategories.contains(cat)) return false;
      }
      // NEW: transaction type / instrument filter
      if (!_matchesInstrumentFilter(i.instrument)) {
        return false;
      }
      return true;
    }).toList();
  }

  bool _isBankSelected(String bank, {String? last4}) {
    final normalizedBank = bank.toUpperCase();
    if (_bankFilter != normalizedBank) return false;
    final targetLast4 = (last4 ?? '').trim();
    if (targetLast4.isEmpty) {
      return _last4Filter == null;
    }
    return _last4Filter == targetLast4;
  }

  void _toggleBankSelection(String bank, {String? last4}) {
    final normalizedBank = bank.toUpperCase();
    final normalizedLast4 = (last4 ?? '').trim().isEmpty ? null : last4!.trim();

    setState(() {
      final currentLast4 = _last4Filter ?? '';
      final targetLast4 = normalizedLast4 ?? '';
      if (_bankFilter == normalizedBank && currentLast4 == targetLast4) {
        _bankFilter = null;
        _last4Filter = null;
      } else {
        _bankFilter = normalizedBank;
        _last4Filter = normalizedLast4;
      }
    });
    _invalidateAggCache();

    if (_scrollCtrl.hasClients) {
      _scrollCtrl.animateTo(
        0,
        duration: const Duration(milliseconds: 280),
        curve: Curves.easeOutCubic,
      );
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
    return raw?.trim().isEmpty == true ? 'Account' : (raw ?? '').trim();
  }

  /// Map any legacy/old category label into one of our 10 main
  /// categories: Fund Transfers, Payments, Shopping, Travel, Food,
  /// Entertainment, Others, Healthcare, Education, Investments.
  String _normalizeMainCategory(String raw) {
    final key = raw.toLowerCase().trim();

    bool hasAny(List<String> tokens) {
      for (final t in tokens) {
        if (key.contains(t)) return true;
      }
      return false;
    }

    // 1) Fund Transfers
    if (hasAny([
      'fund transfer',
      'fund transfers',
      'transfer',
      'p2p',
      'p2m',
      'p2a',
      'self transfer',
      'remittance',
      'cash withdrawal',
      'cash withdraw',
      'atm withdraw',
    ])) {
      return 'Fund Transfers';
    }

    // 2) Payments (loans, bills, recharges, fuel, rent, wallet, etc.)
    if (hasAny([
      'emi',
      'loan',
      'bill',
      'utility',
      'electric',
      'electricity',
      'water',
      'gas',
      'dth',
      'recharge',
      'mobile',
      'postpaid',
      'prepaid',
      'fuel',
      'petrol',
      'diesel',
      'wallet',
      'rent',
      'rental',
      'real estate',
      'payment',
      'paytm recharge',
      'phonepe recharge',
    ])) {
      return 'Payments';
    }

    // 3) Shopping (groceries, ecommerce, apparel, personal care, etc.)
    if (hasAny([
      'grocery',
      'groceries',
      'supermarket',
      'mart',
      'ecom',
      'e-commerce',
      'amazon',
      'flipkart',
      'myntra',
      'nykaa',
      'shop',
      'shopping',
      'fashion',
      'apparel',
      'clothes',
      'electronics',
      'mobile store',
      'personal care',
      'beauty',
      'fitness',
      'gym',
      'gift',
      'gifting',
      'jewell',
      'jewel',
      'stationery',
      'books',
    ])) {
      return 'Shopping';
    }

    // 4) Travel (flights, trains, cabs, hotels, forex, etc.)
    if (hasAny([
      'travel',
      'trip',
      'tour',
      'holiday',
      'flight',
      'airline',
      'air india',
      'indigo',
      'spicejet',
      'vistara',
      'rail',
      'train',
      'irctc',
      'metro',
      'bus',
      'cab',
      'taxi',
      'uber',
      'ola',
      'rapido',
      'hotel',
      'stay',
      'accommodation',
      'resort',
      'car rental',
      'bike rental',
      'forex',
    ])) {
      return 'Travel';
    }

    // 5) Food (restaurants, delivery, alcohol)
    if (hasAny([
      'food',
      'restaurant',
      'restro',
      'cafe',
      'coffee',
      'swiggy',
      'zomato',
      'dining',
      'hotel food',
      'breakfast',
      'lunch',
      'dinner',
      'bar',
      'pub',
      'alcohol',
      'liquor',
    ])) {
      return 'Food';
    }

    // 6) Entertainment (OTT, movies, music, gaming)
    if (hasAny([
      'entertain',
      'movie',
      'cinema',
      'pvr',
      'inox',
      'netflix',
      'prime video',
      'hotstar',
      'sony liv',
      'zee5',
      'ott',
      'spotify',
      'wynk',
      'music',
      'gaming',
      'game',
      'playstation',
      'xbox',
    ])) {
      return 'Entertainment';
    }

    // 8) Healthcare
    if (hasAny([
      'health',
      'hospital',
      'clinic',
      'doctor',
      'dentist',
      'pharma',
      'pharmacy',
      'chemist',
      'medicine',
      'medical',
      'lab',
      'diagnostic',
    ])) {
      return 'Healthcare';
    }

    // 9) Education
    if (hasAny([
      'educat',
      'school',
      'college',
      'university',
      'tuition',
      'coaching',
      'course',
      'udemy',
      'coursera',
      'byju',
      'unacademy',
      'fees',
    ])) {
      return 'Education';
    }

    // 10) Investments (mutual funds, stocks, fds, etc.)
    if (hasAny([
      'invest',
      'mf',
      'mutual fund',
      'sip',
      'stock',
      'shares',
      'equity',
      'demat',
      'broker',
      'zerodha',
      'groww',
      'angel',
      'upstox',
      'fd',
      'fixed deposit',
      'rd',
      'recurring deposit',
      'ppf',
      'nps',
      'insurance premium',
      'insurance',
      'lic',
    ])) {
      return 'Investments';
    }

    // 7) Others (bank charges, govt, tax, misc)
    if (hasAny([
      'charge',
      'fee',
      'penalty',
      'tax',
      'tds',
      'gst',
      'govt',
      'government',
      'stamp duty',
      'service charge',
      'cheque',
      'bank',
    ])) {
      return 'Others';
    }

    // Fallback: anything unknown becomes "Others".
    return 'Others';
  }

  IconData _iconForCategory(String category) {
    final c = category.toLowerCase();
    if (c.contains('fund transfer')) return Icons.swap_horiz_rounded;
    if (c.contains('payment')) return Icons.receipt_long_rounded;
    if (c.contains('shopping')) return Icons.shopping_bag_rounded;
    if (c.contains('travel')) return Icons.flight_takeoff_rounded;
    if (c.contains('food')) return Icons.restaurant_rounded;
    if (c.contains('entertainment')) return Icons.movie_filter_rounded;
    if (c.contains('health')) return Icons.health_and_safety_rounded;
    if (c.contains('educat')) return Icons.school_rounded;
    if (c.contains('invest')) return Icons.trending_up_rounded;
    if (c.contains('other')) return Icons.category_rounded;
    return Icons.category_rounded;
  }

  bool _matchesInstrumentFilter(String? rawInstrument) {
    if (_instrumentFilter == 'All') return true;

    final norm = _normInstrument(rawInstrument).toUpperCase();

    switch (_instrumentFilter) {
      case 'UPI':
        return norm == 'UPI';
      case 'Debit Card':
        return norm == 'DEBIT CARD';
      case 'Credit Card':
        return norm == 'CREDIT CARD';
      case 'NetBanking':
        return norm == 'NETBANKING';
      case 'IMPS':
        return norm == 'IMPS';
      case 'NEFT':
        return norm == 'NEFT';
      case 'RTGS':
        return norm == 'RTGS';
      case 'ATM/POS':
        return norm == 'ATM' || norm == 'POS';
      case 'Others':
        return norm != 'UPI' &&
            norm != 'DEBIT CARD' &&
            norm != 'CREDIT CARD' &&
            norm != 'NETBANKING' &&
            norm != 'IMPS' &&
            norm != 'NEFT' &&
            norm != 'RTGS' &&
            norm != 'ATM' &&
            norm != 'POS';
      default:
        return true;
    }
  }

  Map<String, double> _summaryFor(
      List<ExpenseItem> expenses, List<IncomeItem> incomes) {
    final debit = expenses.fold<double>(0, (sum, e) => sum + e.amount);
    final credit = incomes.fold<double>(0, (sum, i) => sum + i.amount);
    return {'credit': credit, 'debit': debit, 'net': credit - debit};
  }

  /// Builds expense totals for the last [monthCount] months (including current month),
  /// after applying the current bank/card filters.
  /// Oldest month comes first in the returned list.
  List<_MonthSpend> _buildLastMonthSpends({int monthCount = 12}) {
    if (monthCount <= 0) return <_MonthSpend>[];

    final now = DateTime.now();

    // Apply only bank/card filters here; we want full history by month,
    // not limited by the current _range.
    final baseExp = _applyBankFiltersToExpenses(_allExp);

    final List<_MonthSpend> out = <_MonthSpend>[];
    for (int i = monthCount - 1; i >= 0; i--) {
      final monthDate = DateTime(now.year, now.month - i, 1);
      final start = DateTime(monthDate.year, monthDate.month, 1);
      final end = DateTime(monthDate.year, monthDate.month + 1, 1);

      double total = 0;
      for (final e in baseExp) {
        if (!e.date.isBefore(start) && e.date.isBefore(end)) {
          total += e.amount;
        }
      }

      out.add(_MonthSpend(monthDate.year, monthDate.month, total));
    }

    return out;
  }

  /// Convenience labels for month buckets, e.g. ["Dec", "Jan", "Feb", ...].
  List<String> _labelsForMonthSpends(List<_MonthSpend> buckets) {
    final fmt = DateFormat('MMM');
    return buckets
        .map((b) => fmt.format(DateTime(b.year, b.month, 1)))
        .toList();
  }

  List<_MonthlyCategoryStack> _buildMonthlyCategoryStacks(int monthCount) {
    if (monthCount <= 0) return const [];

    final now = DateTime.now();
    final base = _applyBankFiltersToExpenses(_allExp);

    final List<_MonthlyCategoryStack> stacks = <_MonthlyCategoryStack>[];
    for (int i = monthCount - 1; i >= 0; i--) {
      final monthDate = DateTime(now.year, now.month - i, 1);
      final start = DateTime(monthDate.year, monthDate.month, 1);
      final end = DateTime(monthDate.year, monthDate.month + 1, 1);

      final totals = <String, double>{};
      for (final e in base) {
        if (!e.date.isBefore(start) && e.date.isBefore(end)) {
          final legacy = AnalyticsAgg.resolveExpenseCategory(e);
          final cat = _normalizeMainCategory(legacy);
          totals[cat] = (totals[cat] ?? 0) + e.amount;
        }
      }

      final segments = totals.entries
          .map((entry) => _CategoryStackSegment(entry.key, entry.value))
          .toList()
        ..sort((a, b) => b.value.compareTo(a.value));

      stacks.add(_MonthlyCategoryStack(monthDate.year, monthDate.month, segments));
    }

    return stacks;
  }

  /// Category totals for a specific calendar month, after applying
  /// current bank/card + instrument filters.
  Map<String, double> _categoryTotalsForMonth(DateTime month) {
    final key = 'expByCatMonth-${month.year}-${month.month}';
    return _memo(key, () {
      final base = _applyBankFiltersToExpenses(_allExp);
      final start = DateTime(month.year, month.month, 1);
      final end = DateTime(month.year, month.month + 1, 1);

      final out = <String, double>{};
      for (final e in base) {
        if (!e.date.isBefore(start) && e.date.isBefore(end)) {
          final legacy = AnalyticsAgg.resolveExpenseCategory(e);
          final cat = _normalizeMainCategory(legacy);
          out[cat] = (out[cat] ?? 0) + e.amount;
        }
      }

      final entries = out.entries.toList()
        ..sort((a, b) => b.value.compareTo(a.value));
      return Map<String, double>.fromEntries(entries);
    });
  }

  String _resolveExpenseSubcategory(ExpenseItem e) {
    try {
      final val = (e as dynamic).subcategory as String?;
      if (val != null && val.trim().isNotEmpty) return val.trim();
    } catch (_) {}

    try {
      final map = e.toJson();
      final val = map['subcategory'];
      if (val is String && val.trim().isNotEmpty) return val.trim();
    } catch (_) {}

    final metaSub = e.brainMeta?['subcategory'];
    if (metaSub is String && metaSub.trim().isNotEmpty) return metaSub.trim();

    return 'Uncategorized';
  }

  /// Subcategory buckets for a given month and main category, respecting
  /// bank/card + instrument filters.
  List<_SubcategoryBucket> _subcategoryBucketsForMonthAndCategory(
    DateTime month,
    String category,
  ) {
    final start = DateTime(month.year, month.month, 1);
    final end = DateTime(month.year, month.month + 1, 1);

    final filtered = _applyBankFiltersToExpenses(_allExp).where((e) {
      final legacy = AnalyticsAgg.resolveExpenseCategory(e);
      if (_normalizeMainCategory(legacy) != category) return false;
      return !e.date.isBefore(start) && e.date.isBefore(end);
    });

    final map = <String, _SubcategoryBucket>{};
    for (final e in filtered) {
      final sub = _resolveExpenseSubcategory(e);
      final existing = map[sub];
      if (existing == null) {
        map[sub] = _SubcategoryBucket(name: sub, amount: e.amount, txCount: 1);
      } else {
        map[sub] = _SubcategoryBucket(
          name: sub,
          amount: existing.amount + e.amount,
          txCount: existing.txCount + 1,
        );
      }
    }

    final buckets = map.values.toList()
      ..sort((a, b) => b.amount.compareTo(a.amount));
    return buckets;
  }

  List<_CardGroup> _cardGroupsForPeriod(
    List<ExpenseItem> exp,
    List<IncomeItem> inc,
    DateTimeRange range,
  ) {
    final cacheKey = [
      'cardGroups',
      _aggRev,
      _rev,
      range.start.millisecondsSinceEpoch,
      range.end.millisecondsSinceEpoch,
      _bankFilter,
      _last4Filter,
      _instrumentFilter,
      exp.length,
      inc.length,
    ].join('|');
    final cached = _heavyAggCache[cacheKey];
    if (cached is List<_CardGroup>) return cached;

    final map = <String, _CardGroup>{};

    void addTxn({
      required String direction,
      required double amount,
      String? bank,
      String? instrument,
      String? last4,
      String? network,
    }) {
      if (amount <= 0) return;

      final rawBank = (bank ?? 'Unknown').trim();
      final rawInstrument = (instrument ?? '').trim();
      if (rawBank.isEmpty && rawInstrument.isEmpty) return;

      String? l4;
      if (last4 != null) {
        final trimmed = last4.trim();
        if (trimmed.isNotEmpty) {
          final digits = RegExp(r'([0-9]{4})$').firstMatch(trimmed);
          if (digits != null) {
            l4 = digits.group(1);
          } else {
            final start = trimmed.length >= 4 ? trimmed.length - 4 : 0;
            l4 = trimmed.substring(start);
          }
        }
      }

      final labelInstrument = _normInstrument(rawInstrument);

      final normalizedNetwork = (network ?? '').trim();
      final key = '${rawBank.toUpperCase()}|$labelInstrument|${l4 ?? ''}|${normalizedNetwork.toUpperCase()}';
      final group = map.putIfAbsent(
        key,
        () => _CardGroup(
          bank: rawBank.isEmpty ? 'UNKNOWN' : rawBank.toUpperCase(),
          instrument: labelInstrument.isEmpty ? 'Account' : labelInstrument,
          last4: l4,
          network: normalizedNetwork.isEmpty ? null : normalizedNetwork,
        ),
      );

      if (direction == 'debit') {
        group.debitTotal += amount;
      } else {
        group.creditTotal += amount;
      }
      group.txCount += 1;
    }

    for (final e in exp) {
      addTxn(
        direction: 'debit',
        amount: e.amount,
        bank: e.issuerBank,
        instrument: e.instrument,
        last4: e.cardLast4,
        network: e.instrumentNetwork,
      );
    }

    for (final i in inc) {
      addTxn(
        direction: 'credit',
        amount: i.amount,
        bank: i.issuerBank,
        instrument: i.instrument,
        last4: null, // incomes do not carry cardLast4 in model
        network: i.instrumentNetwork,
      );
    }

    final groups = map.values.where((g) => g.txCount > 0).toList();
    groups.sort((a, b) {
      final diff = b.netOutflow.compareTo(a.netOutflow);
      if (diff != 0) return diff;
      return b.txCount.compareTo(a.txCount);
    });
    _heavyAggCache[cacheKey] = groups;
    return groups;
  }

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    setState(() => _loading = true);
    try {
      _allExp = await _expenseSvc.getExpenses(widget.userPhone);
      _allInc = await _incomeSvc.getIncomes(widget.userPhone);
      // Analytics uses only last ~18 months of data for performance.
      final now = DateTime.now();
      final cutoff = DateTime(now.year, now.month - 18, 1);
      _allExp =
          _allExp.where((e) => !e.date.isBefore(cutoff)).toList();
      _allInc =
          _allInc.where((i) => !i.date.isBefore(cutoff)).toList();
      _rev++;
      _invalidateAggCache();

      // NEW: default selected month for category list (current month)
      if (_selectedCategoryMonth == null) {
        _selectedCategoryMonth = DateTime(now.year, now.month, 1);
      }
    } catch (_) {}
    if (!mounted) return;
    setState(() => _loading = false);
  }

  @override
  void dispose() {
    _scrollCtrl.dispose();
    super.dispose();
  }

  Widget _analyticsBannerCard() {
    final bodySmall = Theme.of(context).textTheme.bodySmall;
    return GlassCard(
      radius: Fx.r24,
      child: AdsBannerCard(
        placement: 'analytics_overview',
        inline: true,
        inlineMaxHeight: 90,
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 18),
        minHeight: 96,
        boxShadow: const [],
        placeholder: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.campaign_rounded, color: Fx.mintDark),
            const SizedBox(height: 8),
            const Text(
              'Sponsored',
              style: TextStyle(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 4),
            Text(
              'Your personalised offers will appear here shortly.',
              textAlign: TextAlign.center,
              style: bodySmall?.copyWith(color: Colors.black54),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final bottomPadding = context.adsBottomPadding(extra: 24);

    final activeRange = _range ?? _rangeOrDefault();

    final expPeriodRaw = _allExp
        .where((e) => _inRange(e.date, activeRange))
        .toList()
      ..sort((a, b) => b.date.compareTo(a.date));
    final incPeriodRaw = _allInc
        .where((i) => _inRange(i.date, activeRange))
        .toList()
      ..sort((a, b) => b.date.compareTo(a.date));
    final exp = _applyBankFiltersToExpenses(expPeriodRaw);
    final inc = _applyBankFiltersToIncomes(incPeriodRaw);

    final hasTransactions = exp.isNotEmpty || inc.isNotEmpty;
    final cardGroups = hasTransactions
        ? _cardGroupsForPeriod(expPeriodRaw, incPeriodRaw, activeRange)
        : const <_CardGroup>[];

    final txSummary = _summaryFor(exp, inc);
    final totalExp = txSummary['debit'] ?? 0.0;
    final totalInc = txSummary['credit'] ?? 0.0;
    final savings = txSummary['net'] ?? 0.0;

    final seriesKey = [
      _rev,
      _aggRev,
      _period,
      _custom?.start.millisecondsSinceEpoch,
      _custom?.end.millisecondsSinceEpoch,
      _bankFilter,
      _last4Filter,
      _instrumentFilter,
    ].join('|');
    final series = _seriesCache[seriesKey] ??=
        AnalyticsAgg.amountSeries(_period, exp, inc, now, custom: _custom);

    // Sparkline series reacts to the current filter/period
    final spark = _sparkForPeriod(_period, exp, now, custom: _custom);
    final sparkLabels =
        _sparkLabelsForPeriod(_period, spark, now, custom: _custom);

    final bankExpansionTiles = <Widget>[];
    if (cardGroups.isNotEmpty) {
      final grouped = <String, List<_CardGroup>>{};
      for (final group in cardGroups) {
        grouped.putIfAbsent(group.bank, () => []).add(group);
      }

      final bankKeys = grouped.keys.toList()..sort();
      for (final bank in bankKeys) {
        final accounts = List<_CardGroup>.from(grouped[bank]!);
        accounts.sort((a, b) => b.netOutflow.compareTo(a.netOutflow));
        final bankNet =
            accounts.fold<double>(0, (sum, item) => sum + item.netOutflow);
        final bankColor = bankNet >= 0
            ? (Colors.red.shade700 ?? Colors.red)
            : (Colors.green.shade700 ?? Colors.green);

        final tiles = <Widget>[
          ListTile(
            dense: true,
            contentPadding: EdgeInsets.zero,
            selected: _isBankSelected(bank),
            onTap: () => _toggleBankSelection(bank),
            leading: _bankLogo(bank, size: 32),
            minLeadingWidth: 40,
            title: Text(
              'All ${_formatBankLabel(bank)}',
              style: Fx.label.copyWith(fontWeight: FontWeight.w700),
            ),
            trailing: Text(
              INR.f(bankNet),
              style:
                  Fx.number.copyWith(color: bankColor, fontWeight: FontWeight.w800),
            ),
          ),
        ];

        if (accounts.isNotEmpty) {
          tiles.add(const SizedBox(height: 6));
        }

        for (final account in accounts) {
          final subtitleParts = <String>[];
          if (account.last4 != null && account.last4!.isNotEmpty) {
            subtitleParts.add('••${account.last4}');
          }
          if ((account.network ?? '').isNotEmpty) {
            subtitleParts.add(account.network!);
          }
          subtitleParts.add('${account.txCount} tx');
          final subtitle = subtitleParts.join(' • ');
          final accountColor = account.netOutflow >= 0
              ? (Colors.red.shade700 ?? Colors.red)
              : (Colors.green.shade700 ?? Colors.green);

          tiles.add(
            ListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              selected: _isBankSelected(bank, last4: account.last4),
              onTap: () =>
                  _toggleBankSelection(bank, last4: account.last4),
              leading: _bankLogo(
                bank,
                network: account.network,
                size: 32,
              ),
              minLeadingWidth: 40,
              title: Text(
                account.instrument,
                style: Fx.label.copyWith(fontWeight: FontWeight.w600),
              ),
              subtitle: subtitle.isNotEmpty
                  ? Text(subtitle, style: Fx.label.copyWith(fontSize: 12))
                  : null,
              trailing: Text(
                INR.f(account.netOutflow),
                style: Fx.number
                    .copyWith(color: accountColor, fontWeight: FontWeight.w800),
              ),
            ),
          );
        }

        bankExpansionTiles.add(
          ExpansionTile(
            key: PageStorageKey('analytics-bank-$bank'),
            initiallyExpanded: _isBankSelected(bank),
            tilePadding: const EdgeInsets.symmetric(horizontal: 12),
            childrenPadding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
            leading: _bankLogo(bank, size: 40),
            title: Row(
              children: [
                Expanded(
                  child: Text(
                    _formatBankLabel(bank),
                    style:
                        Fx.label.copyWith(fontWeight: FontWeight.w800, fontSize: 16),
                  ),
                ),
                Text(
                  INR.f(bankNet),
                  style: Fx.number
                      .copyWith(color: bankColor, fontWeight: FontWeight.w800),
                ),
              ],
            ),
            children: tiles,
          ),
        );
      }
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Analytics'),
        elevation: 0,
        backgroundColor: Colors.transparent,
        foregroundColor: Fx.mintDark,
        actions: [
          IconButton(
            tooltip: 'Filters',
            onPressed: _openFiltersScreen,
            icon: Stack(
              clipBehavior: Clip.none,
              children: [
                const Icon(Icons.filter_alt_rounded),
                if (_hasActiveFilters)
                  Positioned(
                    right: -2,
                    top: -2,
                    child: Container(
                      width: 8,
                      height: 8,
                      decoration: const BoxDecoration(
                        color: Colors.redAccent,
                        shape: BoxShape.circle,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
      body: Stack(
        children: [
          _bg(),
          _loading
              ? const Center(child: CircularProgressIndicator())
              : RefreshIndicator(
                  onRefresh: _bootstrap,
                  child: ListView(
                    controller: _scrollCtrl,
                    padding: EdgeInsets.fromLTRB(16, 12, 16, bottomPadding),
                    children: [
                      _periodFilterRow(),
                      if (_bankFilter != null) ...[
                        const SizedBox(height: 8),
                        Align(
                          alignment: Alignment.centerLeft,
                          child: ConstrainedBox(
                            constraints: BoxConstraints(
                              // screen width minus the 16 px left/right list padding
                              maxWidth:
                                  MediaQuery.of(context).size.width - 32,
                            ),
                            child: InputChip(
                              avatar: const Icon(
                                Icons.filter_alt,
                                size: 16,
                                color: Colors.teal,
                              ),
                              label: Text(
                                _formatBankLabel(_bankFilter!) +
                                    (_last4Filter != null
                                        ? ' • ••${_last4Filter!}'
                                        : ''),
                                maxLines: 1,
                                softWrap: false,
                                overflow: TextOverflow.ellipsis,
                              ),
                              onPressed: () {}, // no-op
                              onDeleted: () => setState(() {
                                _bankFilter = null;
                                _last4Filter = null;
                                _invalidateAggCache();
                              }),
                              deleteIcon: const Icon(Icons.close, size: 16),
                              backgroundColor:
                                  Colors.teal.withOpacity(.10),
                              shape: const StadiumBorder(),
                              selected: true,
                            ),
                          ),
                        ),
                      ],
                      const SizedBox(height: 12),

                      // NEW: transaction type / instrument filter row
                      _instrumentFilterRow(),

                      // ===== OVERVIEW (Totals + counts + sparkline) =====
                      _summaryCard(
                        income: totalInc,
                        expense: totalExp,
                        savings: savings,
                        txCount: exp.length + inc.length,
                        expCount: exp.length,
                        incCount: inc.length,
                        spark: spark,
                        onTapSpark: () => _showTrendPopup(
                          spark,
                          title: _period == Period.custom
                              ? 'Trend • Custom'
                              : 'Trend • ${_period.name.toUpperCase()}',
                          labels: sparkLabels,
                        ),
                      ),

                      const SizedBox(height: 12),

                      // NEW: Last X months spends card (Axis-style)
                      _lastMonthsSpendsCard(),

                      // Small banner ad under Overview
                      const SizedBox(height: 10),
                      _analyticsBannerCard(),

                      const SizedBox(height: 14),

                      // NEW: Monthly spends by category (with month selector)
                      _monthlyCategoryListCard(),

                      const SizedBox(height: 14),

                      if (!hasTransactions) ...[
                        GlassCard(
                          radius: Fx.r24,
                          child: Padding(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 14, vertical: 16),
                            child: Text(
                              'No transactions in this period with the current filters.',
                              style: Fx.label
                                  .copyWith(color: Fx.text.withOpacity(.7)),
                            ),
                          ),
                        ),
                        const SizedBox(height: 14),
                      ],

                      if (bankExpansionTiles.isNotEmpty) ...[
                        GlassCard(
                          radius: Fx.r24,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              _sectionHeader('Banks & Cards', Icons.credit_card_rounded),
                              const SizedBox(height: 8),
                              ListView(
                                shrinkWrap: true,
                                physics: const NeverScrollableScrollPhysics(),
                                children: bankExpansionTiles,
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 14),
                      ],

                      // ===== Transactions (bottom) with filter chips =====
                      GlassCard(
                        radius: Fx.r24,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _sectionHeader('Transactions', Icons.list_alt_rounded),
                            const SizedBox(height: 6),
                            Wrap(
                              spacing: 8,
                              children: ['All', 'Income', 'Expense'].map((f) {
                                final sel = _txnFilter == f;
                                return ChoiceChip(
                                  label: Text(f),
                                  selected: sel,
                                  onSelected: (_) =>
                                      setState(() => _txnFilter = f),
                                );
                              }).toList(),
                            ),
                            const SizedBox(height: 8),
                            UnifiedTransactionList(
                              expenses: exp,
                              incomes: inc,
                              friendsById: const <String, FriendModel>{},
                              userPhone: widget.userPhone,
                              previewCount: 20,
                              filterType: _txnFilter,
                              showBillIcon: true,
                              onEdit: _handleEdit,
                              onDelete: _handleDelete,
                              emptyBuilder: (context) =>
                                  _analyticsNoTransactions(_txnFilter),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
        ],
      ),
    );
  }

  // ---------- background ----------
  Widget _bg() => IgnorePointer(
        ignoring: true,
        child: Container(
          decoration: BoxDecoration(
            gradient: RadialGradient(
              colors: [
                Fx.mint.withOpacity(0.10),
                Fx.mintDark.withOpacity(0.06),
                Colors.white.withOpacity(0.60),
              ],
              center: Alignment.topLeft,
              radius: 0.9,
            ),
          ),
        ),
      );

  Widget _analyticsNoTransactions(String filterLabel) {
    final theme = Theme.of(context);
    final label = filterLabel == 'All'
        ? 'No transactions match this filter.'
        : 'No ${filterLabel.toLowerCase()} transactions match this filter.';

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 28, horizontal: 24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          SizedBox(
            height: 180,
            child: Image.asset(
              'assets/icons/no_transaction.png',
              fit: BoxFit.contain,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'Nothing to show yet',
            style:
                theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyMedium?.copyWith(color: Colors.black54),
          ),
        ],
      ),
    );
  }

  // ---------- Section header ----------
  Widget _sectionHeader(String title, IconData icon) {
    return Row(
      children: [
        Icon(icon, color: Fx.mintDark),
        const SizedBox(width: Fx.s8),
        Text(title, style: Fx.title.copyWith(fontSize: 18)),
      ],
    );
  }

  // ---------- OVERVIEW card ----------
  Widget _summaryCard({
    required double income,
    required double expense,
    required double savings,
    required int txCount,
    required int expCount,
    required int incCount,
    required List<double> spark,
    required VoidCallback onTapSpark,
  }) {
    return GlassCard(
      radius: Fx.r24,
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Overview', style: Fx.title.copyWith(fontSize: 18)),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: _statRow('Total Income', INR.f(income), Fx.good,
                    Icons.south_west_rounded),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _statRow('Total Expense', INR.f(expense), Fx.bad,
                    Icons.north_east_rounded),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Icon(Icons.brightness_1_rounded, size: 10, color: Fx.warn),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  'Total Savings  ',
                  style: Fx.label,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 4),
              Flexible(
                child: Text(
                  INR.f(savings),
                  style: Fx.number.copyWith(color: Fx.text),
                  maxLines: 1,
                  softWrap: false,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.right,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'Tx ${NumberFormat.decimalPattern().format(txCount)} '
            '• Exp # ${NumberFormat.decimalPattern().format(expCount)} '
            '• Inc # ${NumberFormat.decimalPattern().format(incCount)}',
            style: Fx.label.copyWith(color: Fx.text.withOpacity(.85)),
            maxLines: 2,
            softWrap: true,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 14),
          GestureDetector(
            onTap: onTapSpark,
            behavior: HitTestBehavior.opaque,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(
                  height: 66,
                  child: _SparklineSimple(values: spark),
                ),
                const SizedBox(height: 6),
                Align(
                  alignment: Alignment.centerRight,
                  child: Text(
                    'Tap graph to expand',
                    style: Fx.label.copyWith(
                      fontSize: 11,
                      color: Fx.text.withOpacity(.75),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ---------- Monthly "Spends by Category" card ----------
  Widget _monthlyCategoryListCard() {
    final buckets = _buildLastMonthSpends(monthCount: 12);

    if (buckets.isEmpty) {
      // No history at all; show a soft empty card instead of nothing.
      return GlassCard(
        radius: Fx.r24,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
          child: Text(
            'We’ll show your spends by category here once transactions are available.',
            style: Fx.label.copyWith(color: Fx.text.withOpacity(.7)),
          ),
        ),
      );
    }

    // Build list of month DateTimes from oldest -> newest.
    final monthDates = <DateTime>[
      for (final b in buckets) DateTime(b.year, b.month, 1),
    ];

    // Ensure selected month is valid; default to most recent if null/out of range.
    DateTime selected =
        _selectedCategoryMonth ?? monthDates.last; // latest in our buckets.
    if (!monthDates.any(
        (m) => m.year == selected.year && m.month == selected.month)) {
      selected = monthDates.last;
      _selectedCategoryMonth = selected;
    }

    final monthLabelFull = DateFormat('MMMM y').format(selected);
    final monthShortFmt = DateFormat('MMM');

    final byCat = _categoryTotalsForMonth(selected);
    final entries = byCat.entries.toList();
    final hasData =
        entries.isNotEmpty && entries.any((e) => e.value.abs() > 0);
    final monthTotal = entries.fold<double>(0, (sum, e) => sum + e.value);

    return GlassCard(
      radius: Fx.r24,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Row(
            children: [
              const Icon(Icons.category_rounded, color: Colors.teal),
              const SizedBox(width: Fx.s8),
              Expanded(
                child: Text(
                  'Spends by category',
                  style: Fx.title.copyWith(fontSize: 18),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            '$monthLabelFull spends – ${INR.f(monthTotal)}',
            style: Fx.label.copyWith(
              fontWeight: FontWeight.w600,
              color: Fx.text.withOpacity(.85),
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 8),

          // Month selector chips (last 12 months)
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final m in monthDates)
                  Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: ChoiceChip(
                      label: Text(monthShortFmt.format(m)),
                      selected:
                          m.year == selected.year && m.month == selected.month,
                      onSelected: (_) {
                        setState(() {
                          _selectedCategoryMonth = m;
                        });
                      },
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 10),

          if (!hasData)
            Padding(
              padding:
                  const EdgeInsets.symmetric(horizontal: 4.0, vertical: 4.0),
              child: Text(
                'No spends found for this month with the current filters.',
                style: Fx.label.copyWith(color: Fx.text.withOpacity(.7)),
              ),
            )
          else
            ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: entries.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (_, index) {
                final entry = entries[index];
                final cat = entry.key;
                final amount = entry.value;

                final start = DateTime(selected.year, selected.month, 1);
                final end = DateTime(selected.year, selected.month + 1, 1);
                final range = DateTimeRange(start: start, end: end);

                return ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(
                    _iconForCategory(cat),
                    color: Fx.mintDark,
                  ),
                  title: Text(
                    cat,
                    style: Fx.label.copyWith(fontWeight: FontWeight.w600),
                  ),
                  trailing: Text(
                    INR.f(amount),
                    style: Fx.number.copyWith(fontWeight: FontWeight.w700),
                    maxLines: 1,
                    softWrap: false,
                    overflow: TextOverflow.ellipsis,
                  ),
                  onTap: () => _openCategoryDetailForMonth(
                    category: cat,
                    month: selected,
                  ),
                  onLongPress: () => _openCategoryDrilldown(
                    expense: true,
                    category: cat,
                    total: amount,
                    overrideRange: range,
                  ),
                );
              },
            ),
        ],
      ),
    );
  }

  Widget _categoryInsightTile({
    required String label,
    required String description,
    required double amount,
    required Color accentColor,
  }) {
    final compact = NumberFormat.compactCurrency(
      locale: 'en_IN',
      symbol: '₹',
      decimalDigits: 0,
    );

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: accentColor.withOpacity(.07),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: accentColor.withOpacity(.35)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 10,
            height: 10,
            margin: const EdgeInsets.only(top: 4),
            decoration: BoxDecoration(
              color: accentColor,
              borderRadius: BorderRadius.circular(12),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: Fx.label.copyWith(
                    fontWeight: FontWeight.w700,
                    color: Fx.text.withOpacity(.95),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  description,
                  style: Fx.label.copyWith(
                    color: Fx.text.withOpacity(.85),
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Text(
            compact.format(amount),
            style: Fx.number.copyWith(
              fontWeight: FontWeight.w700,
              color: Fx.text.withOpacity(.95),
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }

  /// Compact Highest / Lowest spend tiles for the current period,
  /// suitable for showing inside the "Your spends" hero card.
  Widget _highestLowestForCurrentPeriodInline() {
    final insights = _buildCategoryInsightsForCurrentRange();

    if (insights.highestCategory == null &&
        insights.lowestCategory == null) {
      return const SizedBox.shrink();
    }

    final tiles = <Widget>[];

    if (insights.highestCategory != null &&
        insights.highestAmount > 0) {
      tiles.add(
        _categoryInsightTile(
          label: 'Highest spend',
          description:
              'You’ve spent highest on ${insights.highestCategory} in this period.',
          amount: insights.highestAmount,
          accentColor: Fx.bad,
        ),
      );
    }

    if (insights.lowestCategory != null &&
        insights.lowestAmount > 0 &&
        insights.lowestCategory != insights.highestCategory) {
      if (tiles.isNotEmpty) {
        tiles.add(const SizedBox(height: 8));
      }
      tiles.add(
        _categoryInsightTile(
          label: 'Lowest spend',
          description:
              'You’ve spent lowest on ${insights.lowestCategory} in this period.',
          amount: insights.lowestAmount,
          accentColor: Fx.good,
        ),
      );
    }

    if (tiles.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: tiles,
    );
  }

  // ---------- Last X months spends card (Axis-style hero) ----------
  Widget _lastMonthsSpendsCard() {
    // Decide how many months to show based on local window (this card only).
    int monthCount;
    String windowLabel;
    switch (_spendWindow) {
      case '6M':
        monthCount = 6;
        windowLabel = 'last 6 months';
        break;
      case '3M':
        monthCount = 3;
        windowLabel = 'last 3 months';
        break;
      case '1Y':
      default:
        monthCount = 12;
        windowLabel = 'last 12 months';
        break;
    }

    final buckets = _buildLastMonthSpends(monthCount: monthCount);
    final labels = _labelsForMonthSpends(buckets);

    final hasData =
        buckets.isNotEmpty && buckets.any((b) => b.totalExpense > 0);

    // Compute insights
    double total = 0;
    _MonthSpend? top;
    for (final b in buckets) {
      total += b.totalExpense;
      if (top == null || b.totalExpense > top!.totalExpense) {
        top = b;
      }
    }
    final avg = monthCount > 0 ? total / monthCount : 0;

    final compact = NumberFormat.compactCurrency(
      locale: 'en_IN',
      symbol: '₹',
      decimalDigits: 0,
    );
    final fullFmt = NumberFormat.currency(
      locale: 'en_IN',
      symbol: '₹',
      decimalDigits: 0,
    );

    String? topMonthLabel;
    String? topAmountLabel;
    if (hasData && top != null && top.totalExpense > 0) {
      topMonthLabel =
          DateFormat('MMMM').format(DateTime(top.year, top.month, 1));
      topAmountLabel = fullFmt.format(top.totalExpense);
    }

    String? topInstrumentLabel;
    if (buckets.isNotEmpty) {
      final latest = buckets.last;
      final start = DateTime(latest.year, latest.month, 1);
      final end = DateTime(latest.year, latest.month + 1, 1);
      final byInstrument = <String, double>{};
      for (final e in _applyBankFiltersToExpenses(_allExp)) {
        if (!e.date.isBefore(start) && e.date.isBefore(end)) {
          final norm = _normInstrument(e.instrument).toUpperCase();
          byInstrument[norm] = (byInstrument[norm] ?? 0) + e.amount;
        }
      }

      String? maxInstrument;
      double maxValue = 0;
      byInstrument.forEach((key, value) {
        if (maxInstrument == null || value > maxValue) {
          maxInstrument = key;
          maxValue = value;
        }
      });

      String labelForInstrument(String key) {
        switch (key) {
          case 'UPI':
            return 'UPI';
          case 'DEBIT CARD':
            return 'Debit Card';
          case 'CREDIT CARD':
            return 'Credit Card';
          case 'NETBANKING':
            return 'NetBanking';
          case 'IMPS':
            return 'IMPS';
          case 'NEFT':
            return 'NEFT';
          case 'RTGS':
            return 'RTGS';
          case 'ATM':
            return 'ATM';
          case 'POS':
            return 'POS';
          default:
            return 'Others';
        }
      }

      if (maxInstrument != null && maxValue > 0) {
        topInstrumentLabel = labelForInstrument(maxInstrument!);
      }
    }

    Widget _chartBody() {
      if (!hasData) {
        return Container(
          height: 160,
          alignment: Alignment.center,
          child: Text(
            'No spends found for $windowLabel.',
            style: Fx.label.copyWith(color: Fx.text.withOpacity(.7)),
          ),
        );
      }

      if (_lastMonthsView == 'Trend') {
        return _monthlyTrendChart(buckets, labels);
      }
      final stacks = _buildMonthlyCategoryStacks(monthCount);
      return _monthlyCategoryStackedChart(stacks, labels);
    }

    return GlassCard(
      radius: Fx.r24,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header: icon + title on first line, chips on second line
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.show_chart_rounded, color: Colors.teal),
                  const SizedBox(width: Fx.s8),
                  Expanded(
                    child: Text(
                      'Your spends – last $monthCount months',
                      style: Fx.title.copyWith(fontSize: 18),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 4,
                children: [
                  for (final w in const ['1Y', '6M', '3M'])
                    ChoiceChip(
                      label: Text(w),
                      selected: _spendWindow == w,
                      onSelected: (_) {
                        if (_spendWindow == w) return;
                        setState(() {
                          _spendWindow = w;
                        });
                      },
                    ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 6,
            children: [
              for (final view in const ['Trend', 'Categories'])
                ChoiceChip(
                  label: Text(view),
                  selected: _lastMonthsView == view,
                  onSelected: (_) {
                    if (_lastMonthsView == view) return;
                    setState(() {
                      _lastMonthsView = view;
                    });
                  },
                ),
            ],
          ),
          const SizedBox(height: 10),
          _chartBody(),
          if (hasData) ...[
            const SizedBox(height: 10),
            Text(
              'Your average monthly spends in the $windowLabel is ${compact.format(avg)}.',
              style: Fx.label.copyWith(
                color: Fx.text.withOpacity(.9),
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            if (topMonthLabel != null && topAmountLabel != null) ...[
              const SizedBox(height: 4),
              Text(
                'You spent most in $topMonthLabel with $topAmountLabel.',
                style: Fx.label.copyWith(
                  color: Fx.text.withOpacity(.9),
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ],
            if (topInstrumentLabel != null) ...[
              const SizedBox(height: 4),
              Text(
                'In the latest month, you spent most via $topInstrumentLabel.',
                style: Fx.label.copyWith(
                  color: Fx.text.withOpacity(.9),
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ],
            const SizedBox(height: 10),
            _highestLowestForCurrentPeriodInline(),
          ],
        ],
      ),
    );
  }

  Widget _monthlyTrendChart(List<_MonthSpend> buckets, List<String> labels) {
    const int yTicks = 4;
    const double leftGutter = 52;
    const double topPadding = 12;
    const double bottomPadding = 32;

    final series = buckets.map((b) => b.totalExpense).toList();
    final scale = _trendAxisScale(series, yTicks);
    final axisValues = List<double>.generate(
      yTicks + 1,
      (i) => (scale.maxY / yTicks) * i,
    ).reversed.toList();

    return SizedBox(
      height: 220,
      child: Stack(
        children: [
          Positioned(
            left: leftGutter,
            right: 0,
            top: 0,
            bottom: bottomPadding,
            child: CustomPaint(
              painter: _MonthlyTrendPainter(
                series: series,
                maxY: scale.maxY,
                yTicks: yTicks,
              ),
            ),
          ),
          Positioned(
            left: 0,
            top: topPadding,
            bottom: bottomPadding,
            width: leftGutter - 8,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                for (final value in axisValues)
                  Text(
                    _formatTrendAxisValue(value, scale.tick),
                    style: Fx.label.copyWith(
                      fontSize: 10,
                      color: Fx.text.withOpacity(.75),
                    ),
                  ),
              ],
            ),
          ),
          Positioned(
            left: leftGutter,
            right: 0,
            bottom: 0,
            height: bottomPadding,
            child: _monthAxisLabels(labels),
          ),
        ],
      ),
    );
  }

  Widget _monthlyCategoryStackedChart(
    List<_MonthlyCategoryStack> stacks,
    List<String> labels,
  ) {
    const int yTicks = 4;
    const double leftGutter = 52;
    const double topPadding = 12;
    const double bottomPadding = 32;

    final totals = stacks
        .map((s) => s.segments.fold<double>(0, (sum, seg) => sum + seg.value))
        .toList();
    final scale = _trendAxisScale(totals, yTicks);
    final axisValues = List<double>.generate(
      yTicks + 1,
      (i) => (scale.maxY / yTicks) * i,
    ).reversed.toList();

    final categoryTotals = <String, double>{};
    for (final stack in stacks) {
      for (final seg in stack.segments) {
        categoryTotals[seg.category] =
            (categoryTotals[seg.category] ?? 0) + seg.value;
      }
    }
    final legendEntries = categoryTotals.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          height: 220,
          child: Stack(
            children: [
              Positioned(
                left: leftGutter,
                right: 0,
                top: 0,
                bottom: bottomPadding,
                child: CustomPaint(
                  painter: _StackedMonthlyBarsPainter(
                    stacks: stacks,
                    maxY: scale.maxY,
                    yTicks: yTicks,
                    categoryColors: _categoryColors,
                  ),
                ),
              ),
              Positioned(
                left: 0,
                top: topPadding,
                bottom: bottomPadding,
                width: leftGutter - 8,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    for (final value in axisValues)
                      Text(
                        _formatTrendAxisValue(value, scale.tick),
                        style: Fx.label.copyWith(
                          fontSize: 10,
                          color: Fx.text.withOpacity(.75),
                        ),
                      ),
                  ],
                ),
              ),
              Positioned(
                left: leftGutter,
                right: 0,
                bottom: 0,
                height: bottomPadding,
                child: _monthAxisLabels(labels),
              ),
            ],
          ),
        ),
        if (legendEntries.isNotEmpty) ...[
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              for (final entry in legendEntries)
                _categoryLegendChip(entry.key),
            ],
          ),
        ],
      ],
    );
  }

  Widget _monthAxisLabels(List<String> labels) {
    return LayoutBuilder(
      builder: (context, constraints) {
        if (labels.isEmpty) return const SizedBox.shrink();
        final double slotWidth = constraints.maxWidth / labels.length;
        return Row(
          children: [
            for (final label in labels)
              SizedBox(
                width: slotWidth,
                child: Text(
                  label.toUpperCase(),
                  textAlign: TextAlign.center,
                  style: Fx.label.copyWith(
                    fontSize: 10,
                    color: Fx.text.withOpacity(.75),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }

  Widget _categoryLegendChip(String category) {
    final color = _categoryColors[category] ?? Colors.grey;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(4),
          ),
        ),
        const SizedBox(width: 6),
        Text(
          category,
          style: Fx.label.copyWith(color: Fx.text.withOpacity(.8)),
        ),
      ],
    );
  }

  Widget _statRow(String label, String value, Color color, IconData icon) {
    return Row(
      children: [
        Icon(icon, size: 16, color: color),
        const SizedBox(width: 6),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: Fx.label),
              Text(value, style: Fx.number.copyWith(color: color)),
            ],
          ),
        ),
      ],
    );
  }

  // ---------- Trend popup (axes/grid using BarChartSimple) ----------
  void _showTrendPopup(
    List<double> series, {
    required String title,
    List<String>? labels,
  }) {
    final safeLabels = (labels != null && labels.length == series.length)
        ? labels
        : List.generate(series.length, (i) => '${i + 1}');
    final total = series.fold<double>(0, (sum, value) => sum + value);
    final peak = series.isEmpty
        ? 0.0
        : series.reduce((a, b) => a > b ? a : b);
    final avg = series.isEmpty ? 0.0 : total / series.length;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (_) => SizedBox(
        height: MediaQuery.of(context).size.height * 0.85,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 16),
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(
                      child: Text(title,
                          style: const TextStyle(
                              fontWeight: FontWeight.bold, fontSize: 18))),
                  IconButton(
                      icon: const Icon(Icons.close),
                      onPressed: () => Navigator.pop(context)),
                ],
              ),
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'Daily expense trend',
                  style: Fx.label.copyWith(
                    fontWeight: FontWeight.w600,
                    color: Fx.text.withOpacity(.85),
                  ),
                ),
              ),
              const SizedBox(height: 6),
              Expanded(child: _trendChartWithAxis(series, safeLabels)),
              const SizedBox(height: 16),
              _trendStatsRow(total: total, avg: avg, peak: peak),
              const SizedBox(height: 12),
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'These bars show only expenses for the selected period. '
                  'Income insights live in the Income analytics tab.',
                  style: Fx.label.copyWith(
                    fontSize: 12,
                    color: Fx.text.withOpacity(.65),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _trendStatsRow({
    required double total,
    required double avg,
    required double peak,
  }) {
    final labelStyle = Fx.label.copyWith(color: Fx.text.withOpacity(.65));
    final valueStyle = Fx.number.copyWith(fontWeight: FontWeight.w700);
    final surface = Theme.of(context).colorScheme.surface;
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: surface.withOpacity(.8),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Expanded(
              child: _trendStatTile(
                label: 'Total',
                value: INR.f(total),
                labelStyle: labelStyle,
                valueStyle: valueStyle,
              ),
            ),
            Container(
              width: 1,
              height: 36,
              color: Fx.text.withOpacity(.08),
            ),
            Expanded(
              child: _trendStatTile(
                label: 'Average',
                value: INR.f(avg),
                labelStyle: labelStyle,
                valueStyle: valueStyle,
              ),
            ),
            Container(
              width: 1,
              height: 36,
              color: Fx.text.withOpacity(.08),
            ),
            Expanded(
              child: _trendStatTile(
                label: 'Highest day',
                value: INR.f(peak),
                labelStyle: labelStyle,
                valueStyle: valueStyle,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _trendStatTile({
    required String label,
    required String value,
    required TextStyle labelStyle,
    required TextStyle valueStyle,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: labelStyle),
        const SizedBox(height: 4),
        Text(value, style: valueStyle),
      ],
    );
  }

  Widget _trendChartWithAxis(List<double> series, List<String> labels) {
    const int yTicks = 5;
    const double leftGutter = 52;
    const double topPadding = 12;
    const double bottomPadding = 28;

    final _TrendAxisScale scale = _trendAxisScale(series, yTicks);

    final List<String> effectiveLabels = (labels.length == series.length)
        ? labels
        : List.generate(series.length, (i) => i < labels.length ? labels[i] : '${i + 1}');

    final List<SeriesPoint> points = List.generate(
      series.length,
      (i) => SeriesPoint(effectiveLabels[i], series[i]),
    );

    final axisValues = List<double>.generate(
      yTicks + 1,
      (i) => (scale.maxY / yTicks) * i,
    ).reversed.toList();

    return LayoutBuilder(
      builder: (context, constraints) {
        return Stack(
          children: [
            Positioned(
              left: leftGutter,
              right: 0,
              top: 0,
              bottom: 0,
              child: BarChartSimple(
                data: points,
                showGrid: true,
                yTickCount: yTicks,
                targetXTicks: 7,
                showValues: false,
                maxYOverride: scale.maxY,
                padding: const EdgeInsets.fromLTRB(12, topPadding, 12, bottomPadding),
              ),
            ),
            Positioned(
              left: 0,
              top: topPadding,
              bottom: bottomPadding,
              width: leftGutter - 8,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  for (final value in axisValues)
                    Text(
                      _formatTrendAxisValue(value, scale.tick),
                      style: Fx.label.copyWith(
                        fontSize: 10,
                        color: Fx.text.withOpacity(.75),
                      ),
                    ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }

  static _TrendAxisScale _trendAxisScale(List<double> series, int tickCount) {
    double rawMax = 0;
    for (final value in series) {
      if (value.isFinite && value > rawMax) {
        rawMax = value;
      }
    }

    final double baseMax = rawMax > 0 ? rawMax : 1.0;
    final double tick = _trendNiceNum(baseMax / tickCount, true);
    final double niceMax = _trendNiceNum(tick * tickCount, false);
    return _TrendAxisScale(niceMax, tick);
  }

  static double _trendNiceNum(double range, bool round) {
    final double safeRange = (range.isFinite && range > 0) ? range : 1.0;
    final double exponent = (math.log(safeRange) / math.ln10).floorToDouble();
    final double expv = math.pow(10, exponent).toDouble();
    final double f = safeRange / expv;
    double nf;
    if (round) {
      if (f < 1.5) {
        nf = 1;
      } else if (f < 3) {
        nf = 2;
      } else if (f < 7) {
        nf = 5;
      } else {
        nf = 10;
      }
    } else {
      if (f <= 1) {
        nf = 1;
      } else if (f <= 2) {
        nf = 2;
      } else if (f <= 5) {
        nf = 5;
      } else {
        nf = 10;
      }
    }
    return nf * expv;
  }

  static String _formatTrendAxisValue(double value, double tick) {
    if (tick >= 1) {
      return NumberFormat.compactCurrency(
        locale: 'en_IN',
        symbol: '₹',
        decimalDigits: 0,
      ).format(value);
    }

    final int decimals = tick >= 0.1 ? 1 : 2;
    return NumberFormat.currency(
      locale: 'en_IN',
      symbol: '₹',
      decimalDigits: decimals,
    ).format(value);
  }

  // ---------- Drill-down helpers (reuse UnifiedTransactionList) ----------
  Future<void> _openTxDrilldown({
    required String title,
    required List<ExpenseItem> exp,
    required List<IncomeItem> inc,
  }) async {
    final expenses = List<ExpenseItem>.from(exp)
      ..sort((a, b) => b.date.compareTo(a.date));
    final incomes = List<IncomeItem>.from(inc)
      ..sort((a, b) => b.date.compareTo(a.date));

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        final totalCount = expenses.length + incomes.length;
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 42,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 12),
                  decoration: BoxDecoration(
                    color: Colors.grey.shade300,
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
                Text(
                  title,
                  textAlign: TextAlign.center,
                  style: Theme.of(ctx)
                      .textTheme
                      .titleMedium
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 8),
                Expanded(
                  child: UnifiedTransactionList(
                    expenses: expenses,
                    incomes: incomes,
                    friendsById: const <String, FriendModel>{},
                    userPhone: widget.userPhone,
                    enableScrolling: true,
                    previewCount: math.max(20, totalCount),
                    filterType: 'All',
                    showBillIcon: true,
                    onEdit: (tx) async {
                      final updated = await _editTransaction(ctx, tx);
                      if (updated) {
                        await _bootstrap();
                        if (ctx.mounted) Navigator.pop(ctx);
                      }
                    },
                    onDelete: (tx) async {
                      final deleted = await _deleteTransaction(ctx, tx);
                      if (deleted) {
                        await _bootstrap();
                        if (ctx.mounted) Navigator.pop(ctx);
                      }
                    },
                    emptyBuilder: (context) =>
                        _analyticsNoTransactions('All'),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _openCategorySheet({
    required bool isIncome,
    required String category,
    required List<ExpenseItem> srcExp,
    required List<IncomeItem> srcInc,
  }) {
    final exp = isIncome
        ? <ExpenseItem>[]
        : srcExp
            .where((e) =>
                _normalizeMainCategory(
                  AnalyticsAgg.resolveExpenseCategory(e),
                ).toLowerCase() ==
                category.toLowerCase())
            .toList();

    final inc = isIncome
        ? srcInc
            .where((i) =>
                AnalyticsAgg.resolveIncomeCategory(i).toLowerCase() ==
                category.toLowerCase())
            .toList()
        : <IncomeItem>[];

    _openTxDrilldown(
      title: isIncome ? 'Income • $category' : 'Expense • $category',
      exp: exp,
      inc: inc,
    );
  }

  // ---------- Helpers for sparkline & calendar ----------
  List<String> _sparkLabelsForPeriod(
    Period p,
    List<double> data,
    DateTime now, {
    CustomRange? custom,
  }) {
    if (data.isEmpty) return const [];

    final shortMonth = DateFormat('MMM');
    final shortDay = DateFormat('d MMM');

    switch (p) {
      case Period.day:
        return List<String>.generate(
          data.length,
          (i) => '${i.toString().padLeft(2, '0')}h',
        );
      case Period.week:
        const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        return List<String>.generate(
          data.length,
          (i) => names[i % names.length],
        );
      case Period.month:
        return List<String>.generate(
          data.length,
          (i) => '${i + 1}',
        );
      case Period.lastMonth:
        return List<String>.generate(
          data.length,
          (i) => '${i + 1}',
        );
      case Period.quarter:
        final qStartMonth = ((now.month - 1) ~/ 3) * 3 + 1;
        return List<String>.generate(data.length, (i) {
          final monthDate = DateTime(now.year, qStartMonth + i, 1);
          return shortMonth.format(monthDate);
        });
      case Period.year:
        return List<String>.generate(data.length, (i) {
          final monthDate = DateTime(now.year, i + 1, 1);
          return shortMonth.format(monthDate);
        });
      case Period.last2:
        return [
          shortDay.format(now.subtract(const Duration(days: 1))),
          shortDay.format(now),
        ];
      case Period.last5:
        return List<String>.generate(data.length, (i) {
          final target = now.subtract(Duration(days: data.length - 1 - i));
          return shortDay.format(target);
        });
      case Period.all:
        return List<String>.generate(data.length, (i) {
          final monthDate = DateTime(now.year, i + 1, 1);
          return shortMonth.format(monthDate);
        });
      case Period.custom:
        if (custom == null) {
          return List<String>.generate(data.length, (i) => '${i + 1}');
        }
        return List<String>.generate(data.length, (i) {
          final day = custom.start.add(Duration(days: i));
          return shortDay.format(day);
        });
      default:
        throw UnimplementedError('Unhandled period $p');
    }
  }

  List<double> _sparkForPeriod(Period p, List<ExpenseItem> exp, DateTime now,
      {CustomRange? custom}) {
    switch (p) {
      case Period.day:
        final v = List<double>.filled(24, 0);
        for (final e in exp) v[e.date.hour] += e.amount;
        return v;
      case Period.week:
        final v = List<double>.filled(7, 0);
        for (final e in exp) v[e.date.weekday - 1] += e.amount;
        return v;
      case Period.month:
        final days = DateTime(now.year, now.month + 1, 0).day;
        final v = List<double>.filled(days, 0);
        for (final e in exp) v[e.date.day - 1] += e.amount;
        return v;
      case Period.lastMonth:
        final prevStart = DateTime(now.year, now.month - 1, 1);
        final prevDays = DateTime(prevStart.year, prevStart.month + 1, 0).day;
        final vPrev = List<double>.filled(prevDays, 0);
        for (final e in exp) {
          if (e.date.year == prevStart.year && e.date.month == prevStart.month) {
            vPrev[e.date.day - 1] += e.amount;
          }
        }
        return vPrev;
      case Period.quarter:
        final qStartMonth = ((now.month - 1) ~/ 3) * 3 + 1;
        final buckets = List<double>.filled(3, 0);
        for (final e in exp) {
          final idx = e.date.month - qStartMonth;
          if (idx >= 0 && idx < buckets.length) buckets[idx] += e.amount;
        }
        return buckets;
      case Period.year:
        final v = List<double>.filled(12, 0);
        for (final e in exp) v[e.date.month - 1] += e.amount;
        return v;
      case Period.last2:
        final y = now.subtract(const Duration(days: 1));
        return [
          exp
              .where((e) => _sameDayLocal(e.date, y))
              .fold(0.0, (s, e) => s + e.amount),
          exp
              .where((e) => _sameDayLocal(e.date, now))
              .fold(0.0, (s, e) => s + e.amount),
        ];
      case Period.last5:
        final v = List<double>.filled(5, 0);
        for (int d = 0; d < 5; d++) {
          final target = now.subtract(Duration(days: 4 - d));
          for (final e in exp) {
            if (_sameDayLocal(e.date, target)) v[d] += e.amount;
          }
        }
        return v;
      case Period.all:
        final v = List<double>.filled(12, 0);
        for (final e in exp) v[e.date.month - 1] += e.amount;
        return v;
      case Period.custom:
        if (custom == null) return const [];
        final totalDays = custom.end
                .difference(DateTime(
                    custom.start.year, custom.start.month, custom.start.day))
                .inDays +
            1;
        final n = totalDays.clamp(1, 31);
        final v = List<double>.filled(n, 0);
        for (final e in exp) {
          final d = DateTime(e.date.year, e.date.month, e.date.day)
              .difference(DateTime(custom.start.year, custom.start.month,
                  custom.start.day))
              .inDays;
          if (d >= 0 && d < n) v[d] += e.amount;
        }
        return v;
      default:
        throw UnimplementedError('Unhandled period $p');
    }
  }

  double _projectMonthEnd(
      List<ExpenseItem> exp, List<IncomeItem> inc, DateTime now) {
    final monthStart = DateTime(now.year, now.month, 1);
    final daysElapsed = now.difference(monthStart).inDays + 1;
    final daysInMonth = DateTime(now.year, now.month + 1, 0).day;

    double expToDate = 0, incToDate = 0;
    for (final e in exp) {
      if (!e.date.isBefore(monthStart) && !e.date.isAfter(now)) expToDate += e.amount;
    }
    for (final i in inc) {
      if (!i.date.isBefore(monthStart) && !i.date.isAfter(now)) incToDate += i.amount;
    }
    final netPerDay = (incToDate - expToDate) / (daysElapsed.clamp(1, 31));
    final projected = (incToDate - expToDate) +
        netPerDay * (daysInMonth - daysElapsed);
    return projected;
  }

  bool _sameDayLocal(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  Future<bool> _deleteTransaction(BuildContext ctx, dynamic tx) async {
    try {
      if (tx is ExpenseItem) {
        await _expenseSvc.deleteExpense(
          widget.userPhone,
          tx.id,
          friendPhones: tx.friendIds,
        );
      } else if (tx is IncomeItem) {
        await _incomeSvc.deleteIncome(widget.userPhone, tx.id);
      } else {
        return false;
      }
      return true;
    } catch (err) {
      if (ctx.mounted) {
        ScaffoldMessenger.of(ctx).showSnackBar(
          SnackBar(content: Text('Delete failed: $err')),
        );
      }
      return false;
    }
  }

  Future<bool> _editTransaction(BuildContext ctx, dynamic tx) async {
    try {
      if (tx is ExpenseItem) {
        await Navigator.of(ctx).push(
          MaterialPageRoute(
            builder: (_) => EditExpenseScreen(
              userPhone: widget.userPhone,
              expense: tx,
            ),
          ),
        );
        return true;
      }
      if (tx is IncomeItem) {
        try {
          final result = await Navigator.pushNamed(
            ctx,
            '/edit-income',
            arguments: {'userPhone': widget.userPhone, 'income': tx},
          );
          return result == true;
        } catch (_) {
          if (ctx.mounted) {
            ScaffoldMessenger.of(ctx).showSnackBar(
              const SnackBar(
                content: Text("Edit Income screen not found. Set '/edit-income' route."),
              ),
            );
          }
        }
      }
    } catch (_) {
      if (ctx.mounted) {
        ScaffoldMessenger.of(ctx).showSnackBar(
          const SnackBar(content: Text('Unable to open editor.')),
        );
      }
    }
    return false;
  }

  Future<void> _handleDelete(dynamic tx) async {
    final deleted = await _deleteTransaction(context, tx);
    if (deleted) {
      await _bootstrap();
    }
  }

  Future<void> _handleEdit(dynamic tx) async {
    final edited = await _editTransaction(context, tx);
    if (edited) {
      await _bootstrap();
    }
  }
}

class _MonthlyTrendPainter extends CustomPainter {
  final List<double> series;
  final double maxY;
  final int yTicks;

  _MonthlyTrendPainter({
    required this.series,
    required this.maxY,
    required this.yTicks,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (series.isEmpty || size.width <= 0 || size.height <= 0) return;

    final double safeMaxY = maxY <= 0 ? 1.0 : maxY;
    final double w = size.width;
    final double h = size.height;
    final Paint gridPaint = Paint()
      ..color = Fx.text.withOpacity(.08)
      ..strokeWidth = 1;

    for (int i = 0; i <= yTicks; i++) {
      final double y = h - (h / yTicks) * i;
      canvas.drawLine(Offset(0, y), Offset(w, y), gridPaint);
    }

    final double xStep = series.length > 1 ? w / (series.length - 1) : w;
    final Path path = Path();
    for (int i = 0; i < series.length; i++) {
      final double ratio = (series[i] / safeMaxY).clamp(0.0, 1.0);
      final double x = i * xStep;
      final double y = h - ratio * h;
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }

    final Path fill = Path.from(path)
      ..lineTo(w, h)
      ..lineTo(0, h)
      ..close();

    final Color baseColor = Fx.mint;
    canvas.drawPath(
      fill,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [baseColor.withOpacity(.22), baseColor.withOpacity(.04)],
        ).createShader(Rect.fromLTWH(0, 0, w, h)),
    );

    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.2
        ..color = baseColor
        ..isAntiAlias = true,
    );

    final Paint dotPaint = Paint()
      ..color = baseColor
      ..isAntiAlias = true;
    for (int i = 0; i < series.length; i++) {
      final double ratio = (series[i] / safeMaxY).clamp(0.0, 1.0);
      final double x = i * xStep;
      final double y = h - ratio * h;
      canvas.drawCircle(Offset(x, y), 3.5, dotPaint);
    }
  }

  @override
  bool shouldRepaint(covariant _MonthlyTrendPainter oldDelegate) {
    return oldDelegate.series != series ||
        oldDelegate.maxY != maxY ||
        oldDelegate.yTicks != yTicks;
  }
}

class _StackedMonthlyBarsPainter extends CustomPainter {
  final List<_MonthlyCategoryStack> stacks;
  final double maxY;
  final int yTicks;
  final Map<String, Color> categoryColors;

  _StackedMonthlyBarsPainter({
    required this.stacks,
    required this.maxY,
    required this.yTicks,
    required this.categoryColors,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (stacks.isEmpty || size.width <= 0 || size.height <= 0) return;

    final double safeMaxY = maxY <= 0 ? 1.0 : maxY;
    final double w = size.width;
    final double h = size.height;
    final double columnWidth = w / stacks.length;
    final double barWidth = columnWidth * 0.6;
    final double gutter = (columnWidth - barWidth) / 2;
    final Radius radius = Radius.circular(barWidth * 0.25);

    final Paint gridPaint = Paint()
      ..color = Fx.text.withOpacity(.06)
      ..strokeWidth = 1.2;
    for (int i = 0; i <= yTicks; i++) {
      final double y = h - (h / yTicks) * i;
      canvas.drawLine(Offset(0, y), Offset(w, y), gridPaint);
    }

    for (int i = 0; i < stacks.length; i++) {
      final stack = stacks[i];
      final double total =
          stack.segments.fold<double>(0, (sum, seg) => sum + seg.value);
      if (total <= 0) continue;

      double yOffset = h;
      final double left = columnWidth * i + gutter;

      for (final seg in stack.segments) {
        if (seg.value <= 0) continue;
        final double segHeight = (seg.value / safeMaxY) * h;
        yOffset -= segHeight;
        final Color color = (categoryColors[seg.category] ?? Colors.grey)
            .withOpacity(.92);
        final Rect rect = Rect.fromLTWH(left, yOffset, barWidth, segHeight);
        final RRect rrect = RRect.fromRectAndRadius(rect, radius);

        canvas.drawRRect(
          rrect.inflate(2.5),
          Paint()
            ..color = color.withOpacity(.12)
            ..style = PaintingStyle.fill,
        );

        canvas.drawRRect(
          rrect,
          Paint()
            ..shader = LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [color, color.withOpacity(.7)],
            ).createShader(rect),
        );

        canvas.drawRRect(
          rrect,
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = 1.1
            ..color = color.withOpacity(.9),
        );
      }
    }
  }

  @override
  bool shouldRepaint(covariant _StackedMonthlyBarsPainter oldDelegate) {
    return oldDelegate.stacks != stacks ||
        oldDelegate.maxY != maxY ||
        oldDelegate.yTicks != yTicks ||
        oldDelegate.categoryColors != categoryColors;
  }
}


// ================================================
// Small, dependency-free sparkline for Overview card
// ================================================
class _SparklineSimple extends StatelessWidget {
  final List<double> values; // chronological (left->right)
  const _SparklineSimple({required this.values});

  @override
  Widget build(BuildContext context) {
    return CustomPaint(painter: _SparkPainter(values));
  }
}

class _SparkPainter extends CustomPainter {
  final List<double> v;
  _SparkPainter(this.v);

  @override
  void paint(Canvas c, Size s) {
    if (v.isEmpty) return;
    final maxV = v.reduce((a, b) => a > b ? a : b);
    final minV = 0.0;
    final pad = 6.0;
    final w = s.width - pad * 2;
    final h = s.height - pad * 2;
    if (w <= 0 || h <= 0) return;

    double xStep = v.length > 1 ? w / (v.length - 1) : w;
    final path = Path();
    for (int i = 0; i < v.length; i++) {
      final x = pad + i * xStep;
      final t = (maxV <= minV) ? 0.0 : ((v[i] - minV) / (maxV - minV));
      final y = pad + (1 - t) * h;
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }

    // fill
    final fill = Path.from(path)
      ..lineTo(pad + (v.length - 1) * xStep, s.height - pad)
      ..lineTo(pad, s.height - pad)
      ..close();

    final mint = Fx.mint;
    c.drawPath(
      fill,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [mint.withOpacity(.22), mint.withOpacity(.04)],
        ).createShader(Rect.fromLTWH(0, 0, s.width, s.height)),
    );

    // line
    c.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.2
        ..color = mint.withOpacity(.85)
        ..isAntiAlias = true,
    );
  }

  @override
  bool shouldRepaint(covariant _SparkPainter old) => old.v != v;
}
