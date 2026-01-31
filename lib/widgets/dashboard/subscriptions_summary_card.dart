import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../services/subscription_service.dart';
import '../../brain/cadence_detector.dart'; // For RecurringItem
import '../../themes/tokens.dart';
import '../../themes/glass_card.dart';

class SubscriptionsSummaryCard extends StatelessWidget {
  final String userId;
  const SubscriptionsSummaryCard({super.key, required this.userId});

  static final _inr =
      NumberFormat.simpleCurrency(locale: 'en_IN', decimalDigits: 0);

  @override
  Widget build(BuildContext context) {
    final service = Provider.of<SubscriptionService>(context, listen: false);

    return StreamBuilder<List<RecurringItem>>(
      stream: service.streamSuggestions(userId),
      builder: (context, snapshot) {
        if (!snapshot.hasData || snapshot.data!.isEmpty) {
          // Empty state: Show nothing or a "Scan" prompt?
          // For dashboard, maybe show nothing until we detect something.
          // Or show a "Start Tracking Subscriptions" card.
          return const SizedBox.shrink(); // Hide if empty
        }

        final items = snapshot.data!;
        // Sort by next due
        items.sort((a, b) => a.nextDueDate.compareTo(b.nextDueDate));

        final nextUp = items.first;
        final totalMonthly = items.fold(0.0, (sum, i) => sum + i.monthlyAmount);

        return GlassCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                Icon(Icons.subscriptions_rounded, color: Fx.mintDark, size: 20),
                const SizedBox(width: 8),
                Text('Subscriptions', style: Fx.title),
                const Spacer(),
                Text('${_inr.format(totalMonthly)}/mo', style: Fx.label),
              ]),
              const SizedBox(height: 12),

              // Next payment highlight
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Fx.bg.withValues(alpha: 0.5),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: Fx.mintDark.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Icon(_iconFor(nextUp.type),
                          color: Fx.mintDark, size: 20),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Upcoming: ${nextUp.name}',
                              style: Fx.label.copyWith(color: Fx.textStrong)),
                          Text(
                            'Due ${_fmtDate(nextUp.nextDueDate)}',
                            style: Fx.label.copyWith(fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                    Text(_inr.format(nextUp.monthlyAmount), style: Fx.h6),
                  ],
                ),
              ),

              if (items.length > 1) ...[
                const SizedBox(height: 12),
                Text('${items.length - 1} more active recurring payments',
                    style: Fx.label.copyWith(fontSize: 11)),
              ]
            ],
          ),
        );
      },
    );
  }

  String _fmtDate(DateTime d) {
    final now = DateTime.now();
    final diff = d.difference(now).inDays;
    if (diff == 0) return 'Today';
    if (diff == 1) return 'Tomorrow';
    if (diff < 7) return '$diff days left';
    return DateFormat('d MMM').format(d);
  }

  IconData _iconFor(String type) {
    switch (type) {
      case 'subscription':
        return Icons.movie_filter_rounded;
      case 'loan_emi':
        return Icons.account_balance_rounded;
      case 'autopay':
        return Icons.autorenew_rounded;
      default:
        return Icons.subscriptions_rounded;
    }
  }
}
