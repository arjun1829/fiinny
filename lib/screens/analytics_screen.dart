// ignore_for_file: prefer_final_fields, library_private_types_in_public_api

import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fl_chart/fl_chart.dart';

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
import '../widgets/finance/bank_card_widget.dart';
import '../widgets/finance/add_card_sheet.dart';
import '../services/credit_card_service.dart';
import '../models/credit_card_model.dart';
import '../widgets/dashboard/bank_cards_carousel.dart';
import '../widgets/dashboard/bank_overview_dialog.dart';
import '../services/user_data.dart';

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

enum SpendScope { all, savingsAccounts, creditCards }

class _AnalyticsScreenState extends State<AnalyticsScreen> {
  // ---------- CUSTOM SOFT PILL ----------
  Widget _buildSoftPill({
    required String label,
    required bool isSelected,
    required VoidCallback onTap,
    IconData? icon,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(30),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFF1A1A1A) : Colors.grey[100],
          borderRadius: BorderRadius.circular(30),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(
                icon,
                size: 16,
                color: isSelected ? Colors.white : Colors.grey[700],
              ),
              const SizedBox(width: 8),
            ],
            Text(
              label,
              style: TextStyle(
                color: isSelected ? Colors.white : Colors.grey[700],
                fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                fontSize: 13,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMonthSelector({
    required List<DateTime> months,
    required DateTime selected,
    required ValueChanged<DateTime> onSelect,
  }) {
    final fmt = DateFormat('MMM');
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final m in months)
            Padding(
              padding: const EdgeInsets.only(right: 6),
              child: _buildSoftPill(
                label: fmt.format(m),
                isSelected:
                    m.year == selected.year && m.month == selected.month,
                onTap: () => onSelect(m),
              ),
            ),
        ],
      ),
    );
  }

  final _expenseSvc = ExpenseService();
  final _incomeSvc = IncomeService();
  final _cardSvc = CreditCardService(); // NEW
  List<CreditCardModel> _myCards = []; // NEW
  String? _userName;
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

  SpendScope _scope = SpendScope.all;
  bool _showFriendsOnlyInAll = false;

  int _aggRev = 0;
  final Map<String, Map<String, double>> _aggCache = {};

  // caches
  final Map<String, Map<String, double>> _rollCache = {};
  final Map<String, dynamic> _heavyAggCache = {};
  int _rev = 0;

  static const Map<String, Color> _categoryColors = {
    'Fund Transfers': Color(0xFFAB47BC), // Purple
    'Payments': Color(0xFF29B6F6), // Light Blue
    'Shopping': Color(0xFF6C63FF), // Indigo/Purple
    'Travel': Color(0xFF38A3A5), // Teal
    'Food': Color(0xFFFF6584), // Pinkish Red
    'Entertainment': Color(0xFFFFC045), // Amber
    'Healthcare': Color(0xFF66BB6A), // Green
    'Education': Color(0xFFFFA726), // Orange
    'Investments': Color(0xFF8D6E63), // Brown
    'Others': Color(0xFFBDBDBD), // Grey
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
      _showFriendsOnlyInAll ||
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
    final theme = Theme.of(context);
    return ColoredBox(
      color: theme.colorScheme.primaryContainer,
      child: Center(
        child: Text(
          _bankInitials(bank),
          style: TextStyle(
            fontWeight: FontWeight.w700,
            color: theme.colorScheme.primary,
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
        color: Theme.of(context).cardColor,
        border: Border.all(color: Theme.of(context).dividerColor),
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
    _rollCache.clear();
    _heavyAggCache.clear();
  }

  void _changeScope(SpendScope scope) {
    setState(() {
      _scope = scope;
      _instrumentFilter = 'All';
      _showFriendsOnlyInAll = false;
      if (scope != SpendScope.all) {
        _bankFilter = null;
        _last4Filter = null;
      }
      _invalidateAggCache();
    });
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
                      _buildMonthSelector(
                        months: monthDates,
                        selected: selected,
                        onSelect: (m) {
                          setSheetState(() {
                            selected = m;
                            _selectedCategoryMonth = m;
                            filter = <String>{};
                          });
                        },
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
      child: Align(
        alignment: Alignment.centerLeft,
        child: Container(
          padding: const EdgeInsets.all(4),
          decoration: BoxDecoration(
            color: Colors.grey.withOpacity(0.08),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final token in periods)
                _buildPeriodDockItem(token),
              _buildPeriodDockIcon(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPeriodDockItem(String token) {
     final bool isSelected = _range == null && _periodToken == token;
     final label = token == 'All Time' ? 'All' : token;
     return InkWell(
       onTap: () {
          setState(() {
            _periodToken = token;
            _range = null;
            _custom = null;
            _period = _periodForToken(token);
            _invalidateAggCache();
          });
       },
       borderRadius: BorderRadius.circular(12),
       child: AnimatedContainer(
         duration: const Duration(milliseconds: 200),
         padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
         decoration: BoxDecoration(
           color: isSelected ? Colors.white : Colors.transparent,
           borderRadius: BorderRadius.circular(12),
           boxShadow: isSelected ? [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 4, offset: const Offset(0, 2))] : [],
         ),
         child: Text(
           label,
           style: TextStyle(
             color: isSelected ? Colors.black : Colors.grey[600],
             fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
             fontSize: 13,
           ),
         ),
       ),
     );
  }

  Widget _buildPeriodDockIcon() {
     final bool isSelected = _range != null;
     return InkWell(
       onTap: () async {
          final now = DateTime.now();
          final firstDate = DateTime(now.year - 5);
          final lastDate = DateTime(now.year + 2);

          final picked = await showDateRangePicker(
            context: context,
            firstDate: firstDate,
            lastDate: lastDate,
            initialDateRange: _range,
            builder: (context, child) {
              return Theme(
                data: Theme.of(context).copyWith(
                  colorScheme: const ColorScheme.light(
                    primary: Fx.mintDark,
                    onPrimary: Colors.white,
                    surface: Colors.white,
                    onSurface: Colors.black,
                  ),
                ),
                child: child!,
              );
            },
          );

          if (picked != null) {
            final start = DateTime(
                picked.start.year, picked.start.month, picked.start.day);
            final endInclusive = DateTime(
                picked.end.year, picked.end.month, picked.end.day);
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
       borderRadius: BorderRadius.circular(12),
       child: AnimatedContainer(
         duration: const Duration(milliseconds: 200),
         padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
         decoration: BoxDecoration(
           color: isSelected ? Colors.white : Colors.transparent,
           borderRadius: BorderRadius.circular(12),
           boxShadow: isSelected ? [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 4, offset: const Offset(0, 2))] : [],
         ),
         child: Icon(
           Icons.calendar_today_rounded,
           size: 16,
           color: isSelected ? Colors.black : Colors.grey[600],
         ),
       ),
     );
  }

  Widget _scopeFiltersRow(List<_CardGroup> cardGroups) {
    if (_scope == SpendScope.all) {
      final banks = <String>{
        for (final group in cardGroups) group.bank.toUpperCase(),
      }.toList()
        ..sort();

      return SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            Padding(
              padding: const EdgeInsets.only(right: 6),
              child: _buildSoftPill(
                label: 'All accounts',
                isSelected: _bankFilter == null && !_showFriendsOnlyInAll,
                onTap: () {
                  setState(() {
                    _bankFilter = null;
                    _last4Filter = null;
                    _showFriendsOnlyInAll = false;
                    _invalidateAggCache();
                  });
                },
              ),
            ),
            for (final bank in banks)
              Padding(
                padding: const EdgeInsets.only(right: 6),
                child: _buildSoftPill(
                  label: _formatBankLabel(bank),
                  isSelected: _bankFilter == bank.toUpperCase(),
                  onTap: () {
                    setState(() {
                      _bankFilter = bank.toUpperCase();
                      _last4Filter = null;
                      _showFriendsOnlyInAll = false;
                      _invalidateAggCache();
                    });
                  },
                ),
              ),
            Padding(
              padding: const EdgeInsets.only(right: 6),
              child: _buildSoftPill(
                label: 'Friends',
                isSelected: _showFriendsOnlyInAll,
                onTap: () {
                  setState(() {
                    _showFriendsOnlyInAll = true;
                    _bankFilter = null;
                    _last4Filter = null;
                    _invalidateAggCache();
                  });
                },
              ),
            ),
          ],
        ),
      );
    }

    const options = <String>['All', 'UPI', 'Debitcard', 'Others'];

    return Row(
      children: [
        Expanded(
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final opt in options)
                  Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: _buildSoftPill(
                      label: opt,
                      isSelected: _instrumentFilter == opt,
                      onTap: () {
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
        ),
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
    );
  }

  List<ExpenseItem> _applyBankFiltersToExpenses(List<ExpenseItem> list) {
    return list.where((e) {
      final normInstrument = _normInstrument(e.instrument).toUpperCase();
      final bool isCreditCard = normInstrument == 'CREDIT CARD';
      final bool hasFriends = e.friendIds.isNotEmpty;

      if (_scope == SpendScope.savingsAccounts && isCreditCard) return false;
      if (_scope == SpendScope.creditCards && !isCreditCard) return false;
      if (_scope == SpendScope.all && _showFriendsOnlyInAll && !hasFriends) {
        return false;
      }

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
      case 'Debitcard':
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

      if (_selectedCategoryMonth == null) {
        _selectedCategoryMonth = DateTime(now.year, now.month, 1);
      }
      final userDoc = await FirebaseFirestore.instance.collection('users').doc(widget.userPhone).get();
      if (mounted) {
        setState(() {
             _userName = userDoc.data()?['name'];
        });
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

  String _activePeriodLabel(DateTimeRange range) {
    switch (_periodToken) {
      case 'D':
        return 'Today';
      case 'W':
        return 'This week';
      case 'M':
        return 'This month';
      case 'Y':
        return 'This year';
      case 'All Time':
        return 'All time';
      default:
        break;
    }

    final start = DateFormat('d MMM').format(range.start);
    final end = DateFormat('d MMM')
        .format(range.end.subtract(const Duration(days: 1)));
    return '$start - $end';
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
        ? _cardGroupsForPeriod(exp, inc, activeRange)
        : const <_CardGroup>[];

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
        title: Text(
          'Analytics',
          style: Fx.title.copyWith(fontSize: 20, fontWeight: FontWeight.bold, color: Colors.blueGrey[900]),
        ),
        centerTitle: false,
        elevation: 0,
        backgroundColor: Colors.transparent,
        foregroundColor: Colors.blueGrey[900],
        actions: [
          IconButton(
            tooltip: 'Filters',
            onPressed: _openFiltersScreen,
            icon: Stack(
              clipBehavior: Clip.none,
              children: [
                Icon(Icons.filter_list_rounded, color: Colors.blueGrey[800]),
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
                      BankCardsCarousel(
                        expenses: _allExp,
                        incomes: _allInc,
                        userName: _userName ?? 'User',
                        onAddCard: () {
                          // TODO: Implement add card
                          ScaffoldMessenger.of(context).showSnackBar(
                             const SnackBar(content: Text("Add Card feature coming soon!")),
                           );
                        },
                        onCardSelected: (slug) {
                           final bankName = slug.toUpperCase();
                           showDialog(
                             context: context,
                             builder: (_) => BankOverviewDialog(
                               bankSlug: slug,
                               bankName: bankName,
                               allExpenses: _allExp,
                               allIncomes: _allInc,
                               userPhone: widget.userPhone,
                               userName: _userName ?? 'User',
                             ),
                           );
                        },
                      ),
                      const SizedBox(height: 24),
                      Text(
                        'Your Spends',
                        style: Fx.title.copyWith(
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 6,
                        children: [
                          _buildSoftPill(
                            label: 'All',
                            isSelected: _scope == SpendScope.all,
                            onTap: () => _changeScope(SpendScope.all),
                          ),
                          _buildSoftPill(
                            label: 'Savings accounts',
                            isSelected: _scope == SpendScope.savingsAccounts,
                            onTap: () => _changeScope(SpendScope.savingsAccounts),
                          ),
                          _buildSoftPill(
                            label: 'Credit cards',
                            isSelected: _scope == SpendScope.creditCards,
                            onTap: () => _changeScope(SpendScope.creditCards),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
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
                      _scopeFiltersRow(cardGroups),

                      const SizedBox(height: 12),

                      // NEW: Last X months spends card (Axis-style)
                      _lastMonthsSpendsCard(),

                      // Small banner ad
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
                                return _buildSoftPill(
                                  label: f,
                                  isSelected: sel,
                                  onTap: () => setState(() => _txnFilter = f),
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
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                Color(0xFFE0F2F1), // Teal 50
                Color(0xFFF0FDF4), // Mint 50
                Colors.white,
                Colors.white,
              ],
              stops: [0.0, 0.3, 0.6, 1.0],
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

  // ---------- Monthly "Spends by Category" card ----------
  Widget _monthlyCategoryListCard() {
    final buckets = _buildLastMonthSpends(monthCount: 12);

    if (buckets.isEmpty) {
      // No history at all; show a soft empty card instead of nothing.
      return GlassCard(
        radius: Fx.r24,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildMyCardsSection(), // NEW
            const SizedBox(height: 16),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                'We’ll show your spends by category here once transactions are available.',
                style: Fx.label.copyWith(color: Fx.text.withOpacity(.7)),
              ),
            ),
          ],
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
          _buildMonthSelector(
            months: monthDates,
            selected: selected,
            onSelect: (m) {
              setState(() {
                _selectedCategoryMonth = m;
              });
            },
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
                    color: _categoryColors[cat] ?? Fx.mintDark,
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

  // ---------- Last X months spends card (Axis-style) ----------
  Widget _lastMonthsSpendsCard() {
    // 1) Gather data for last 12 months
    final buckets = _buildLastMonthSpends(monthCount: 12);
    if (buckets.isEmpty) return const SizedBox.shrink();

    // Calculate average
    final totalAll = buckets.fold<double>(0, (sum, b) => sum + b.totalExpense);
    final avg = buckets.isEmpty ? 0.0 : totalAll / buckets.length;

    // Current month spend
    final currentSpend = buckets.last.totalExpense;

    // Comparison text
    String comparisonText;
    if (avg == 0) {
      comparisonText = 'No previous data to compare.';
    } else {
      final diff = currentSpend - avg;
      final pct = (diff / avg * 100).abs().toStringAsFixed(0);
      if (diff > 0) {
        comparisonText = '$pct% more than your monthly average.';
      } else if (diff < 0) {
        comparisonText = '$pct% less than your monthly average.';
      } else {
        comparisonText = 'Same as your monthly average.';
      }
    }

    // Prepare chart data
    // We'll show bar chart or line chart based on _lastMonthsView
    // For simplicity, let's implement a nice Bar Chart using fl_chart or custom painter.
    // Reusing BarChartSimple if possible, or building a custom one.
    // Let's use a custom small bar chart for "Trend".

    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.65), // Stronger opacity for contrast against new background
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Colors.white.withOpacity(0.8), width: 1.5),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF004D40).withOpacity(0.08), // Teal shadow
            blurRadius: 24,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Last 12 months',
                      style: Fx.label.copyWith(
                        color: Fx.text.withOpacity(0.6),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      INR.f(currentSpend),
                      style: Fx.title.copyWith(fontSize: 24),
                    ),
                  ],
                ),
              ),
              // View selector (Trend / Stacked)
              Container(
                decoration: BoxDecoration(
                  color: Colors.grey.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(20),
                ),
                padding: const EdgeInsets.all(4),
                child: Row(
                  children: [
                    _chartViewBtn('Trend', Icons.bar_chart_rounded),
                    _chartViewBtn('Breakdown', Icons.pie_chart_rounded),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            comparisonText,
            style: Fx.label.copyWith(color: Fx.text.withOpacity(0.7)),
          ),
          const SizedBox(height: 24),

          // Chart Area
          SizedBox(
            height: 220,
            child: _lastMonthsView == 'Trend'
                ? _buildTrendChart(buckets, avg)
                : _buildStackedChart(),
          ),
          if (_lastMonthsView == 'Breakdown') ...[
            const SizedBox(height: 16),
            _buildBreakdownLegend(buckets),
          ],
        ],
      ),
    );
  }

  Widget _chartViewBtn(String label, IconData icon) {
    final selected = _lastMonthsView == label;
    return InkWell(
      onTap: () => setState(() => _lastMonthsView = label),
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: selected ? Colors.white : Colors.transparent,
          borderRadius: BorderRadius.circular(16),
          boxShadow: selected
              ? [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.05),
                    blurRadius: 4,
                    offset: const Offset(0, 2),
                  )
                ]
              : [],
        ),
        child: Row(
          children: [
            Icon(
              icon,
              size: 16,
              color: selected ? Colors.black : Colors.black54,
            ),
            const SizedBox(width: 4),
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
                color: selected ? Colors.black : Colors.black54,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTrendChart(List<_MonthSpend> buckets, double avg) {
    if (buckets.isEmpty) return const SizedBox.shrink();

    double maxY = avg;
    for (final b in buckets) {
      if (b.totalExpense > maxY) maxY = b.totalExpense;
    }
    if (maxY == 0) maxY = 100;
    maxY = maxY * 1.25; // Add headroom

    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.0, end: 1.0),
      duration: const Duration(milliseconds: 1000),
      curve: Curves.easeOutQuart,
      builder: (context, anim, child) {
        final double minX = -0.5;
        final double maxX = buckets.length - 0.5;
        
        return Stack(
          children: [
            BarChart(
              BarChartData(
                minY: 0,
                maxY: maxY,
                barTouchData: BarTouchData(
                  touchTooltipData: BarTouchTooltipData(
                    tooltipBgColor: Colors.black87,
                    getTooltipItem: (group, groupIndex, rod, rodIndex) {
                       return BarTooltipItem(
                         INR.f(rod.toY),
                         const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12),
                       );
                    }
                  ),
                ),
                titlesData: FlTitlesData(
                  show: true,
                  bottomTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      reservedSize: 24,
                      interval: 1, // Ensure one title per integer index
                      getTitlesWidget: (val, meta) {
                        final index = val.toInt();
                        if (index < 0 || index >= buckets.length) {
                          return const SizedBox.shrink();
                        }
                        if (val != index.toDouble()) return const SizedBox.shrink();

                        final b = buckets[index];
                        return Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Text(
                            DateFormat('MMM').format(DateTime(b.year, b.month)),
                            style: TextStyle(
                              fontSize: 10, 
                              color: Colors.grey[600],
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                  leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                  topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                  rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                ),
                gridData: const FlGridData(show: false),
                borderData: FlBorderData(show: false),
                barGroups: [
                  for (int i = 0; i < buckets.length; i++)
                    BarChartGroupData(
                      x: i,
                      barRods: [
                        BarChartRodData(
                          toY: buckets[i].totalExpense * anim,
                          color: i == buckets.length - 1
                              ? const Color(0xFF004D40)
                              : Colors.grey[300],
                          width: 12,
                          borderRadius: BorderRadius.circular(4),
                          backDrawRodData: BackgroundBarChartRodData(
                             show: true,
                             toY: maxY,
                             color: Colors.grey.withOpacity(0.05),
                          )
                        ),
                      ],
                    ),
                ],
              ),
            ),
            IgnorePointer(
              child: LineChart(
                LineChartData(
                  minY: 0,
                  maxY: maxY,
                  minX: minX,
                  maxX: maxX,
                  lineTouchData: const LineTouchData(enabled: false),
                  titlesData: const FlTitlesData(show: false),
                  gridData: const FlGridData(show: false),
                  borderData: FlBorderData(show: false),
                  lineBarsData: [
                    LineChartBarData(
                      spots: [
                        for (int i = 0; i < buckets.length; i++)
                          FlSpot(i.toDouble(), buckets[i].totalExpense * anim),
                      ],
                      isCurved: true,
                      curveSmoothness: 0.25, // Gentle curve
                      color: const Color(0xFF004D40),
                      barWidth: 2,
                      isStrokeCapRound: true,
                      dotData: const FlDotData(show: false),
                      belowBarData: BarAreaData(
                        show: true,
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [
                            const Color(0xFF004D40).withOpacity(0.15 * anim),
                            const Color(0xFF004D40).withOpacity(0.0),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildBreakdownLegend(List<_MonthSpend> buckets) {
     // Identify all categories present in the current view (last 6 months stacks essentially)
     final stacks = _buildMonthlyCategoryStacks(12);
     final categories = <String>{};
     for (final s in stacks) {
        for (final seg in s.segments) {
           if (seg.value > 0) categories.add(seg.category);
        }
     }
     final list = categories.toList()..sort();

     return Wrap(
        spacing: 8,
        runSpacing: 8,
        alignment: WrapAlignment.center,
        children: list.map((cat) {
           return Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                 Container(
                    width: 8, height: 8,
                    decoration: BoxDecoration(
                       color: _categoryColors[cat] ?? Colors.grey,
                       shape: BoxShape.circle,
                    ),
                 ),
                 const SizedBox(width: 4),
                 Text(
                    cat, 
                    style: TextStyle(
                       fontSize: 11, 
                       color: Colors.grey[700],
                       fontWeight: FontWeight.w500
                    )
                 ),
              ],
           );
        }).toList(),
     );
  }

  Widget _buildStackedChart() {
    // Show breakdown of top categories per month
    final stacks = _buildMonthlyCategoryStacks(6); // last 6 months only for space
    if (stacks.isEmpty) return const SizedBox.shrink();

    // Normalize to 100%? Or absolute?
    // Let's do absolute stacked bars.
    double maxY = 0;
    for (final s in stacks) {
      final total = s.segments.fold<double>(0, (sum, seg) => sum + seg.value);
      if (total > maxY) maxY = total;
    }
    if (maxY == 0) maxY = 100;

    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        final barWidth = (width / (stacks.length * 2)).clamp(12.0, 32.0);

        return Row(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            for (final stack in stacks)
              _singleStackedBar(stack, maxY, barWidth),
          ],
        );
      },
    );
  }

  Widget _singleStackedBar(
    _MonthlyCategoryStack stack,
    double maxY,
    double width,
  ) {
    final label = DateFormat('MMM').format(DateTime(stack.year, stack.month));
    final total = stack.segments.fold<double>(0, (sum, seg) => sum + seg.value);
    final hFactor = (total / maxY).clamp(0.0, 1.0);
    final totalH = 140 * hFactor;

    return Column(
      mainAxisAlignment: MainAxisAlignment.end,
      children: [
        SizedBox(
          height: 140,
          width: width,
          child: Stack(
            alignment: Alignment.bottomCenter,
            children: [
              // Background track
              Container(
                width: width,
                height: 140,
                decoration: BoxDecoration(
                  color: Colors.grey.withOpacity(0.05),
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
              // Segments
              _buildStackedSegments(stack.segments, totalH, width),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Text(
          label,
          style: const TextStyle(fontSize: 10, color: Colors.black54),
        ),
      ],
    );
  }

  Widget _buildStackedSegments(
    List<_CategoryStackSegment> segments,
    double totalHeight,
    double width,
  ) {
    if (totalHeight <= 0) return const SizedBox.shrink();
    final totalVal = segments.fold<double>(0, (sum, s) => sum + s.value);
    if (totalVal <= 0) return const SizedBox.shrink();

    final children = <Widget>[];
    for (final seg in segments) {
      final pct = seg.value / totalVal;
      final h = totalHeight * pct;
      final color = _categoryColors[seg.category] ?? Colors.grey;

      children.add(
        Container(
          width: width,
          height: h,
          color: color,
        ),
      );
    }

    // Reverse so largest/first is at bottom? Or top?
    // Usually stacks build up.
    // If we use Column(mainAxisAlignment: end), the first child is at top.
    // We want the first segment at the bottom.
    // So we should reverse the list if we use Column.
    // Or just use Flex.

    return ClipRRect(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.end,
        children: children.reversed.toList(),
      ),
    );
  }

  Future<void> _openTxDrilldown({
    required String title,
    required List<ExpenseItem> exp,
    required List<IncomeItem> inc,
  }) async {
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => Scaffold(
          appBar: AppBar(
            title: Text(title),
            elevation: 0,
            backgroundColor: Colors.white,
            foregroundColor: Colors.black,
          ),
          body: UnifiedTransactionList(
            expenses: exp,
            incomes: inc,
            friendsById: const {},
            userPhone: widget.userPhone,
            onEdit: _handleEdit,
            onDelete: _handleDelete,
            enableScrolling: true,
          ),
        ),
      ),
    );
  }

  Future<void> _handleDelete(dynamic item) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Transaction?'),
        content: const Text('This action cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );

    if (confirm == true) {
      setState(() => _loading = true);
      try {
        if (item is ExpenseItem) {
          await _expenseSvc.deleteExpense(widget.userPhone, item.id);
        } else if (item is IncomeItem) {
          await _incomeSvc.deleteIncome(widget.userPhone, item.id);
        }
        await _bootstrap();
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Error deleting: $e')),
          );
        }
      } finally {
        if (mounted) setState(() => _loading = false);
      }
    }
  }

  Future<void> _handleEdit(dynamic tx) async {
    // EditExpenseScreen only handles ExpenseItem, not IncomeItem
    if (tx is! ExpenseItem) return;

    final edited = await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => EditExpenseScreen(
          expense: tx,
          userPhone: widget.userPhone,
        ),
      ),
    );

    if (edited == true) {
      await _bootstrap();
    }
  }
  Widget _buildMyCardsSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'My Cards',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
              ),
              IconButton(
                icon: const Icon(Icons.add_circle_outline),
                onPressed: () async {
                   final added = await showModalBottomSheet<bool>(
                    context: context,
                    isScrollControlled: true,
                    useSafeArea: true,
                    backgroundColor: Colors.transparent,
                    builder: (_) => AddCardSheet(userId: widget.userPhone),
                  );
                  if (added == true) {
                     final cards = await _cardSvc.getUserCards(widget.userPhone);
                     if (mounted) setState(() => _myCards = cards);
                  }
                },
              )
            ],
          ),
        ),
        SizedBox(
          height: 220,
          child: _myCards.isEmpty
              ? Center(
                  child: TextButton.icon(
                    icon: const Icon(Icons.add),
                    label: const Text('Add your first card'),
                    onPressed: () async {
                       final added = await showModalBottomSheet<bool>(
                        context: context,
                        isScrollControlled: true,
                        useSafeArea: true,
                        backgroundColor: Colors.transparent,
                        builder: (_) => AddCardSheet(userId: widget.userPhone),
                      );
                      if (added == true) {
                         final cards = await _cardSvc.getUserCards(widget.userPhone);
                         if (mounted) setState(() => _myCards = cards);
                      }
                    },
                  ),
                )
              : ListView.builder(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  itemCount: _myCards.length,
                  itemBuilder: (ctx, i) {
                    return BankCardWidget(
                      card: _myCards[i],
                      onTap: () {
                         // Optional: show details
                      },
                    );
                  },
                ),
        ),
      ],
    );
  }
}

