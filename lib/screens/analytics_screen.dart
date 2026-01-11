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
import 'expenses_screen.dart' show ExpenseFilterConfig, ExpenseFiltersScreen;
import '../widgets/finance/bank_card_widget.dart';
import '../widgets/finance/add_card_sheet.dart';
import '../services/credit_card_service.dart';
import '../models/credit_card_model.dart';
import '../widgets/dashboard/bank_cards_carousel.dart';
import '../widgets/dashboard/bank_overview_dialog.dart';
import '../services/user_data.dart';

class _ChartBucket {
  final DateTime date; // Start of the bucket period
  final String label; // Display label (e.g. "4 AM", "Mon", "Jan")
  final double total; // Total spend in this bucket
  final Map<String, double> categoryBreakdown; // Stacked breakdown

  const _ChartBucket({
    required this.date,
    required this.label,
    required this.total,
    required this.categoryBreakdown,
  });
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
  final parts = bank.split(' ').where((part) => part.isNotEmpty).map((part) {
    final first = part.substring(0, 1).toUpperCase();
    final rest = part.length > 1 ? part.substring(1).toLowerCase() : '';
    return first + rest;
  }).toList();
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
  String? _bankFilter; // normalized uppercase bank name
  String? _last4Filter; // last 4 digits for specific account

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

