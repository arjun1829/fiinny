// lib/screens/analytics_screen.dart
import 'dart:math' as math;

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

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
import '../core/ads/ads_banner_card.dart';

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

  // Bottom list filter chips
  String _txnFilter = "All";

  // Calendar / custom filter
  CustomRange? _custom;

  // caches
  final Map<String, List<SeriesPoint>> _seriesCache = {};
  final Map<String, Map<String, double>> _rollCache = {};
  int _rev = 0;

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
    } catch (_) {}
    if (!mounted) return;
    setState(() => _loading = false);
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

    // Use custom range when set from calendar
    final r = AnalyticsAgg.rangeFor(_period, now, custom: _custom);

    final exp = AnalyticsAgg.filterExpenses(_allExp, r);
    final inc = AnalyticsAgg.filterIncomes(_allInc, r);

    final totalExp = AnalyticsAgg.sumAmount(exp, (e) => e.amount);
    final totalInc = AnalyticsAgg.sumAmount(inc, (i) => i.amount);
    final savings = totalInc - totalExp;

    final seriesKey = '$_rev|$_period|series|${_custom?.start}-${_custom?.end}';
    final series = _seriesCache[seriesKey] ??=
        AnalyticsAgg.amountSeries(_period, exp, inc, now, custom: _custom);

    // Robust category rollups (smart resolvers)
    final catKey = '$_rev|$_period|expCat|${_custom?.start}-${_custom?.end}';
    final byCatExp = _rollCache[catKey] ??= AnalyticsAgg.byExpenseCategorySmart(exp);

    final incKey = '$_rev|$_period|incCat|${_custom?.start}-${_custom?.end}';
    final byCatInc = _rollCache[incKey] ??= AnalyticsAgg.byIncomeCategorySmart(inc);

    final merchKey = '$_rev|$_period|merch|${_custom?.start}-${_custom?.end}';
    final byMerch = _rollCache[merchKey] ??= AnalyticsAgg.byMerchant(exp);

    final catSlicesExp = byCatExp.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
    final catSlicesInc = byCatInc.entries.toList()..sort((a, b) => b.value.compareTo(a.value));

    final palette = _legendPalette();

    // Sparkline series reacts to the current filter/period
    final spark = _sparkForPeriod(_period, exp, now, custom: _custom);

    // Calendar heatmap uses current month overview (tap -> set custom day)
    final calData = _monthExpenseMap(_allExp, now);

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
              padding: EdgeInsets.fromLTRB(16, 12, 16, bottomPadding),
              children: [
                // Period chips (no premium)
                _periodChips(),
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
                          setState(() {
                            _period = Period.custom;
                            _custom = CustomRange(date, date);
                          });
                        },
                        onDayLongPress: (day, amt) {
                          final date = DateTime(now.year, now.month, day);
                          final start = DateTime(date.year, date.month, date.day);
                          final end = start.add(const Duration(days: 1));
                          final rr = DateTimeRange(start: start, end: end);
                          final expD = _allExp.where((e) => !e.date.isBefore(rr.start) && e.date.isBefore(rr.end)).toList();
                          final incD = _allInc.where((i) => !i.date.isBefore(rr.start) && i.date.isBefore(rr.end)).toList();
                          _openUnifiedSheet(
                            title: 'Transactions • ${DateFormat('d MMM').format(date)}',
                            exp: expD,
                            inc: incD,
                          );
                        },
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 14),

                // Expense by Category (donut + legend + drill-down)
                _donutCard(
                  title: 'Expense by Category',
                  entries: catSlicesExp,
                  palette: palette,
                  onSliceTap: (label) => _openCategorySheet(
                    isIncome: false,
                    category: label,
                    srcExp: exp,
                    srcInc: inc,
                  ),
                ),

                const SizedBox(height: 14),

                // Income by Category (donut + legend + drill-down)
                if (totalInc > 0)
                  _donutCard(
                    title: 'Income by Category',
                    entries: catSlicesInc,
                    palette: palette,
                    onSliceTap: (label) => _openCategorySheet(
                      isIncome: true,
                      category: label,
                      srcExp: exp,
                      srcInc: inc,
                    ),
                  ),

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
                            onSelected: (_) => setState(() => _txnFilter = f),
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

  // ---------- period chips (added Quarter "Q") ----------
  Widget _periodChips() {
    final items = <(String, Period)>[
      ('D', Period.day),
      ('W', Period.week),
      ('M', Period.month),
      ('Q', Period.quarter),
      ('Y', Period.year),
      ('2D', Period.last2),
      ('5D', Period.last5),
      ('All', Period.all),
    ];
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: items.map((t) {
        final sel = t.$2 == _period;
        return InkWell(
          borderRadius: BorderRadius.circular(999),
          onTap: () => setState(() {
            _period = t.$2;
            if (_period != Period.custom) _custom = null;
          }),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: sel ? Fx.mintDark.withOpacity(.12) : Colors.white,
              borderRadius: BorderRadius.circular(999),
              border: Border.all(
                color: sel ? Fx.mintDark.withOpacity(.35) : Colors.grey.shade200,
              ),
              boxShadow: sel ? Fx.soft : null,
            ),
            child: Text(
              t.$1,
              style: TextStyle(
                fontWeight: FontWeight.w800,
                color: sel ? Fx.mintDark : Fx.text,
              ),
            ),
          ),
        );
      }).toList(),
    );
  }

  // ---------- Section header ----------
  Widget _sectionHeader(String title, IconData icon) {
    return Row(
      children: [
        Icon(icon, color: Fx.mintDark),
        const SizedBox(width: Fx.s8),
        Text(title, style: Fx.title),
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
      child: Row(
        children: [
          // Left: numbers & counts
          Expanded(
            flex: 2,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Overview', style: Fx.title),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: _statRow('Total Income', INR.f(income), Fx.good, Icons.south_west_rounded),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _statRow('Total Expense', INR.f(expense), Fx.bad, Icons.north_east_rounded),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Icon(Icons.brightness_1_rounded, size: 10, color: Fx.warn),
                    const SizedBox(width: 6),
                    Text('Total Savings  ', style: Fx.label),
                    Text(INR.f(savings), style: Fx.number.copyWith(color: Fx.text)),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  'Tx ${NumberFormat.decimalPattern().format(txCount)} '
                      '• Exp # ${NumberFormat.decimalPattern().format(expCount)} '
                      '• Inc # ${NumberFormat.decimalPattern().format(incCount)}',
                  style: Fx.label.copyWith(color: Fx.text.withOpacity(.85)),
                ),
              ],
            ),
          ),

          // Right: sparkline (tappable)
          Expanded(
            flex: 1,
            child: GestureDetector(
              onTap: onTapSpark,
              behavior: HitTestBehavior.opaque,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  SizedBox(width: 120, height: 60, child: _SparklineSimple(values: spark)),
                  const SizedBox(height: 6),
                  Text(
                    'Tap graph to expand',
                    style: Fx.label.copyWith(fontSize: 11, color: Fx.text.withOpacity(.75)),
                  ),
                ],
              ),
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
  void _showTrendPopup(List<double> series, {required String title}) {
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
                  Expanded(child: Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18))),
                  IconButton(icon: const Icon(Icons.close), onPressed: () => Navigator.pop(context)),
                ],
              ),
              const SizedBox(height: 8),
              Expanded(
                child: BarChartSimple(
                  data: List.generate(series.length, (i) => SeriesPoint('${i + 1}', series[i])),
                  showGrid: true,
                  yTickCount: 5,
                  targetXTicks: 7,
                  showValues: false,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ---------- donut card helper (bigger ring + palette + taps) ----------
  /// Builds a donut chart section with consistent styling.
  Widget _donutCard({
    required String title,
    required List<MapEntry<String, double>> entries,
    required List<Color> palette,
    required void Function(String label) onSliceTap,
  }) => _AnalyticsDonutCard(
        header: _sectionHeader(title, Icons.pie_chart_rounded),
        entries: entries,
        palette: palette,
        onSliceTap: onSliceTap,
      );

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
      final name    = entry.key;
      final amount  = entry.value.abs();
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
              const Icon(Icons.store_mall_directory_rounded, size: 14, color: Colors.teal),
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
              Text('• $displayAmount', style: Fx.label.copyWith(color: Fx.text.withOpacity(.9))),
              const SizedBox(width: 6),
              Text('· ${txCount}x', style: Fx.label),
            ],
          ),
        ),
      ),
    );
  }

  // keep legend colors in sync with DonutChartSimple painter palette
  List<Color> _legendPalette() => const [
    Fx.mintDark,
    Fx.good,
    Fx.warn,
    Fx.bad,
    Colors.indigo,
    Colors.purple,
    Colors.cyan,
    Colors.brown,
  ];

  // ---------- Drill-down helpers (reuse UnifiedTransactionList) ----------
  void _openUnifiedSheet({
    required String title,
    required List<ExpenseItem> exp,
    required List<IncomeItem> inc,
  }) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (_) {
        final h = MediaQuery.of(context).size.height * 0.88;
        return SizedBox(
          height: h,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 6, 4),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        title,
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
                      ),
                    ),
                    IconButton(icon: const Icon(Icons.close), onPressed: () => Navigator.pop(context)),
                  ],
                ),
              ),
              Expanded(
                child: UnifiedTransactionList(
                  expenses: exp,
                  incomes: inc,
                  friendsById: const <String, FriendModel>{},
                  userPhone: widget.userPhone,
                  previewCount: 20,
                  showBillIcon: true,
                ),
              ),
            ],
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
        : srcExp.where((e) => AnalyticsAgg.resolveExpenseCategory(e).toLowerCase() == category.toLowerCase()).toList();

    final inc = isIncome
        ? srcInc.where((i) => AnalyticsAgg.resolveIncomeCategory(i).toLowerCase() == category.toLowerCase()).toList()
        : <IncomeItem>[];

    _openUnifiedSheet(
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

    _openUnifiedSheet(title: 'Merchant • $merchant', exp: matched, inc: const []);
  }

  // ---------- Helpers for sparkline & calendar ----------
  List<double> _sparkForPeriod(Period p, List<ExpenseItem> exp, DateTime now, {CustomRange? custom}) {
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
          exp.where((e) => _sameDayLocal(e.date, y)).fold(0.0, (s, e) => s + e.amount),
          exp.where((e) => _sameDayLocal(e.date, now)).fold(0.0, (s, e) => s + e.amount),
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
            .difference(DateTime(custom.start.year, custom.start.month, custom.start.day))
            .inDays +
            1;
        final n = totalDays.clamp(1, 31);
        final v = List<double>.filled(n, 0);
        for (final e in exp) {
          final d = DateTime(e.date.year, e.date.month, e.date.day)
              .difference(DateTime(custom.start.year, custom.start.month, custom.start.day))
              .inDays;
          if (d >= 0 && d < n) v[d] += e.amount;
        }
        return v;
    }
  }

  double _projectMonthEnd(List<ExpenseItem> exp, List<IncomeItem> inc, DateTime now) {
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
    final projected = (incToDate - expToDate) + netPerDay * (daysInMonth - daysElapsed);
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
}

