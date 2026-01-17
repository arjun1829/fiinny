import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../models/credit_card_cycle.dart';

import '../../services/credit_card_service.dart';

class CreditCardsSummaryCard extends StatefulWidget {
  const CreditCardsSummaryCard({
    super.key,
    required this.userId,
    this.onOpen,
  });

  final String userId;
  final VoidCallback? onOpen;

  @override
  State<CreditCardsSummaryCard> createState() => _CreditCardsSummaryCardState();
}

class _CreditCardsSummaryCardState extends State<CreditCardsSummaryCard> {
  final CreditCardService _svc = CreditCardService();
  late Future<_Summary> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<_Summary> _load() async {
    final cards = await _svc.getUserCards(widget.userId);
    final futures = cards
        .map((card) => _svc.getLatestCycle(widget.userId, card.id))
        .toList();
    final cycles = await Future.wait(futures);

    final now = DateTime.now();
    int overdue = 0;
    int dueToday = 0;
    int dueSoon = 0;
    double totalDue = 0;

    for (var i = 0; i < cards.length; i++) {
      final CreditCardCycle? cyc = cycles[i];
      if (cyc == null) continue;

      final remaining = math.max(0, cyc.totalDue - cyc.paidAmount);
      if (remaining <= 0.01) {
        continue;
      }

      totalDue += remaining;

      if (now.isAfter(cyc.dueDate)) {
        overdue++;
      } else {
        final days = cyc.dueDate.difference(now).inDays;
        if (days <= 0) {
          dueToday++;
        } else if (days <= 7) {
          dueSoon++;
        }
      }
    }

    return _Summary(
      totalCards: cards.length,
      totalDue: totalDue,
      overdue: overdue,
      dueToday: dueToday,
      dueSoon: dueSoon,
    );
  }

  @override
  Widget build(BuildContext context) {
    final inr = NumberFormat.compactCurrency(
      locale: 'en_IN',
      symbol: '₹',
    );

    return FutureBuilder<_Summary>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return _shell();
        }
        final summary = snapshot.data ?? const _Summary();
        return Card(
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: BorderSide(color: Colors.grey.shade300),
          ),
          margin: const EdgeInsets.fromLTRB(16, 10, 16, 0),
          child: InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: widget.onOpen,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.credit_card, size: 22),
                      const SizedBox(width: 8),
                      const Text(
                        'Credit Cards',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const Spacer(),
                      if (widget.onOpen != null)
                        const Icon(Icons.chevron_right, size: 22),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        inr.format(summary.totalDue),
                        style: const TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(width: 8),
                      const Text(
                        'total due',
                        style: TextStyle(color: Colors.grey),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      _chip(
                        Icons.warning_amber_rounded,
                        'Overdue',
                        summary.overdue,
                        color: Colors.red,
                      ),
                      _chip(
                        Icons.today,
                        'Due today',
                        summary.dueToday,
                        color: Colors.orange,
                      ),
                      _chip(
                        Icons.schedule,
                        '≤ 7 days',
                        summary.dueSoon,
                        color: Colors.blue,
                      ),
                      _chip(
                        Icons.layers,
                        'Cards',
                        summary.totalCards,
                        color: Colors.grey,
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _shell() {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: Colors.grey.shade300),
      ),
      margin: const EdgeInsets.fromLTRB(16, 10, 16, 0),
      child: const Padding(
        padding: EdgeInsets.all(16),
        child: SizedBox(
          height: 72,
          child: Center(child: CircularProgressIndicator()),
        ),
      ),
    );
  }

  Widget _chip(IconData icon, String label, int value, {Color? color}) {
    final chipColor = color ?? Colors.teal;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: chipColor.withValues(alpha: .1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: chipColor.withValues(alpha: .3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: chipColor),
          const SizedBox(width: 6),
          Text(
            '$label: $value',
            style: TextStyle(fontSize: 12, color: chipColor),
          ),
        ],
      ),
    );
  }
}

class _Summary {
  const _Summary({
    this.totalCards = 0,
    this.totalDue = 0,
    this.overdue = 0,
    this.dueToday = 0,
    this.dueSoon = 0,
  });

  final int totalCards;
  final double totalDue;
  final int overdue;
  final int dueToday;
  final int dueSoon;
}