  Future<void> _handleEdit(dynamic item) async {
    // Only support editing expenses for now as EditExpenseScreen is specific
    if (item is! ExpenseItem) return;

    final result = await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => EditExpenseScreen(
          userPhone: widget.userPhone,
          expense: item,
        ),
      ),
    );

    if (result == true) {
      await _bootstrap();
    }
  }

  Future<void> _handleDelete(dynamic item) async {
    if (item is ExpenseItem) {
      await _expenseSvc.deleteExpense(widget.userPhone, item.id);
    } else if (item is IncomeItem) {
      await _incomeSvc.deleteIncome(widget.userPhone, item.id);
    }
    await _bootstrap();
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
        final start = DateTime(now.year, now.month, now.day)
            .subtract(Duration(days: now.weekday - 1));
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
        return (
          start: DateTime(now.year, 1, 1),
          end: DateTime(now.year, 12, 31)
        );
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
        _period = config.customRange != null
            ? Period.custom
            : _periodForToken(_periodToken);
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
        _selectedBanks = {for (final b in config.banks) b.trim().toUpperCase()}
          ..removeWhere((b) => b.isEmpty);
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

  bool _includeSalaryOverflow = false;

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
        return DateTimeRange(
            start: monday, end: monday.add(const Duration(days: 7)));
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
        final effectiveStart = _includeSalaryOverflow
            ? start.subtract(const Duration(days: 3))
            : start;
        return DateTimeRange(
            start: effectiveStart, end: DateTime(now.year, now.month + 1, 1));
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

  Map<String, double> _categoryTotalsForMonth(DateTime month) {
    final start = DateTime(month.year, month.month, 1);
    final end = DateTime(month.year, month.month + 1, 1);
    final range = DateTimeRange(start: start, end: end);

    final out = <String, double>{};
    for (final e in _applyBankFiltersToExpenses(_allExp)) {
      if (!_inRange(e.date, range)) continue;
      final legacy = AnalyticsAgg.resolveExpenseCategory(e);
      final cat = _normalizeMainCategory(legacy);
      out[cat] = (out[cat] ?? 0) + e.amount;
    }
    return out;
  }

  List<_SubcategoryBucket> _subcategoryBucketsForMonthAndCategory(
      DateTime month, String category) {
    final start = DateTime(month.year, month.month, 1);
    final end = DateTime(month.year, month.month + 1, 1);
    final range = DateTimeRange(start: start, end: end);

    final expenses = _applyBankFiltersToExpenses(_allExp).where((e) {
      if (!_inRange(e.date, range)) return false;
      final legacy = AnalyticsAgg.resolveExpenseCategory(e);
      final cat = _normalizeMainCategory(legacy);
      return cat == category;
    });

    final map = <String, _SubcategoryBucket>{};

    for (final e in expenses) {
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

    return map.values.toList();
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
      _openTxDrilldown(
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
      _openTxDrilldown(
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
      for (final b in buckets) DateTime(b.date.year, b.date.month, 1),
    ];

    DateTime selected = DateTime(month.year, month.month, 1);
    if (!monthDates
        .any((m) => m.year == selected.year && m.month == selected.month)) {
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

            int _cmp(String a, String b) =>
                a.toLowerCase().compareTo(b.toLowerCase());

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
                          onTap: () => Navigator.pop(
                              context, _SubcategorySort.alphaDesc),
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
              final temp = filter.isEmpty
                  ? Set<String>.from(allSubs)
                  : Set<String>.from(filter);
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
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceBetween,
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
                              height:
                                  math.min(360, allSubs.length * 56).toDouble(),
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
                                    if (temp.length == allSubs.length ||
                                        temp.isEmpty) {
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
                        style:
                            Fx.label.copyWith(color: Fx.text.withOpacity(.75)),
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
                                  style: Fx.label
                                      .copyWith(color: Fx.text.withOpacity(.7)),
                                ),
                              )
                            : ListView.separated(
                                itemBuilder: (_, index) {
                                  final bucket = visible[index];
                                  final start = DateTime(
                                      selected.year, selected.month, 1);
                                  final end = DateTime(
                                      selected.year, selected.month + 1, 1);
                                  final range =
                                      DateTimeRange(start: start, end: end);

                                  return ListTile(
                                    contentPadding: EdgeInsets.zero,
                                    title: Text(
                                      bucket.name,
                                      style: Fx.label.copyWith(
                                          fontWeight: FontWeight.w600),
                                    ),
                                    subtitle: Text(
                                      '${bucket.txCount} tx',
                                      style: Fx.label.copyWith(
                                          color: Fx.text.withOpacity(.7)),
                                    ),
                                    trailing: Text(
                                      INR.f(bucket.amount),
                                      style: Fx.number.copyWith(
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                    onTap: () {
                                      final matches =
                                          _applyBankFiltersToExpenses(
                                        _allExp,
                                      ).where((e) {
                                        return !e.date.isBefore(start) &&
                                            e.date.isBefore(end) &&
                                            _normalizeMainCategory(
                                                  AnalyticsAgg
                                                      .resolveExpenseCategory(
                                                          e),
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
                                separatorBuilder: (_, __) =>
                                    const Divider(height: 1),
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
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (final token in periods) _buildPeriodDockItem(token),
                _buildPeriodDockIcon(),
                if (_periodToken == 'M') _buildSalaryOverflowCheckbox(),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildSalaryOverflowCheckbox() {
    return InkWell(
      onTap: () {
        setState(() {
          _includeSalaryOverflow = !_includeSalaryOverflow;
          _invalidateAggCache();
        });
      },
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.only(left: 12, right: 8, top: 8, bottom: 8),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              _includeSalaryOverflow
                  ? Icons.check_box_rounded
                  : Icons.check_box_outline_blank_rounded,
              size: 18,
              color: _includeSalaryOverflow
                  ? (Colors.teal[800] ?? Colors.teal)
                  : Colors.grey,
            ),
            const SizedBox(width: 4),
            Text(
              'Include last 3 days',
              style: TextStyle(
                fontSize: 12,
                fontWeight: _includeSalaryOverflow
                    ? FontWeight.w600
                    : FontWeight.normal,
                color: _includeSalaryOverflow
                    ? (Colors.teal[800] ?? Colors.teal)
                    : Colors.grey[700],
              ),
            ),
          ],
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
          boxShadow: isSelected
              ? [
                  BoxShadow(
                      color: Colors.black.withOpacity(0.05),
                      blurRadius: 4,
                      offset: const Offset(0, 2))
                ]
              : [],
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
          final start =
              DateTime(picked.start.year, picked.start.month, picked.start.day);
          final endInclusive =
              DateTime(picked.end.year, picked.end.month, picked.end.day);
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
          boxShadow: isSelected
              ? [
                  BoxShadow(
                      color: Colors.black.withOpacity(0.05),
                      blurRadius: 4,
                      offset: const Offset(0, 2))
                ]
              : [],
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
  List<_ChartBucket> _buildLastMonthSpends({int monthCount = 12}) {
    if (monthCount <= 0) return <_ChartBucket>[];

    final now = DateTime.now();
    // Apply only bank/card filters here; we want full history by month,
    // not limited by the current _range.
    final baseExp = _applyBankFiltersToExpenses(_allExp);

    final List<_ChartBucket> out = <_ChartBucket>[];
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

      out.add(_ChartBucket(
        date: monthDate,
        label: DateFormat('MMM').format(monthDate),
        total: total,
        categoryBreakdown: const {},
      ));
    }

    return out;
  }

  /// Convenience labels for month buckets, e.g. ["Dec", "Jan", "Feb", ...].
  List<String> _labelsForMonthSpends(List<_ChartBucket> buckets) {
    final fmt = DateFormat('MMM');
    return buckets.map((b) => fmt.format(b.date)).toList();
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

      stacks.add(
          _MonthlyCategoryStack(monthDate.year, monthDate.month, segments));
    }

    return stacks;
  }

  List<_ChartBucket> _buildLastDaysSpends({int dayCount = 14}) {
    final now = DateTime.now();
    final baseExp = _applyBankFiltersToExpenses(_allExp);
    final out = <_ChartBucket>[];

    for (int i = dayCount - 1; i >= 0; i--) {
      final d = now.subtract(Duration(days: i));
      final date = DateTime(d.year, d.month, d.day);
      final start = date;
      final end = date.add(const Duration(days: 1));

      double total = 0;
      for (final e in baseExp) {
        if (!e.date.isBefore(start) && e.date.isBefore(end)) total += e.amount;
      }
      out.add(_ChartBucket(
        date: date,
        label: i == 0
            ? 'Today'
            : (i == 1 ? 'Yesterday' : DateFormat('d MMM').format(date)),
        total: total,
        categoryBreakdown: const {},
      ));
    }
    return out;
  }

  List<_ChartBucket> _buildLastWeeksSpends({int weekCount = 12}) {
    final now = DateTime.now();
    final baseExp = _applyBankFiltersToExpenses(_allExp);
    final out = <_ChartBucket>[];

    // Find start of current week (Monday)
    final currentMonday = DateTime(now.year, now.month, now.day)
        .subtract(Duration(days: now.weekday - 1));

    for (int i = weekCount - 1; i >= 0; i--) {
      final start = currentMonday.subtract(Duration(days: i * 7));
      final end = start.add(const Duration(days: 7));

      double total = 0;
      for (final e in baseExp) {
        if (!e.date.isBefore(start) && e.date.isBefore(end)) total += e.amount;
      }
      out.add(_ChartBucket(
        date: start, // Key is start of week
        label: DateFormat('d MMM').format(start),
        total: total,
        categoryBreakdown: const {},
      ));
    }
    return out;
  }

  List<_ChartBucket> _buildLastYearsSpends({int yearCount = 5}) {
    final now = DateTime.now();
    final baseExp = _applyBankFiltersToExpenses(_allExp);
    final out = <_ChartBucket>[];

    for (int i = yearCount - 1; i >= 0; i--) {
      final year = now.year - i;
      final start = DateTime(year, 1, 1);
      final end = DateTime(year + 1, 1, 1);

      double total = 0;
      for (final e in baseExp) {
        if (!e.date.isBefore(start) && e.date.isBefore(end)) total += e.amount;
      }
      out.add(_ChartBucket(
        date: start,
        label: year.toString(),
        total: total,
        categoryBreakdown: const {},
      ));
    }
    return out;
  }

  List<_ChartBucket> _buildAllTimeBucket() {
    final baseExp = _applyBankFiltersToExpenses(_allExp);
    double total = baseExp.fold(0, (sum, e) => sum + e.amount);

    // Minimal date found or 2000
    DateTime minDate = DateTime(2000);
    if (baseExp.isNotEmpty) {
      var d = baseExp.first.date;
      for (final e in baseExp) if (e.date.isBefore(d)) d = e.date;
      minDate = DateTime(d.year, d.month, 1); // just a reference
    }

    return [
      _ChartBucket(
        date: minDate,
        label: 'All Time',
        total: total,
        categoryBreakdown: const {},
      )
    ];
  }

  List<_ChartBucket> _buildAdaptiveBuckets() {
    switch (_periodToken) {
      case 'D':
        return _buildLastDaysSpends();
      case 'W':
        return _buildLastWeeksSpends();
      case 'Y':
        return _buildLastYearsSpends();
      case 'All Time':
        return _buildAllTimeBucket();
      case 'M':
      default:
        return _buildLastMonthSpends();
    }
  }

  Map<String, double> _categoryTotalsForRange(DateTime start, DateTime end) {
    final key =
        'expByCatRange-${start.millisecondsSinceEpoch}-${end.millisecondsSinceEpoch}-$_bankFilter-$_instrumentFilter-v$_rev';
    return _memo(key, () {
      final base = _applyBankFiltersToExpenses(_allExp);
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

  List<_SubcategoryBucket> _subcategoryBucketsForRangeAndCategory(
    DateTime start,
    DateTime end,
    String category,
  ) {
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
      final key =
          '${rawBank.toUpperCase()}|$labelInstrument|${l4 ?? ''}|${normalizedNetwork.toUpperCase()}';
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
      _allExp = _allExp.where((e) => !e.date.isBefore(cutoff)).toList();
      _allInc = _allInc.where((i) => !i.date.isBefore(cutoff)).toList();
      _rev++;
      _invalidateAggCache();

      if (_selectedCategoryMonth == null) {
        _selectedCategoryMonth = DateTime(now.year, now.month, 1);
      }
      final userDoc = await FirebaseFirestore.instance
          .collection('users')
          .doc(widget.userPhone)
          .get();
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
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 0),
      child: AdsBannerCard(
        placement: 'analytics_overview',
        inline: false,
        inlineMaxHeight: 90,
        padding: EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        minHeight: 90,
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
    final end =
        DateFormat('d MMM').format(range.end.subtract(const Duration(days: 1)));
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
              style: Fx.number
                  .copyWith(color: bankColor, fontWeight: FontWeight.w800),
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
              onTap: () => _toggleBankSelection(bank, last4: account.last4),
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
                    style: Fx.label
                        .copyWith(fontWeight: FontWeight.w800, fontSize: 16),
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
          style: Fx.title.copyWith(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: Colors.blueGrey[900]),
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
                            const SnackBar(
                                content: Text("Add Card feature coming soon!")),
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
                      _analyticsBannerCard(),
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
                            onTap: () =>
                                _changeScope(SpendScope.savingsAccounts),
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
                              maxWidth: MediaQuery.of(context).size.width - 32,
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
                              backgroundColor: Colors.teal.withOpacity(.10),
                              shape: const StadiumBorder(),
                              selected: true,
                            ),
                          ),
                        ),
                      ],
                      const SizedBox(height: 12),
                      _scopeFiltersRow(cardGroups),

                      const SizedBox(height: 12),

                      // NEW: Dynamic Trend Card
                      _dynamicTrendCard(),

                      // Small banner ad
                      const SizedBox(height: 10),
                      _analyticsBannerCard(),

                      const SizedBox(height: 14),
                      _monthlyCategoryListCard(),

                      const SizedBox(height: 14),
                      GlassCard(
                        radius: Fx.r24,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _sectionHeader(
                                'Transactions', Icons.list_alt_rounded),
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
            style: theme.textTheme.titleMedium
                ?.copyWith(fontWeight: FontWeight.w700),
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

  DateTimeRange _getRangeForBucketDate(DateTime date) {
    if (_periodToken == 'D')
      return DateTimeRange(start: date, end: date.add(const Duration(days: 1)));
    if (_periodToken == 'W')
      return DateTimeRange(start: date, end: date.add(const Duration(days: 7)));
    if (_periodToken == 'Y')
      return DateTimeRange(start: date, end: DateTime(date.year + 1, 1, 1));
    if (_periodToken == 'All Time')
      return DateTimeRange(start: date, end: DateTime(3000));
    // M
    return DateTimeRange(
        start: date, end: DateTime(date.year, date.month + 1, 1));
  }

  Widget _buildBucketSelector({
    required List<_ChartBucket> buckets,
    required _ChartBucket selected,
    required ValueChanged<_ChartBucket> onSelect,
  }) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final b in buckets)
            Padding(
              padding: const EdgeInsets.only(right: 6),
              child: _buildSoftPill(
                label: b.label,
                isSelected: b.date.isAtSameMomentAs(selected.date),
                onTap: () => onSelect(b),
              ),
            ),
        ],
      ),
    );
  }

  void _openCategoryDetailForBucket(
      String category, DateTime start, DateTime end, double amount) {
    final subBuckets =
        _subcategoryBucketsForRangeAndCategory(start, end, category);

    if (subBuckets.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No transactions found for $category')),
      );
      return;
    }

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => _SubcategoryBreakdownSheet(
        category: category,
        start: start,
        end: end,
        totalAmount: amount,
        subBuckets: subBuckets,
        onSubcategoryTap: (subcategory, subAmount) {
          // Drill down to transactions for this subcategory
          final expInRange = _applyBankFiltersToExpenses(_allExp).where((e) {
            return !e.date.isBefore(start) &&
                e.date.isBefore(end) &&
                _normalizeMainCategory(
                        AnalyticsAgg.resolveExpenseCategory(e)) ==
                    category &&
                _resolveExpenseSubcategory(e) == subcategory;
          }).toList();

          Navigator.pop(context); // Close the sheet first
          _openTxDrilldown(
            title:
                '$category • $subcategory (${DateFormat("d MMM").format(start)} - ${DateFormat("d MMM").format(end.subtract(const Duration(days: 1)))})',
            exp: expInRange,
            inc: const [],
          );
        },
      ),
    );
  }

  void _openTxDrilldown({
    required String title,
    required List<ExpenseItem> exp,
    required List<IncomeItem> inc,
  }) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => DraggableScrollableSheet(
        initialChildSize: 0.85,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        builder: (context, scrollController) {
          return Container(
            decoration: const BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
            ),
            child: Column(
              children: [
                // Handle bar
                Container(
                  margin: const EdgeInsets.only(top: 12, bottom: 8),
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.grey[300],
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),

                // Header
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          title,
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close),
                        onPressed: () => Navigator.pop(context),
                      ),
                    ],
                  ),
                ),

                const Divider(height: 1),

                // Transaction list
                Expanded(
                  child: exp.isEmpty && inc.isEmpty
                      ? Center(
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: Text(
                              'No transactions found',
                              style: TextStyle(
                                color: Colors.grey[600],
                                fontSize: 15,
                              ),
                            ),
                          ),
                        )
                      : SingleChildScrollView(
                          controller: scrollController,
                          child: UnifiedTransactionList(
                            expenses: exp,
                            incomes: inc,
                            friendsById: const <String, FriendModel>{},
                            userPhone: widget.userPhone,
                            previewCount: 10000, // Show all
                            filterType: 'All',
                            showBillIcon: true,
                            enableScrolling:
                                false, // Let SingleChildScrollView handle it
                            onEdit: (item) async {
                              await _handleEdit(item);
                              if (mounted)
                                Navigator.pop(
                                    context); // Close sheet to reflect changes
                            },
                            onDelete: (item) async {
                              await _handleDelete(item);
                              if (mounted)
                                Navigator.pop(
                                    context); // Close sheet to reflect changes
                            },
                            onChangeCategory: (
                                {required String txId,
                                required String newCategory,
                                required dynamic payload}) async {
                              if (payload is ExpenseItem) {
                                final updated =
                                    payload.copyWith(category: newCategory);
                                await _expenseSvc.updateExpense(
                                    widget.userPhone, updated);
                                await _bootstrap();
                              }
                            },
                            onChangeSubcategory: (
                                {required String txId,
                                required String newSubcategory,
                                required dynamic payload}) async {
                              if (payload is ExpenseItem) {
                                final updated = payload.copyWith(
                                    subcategory: newSubcategory);
                                await _expenseSvc.updateExpense(
                                    widget.userPhone, updated);
                                await _bootstrap();
                              }
                            },
                            emptyBuilder: (context) => const SizedBox(),
                          ),
                        ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _monthlyCategoryListCard() {
    final buckets = _buildAdaptiveBuckets();

    if (buckets.isEmpty) {
      return GlassCard(
        radius: Fx.r24,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildMyCardsSection(),
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

    _ChartBucket? selectedBucket;
    if (_selectedCategoryMonth != null) {
      try {
        selectedBucket = buckets.firstWhere(
            (b) => b.date.isAtSameMomentAs(_selectedCategoryMonth!));
      } catch (_) {}
    }
    if (selectedBucket == null) {
      selectedBucket = buckets.isNotEmpty ? buckets.last : null;
    }

    if (selectedBucket == null) return const SizedBox();

    final range = _getRangeForBucketDate(selectedBucket.date);
    final byCat = _categoryTotalsForRange(range.start, range.end);

    final entries = byCat.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    final hasData = entries.isNotEmpty && entries.any((e) => e.value.abs() > 0);
    final total = entries.fold<double>(0, (sum, e) => sum + e.value);

    String periodLabel = selectedBucket.label;
    if (_periodToken == 'M')
      periodLabel = DateFormat('MMMM y').format(selectedBucket.date);
    if (_periodToken == 'W')
      periodLabel =
          '${DateFormat('d MMM').format(range.start)} - ${DateFormat('d MMM').format(range.end.subtract(const Duration(days: 1)))}';

    return GlassCard(
      radius: Fx.r24,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
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
            '$periodLabel spends – ${INR.f(total)}',
            style: Fx.label.copyWith(
              fontWeight: FontWeight.w600,
              color: Fx.text.withOpacity(.85),
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 8),
          _buildBucketSelector(
            buckets: buckets,
            selected: selectedBucket,
            onSelect: (b) {
              setState(() => _selectedCategoryMonth = b.date);
            },
          ),
          const SizedBox(height: 10),
          if (!hasData)
            Padding(
              padding: const EdgeInsets.all(4),
              child: Text('No spends found for this period.',
                  style: Fx.label.copyWith(color: Fx.text.withOpacity(.7))),
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

                return ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(
                    _iconForCategory(cat),
                    color: _categoryColors[cat] ?? Fx.mintDark,
                  ),
                  title: Text(cat,
                      style: Fx.label.copyWith(fontWeight: FontWeight.w600)),
                  trailing: Text(
                    INR.f(amount),
                    style: Fx.number.copyWith(fontWeight: FontWeight.w700),
                  ),
                  onTap: () => _openCategoryDetailForBucket(
                      cat, range.start, range.end, amount),
                );
              },
            ),
        ],
      ),
    );
  }

  // ---------- Last X months spends card (Axis-style) ----------

  // ---------- Chart Data Generation ----------

  /// Generates chart buckets based on the current active period/range.
  List<_ChartBucket> _generateChartBuckets() {
    final range = _range ?? _rangeOrDefault();
    final start = range.start;
    final end =
        range.end.subtract(const Duration(milliseconds: 1)); // adjust strictly

    final diff = end.difference(start);
    final days = diff.inDays;

    // Decide granularity
    bool useHours = false;
    bool useMonths = false;
    bool useSays = false; // days

    // If explicit period token is Year, force month buckets
    if (_periodToken == 'Y') {
      useMonths = true;
    } else if (_periodToken == 'D' || _periodToken == 'Day' || days == 0) {
      useHours = true;
    } else if (_periodToken == 'M' || days >= 28) {
      // Month or Custom large range -> Days (or Weeks if too large? Stick to days for Month view)
      // Actually for "Month", we want daily bars.
      useSays = true;
    } else if (_periodToken == 'W') {
      useSays = true; // 7 days
    } else if (_periodToken == 'All Time') {
      useMonths = true;
    } else {
      // Custom range fallback
      if (days <= 1)
        useHours = true;
      else if (days <= 31)
        useSays = true;
      else
        useMonths = true;
    }

    // Generate empty buckets
    final buckets = <_ChartBucket>[];

    // Helper to get expense data (filtered)
    // We need to re-fetch relevant expenses based on method.
    // Optimization: Filter _allExp once for the whole range, then bucketize.
    final expInRange = _applyBankFiltersToExpenses(_allExp).where((e) {
      return !e.date.isBefore(start) && e.date.isBefore(range.end);
    }).toList();

    // Generators
    if (useHours) {
      // 0 to 23 hours for the specific day
      // Note: If custom range matches 2 days, this logic might be simplistic,
      // but for 'D' it's always TODAY 00:00 to 23:59
      final baseDate = DateTime(start.year, start.month, start.day);
      for (int i = 0; i < 24; i++) {
        final bucketStart = baseDate.add(Duration(hours: i));
        final bucketEnd = bucketStart.add(const Duration(hours: 1));

        final bucketExp = expInRange.where(
            (e) => !e.date.isBefore(bucketStart) && e.date.isBefore(bucketEnd));

        double total = 0;
        final catMap = <String, double>{};
        for (final e in bucketExp) {
          total += e.amount;
          final cat =
              _normalizeMainCategory(AnalyticsAgg.resolveExpenseCategory(e));
          catMap[cat] = (catMap[cat] ?? 0) + e.amount;
        }

        // Label: "4 PM" or "4"
        final hourC = i % 12 == 0 ? 12 : i % 12;
        final ampm = i < 12 ? 'AM' : 'PM';
        // Simplified label to avoid clutter: only even hours or every 4 hours?
        // Let chart decide, just provide "4 PM"
        final label = '$hourC $ampm';

        buckets.add(_ChartBucket(
          date: bucketStart,
          label: label,
          total: total,
          categoryBreakdown: catMap,
        ));
      }
    } else if (useMonths) {
      // Iterate from start month to end month
      DateTime ptr = DateTime(start.year, start.month, 1);
      final stop = DateTime(end.year, end.month, 1);

      while (!ptr.isAfter(stop)) {
        final bucketStart = DateTime(ptr.year, ptr.month, 1);
        final bucketEnd = DateTime(ptr.year, ptr.month + 1, 1);

        final bucketExp = expInRange.where(
            (e) => !e.date.isBefore(bucketStart) && e.date.isBefore(bucketEnd));

        double total = 0;
        final catMap = <String, double>{};
        for (final e in bucketExp) {
          total += e.amount;
          final cat =
              _normalizeMainCategory(AnalyticsAgg.resolveExpenseCategory(e));
          catMap[cat] = (catMap[cat] ?? 0) + e.amount;
        }

        buckets.add(_ChartBucket(
          date: bucketStart,
          label: DateFormat('MMM').format(bucketStart),
          total: total,
          categoryBreakdown: catMap,
        ));

        ptr = DateTime(ptr.year, ptr.month + 1, 1);
      }
    } else {
      // Days
      DateTime ptr = DateTime(start.year, start.month, start.day);
      final stop = DateTime(end.year, end.month,
          end.day); // can match end exactly for exclusive check loop?

      // Safety cap for custom ranges
      int count = 0;
      while (ptr.isBefore(range.end) && count < 60) {
        final bucketStart = DateTime(ptr.year, ptr.month, ptr.day);
        final bucketEnd = bucketStart.add(const Duration(days: 1));

        final bucketExp = expInRange.where(
            (e) => !e.date.isBefore(bucketStart) && e.date.isBefore(bucketEnd));

        double total = 0;
        final catMap = <String, double>{};
        for (final e in bucketExp) {
          total += e.amount;
          final cat =
              _normalizeMainCategory(AnalyticsAgg.resolveExpenseCategory(e));
          catMap[cat] = (catMap[cat] ?? 0) + e.amount;
        }

        // Label: "Mon", "Tue" for Week; "1", "2" for Month
        String label = '';
        if (_periodToken == 'W') {
          label = DateFormat('E').format(bucketStart);
        } else {
          label = bucketStart.day.toString();
        }

        buckets.add(_ChartBucket(
          date: bucketStart,
          label: label,
          total: total,
          categoryBreakdown: catMap,
        ));

        ptr = ptr.add(const Duration(days: 1));
        count++;
      }
    }

    return buckets;
  }

  // ---------- Dynamic Trend Card (Chart) ----------
  Widget _dynamicTrendCard() {
    final buckets = _generateChartBuckets();
    if (buckets.isEmpty || buckets.every((b) => b.total == 0)) {
      // Show placeholder state if truly empty?
      // Or just show zero-state chart.
    }

    // Identify period label
    String title = 'Trends';
    String subtitle = 'Spending over time';

    if (_periodToken == 'D') {
      title = 'Today\'s Spend';
      subtitle = 'Hourly breakdown';
    } else if (_periodToken == 'W') {
      title = 'Weekly Trend';
      subtitle = 'Daily breakdown';
    } else if (_periodToken == 'M') {
      title = 'Monthly Trend';
      subtitle = DateFormat('MMMM y').format(_range?.start ?? DateTime.now());
    } else if (_periodToken == 'Y') {
      title = 'Yearly Trend';
      subtitle = DateFormat('y').format(_range?.start ?? DateTime.now());
    } else if (_periodToken == 'All Time') {
      title = 'All Time';
      subtitle = 'Monthly breakdown';
    } else {
      title = 'Custom Range';
      subtitle = _activePeriodLabel(_range ?? _rangeOrDefault());
    }

    final totalPeriod = buckets.fold<double>(0, (sum, b) => sum + b.total);

    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.65),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Colors.white.withOpacity(0.8), width: 1.5),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF004D40).withOpacity(0.08),
            blurRadius: 24,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: Fx.label.copyWith(
                      color: Fx.text.withOpacity(0.6),
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    INR.f(totalPeriod),
                    style: Fx.title.copyWith(fontSize: 24),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              // View selector (Trend / Stacked)
              Container(
                decoration: BoxDecoration(
                  color: Colors.grey.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(20),
                ),
                padding: const EdgeInsets.all(4),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _chartViewBtn('Trend', Icons.bar_chart_rounded),
                    _chartViewBtn('Breakdown', Icons.pie_chart_rounded),
                  ],
                ),
              ),
            ],
          ),

          Text(
            subtitle,
            style: Fx.label
                .copyWith(color: Fx.text.withOpacity(0.5), fontSize: 13),
          ),

          const SizedBox(height: 24),

          // Chart Area
          SizedBox(
            height: 220,
            child: _lastMonthsView == 'Trend'
                ? _buildTrendChart(buckets)
                : _buildStackedChart(buckets),
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
    final bool isActive = _lastMonthsView == label;
    return GestureDetector(
      onTap: () {
        setState(() {
          _lastMonthsView = label;
        });
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: isActive ? Colors.white : Colors.transparent,
          borderRadius: BorderRadius.circular(16),
          boxShadow: isActive
              ? [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.05),
                    blurRadius: 4,
                    offset: const Offset(0, 2),
                  )
                ]
              : null,
        ),
        child: Row(
          children: [
            Icon(
              icon,
              size: 16,
              color: isActive ? Colors.black87 : Colors.black54,
            ),
            const SizedBox(width: 6),
            Text(
              label,
              style: Fx.label.copyWith(
                color: isActive ? Colors.black87 : Colors.black54,
                fontWeight: isActive ? FontWeight.w600 : FontWeight.w500,
                fontSize: 12,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTrendChart(List<_ChartBucket> buckets) {
    // Max Y calculation
    double maxY = 0;
    for (final b in buckets) {
      if (b.total > maxY) maxY = b.total;
    }
    if (maxY == 0) maxY = 100;
    maxY *= 1.2; // buffer

    return BarChart(
      BarChartData(
        alignment: BarChartAlignment.spaceAround,
        maxY: maxY,
        barTouchData: BarTouchData(
          touchTooltipData: BarTouchTooltipData(
            getTooltipColor: (group) => Colors.black87,
            getTooltipItem: (group, groupIndex, rod, rodIndex) {
              final bucket = buckets[groupIndex];
              return BarTooltipItem(
                '${bucket.label}\n',
                const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                  fontSize: 14,
                ),
                children: <TextSpan>[
                  TextSpan(
                    text: INR.f(bucket.total),
                    style: const TextStyle(
                      color: Color(0xFFE0E0E0),
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              );
            },
          ),
        ),
        titlesData: FlTitlesData(
          show: true,
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              getTitlesWidget: (value, meta) {
                final idx = value.toInt();
                if (idx < 0 || idx >= buckets.length)
                  return const SizedBox.shrink();
                // Thin out labels if too many
                if (buckets.length > 15 && idx % 2 != 0)
                  return const SizedBox.shrink();
                if (buckets.length > 30 && idx % 4 != 0)
                  return const SizedBox.shrink();

                return Padding(
                  padding: const EdgeInsets.only(top: 8.0),
                  child: Text(
                    buckets[idx].label,
                    style: const TextStyle(
                      color: Color(0xff7589a2),
                      fontWeight: FontWeight.bold,
                      fontSize: 10,
                    ),
                  ),
                );
              },
              reservedSize: 30,
            ),
          ),
          leftTitles:
              const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          topTitles:
              const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          rightTitles:
              const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        ),
        gridData: FlGridData(
          show: true,
          drawVerticalLine: false,
          horizontalInterval: maxY / 5 == 0 ? 1 : maxY / 5,
          getDrawingHorizontalLine: (value) {
            return FlLine(
              color: const Color(0xffe7e8ec),
              strokeWidth: 1,
            );
          },
        ),
        borderData: FlBorderData(show: false),
        barGroups: buckets.asMap().entries.map((entry) {
          final idx = entry.key;
          final bucket = entry.value;
          return BarChartGroupData(
            x: idx,
            barRods: [
              BarChartRodData(
                toY: bucket.total,
                gradient: const LinearGradient(
                  colors: [Color(0xFF2E7D32), Color(0xFF004D40)],
                  begin: Alignment.bottomCenter,
                  end: Alignment.topCenter,
                ),
                width: buckets.length > 20 ? 8 : 16,
                borderRadius:
                    const BorderRadius.vertical(top: Radius.circular(4)),
              )
            ],
          );
        }).toList(),
      ),
    );
  }

  Widget _buildBreakdownLegend(List<_ChartBucket> buckets) {
    // Aggregate all categories
    final agg = <String, double>{};
    for (final b in buckets) {
      b.categoryBreakdown.forEach((cat, amt) {
        agg[cat] = (agg[cat] ?? 0) + amt;
      });
    }

    // Sort by amount desc
    final sorted = agg.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));

    return Wrap(
      spacing: 16,
      runSpacing: 8,
      children: sorted.map((e) {
        final color = _categoryColors[e.key] ?? Colors.grey;
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 12,
              height: 12,
              decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            ),
            const SizedBox(width: 6),
            Text(
              e.key,
              style: Fx.label.copyWith(fontSize: 12),
            ),
          ],
        );
      }).toList(),
    );
  }

  Widget _buildStackedChart(List<_ChartBucket> buckets) {
    // MaxY
    double maxY = 0;
    for (final b in buckets) {
      if (b.total > maxY) maxY = b.total;
    }
    if (maxY == 0) maxY = 100;
    maxY *= 1.1;

    return BarChart(
      BarChartData(
        alignment: BarChartAlignment.spaceAround,
        maxY: maxY,
        barTouchData: BarTouchData(
          touchTooltipData: BarTouchTooltipData(
              getTooltipColor: (group) => Colors.black87,
              getTooltipItem: (group, groupIndex, rod, rodIndex) {
                final bucket = buckets[groupIndex];
                return BarTooltipItem(
                  '${bucket.label}\n',
                  const TextStyle(
                      color: Colors.white, fontWeight: FontWeight.bold),
                  children: [
                    TextSpan(
                      text: INR.f(bucket.total),
                      style:
                          const TextStyle(color: Colors.white70, fontSize: 12),
                    ),
                  ],
                );
              }),
        ),
        titlesData: FlTitlesData(
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              getTitlesWidget: (val, _) {
                final idx = val.toInt();
                if (idx < 0 || idx >= buckets.length)
                  return const SizedBox.shrink();
                // Thin out labels
                if (buckets.length > 15 && idx % 2 != 0)
                  return const SizedBox.shrink();
                if (buckets.length > 30 && idx % 4 != 0)
                  return const SizedBox.shrink();
                return Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(buckets[idx].label,
                      style: const TextStyle(fontSize: 10, color: Colors.grey)),
                );
              },
              reservedSize: 30,
            ),
          ),
          leftTitles:
              const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          topTitles:
              const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          rightTitles:
              const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        ),
        gridData: FlGridData(show: false),
        borderData: FlBorderData(show: false),
        barGroups: buckets.asMap().entries.map((entry) {
          final idx = entry.key;
          final bucket = entry.value;
          return BarChartGroupData(
            x: idx,
            barRods: [
              BarChartRodData(
                toY: bucket.total,
                width: buckets.length > 20 ? 8 : 16,
                rodStackItems:
                    _buildRodStackItems(bucket.categoryBreakdown, bucket.total),
                borderRadius: BorderRadius.all(Radius.zero),
              ),
            ],
          );
        }).toList(),
      ),
    );
  }

  List<BarChartRodStackItem> _buildRodStackItems(
      Map<String, double> breakdown, double total) {
    if (total == 0) return [];

    final sorted = breakdown.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));

    final items = <BarChartRodStackItem>[];
    double currentY = 0;

    for (final e in sorted) {
      final amt = e.value;
      if (amt <= 0) continue;

      final color = _categoryColors[e.key] ?? Colors.grey;
      items.add(BarChartRodStackItem(currentY, currentY + amt, color));
      currentY += amt;
    }

    return items;
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
                style: Theme.of(context)
                    .textTheme
                    .titleLarge
                    ?.copyWith(fontWeight: FontWeight.bold),
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
                        final cards =
                            await _cardSvc.getUserCards(widget.userPhone);
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

