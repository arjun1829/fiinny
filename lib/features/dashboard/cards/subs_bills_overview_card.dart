import 'package:flutter/material.dart';
import 'package:lifemap/details/models/shared_item.dart';
import '../../../services/subscriptions/subscriptions_service.dart';

class SubsBillsOverviewCard extends StatelessWidget {
  final Stream<List<SharedItem>>? source;
  final VoidCallback onOpen; // Navigator to '/subsBills'

  const SubsBillsOverviewCard({
    Key? key,
    required this.onOpen,
    this.source,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final svc = SubscriptionsService();
    return StreamBuilder<List<SharedItem>>(
      stream: source ?? svc.safeEmptyStream,
      builder: (_, snap) {
        final items = snap.data ?? const <SharedItem>[];
        final k = svc.computeKpis(items);
        final dueSoon = svc.countDueWithin(items, days: 7);
        return InkWell(
          onTap: onOpen,
          borderRadius: BorderRadius.circular(14),
          child: Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Colors.black12),
              boxShadow: const [BoxShadow(color: Color(0x14000000), blurRadius: 10, offset: Offset(0, 4))],
            ),
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                const Icon(Icons.receipt_long_outlined),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Text('Subscriptions & Bills', style: TextStyle(fontWeight: FontWeight.w900)),
                    const SizedBox(height: 2),
                    Text('$dueSoon due this week • ₹${k.monthTotal.toStringAsFixed(0)} this month',
                        style: const TextStyle(color: Colors.black54)),
                  ]),
                ),
                const Icon(Icons.chevron_right),
              ],
            ),
          ),
        );
      },
    );
  }
}
