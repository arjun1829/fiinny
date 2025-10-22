// lib/screens/analytics_screen.dart
import 'package:flutter/material.dart';

import '../core/analytics/aggregators.dart';
import '../core/flags/premium_gate.dart';
import '../core/formatters/inr.dart';
import '../models/expense_item.dart';
import '../models/income_item.dart';
import '../services/expense_service.dart';
import '../services/income_service.dart';
import '../themes/glass_card.dart';
import '../themes/tokens.dart';
import '../widgets/charts/bar_chart_simple.dart';
import '../widgets/charts/donut_chart_simple.dart';
import '../widgets/premium/premium_chip.dart';

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

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final r = AnalyticsAgg.rangeFor(_period, now);
    final exp = AnalyticsAgg.filterExpenses(_allExp, r);
    final inc = AnalyticsAgg.filterIncomes(_allInc, r);

    final totalExp = AnalyticsAgg.sumAmount(exp, (e) => e.amount);
    final totalInc = AnalyticsAgg.sumAmount(inc, (i) => i.amount);
    final savings = totalInc - totalExp;
    final rate = totalInc > 0 ? (savings / totalInc) : 0.0;

    final seriesKey = '$_rev|$_period|series';
    final series = _seriesCache[seriesKey] ??=
        AnalyticsAgg.amountSeries(_period, exp, inc, now);

    final catKey = '$_rev|$_period|cat';
    final byCat = _rollCache[catKey] ??= AnalyticsAgg.byCategory(exp);

    final merchKey = '$_rev|$_period|merch';
    final byMerch = _rollCache[merchKey] ??= AnalyticsAgg.byMerchant(exp);

    final catSlices = byCat.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    final userId = widget.userPhone;

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
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                    children: [
                      Row(
                        children: [
                          Expanded(child: _periodChips()),
                          const SizedBox(width: 10),
                          FutureBuilder<bool>(
                            future: PremiumGate.instance.isPremium(userId),
                            builder: (_, snap) {
                              final isPro = snap.data == true;
                              if (isPro) return const SizedBox.shrink();
                              return PremiumChip(
                                onTap: () => Navigator.pushNamed(
                                  context,
                                  '/premium',
                                  arguments: userId,
                                ),
                              );
                            },
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      _kpiRow(totalInc, totalExp, savings, rate),
                      const SizedBox(height: 14),
                      GlassCard(
                        radius: Fx.r24,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _sectionHeader('Spending + Income',
                                Icons.stacked_line_chart_rounded),
                            BarChartSimple(data: series),
                          ],
                        ),
                      ),
                      const SizedBox(height: 14),
                      FutureBuilder<bool>(
                        future: PremiumGate.instance.isPremium(userId),
                        builder: (_, snap) {
                          final isPro = snap.data == true;
                          final sliceLimit = isPro ? 10 : 6;
                          final legendLimit = isPro ? 12 : 6;
                          final donutData = catSlices
                              .take(sliceLimit)
                              .map((e) => DonutSlice(e.key, e.value))
                              .toList();
                          final legendItems = catSlices
                              .take(legendLimit)
                              .map((e) => _pill('${e.key}: ${INR.c(e.value)}'))
                              .toList();
                          return GlassCard(
                            radius: Fx.r24,
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                _sectionHeader(
                                    'Expense by Category', Icons.pie_chart_rounded),
                                const SizedBox(height: 8),
                                Align(
                                  alignment: Alignment.center,
                                  child: DonutChartSimple(data: donutData, size: 180),
                                ),
                                const SizedBox(height: 8),
                                Wrap(
                                  spacing: 8,
                                  runSpacing: 8,
                                  children: legendItems,
                                ),
                              ],
                            ),
                          );
                        },
                      ),
                      const SizedBox(height: 14),
                      GlassCard(
                        radius: Fx.r24,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _sectionHeader(
                                'Top Merchants', Icons.store_rounded),
                            const SizedBox(height: 8),
                            ..._topMerchants(byMerch),
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

  Widget _periodChips() {
    final items = <(String, Period)>[
      ('D', Period.day),
      ('W', Period.week),
      ('M', Period.month),
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
          onTap: () => setState(() => _period = t.$2),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: sel ? Fx.mintDark.withOpacity(.12) : Colors.white,
              borderRadius: BorderRadius.circular(999),
              border: Border.all(
                color:
                    sel ? Fx.mintDark.withOpacity(.35) : Colors.grey.shade200,
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

  Widget _kpiRow(double inc, double exp, double sav, double rate) {
    final ratePct = rate.isFinite ? (rate * 100).toStringAsFixed(0) : '0';
    final rateLabel = '${ratePct}% of income';
    return Row(
      children: [
        Expanded(
          child: _kpi('Income', INR.f(inc), Icons.call_received_rounded,
              Fx.good),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _kpi('Expense', INR.f(exp), Icons.call_made_rounded, Fx.bad),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _kpi('Savings', INR.f(sav), Icons.savings_rounded,
              sav >= 0 ? Fx.good : Fx.bad,
              footnote: inc > 0 ? rateLabel : null),
        ),
      ],
    );
  }

  Widget _kpi(String title, String value, IconData icon, Color color,
      {String? footnote}) {
    return GlassCard(
      radius: Fx.r24,
      child: Row(
        children: [
          Icon(icon, color: color),
          const SizedBox(width: Fx.s8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: Fx.label),
                Text(value, style: Fx.number.copyWith(color: color)),
                if (footnote != null)
                  Text(
                    footnote,
                    style: Fx.label.copyWith(fontSize: 12, color: Fx.text),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _sectionHeader(String title, IconData icon) {
    return Row(
      children: [
        Icon(icon, color: Fx.mintDark),
        const SizedBox(width: Fx.s8),
        Text(title, style: Fx.title),
      ],
    );
  }

  List<Widget> _topMerchants(Map<String, double> byMerch) {
    final items = byMerch.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    final top = items.take(8).toList();

    if (top.isEmpty) {
      return [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Text('No merchants to show for this period.', style: Fx.label),
        )
      ];
    }

    return top
        .map(
          (e) => ListTile(
            dense: true,
            contentPadding: const EdgeInsets.symmetric(horizontal: 8),
            leading: const Icon(Icons.store_rounded, color: Fx.mintDark),
            title: Text(e.key, maxLines: 1, overflow: TextOverflow.ellipsis),
            trailing:
                Text(INR.f(e.value), style: Fx.label.copyWith(fontWeight: FontWeight.w800)),
            onTap: () {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('Filter by "${e.key}" coming soon')),
              );
            },
          ),
        )
        .toList();
  }
}

Widget _pill(String label) {
  return Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
    decoration: BoxDecoration(
      color: Fx.mintDark.withOpacity(.12),
      borderRadius: BorderRadius.circular(999),
      border: Border.all(color: Fx.mintDark.withOpacity(.25)),
    ),
    child: Text(
      label,
      style: const TextStyle(fontWeight: FontWeight.w600),
    ),
  );
}