// Subcategory Breakdown Sheet Widget
class _SubcategoryBreakdownSheet extends StatefulWidget {
  final String category;
  final DateTime start;
  final DateTime end;
  final double totalAmount;
  final List<_SubcategoryBucket> subBuckets;
  final Function(String subcategory, double amount) onSubcategoryTap;

  const _SubcategoryBreakdownSheet({
    required this.category,
    required this.start,
    required this.end,
    required this.totalAmount,
    required this.subBuckets,
    required this.onSubcategoryTap,
  });

  @override
  State<_SubcategoryBreakdownSheet> createState() =>
      _SubcategoryBreakdownSheetState();
}

class _SubcategoryBreakdownSheetState
    extends State<_SubcategoryBreakdownSheet> {
  _SubcategorySort _sortBy = _SubcategorySort.amountDesc;

  List<_SubcategoryBucket> get _sortedBuckets {
    final list = List<_SubcategoryBucket>.from(widget.subBuckets);
    switch (_sortBy) {
      case _SubcategorySort.amountDesc:
        list.sort((a, b) => b.amount.compareTo(a.amount));
        break;
      case _SubcategorySort.amountAsc:
        list.sort((a, b) => a.amount.compareTo(b.amount));
        break;
      case _SubcategorySort.alphaAsc:
        list.sort((a, b) => a.name.compareTo(b.name));
        break;
      case _SubcategorySort.alphaDesc:
        list.sort((a, b) => b.name.compareTo(a.name));
        break;
    }
    return list;
  }

  @override
  Widget build(BuildContext context) {
    final dateRange =
        '${DateFormat("d MMM").format(widget.start)} - ${DateFormat("d MMM").format(widget.end.subtract(const Duration(days: 1)))}';

    return DraggableScrollableSheet(
      initialChildSize: 0.75,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      builder: (context, scrollController) {
        return Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          ),
          child: Column(
            children: [
              // Handle bar
              Container(
                margin: const EdgeInsets.only(top: 12, bottom: 8),
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey[300],
                  borderRadius: BorderRadius.circular(2),
                ),
              ),

              // Header
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(
                          Icons.category_rounded,
                          color: Colors.teal[700],
                          size: 28,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                widget.category,
                                style: const TextStyle(
                                  fontSize: 22,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              Text(
                                dateRange,
                                style: TextStyle(
                                  fontSize: 13,
                                  color: Colors.grey[600],
                                ),
                              ),
                            ],
                          ),
                        ),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(
                              INR.f(widget.totalAmount),
                              style: const TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.bold,
                                color: Colors.black87,
                              ),
                            ),
                            Text(
                              '${widget.subBuckets.length} subcategories',
                              style: TextStyle(
                                fontSize: 12,
                                color: Colors.grey[600],
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),

                    // Sort options
                    Row(
                      children: [
                        Text(
                          'Sort by:',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: Colors.grey[700],
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: SingleChildScrollView(
                            scrollDirection: Axis.horizontal,
                            child: Row(
                              children: [
                                _buildSortChip(
                                    'Amount ↓', _SubcategorySort.amountDesc),
                                const SizedBox(width: 6),
                                _buildSortChip(
                                    'Amount ↑', _SubcategorySort.amountAsc),
                                const SizedBox(width: 6),
                                _buildSortChip(
                                    'A-Z', _SubcategorySort.alphaAsc),
                                const SizedBox(width: 6),
                                _buildSortChip(
                                    'Z-A', _SubcategorySort.alphaDesc),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              const Divider(height: 1),

              // Subcategory list
              Expanded(
                child: ListView.separated(
                  controller: scrollController,
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  itemCount: _sortedBuckets.length,
                  separatorBuilder: (_, __) =>
                      const Divider(height: 1, indent: 72),
                  itemBuilder: (context, index) {
                    final bucket = _sortedBuckets[index];
                    final percentage =
                        (bucket.amount / widget.totalAmount * 100)
                            .toStringAsFixed(1);

                    return ListTile(
                      contentPadding: const EdgeInsets.symmetric(
                          horizontal: 20, vertical: 4),
                      leading: Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(
                          color: Colors.teal.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Icon(
                          Icons.label_outline,
                          color: Colors.teal[700],
                          size: 24,
                        ),
                      ),
                      title: Text(
                        bucket.name,
                        style: const TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 15,
                        ),
                      ),
                      subtitle: Text(
                        '${bucket.txCount} transaction${bucket.txCount != 1 ? 's' : ''} • $percentage%',
                        style: TextStyle(
                          fontSize: 13,
                          color: Colors.grey[600],
                        ),
                      ),
                      trailing: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            INR.f(bucket.amount),
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 16,
                            ),
                          ),
                          Icon(
                            Icons.chevron_right,
                            color: Colors.grey[400],
                            size: 20,
                          ),
                        ],
                      ),
                      onTap: () =>
                          widget.onSubcategoryTap(bucket.name, bucket.amount),
                    );
                  },
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildSortChip(String label, _SubcategorySort sort) {
    final isSelected = _sortBy == sort;
    return GestureDetector(
      onTap: () => setState(() => _sortBy = sort),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? Colors.teal : Colors.grey[100],
          borderRadius: BorderRadius.circular(16),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
            color: isSelected ? Colors.white : Colors.grey[700],
          ),
        ),
      ),
    );
  }
}