// ---------- legend pill ----------
Widget _pillWithDot(
  String label, {
  Color? dot,
  bool selected = false,
  VoidCallback? onTap,
}) {
  final bg = selected ? Fx.mintDark.withOpacity(.18) : Fx.mintDark.withOpacity(.12);
  final border = selected ? Fx.mintDark.withOpacity(.45) : Fx.mintDark.withOpacity(.25);
  final textColor = selected ? Fx.mintDark : Fx.text;

  return Material(
    color: Colors.transparent,
    child: InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(999),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: border),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (dot != null) ...[
              Container(width: 8, height: 8, decoration: BoxDecoration(color: dot, shape: BoxShape.circle)),
              const SizedBox(width: 6),
            ],
            Text(
              label,
              style: TextStyle(fontWeight: FontWeight.w600, color: textColor),
            ),
          ],
        ),
      ),
    ),
  );
}

class _AnalyticsDonutCard extends StatefulWidget {
  final Widget header;
  final List<MapEntry<String, double>> entries;
  final List<Color> palette;
  final void Function(String label) onSliceTap;

  const _AnalyticsDonutCard({
    required this.header,
    required this.entries,
    required this.palette,
    required this.onSliceTap,
  });

  @override
  State<_AnalyticsDonutCard> createState() => _AnalyticsDonutCardState();
}

