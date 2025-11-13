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
import '../widgets/charts/donut_chart_simple.dart';
import '../widgets/unified_transaction_list.dart';
import 'edit_expense_screen.dart';

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

  // Bottom list filter chips
  String _txnFilter = "All";

  // Calendar / custom filter
  CustomRange? _custom;

  int _aggRev = 0;
  final Map<String, Map<String, double>> _aggCache = {};

  // caches
  final Map<String, List<SeriesPoint>> _seriesCache = {};
  final Map<String, Map<String, double>> _rollCache = {};
  int _rev = 0;

  // Banks & Cards selection (screen-wide filter)
  String? _bankFilter;   // normalized uppercase bank name
  String? _last4Filter;  // last 4 digits for specific account
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
        final cat = AnalyticsAgg.resolveExpenseCategory(e);
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
          final cat = AnalyticsAgg.resolveExpenseCategory(e);
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

  Widget _categoryChips({required bool expense}) {
    final data = expense ? sumExpenseByCategory() : sumIncomeByCategory();
    final entries = data.entries.toList();
    if (entries.isEmpty) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(.65),
          borderRadius: BorderRadius.circular(14),
          boxShadow: Fx.soft,
        ),
        child: Text(
          'No data for this selection',
          style: Fx.label.copyWith(color: Fx.text.withOpacity(.7)),
        ),
      );
    }

    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final entry in entries)
          ActionChip(
            label: Text(
              '${entry.key} • ${INR.c(entry.value)}',
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
            onPressed: () => _openCategoryDrilldown(
              expense: expense,
              category: entry.key,
              total: entry.value,
            ),
          ),
      ],
    );
  }

  Future<void> _openCategoryDrilldown({
    required bool expense,
    required String category,
    required double total,
  }) async {
    final range = _rangeOrDefault();
    if (expense) {
      final matches = _applyBankFiltersToExpenses(_allExp)
          .where((e) =>
              _inRange(e.date, range) &&
              AnalyticsAgg.resolveExpenseCategory(e) == category)
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

  Widget _categorySection({required bool expense}) {
    final title = expense ? 'Expense by Category' : 'Income by Category';
    final data = expense ? sumExpenseByCategory() : sumIncomeByCategory();
    final entries = data.entries
        .where((e) => e.value.isFinite && e.value != 0)
        .toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    final hasData = entries.isNotEmpty &&
        entries.any((element) => element.value.abs() > 0);

    Widget _emptyCard() => Container(
          key: ValueKey('empty-${expense ? 'exp' : 'inc'}'),
          width: double.infinity,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(20),
            boxShadow: Fx.soft,
          ),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 18),
          child: Text(
            'No data for this selection',
            style: Fx.label.copyWith(color: Fx.text.withOpacity(.7)),
          ),
        );

    Widget _chart() => Container(
          key: ValueKey('chart-${expense ? 'exp' : 'inc'}'),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(20),
            boxShadow: Fx.soft,
          ),
          padding: const EdgeInsets.all(12),
          child: DonutChartSimple(
            slices: [
              for (final entry in entries)
                DonutSlice(
                  label: entry.key,
                  value: entry.value.abs(),
                ),
            ],
            height: 220,
            centerLabel: expense ? 'Spent' : 'Received',
            showCenterTotal: true,
            onSliceTap: (_, slice) => _openCategoryDrilldown(
              expense: expense,
              category: slice.label,
              total: data[slice.label] ?? 0,
            ),
          ),
        );

    return GlassCard(
      radius: Fx.r24,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionHeader(title, Icons.pie_chart_rounded),
          const SizedBox(height: 8),
          RepaintBoundary(
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 220),
              child: hasData ? _chart() : _emptyCard(),
            ),
          ),
          const SizedBox(height: 12),
          if (hasData) _categoryChips(expense: expense),
        ],
      ),
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
        final String l4 = '';
        if (l4.isEmpty || !l4.endsWith(_last4Filter!)) {
          return false;
        }
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

  Map<String, double> _summaryFor(
      List<ExpenseItem> expenses, List<IncomeItem> incomes) {
    final debit = expenses.fold<double>(0, (sum, e) => sum + e.amount);
    final credit = incomes.fold<double>(0, (sum, i) => sum + i.amount);
    return {'credit': credit, 'debit': debit, 'net': credit - debit};
  }

  List<_CardGroup> _cardGroupsForPeriod(
    List<ExpenseItem> exp,
    List<IncomeItem> inc,
  ) {
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
      _rev++;
      _seriesCache.clear();
      _rollCache.clear();
      _invalidateAggCache();
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

    final expPeriod = _allExp
        .where((e) => _inRange(e.date, activeRange))
        .toList()
      ..sort((a, b) => b.date.compareTo(a.date));
    final incPeriod = _allInc
        .where((i) => _inRange(i.date, activeRange))
        .toList()
      ..sort((a, b) => b.date.compareTo(a.date));
    final cardGroups = _cardGroupsForPeriod(expPeriod, incPeriod);

    var exp = expPeriod;
    var inc = incPeriod;

    exp = _applyBankFiltersToExpenses(exp);
    inc = _applyBankFiltersToIncomes(inc);

    final txSummary = _summaryFor(exp, inc);
    final totalExp = txSummary['debit'] ?? 0.0;
    final totalInc = txSummary['credit'] ?? 0.0;
    final savings = txSummary['net'] ?? 0.0;

    final seriesKey = '$_rev|$_period|series|${_custom?.start}-${_custom?.end}';
    final series = _seriesCache[seriesKey] ??=
        AnalyticsAgg.amountSeries(_period, exp, inc, now, custom: _custom);

    // Robust category rollups (smart resolvers)
    final merchKey = '$_rev|$_period|merch|${_custom?.start}-${_custom?.end}';
    final byMerch = _rollCache[merchKey] ??= AnalyticsAgg.byMerchant(exp);

    // Sparkline series reacts to the current filter/period
    final spark = _sparkForPeriod(_period, exp, now, custom: _custom);
    final sparkLabels =
        _sparkLabelsForPeriod(_period, spark, now, custom: _custom);

    // Calendar heatmap uses current month overview (tap -> set custom day)
    final calData = _monthExpenseMap(
        (_bankFilter == null && _last4Filter == null) ? _allExp : exp, now);

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
                      ],
                      const SizedBox(height: 12),

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

                      // Small banner ad under Overview
                      const SizedBox(height: 10),
                      _analyticsBannerCard(),

                      const SizedBox(height: 14),

                      // ===== Calendar (tappable, shows amounts) =====
                      GlassCard(
                        radius: Fx.r24,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _sectionHeader('Calendar', Icons.calendar_month_rounded),
                            const SizedBox(height: 8),
                            _MiniCalendarHeatmap(
                              month: DateTime(now.year, now.month, 1),
                              amountsByDay: calData,
                              onDayTap: (day, amt) {
                                final date = DateTime(now.year, now.month, day);
                                final start = DateTime(date.year, date.month, date.day);
                                setState(() {
                                  _period = Period.custom;
                                  _custom = CustomRange(start, start);
                                  _range = DateTimeRange(
                                    start: start,
                                    end: start.add(const Duration(days: 1)),
                                  );
                                  _invalidateAggCache();
                                });
                              },
                              onDayLongPress: (day, amt) {
                                final date = DateTime(now.year, now.month, day);
                                final start = DateTime(date.year, date.month, date.day);
                                final end = start.add(const Duration(days: 1));
                                final rr = DateTimeRange(start: start, end: end);
                                final expD = _allExp
                                    .where((e) =>
                                        !e.date.isBefore(rr.start) &&
                                        e.date.isBefore(rr.end))
                                    .toList();
                                final incD = _allInc
                                    .where((i) =>
                                        !i.date.isBefore(rr.start) &&
                                        i.date.isBefore(rr.end))
                                    .toList();
                                _openTxDrilldown(
                                  title:
                                      'Transactions • ${DateFormat('d MMM').format(date)}',
                                  exp: expD,
                                  inc: incD,
                                );
                              },
                            ),
                          ],
                        ),
                      ),

                      const SizedBox(height: 14),

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

                      // Expense by Category (donut + drill-down)
                      _categorySection(expense: true),

                      const SizedBox(height: 14),

                      // Income by Category (donut + drill-down)
                      _categorySection(expense: false),

                      const SizedBox(height: 14),

                      // Top Merchants (chips)
                      GlassCard(
                        radius: Fx.r24,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _sectionHeader('Top Merchants', Icons.store_rounded),
                            const SizedBox(height: 8),
                            ..._topMerchants(byMerch, exp),
                          ],
                        ),
                      ),

                      const SizedBox(height: 14),

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
              Text('Total Savings  ', style: Fx.label),
              Text(INR.f(savings),
                  style: Fx.number.copyWith(color: Fx.text)),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'Tx ${NumberFormat.decimalPattern().format(txCount)} '
            '• Exp # ${NumberFormat.decimalPattern().format(expCount)} '
            '• Inc # ${NumberFormat.decimalPattern().format(incCount)}',
            style: Fx.label.copyWith(color: Fx.text.withOpacity(.85)),
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

  // ---------- Top merchants as compact chips (amount + tx count) ----------
  List<Widget> _topMerchants(
    Map<String, double> byMerch,
    List<ExpenseItem> srcExp,
  ) {
    // Count transactions per merchant in the current filtered list
    final Map<String, int> countMap = {};
    for (final e in srcExp) {
      final raw = (e.counterparty ?? e.upiVpa ?? e.label ?? '').trim();
      if (raw.isEmpty) continue;
      final key = AnalyticsAgg.displayMerchantKey(raw);
      if (key.isEmpty) continue;
      countMap[key] = (countMap[key] ?? 0) + 1;
    }

    final items = byMerch.entries
        .where((e) => e.value.isFinite && e.value != 0)
        .toList()
      ..sort((a, b) => b.value.compareTo(a.value));

    if (items.isEmpty) {
      return [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Text('No merchants to show for this period.', style: Fx.label),
        ),
      ];
    }

    final compact = NumberFormat.compactCurrency(
      locale: 'en_IN',
      symbol: '₹',
      decimalDigits: 0,
    );

    final chips = <Widget>[];
    for (final entry in items.take(8)) {
      final name = entry.key;
      final amount = entry.value.abs();
      final txCount = countMap[name] ?? 0;

      chips.add(
        _merchantChip(
          name: name,
          displayAmount: compact.format(amount),
          txCount: txCount,
          onTap: () => _openMerchantSheet(name, srcExp),
        ),
      );
    }

    return [
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: chips,
      ),
    ];
  }

  Widget _merchantChip({
    required String name,
    required String displayAmount,
    required int txCount,
    required VoidCallback onTap,
  }) {
    return Material(
      color: Fx.mintDark.withOpacity(.10),
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.store_mall_directory_rounded,
                  size: 14, color: Colors.teal),
              const SizedBox(width: 6),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 140),
                child: Text(
                  name,
                  overflow: TextOverflow.ellipsis,
                  maxLines: 1,
                  style: Fx.label,
                ),
              ),
              const SizedBox(width: 8),
              Text('• $displayAmount',
                  style: Fx.label.copyWith(color: Fx.text.withOpacity(.9))),
              const SizedBox(width: 6),
              Text('· ${txCount}x', style: Fx.label),
            ],
          ),
        ),
      ),
    );
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
                AnalyticsAgg.resolveExpenseCategory(e).toLowerCase() ==
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

  void _openMerchantSheet(String merchant, List<ExpenseItem> srcExp) {
    final target = merchant.toLowerCase();
    final matched = srcExp.where((e) {
      final raw = (e.counterparty ?? e.upiVpa ?? e.label ?? '').trim();
      if (raw.isEmpty) return false;
      final key = AnalyticsAgg.displayMerchantKey(raw).toLowerCase();
      return key == target;
    }).toList();

    _openTxDrilldown(title: 'Merchant • $merchant', exp: matched, inc: const []);
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

  Map<int, double> _monthExpenseMap(List<ExpenseItem> all, DateTime now) {
    final start = DateTime(now.year, now.month, 1);
    final end = DateTime(now.year, now.month + 1, 1);
    final map = <int, double>{};
    for (final e in all) {
      if (!e.date.isBefore(start) && e.date.isBefore(end)) {
        map[e.date.day] = (map[e.date.day] ?? 0) + e.amount;
      }
    }
    return map;
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

// ==================================================
// Mini Calendar Heatmap (current month only) with amounts & tap handlers
// ==================================================
class _MiniCalendarHeatmap extends StatelessWidget {
  final DateTime month; // first day of month
  final Map<int, double> amountsByDay;
  final void Function(int day, double amount)? onDayTap;
  final void Function(int day, double amount)? onDayLongPress;
  const _MiniCalendarHeatmap({
    required this.month,
    required this.amountsByDay,
    this.onDayTap,
    this.onDayLongPress,
  });

  @override
  Widget build(BuildContext context) {
    final firstWeekday = DateTime(month.year, month.month, 1).weekday; // 1=Mon..7=Sun
    final daysInMonth = DateTime(month.year, month.month + 1, 0).day;

    const labels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4.0),
          child: Row(
            children: [
              Text(DateFormat('MMMM').format(month), style: Fx.label),
              const SizedBox(width: 6),
              Text(DateFormat('y').format(month),
                  style: Fx.label.copyWith(color: Fx.text.withOpacity(.7))),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: labels
              .map((d) => Expanded(
                    child: Center(
                        child: Text(d, style: Fx.label.copyWith(fontSize: 11))),
                  ))
              .toList(),
        ),
        const SizedBox(height: 6),
        _grid(firstWeekday, daysInMonth),
      ],
    );
  }

  Widget _grid(int firstWeekday, int daysInMonth) {
    final startCol = firstWeekday % 7; // Sun=0
    final totalCells = ((startCol + daysInMonth + 6) ~/ 7) * 7;

    final maxVal =
        amountsByDay.isEmpty ? 0.0 : amountsByDay.values.reduce((a, b) => a > b ? a : b);

    final compact = NumberFormat.compactCurrency(
        locale: 'en_IN', symbol: '₹', decimalDigits: 0);

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: totalCells,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 7,
        mainAxisSpacing: 6,
        crossAxisSpacing: 6,
        childAspectRatio: 1.1,
      ),
      itemBuilder: (_, i) {
        final dayNum = i - startCol + 1;
        if (dayNum < 1 || dayNum > daysInMonth) return const SizedBox.shrink();

        final amt = amountsByDay[dayNum] ?? 0.0;
        final t = (maxVal <= 0) ? 0.0 : (amt / maxVal).clamp(0.0, 1.0);
        final base = Fx.mintDark;
        final fill = base.withOpacity(0.12 + t * 0.32);

        final today = DateTime.now();
        final isToday = (today.year == month.year &&
            today.month == month.month &&
            today.day == dayNum);

        final cell = Container(
          decoration: BoxDecoration(
            color: fill,
            borderRadius: BorderRadius.circular(10),
            border: isToday
                ? Border.all(color: base.withOpacity(.55), width: 1.2)
                : Border.all(color: Colors.white.withOpacity(.25)),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Align(
                alignment: Alignment.topRight,
                child: Text(
                  '$dayNum',
                  style: Fx.label.copyWith(
                    fontWeight: FontWeight.w800,
                    fontSize: 11,
                    color: Colors.black.withOpacity(.75),
                  ),
                ),
              ),
              if (amt > 0)
                Align(
                  alignment: Alignment.bottomLeft,
                  child: Text(
                    compact.format(amt),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Fx.label.copyWith(
                      fontSize: 10.5,
                      fontWeight: FontWeight.w800,
                      color: Colors.black.withOpacity(.75),
                    ),
                  ),
                ),
            ],
          ),
        );

        if (onDayTap == null && onDayLongPress == null) return cell;
        return GestureDetector(
          onTap: () => onDayTap?.call(dayNum, amt),
          onLongPress: () => onDayLongPress?.call(dayNum, amt),
          child: cell,
        );
      },
    );
  }
}
