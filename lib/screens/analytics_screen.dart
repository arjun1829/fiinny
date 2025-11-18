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

class _MonthSpend {
  final int year;
  final int month;
  final double totalExpense;

  const _MonthSpend(this.year, this.month, this.totalExpense);
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

  // Universe of main expense categories used for insights.
  // These should stay in sync with our categorisation logic.
  static const List<String> _kMainExpenseCategories = <String>[
    'Fund Transfers',
    'Payments',
    'Shopping',
    'Travel',
    'Food',
    'Entertainment',
    'Others',
    'Healthcare',
    'Education',
    'Investments',
  ];

  List<ExpenseItem> _allExp = [];
  List<IncomeItem> _allInc = [];
  Period _period = Period.month;
  String _periodToken = 'M';
  DateTimeRange? _range;

  // NEW: window for "Last X months spends" card (only for that card)
  String _spendWindow = '1Y';

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
    DateTimeRange? overrideRange,
  }) async {
    final range = overrideRange ?? _rangeOrDefault();
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
                                            AnalyticsAgg.resolveExpenseCategory(e) ==
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
          if (expense && hasData) ...[
            const SizedBox(height: 12),
            _categoryInsightsFooter(),
          ],
        ],
      ),
    );
  }

  Widget _categoryInsightsFooter() {
    final insights = _buildCategoryInsightsForCurrentRange();

    // Nothing to show if we have no categories at all.
    if (insights.highestCategory == null &&
        insights.lowestCategory == null &&
        insights.zeroCategories.isEmpty) {
      return const SizedBox.shrink();
    }

    final children = <Widget>[];

    if (insights.highestCategory != null && insights.highestAmount > 0) {
      children.add(
        _categoryInsightTile(
          label: 'Highest spend',
          description:
              'You’ve spent highest on ${insights.highestCategory} in this period.',
          amount: insights.highestAmount,
          accentColor: Fx.bad, // red-ish accent
        ),
      );
    }

    if (insights.lowestCategory != null &&
        insights.lowestAmount > 0 &&
        insights.lowestCategory != insights.highestCategory) {
      if (children.isNotEmpty) {
        children.add(const SizedBox(height: 8));
      }
      children.add(
        _categoryInsightTile(
          label: 'Lowest spend',
          description:
              'You’ve spent lowest on ${insights.lowestCategory} in this period.',
          amount: insights.lowestAmount,
          accentColor: Fx.good, // green-ish accent
        ),
      );
    }

    if (insights.zeroCategories.isNotEmpty) {
      if (children.isNotEmpty) {
        children.add(const SizedBox(height: 10));
      }
      children.add(
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Zero spends in this period',
              style: Fx.label.copyWith(
                fontWeight: FontWeight.w600,
                color: Fx.text.withOpacity(.85),
              ),
            ),
            const SizedBox(height: 6),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: insights.zeroCategories.map((cat) {
                return Chip(
                  label: Text(
                    cat,
                    style: Fx.label.copyWith(fontSize: 12),
                  ),
                  backgroundColor: Fx.mintDark.withOpacity(.06),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 0),
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                );
              }).toList(),
            ),
          ],
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: children,
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
      decoration: BoxDecoration(
        color: accentColor.withOpacity(.06),
        borderRadius: BorderRadius.circular(14),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label.toUpperCase(),
            style: Fx.label.copyWith(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: accentColor,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            description,
            style: Fx.label.copyWith(
              color: Fx.text.withOpacity(.9),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            compact.format(amount),
            style: Fx.number.copyWith(
              fontWeight: FontWeight.w700,
              color: Fx.text,
            ),
          ),
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
        final String l4 = '';
        if (l4.isEmpty || !l4.endsWith(_last4Filter!)) {
          return false;
        }
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

  /// Computes highest, lowest and zero-spend categories for the current
  /// date range + bank/card filters, based on sumExpenseByCategory().
  _CategoryInsights _buildCategoryInsightsForCurrentRange() {
    final byCat = sumExpenseByCategory();

    if (byCat.isEmpty) {
      // No data at all for this window: highest/lowest are null,
      // all known categories count as zero.
      return _CategoryInsights(
        highestCategory: null,
        highestAmount: 0,
        lowestCategory: null,
        lowestAmount: 0,
        zeroCategories: List<String>.from(_kMainExpenseCategories),
      );
    }

    String? highestCat;
    double highestVal = 0;

    String? lowestCat;
    double lowestVal = 0;
    bool first = true;

    byCat.forEach((cat, amount) {
      final value = amount.abs();

      // Highest
      if (highestCat == null || value > highestVal) {
        highestCat = cat;
        highestVal = value;
      }

      // Lowest (among non-zero)
      if (first) {
        lowestCat = cat;
        lowestVal = value;
        first = false;
      } else if (value < lowestVal) {
        lowestCat = cat;
        lowestVal = value;
      }
    });

    // Zero-spend categories = ones from our universe that are missing or 0
    final List<String> zero = <String>[];
    for (final cat in _kMainExpenseCategories) {
      final v = byCat[cat];
      if (v == null || v == 0) {
        zero.add(cat);
      }
    }

    return _CategoryInsights(
      highestCategory: highestCat,
      highestAmount: highestVal,
      lowestCategory: lowestCat,
      lowestAmount: lowestVal,
      zeroCategories: zero,
    );
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
          final cat = AnalyticsAgg.resolveExpenseCategory(e);
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
      if (AnalyticsAgg.resolveExpenseCategory(e) != category) return false;
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

    // Robust category rollups (smart resolvers)
    final merchKey = [
      'merch',
      _rev,
      _aggRev,
      _period,
      _custom?.start.millisecondsSinceEpoch,
      _custom?.end.millisecondsSinceEpoch,
      _bankFilter,
      _last4Filter,
      _instrumentFilter,
    ].join('|');
    final byMerch = hasTransactions
        ? (_rollCache[merchKey] ??= AnalyticsAgg.byMerchant(exp))
        : <String, double>{};

    // Sparkline series reacts to the current filter/period
    final spark = _sparkForPeriod(_period, exp, now, custom: _custom);
    final sparkLabels =
        _sparkLabelsForPeriod(_period, spark, now, custom: _custom);

    // Calendar heatmap uses current month overview (tap -> set custom day)
    final usingUnfilteredCalendarSource =
        _bankFilter == null && _last4Filter == null;
    final calData = _cachedMonthExpenseMap(
      usingUnfilteredCalendarSource ? _allExp : exp,
      now,
      usesUnfilteredSource: usingUnfilteredCalendarSource,
    );

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

    // Prepare chart data
    final List<SeriesPoint> points = [
      for (int i = 0; i < buckets.length; i++)
        SeriesPoint(labels[i], buckets[i].totalExpense),
    ];

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

      return SizedBox(
        height: 200,
        child: BarChartSimple(
          data: points,
          showGrid: true,
          yTickCount: 4,
          targetXTicks: monthCount == 12 ? 6 : monthCount,
          showValues: false,
        ),
      );
    }

    return GlassCard(
      radius: Fx.r24,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header row: title + window chips
          Row(
            children: [
              Expanded(
                child: Row(
                  children: [
                    const Icon(Icons.show_chart_rounded, color: Colors.teal),
                    const SizedBox(width: Fx.s8),
                    Text(
                      'Your spends – last $monthCount months',
                      style: Fx.title.copyWith(fontSize: 18),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
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
          ],
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

  Map<int, double> _cachedMonthExpenseMap(
    List<ExpenseItem> all,
    DateTime now, {
    required bool usesUnfilteredSource,
  }) {
    final cacheKey = [
      'monthExpenseMap',
      _aggRev,
      _rev,
      now.year,
      now.month,
      _bankFilter,
      _last4Filter,
      _instrumentFilter,
      usesUnfilteredSource,
      all.length,
    ].join('|');

    final cached = _heavyAggCache[cacheKey];
    if (cached is Map<int, double>) return cached;

    final map = _monthExpenseMap(all, now);
    _heavyAggCache[cacheKey] = map;
    return map;
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
