import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:google_fonts/google_fonts.dart';

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
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final option in _periodOptions)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(
                        _labelFor(option),
                        style: GoogleFonts.inter(
                          color:
                              _period == option ? Colors.white : Colors.black87,
                          fontWeight: _period == option
                              ? FontWeight.w600
                              : FontWeight.w500,
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
                              : Colors.grey.shade200,
                        ),
                      ),
                      elevation: _period == option ? 4 : 0,
                      shadowColor: Colors.black.withOpacity(0.2),
                      pressElevation: 0,
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 8),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          _summaryCard(stats),
          const SizedBox(height: 20),
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

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
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
            'Summary',
            style: GoogleFonts.inter(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: Colors.black87,
            ),
          ),
          const SizedBox(height: 20),
          _metricRow('Total shared', stats.totalShared, highlight: true),
          const SizedBox(height: 12),
          _metricRow('You paid', stats.youPaid),
          const SizedBox(height: 8),
          _metricRow('${widget.friend.name} paid', stats.friendPaid),
          const SizedBox(height: 8),
          _metricRow('Your share', stats.yourShare),
          const SizedBox(height: 8),
          _metricRow('${widget.friend.name} share', stats.friendShare),
          const SizedBox(height: 20),
          Divider(color: Colors.grey.shade100, height: 1),
          const SizedBox(height: 20),
          Text(netLabel,
              style: GoogleFonts.inter(
                  color: netColor, fontWeight: FontWeight.w700, fontSize: 16)),
          const SizedBox(height: 12),
          Text(
            'Settlements: You paid ${_currency.format(stats.settlementPaidByYou)} · '
            'Received ${_currency.format(stats.settlementPaidByFriend)}',
            style: GoogleFonts.inter(
              color: Colors.grey.shade500,
              fontSize: 12,
              height: 1.5,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '${stats.transactionCount} transactions in range',
            style: GoogleFonts.inter(
              color: Colors.grey.shade400,
              fontSize: 11,
            ),
          ),
        ],
      ),
    );
  }

  Widget _categoryCard(_FriendAnalyticsStats stats) {
    final entries = stats.categoryTotals.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    final total = stats.categoryTotals.values.fold<double>(0, (s, v) => s + v);

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
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
            'Top Spend Categories',
            style: GoogleFonts.inter(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: Colors.black87,
            ),
          ),
          const SizedBox(height: 20),
          if (entries.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 20),
              child: Center(
                child: Text(
                  'No spends recorded in this range.',
                  style: GoogleFonts.inter(
                    color: Colors.grey.shade400,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            )
          else
            ...entries.take(4).map((entry) {
              final pct =
                  total <= 0 ? 0 : ((entry.value / total) * 100).clamp(0, 100);
              return Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Column(
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            entry.key,
                            style: GoogleFonts.inter(
                              fontWeight: FontWeight.w600,
                              color: Colors.grey.shade800,
                            ),
                          ),
                        ),
                        Text(
                          _currency.format(entry.value),
                          style: GoogleFonts.inter(
                            fontWeight: FontWeight.w600,
                            color: Colors.black87,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Expanded(
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(4),
                            child: LinearProgressIndicator(
                              value: pct / 100,
                              minHeight: 6,
                              backgroundColor: Colors.grey.shade100,
                              color: Colors.teal.shade400,
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Text(
                          '${pct.toStringAsFixed(0)}%',
                          style: GoogleFonts.inter(
                            fontSize: 12,
                            color: Colors.grey.shade500,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              );
            }),
        ],
      ),
    );
  }

  Widget _metricRow(String label, double value, {bool highlight = false}) {
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: GoogleFonts.inter(
              color: Colors.grey.shade600,
              fontSize: 14,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
        Text(
          _currency.format(value),
          style: GoogleFonts.inter(
            fontSize: highlight ? 18 : 14,
            fontWeight: highlight ? FontWeight.w700 : FontWeight.w600,
            color: highlight ? Colors.black87 : Colors.grey.shade800,
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