class _AnalyticsDonutCardState extends State<_AnalyticsDonutCard> {
  int? _selected;

  void _handleSliceTap(int index, DonutSlice slice) {
    widget.onSliceTap(slice.label);
    setState(() => _selected = index);
  }

  @override
  Widget build(BuildContext context) {
    final donutData = widget.entries
        .where((e) => e.value.isFinite && e.value != 0)
        .map((e) => DonutSlice(e.key, e.value.abs()))
        .toList();

    if (donutData.isEmpty) {
      return GlassCard(
        radius: Fx.r24,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            widget.header,
            const SizedBox(height: 8),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 6, 12, 14),
              child: Text(
                'No data to chart for this period.',
                style: Fx.label.copyWith(color: Fx.text.withOpacity(.8)),
              ),
            ),
          ],
        ),
      );
    }

    final total = donutData.fold<double>(0, (sum, slice) => sum + slice.value);
    var selectedIndex = _selected;
    if (selectedIndex != null && selectedIndex >= donutData.length) {
      selectedIndex = null;
    }

    final legendItems = <Widget>[];
    for (int i = 0; i < donutData.length && i < 12; i++) {
      final slice = donutData[i];
      final percent = total <= 0 ? 0.0 : (slice.value / total * 100);
      final percentText = percent >= 10 ? percent.toStringAsFixed(0) : percent.toStringAsFixed(1);
      final label = '${slice.label}: ${INR.c(slice.value)} • $percentText%';
      legendItems.add(
        _pillWithDot(
          label,
          dot: widget.palette[i % widget.palette.length],
          selected: selectedIndex == i,
          onTap: () => _handleSliceTap(i, slice),
        ),
      );
    }

    final bars = <Widget>[];
    for (int i = 0; i < donutData.length && i < 6; i++) {
      final slice = donutData[i];
      final percent = total <= 0 ? 0.0 : (slice.value / total);
      bars.add(
        _CategoryBar(
          label: slice.label,
          amount: slice.value,
          color: widget.palette[i % widget.palette.length],
          fraction: percent,
          onTap: () => _handleSliceTap(i, slice),
        ),
      );
    }

    return GlassCard(
      radius: Fx.r24,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          widget.header,
          const SizedBox(height: 8),
          Center(
            child: SizedBox(
              width: 210,
              height: 210,
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final size = math.min(constraints.maxWidth, constraints.maxHeight);
                  final outerRadius = size / 2 - 8;
                  const ringThickness = 22.0;
                  final centerSpace = (outerRadius - ringThickness).clamp(0.0, outerRadius);

                  final sections = <PieChartSectionData>[];
                  for (int i = 0; i < donutData.length; i++) {
                    final slice = donutData[i];
                    final color = widget.palette[i % widget.palette.length];
                    final isSelected = selectedIndex == i;
                    sections.add(
                      PieChartSectionData(
                        value: slice.value,
                        color: color,
                        title: '',
                        radius: outerRadius + (isSelected ? 6 : 0),
                        showTitle: false,
                      ),
                    );
                  }

                  return Stack(
                    alignment: Alignment.center,
                    children: [
                      PieChart(
                        PieChartData(
                          sections: sections,
                          sectionsSpace: 2,
                          startDegreeOffset: -90,
                          centerSpaceRadius: centerSpace,
                          borderData: FlBorderData(show: false),
                          pieTouchData: PieTouchData(
                            touchCallback: (event, response) {
                              if (!event.isInterestedForInteractions || response == null || response.touchedSection == null) {
                                if (_selected != null) {
                                  setState(() => _selected = null);
                                }
                                return;
                              }

                              final index = response.touchedSection!.touchedSectionIndex;
                              if (index == null || index < 0 || index >= donutData.length) {
                                return;
                              }
                              _handleSliceTap(index, donutData[index]);
                            },
                          ),
                        ),
                        swapAnimationDuration: const Duration(milliseconds: 400),
                        swapAnimationCurve: Curves.easeOutCubic,
                      ),
                      Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            INR.c(total),
                            style: Fx.number.copyWith(fontSize: 16),
                          ),
                          Text(
                            'total',
                            style: Fx.label.copyWith(fontSize: 11, color: Fx.text.withOpacity(.70)),
                          ),
                        ],
                      )
                    ],
                  );
                },
              ),
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: legendItems,
          ),
          if (bars.isNotEmpty) ...[
            const SizedBox(height: 14),
            ...bars,
          ],
        ],
      ),
    );
  }
}

