import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/analytics/aggregators.dart';
import '../../group/group_balance_math.dart'
    show computeSplits, pairwiseNetForUser;
import '../../models/expense_item.dart';
import '../../models/friend_model.dart';
import '../../models/group_model.dart';
import '../../settleup_v2/pairwise_math.dart';

class GroupAnalyticsTab extends StatefulWidget {
  const GroupAnalyticsTab({
    super.key,
    required this.expenses,
    required this.currentUserPhone,
    required this.group,
    required this.members,
    required this.memberDisplayNames,
  });

  final List<ExpenseItem> expenses;
  final String currentUserPhone;
  final GroupModel group;
  final List<FriendModel> members;
  final Map<String, String> memberDisplayNames;

  @override
  State<GroupAnalyticsTab> createState() => _GroupAnalyticsTabState();
}

class _GroupAnalyticsTabState extends State<GroupAnalyticsTab> {
  Period _period = Period.month;
  final NumberFormat _currency =
      NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

  static const _periodOptions = [
    Period.month,
    Period.quarter,
    Period.year,
    Period.all,
  ];

  late final Map<String, FriendModel> _memberById = {
    for (final m in widget.members) m.phone: m,
  };

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final range = AnalyticsAgg.rangeFor(_period, now);
    final filtered = AnalyticsAgg.filterExpenses(widget.expenses, range);
    final stats = _GroupAnalyticsStats.compute(
      filtered: filtered,
      currentUser: widget.currentUserPhone,
      groupId: widget.group.id,
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
                  label: Text(
                    _labelFor(option),
                    style: TextStyle(
                      color: _period == option ? Colors.white : Colors.black87,
                      fontWeight:
                          _period == option ? FontWeight.w700 : FontWeight.w600,
                      fontSize: 13,
                    ),
                  ),
                  selected: _period == option,
                  onSelected: (_) => setState(() => _period = option),
                  selectedColor: Colors.black,
                  backgroundColor: Colors.white,
                  showCheckmark: false,
                  shape: StadiumBorder(
                    side: BorderSide(
                      color: _period == option
                          ? Colors.transparent
                          : Colors.grey.shade300,
                    ),
                  ),
                  elevation: _period == option ? 2 : 0,
                  pressElevation: 0,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                ),
            ],
          ),
          const SizedBox(height: 16),
          _summaryCard(stats),
          const SizedBox(height: 16),
          _membersCard(stats),
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

  Widget _summaryCard(_GroupAnalyticsStats stats) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 16,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Group summary',
            style: Theme.of(context)
                .textTheme
                .titleMedium
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 12),
          _metricRow('Total spend', stats.totalSpend, bold: true),
          const SizedBox(height: 10),
          _metricRow('You paid', stats.youPaid),
          const SizedBox(height: 8),
          _metricRow('Your share', stats.yourShare),
          const SizedBox(height: 8),
          _metricRow('Settlements paid', stats.settlementPaid),
          const SizedBox(height: 8),
          _metricRow('Settlements received', stats.settlementReceived),
          const SizedBox(height: 12),
          Text(
            '${stats.transactionCount} transactions in range',
            style: Theme.of(context)
                .textTheme
                .bodySmall
                ?.copyWith(color: Colors.grey.shade600),
          ),
        ],
      ),
    );
  }

  Widget _membersCard(_GroupAnalyticsStats stats) {
    final entries = stats.memberNet.entries
        .where((e) => e.value.abs() > 0.01)
        .toList()
      ..sort((a, b) => b.value.abs().compareTo(a.value.abs()));

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 16,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Member balances',
            style: Theme.of(context)
                .textTheme
                .titleMedium
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 12),
          if (entries.isEmpty)
            Text(
              'Everyone is settled for this range.',
              style: Theme.of(context)
                  .textTheme
                  .bodyMedium
                  ?.copyWith(color: Colors.grey.shade600),
            )
          else
            ...entries.take(5).map((entry) {
              final name = _displayName(entry.key);
              final amount = _currency.format(entry.value.abs());
              final positive = entry.value >= 0;
              final color =
                  positive ? Colors.teal.shade700 : Colors.deepOrange.shade700;
              final text = positive ? 'owes you' : 'you owe';
              return Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        name,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                    ),
                    Text('$text $amount', style: TextStyle(color: color)),
                  ],
                ),
              );
            }),
        ],
      ),
    );
  }

  Widget _categoryCard(_GroupAnalyticsStats stats) {
    final entries = stats.categoryTotals.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    final total = stats.categoryTotals.values.fold<double>(0, (s, v) => s + v);

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 16,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      padding: const EdgeInsets.all(24),
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
            ...entries.take(5).map((entry) {
              final pct =
                  total <= 0 ? 0 : ((entry.value / total) * 100).clamp(0, 100);
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
                    Text(
                        '${pct.toStringAsFixed(0)}% · ${_currency.format(entry.value)}'),
                  ],
                ),
              );
            }),
        ],
      ),
    );
  }

  Widget _metricRow(String label, double value, {bool bold = false}) {
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
                fontWeight: bold ? FontWeight.w700 : FontWeight.w600,
              ),
        ),
      ],
    );
  }

  String _displayName(String phone) {
    if (phone == widget.currentUserPhone) return 'You';
    final friend = _memberById[phone];
    if (friend != null &&
        friend.name.isNotEmpty &&
        friend.name != friend.phone) {
      return friend.name;
    }
    final mapped = widget.memberDisplayNames[phone];
    if (mapped != null && mapped.isNotEmpty) return mapped;
    final digits = phone.replaceAll(RegExp(r'\D'), '');
    if (digits.length < 4) return phone;
    return 'Member (${digits.substring(digits.length - 4)})';
  }
}

