import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/analytics/aggregators.dart';
import '../../group/group_balance_math.dart' show computeSplits;
import '../../models/expense_item.dart';
import '../../models/friend_model.dart';
import '../../settleup_v2/pairwise_math.dart';

class FriendAnalyticsTab extends StatefulWidget {
  const FriendAnalyticsTab({
    super.key,
    required this.expenses,
    required this.currentUserPhone,
    required this.friend,
  });

  final List<ExpenseItem> expenses;
  final String currentUserPhone;
  final FriendModel friend;

  @override
  State<FriendAnalyticsTab> createState() => _FriendAnalyticsTabState();
}

class _FriendAnalyticsTabState extends State<FriendAnalyticsTab> {
  Period _period = Period.month;
  final NumberFormat _currency =
      NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

  static const _periodOptions = [
    Period.month,
    Period.quarter,
    Period.year,
    Period.all,
  ];

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final range = AnalyticsAgg.rangeFor(_period, now);
    final filtered = AnalyticsAgg.filterExpenses(widget.expenses, range);
    final stats = _FriendAnalyticsStats.compute(
      filtered: filtered,
      currentUser: widget.currentUserPhone,
      friendId: widget.friend.phone,
    );

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final option in _periodOptions)
                ChoiceChip(
                  label: Text(_labelFor(option)),
                  selected: _period == option,
                  onSelected: (_) => setState(() => _period = option),
                ),
            ],
          ),
          const SizedBox(height: 16),
          _summaryCard(stats),
          const SizedBox(height: 16),
          _categoryCard(stats),
        ],
      ),
    );
  }

  String _labelFor(Period p) {
    switch (p) {
      case Period.month:
        return 'This month';
      case Period.quarter:
        return 'Quarter';
      case Period.year:
        return 'Year';
      case Period.all:
        return 'All time';
      default:
        return p.name;
    }
  }

  Widget _summaryCard(_FriendAnalyticsStats stats) {
    String netLabel;
    Color? netColor;
    if (stats.totals.net > 0.01) {
      netLabel = 'You get back ${_currency.format(stats.totals.net)}';
      netColor = Colors.teal.shade700;
    } else if (stats.totals.net < -0.01) {
      netLabel = 'You owe ${_currency.format(stats.totals.net.abs())}';
      netColor = Colors.deepOrange.shade700;
    } else {
      netLabel = 'All settled';
      netColor = Colors.grey.shade700;
    }

    return Card(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      elevation: 3,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 18, 16, 18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Summary',
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 12),
            _metricRow('Total shared', stats.totalShared, highlight: true),
            const SizedBox(height: 10),
            _metricRow('You paid', stats.youPaid),
            const SizedBox(height: 8),
            _metricRow('${widget.friend.name} paid', stats.friendPaid),
            const SizedBox(height: 8),
            _metricRow('Your share', stats.yourShare),
            const SizedBox(height: 8),
            _metricRow('${widget.friend.name} share', stats.friendShare),
            const SizedBox(height: 12),
            Divider(color: Colors.grey.shade300),
            const SizedBox(height: 12),
            Text(netLabel, style: TextStyle(color: netColor, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Text(
              'Settlements · You paid ${_currency.format(stats.settlementPaidByYou)} · '
              'You received ${_currency.format(stats.settlementPaidByFriend)}',
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: Colors.grey.shade700),
            ),
            const SizedBox(height: 8),
            Text(
              '${stats.transactionCount} transactions in range',
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: Colors.grey.shade600),
            ),
          ],
        ),
      ),
    );
  }

  Widget _categoryCard(_FriendAnalyticsStats stats) {
    final entries = stats.categoryTotals.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    final total = stats.categoryTotals.values.fold<double>(0, (s, v) => s + v);

    return Card(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      elevation: 3,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 18, 16, 18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Top categories',
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 12),
            if (entries.isEmpty)
              Text(
                'No spends recorded in this range.',
                style: Theme.of(context)
                    .textTheme
                    .bodyMedium
                    ?.copyWith(color: Colors.grey.shade600),
              )
            else
              ...entries.take(4).map((entry) {
                final pct = total <= 0
                    ? 0
                    : ((entry.value / total) * 100).clamp(0, 100);
                return Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          entry.key,
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                      ),
                      Text('${pct.toStringAsFixed(0)}% · ${_currency.format(entry.value)}'),
                    ],
                  ),
                );
              }),
          ],
        ),
      ),
    );
  }

  Widget _metricRow(String label, double value, {bool highlight = false}) {
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: Theme.of(context)
                .textTheme
                .bodyMedium
                ?.copyWith(color: Colors.grey.shade700),
          ),
        ),
        Text(
          _currency.format(value),
          style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                fontWeight: highlight ? FontWeight.w700 : FontWeight.w600,
              ),
        ),
      ],
    );
  }
}

class _FriendAnalyticsStats {
  final PairwiseTotals totals;
  final double youPaid;
  final double friendPaid;
  final double yourShare;
  final double friendShare;
  final double totalShared;
  final double settlementPaidByYou;
  final double settlementPaidByFriend;
  final int transactionCount;
  final Map<String, double> categoryTotals;

  const _FriendAnalyticsStats({
    required this.totals,
    required this.youPaid,
    required this.friendPaid,
    required this.yourShare,
    required this.friendShare,
    required this.totalShared,
    required this.settlementPaidByYou,
    required this.settlementPaidByFriend,
    required this.transactionCount,
    required this.categoryTotals,
  });

  factory _FriendAnalyticsStats.compute({
    required List<ExpenseItem> filtered,
    required String currentUser,
    required String friendId,
  }) {
    final breakdown = computePairwiseBreakdown(currentUser, friendId, filtered);
    double youPaid = 0;
    double friendPaid = 0;
    double yourShare = 0;
    double friendShare = 0;
    double settlementPaidByYou = 0;
    double settlementPaidByFriend = 0;
    final normalExpenses = <ExpenseItem>[];

    for (final e in filtered) {
      final settlement = isSettlementLike(e);
      if (settlement) {
        if (e.payerId == currentUser) {
          settlementPaidByYou += e.amount;
        } else if (e.payerId == friendId) {
          settlementPaidByFriend += e.amount;
        }
        continue;
      }
      normalExpenses.add(e);
      if (e.payerId == currentUser) {
        youPaid += e.amount;
      } else if (e.payerId == friendId) {
        friendPaid += e.amount;
      }
      final splits = computeSplits(e);
      yourShare += splits[currentUser] ?? 0.0;
      friendShare += splits[friendId] ?? 0.0;
    }

    final totalShared = yourShare + friendShare;
    final categories = AnalyticsAgg.byExpenseCategorySmart(normalExpenses);

    return _FriendAnalyticsStats(
      totals: breakdown.totals,
      youPaid: youPaid,
      friendPaid: friendPaid,
      yourShare: yourShare,
      friendShare: friendShare,
      totalShared: totalShared,
      settlementPaidByYou: settlementPaidByYou,
      settlementPaidByFriend: settlementPaidByFriend,
      transactionCount: filtered.length,
      categoryTotals: categories,
    );
  }
}
