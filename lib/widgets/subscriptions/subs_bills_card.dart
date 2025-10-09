// lib/widgets/subscriptions/subs_bills_card.dart
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

class SubsBillsCard extends StatelessWidget {
  final String userPhone;
  final int? activeCount;
  final int? overdueCount;
  final double? monthTotal;
  final DateTime? nextDue;

  /// Called when the card is tapped (e.g., navigate to global screen)
  final VoidCallback? onOpen;

  /// Called when the + button is tapped (e.g., open add flow)
  final VoidCallback? onAdd;

  const SubsBillsCard({
    Key? key,
    required this.userPhone,
    this.activeCount,
    this.overdueCount,
    this.monthTotal,
    this.nextDue,
    this.onOpen,
    this.onAdd,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final df = DateFormat('d MMM');
    final nextDueStr = nextDue == null ? '--' : df.format(nextDue!);
    final totalStr = monthTotal == null ? '--' : '₹${monthTotal!.toStringAsFixed(0)}';
    final activeStr = activeCount?.toString() ?? '--';
    final overdueStr = overdueCount?.toString() ?? '0';

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onOpen,
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.grey.shade200),
            boxShadow: const [
              BoxShadow(
                color: Color(0x14000000),
                blurRadius: 16,
                offset: Offset(0, 8),
              ),
            ],
          ),
          child: Row(
            children: [
              Container(
                height: 44,
                width: 44,
                decoration: BoxDecoration(
                  color: Colors.teal.withOpacity(.10),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.receipt_long, color: Colors.teal),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Subscriptions & Bills',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w900,
                        )),
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 8,
                      runSpacing: 6,
                      children: [
                        _chip('Active', activeStr),
                        _chip('Overdue', overdueStr),
                        _chip('This month', totalStr),
                        _chip('Next due', nextDueStr),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                tooltip: 'Add',
                onPressed: onAdd,
                icon: const Icon(Icons.add_circle_outline),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _chip(String label, String value) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.grey.shade100,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Text('$label: ',
            style: TextStyle(
              color: Colors.grey.shade800,
              fontWeight: FontWeight.w700,
              fontSize: 12,
            )),
        Text(
          value,
          style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 12),
        ),
      ]),
    );
  }
}