class _GroupAnalyticsStats {
  final double totalSpend;
  final double youPaid;
  final double yourShare;
  final double settlementPaid;
  final double settlementReceived;
  final int transactionCount;
  final Map<String, double> categoryTotals;
  final Map<String, double> memberNet;

  const _GroupAnalyticsStats({
    required this.totalSpend,
    required this.youPaid,
    required this.yourShare,
    required this.settlementPaid,
    required this.settlementReceived,
    required this.transactionCount,
    required this.categoryTotals,
    required this.memberNet,
  });

  factory _GroupAnalyticsStats.compute({
    required List<ExpenseItem> filtered,
    required String currentUser,
    required String groupId,
  }) {
    double totalSpend = 0;
    double youPaid = 0;
    double yourShare = 0;
    double settlementPaid = 0;
    double settlementReceived = 0;
    final normalExpenses = <ExpenseItem>[];

    for (final e in filtered) {
      final settlement = isSettlementLike(e);
      if (settlement) {
        if (e.payerId == currentUser) {
          settlementPaid += e.amount;
        } else if (e.friendIds.contains(currentUser)) {
          settlementReceived += e.amount / e.friendIds.length;
        }
        continue;
      }
      normalExpenses.add(e);
      totalSpend += e.amount;
      if (e.payerId == currentUser) {
        youPaid += e.amount;
      }
      final splits = computeSplits(e);
      yourShare += splits[currentUser] ?? 0.0;
    }

    final categoryTotals = AnalyticsAgg.byExpenseCategorySmart(normalExpenses);
    final memberNet =
        pairwiseNetForUser(filtered, currentUser, onlyGroupId: groupId);

    return _GroupAnalyticsStats(
      totalSpend: totalSpend,
      youPaid: youPaid,
      yourShare: yourShare,
      settlementPaid: settlementPaid,
      settlementReceived: settlementReceived,
      transactionCount: filtered.length,
      categoryTotals: categoryTotals,
      memberNet: memberNet,
    );
  }
}