class _CategoryBar extends StatelessWidget {
  final String label;
  final double amount;
  final Color color;
  final double fraction;
  final VoidCallback onTap;

  const _CategoryBar({
    required this.label,
    required this.amount,
    required this.color,
    required this.fraction,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final percent = (fraction * 100).clamp(0, 100);
    final percentText = percent >= 10 ? percent.toStringAsFixed(0) : percent.toStringAsFixed(1);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.all(8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        label,
                        style: Fx.label.copyWith(fontWeight: FontWeight.w700),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(INR.c(amount), style: Fx.number.copyWith(color: Fx.text)),
                    const SizedBox(width: 8),
                    Text('$percentText%', style: Fx.label.copyWith(color: Fx.text.withOpacity(.75))),
                  ],
                ),
                const SizedBox(height: 6),
                ClipRRect(
                  borderRadius: BorderRadius.circular(6),
                  child: LinearProgressIndicator(
                    value: fraction.clamp(0, 1),
                    minHeight: 8,
                    backgroundColor: color.withOpacity(.15),
                    valueColor: AlwaysStoppedAnimation<Color>(color),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
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
      if (i == 0) path.moveTo(x, y); else path.lineTo(x, y);
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
            child: Center(child: Text(d, style: Fx.label.copyWith(fontSize: 11))),
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

    final maxVal = amountsByDay.isEmpty
        ? 0.0
        : amountsByDay.values.reduce((a, b) => a > b ? a : b);

    final compact = NumberFormat.compactCurrency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

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
        final isToday = (today.year == month.year && today.month == month.month && today.day == dayNum);

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
