// lib/details/recurring/recurring_card.dart
import 'package:flutter/material.dart';
import '../models/shared_item.dart';

class RecurringCard extends StatelessWidget {
  final SharedItem item;
  final VoidCallback? onPay;
  final VoidCallback? onPause;

  const RecurringCard({
    super.key,
    required this.item,
    this.onPay,
    this.onPause,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    final String title =
    (item.title?.trim().isNotEmpty == true
        ? item.title
        : (item.provider?.trim().isNotEmpty == true
        ? item.provider
        : (item.type ?? 'Item')))
    !;

    final String dueStr = _fmt(item.nextDueAt);
    final bool isPaused = item.rule.status == 'paused';
    final bool isEnded  = item.rule.status == 'ended';
    final bool isReminder = (item.rule.amount == 0);

    final Color? fgDim =
    isEnded ? Colors.grey : (isPaused ? Colors.brown : null);
    final Color? subDim =
    isEnded ? Colors.grey : Colors.grey.shade700;

    final IconData leadingIcon = _iconFor(item.type);

    return Opacity(
      opacity: isEnded ? 0.6 : 1,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 6),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Theme.of(context).cardColor,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.grey.shade200),
        ),
        child: Row(
          children: [
            Icon(leadingIcon, color: cs.primary),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: fgDim,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    isReminder
                        ? "Next $dueStr • Reminder"
                        : "Due $dueStr • ₹${item.rule.amount.toStringAsFixed(0)}",
                    style: TextStyle(color: subDim, fontSize: 12),
                    maxLines: 2,
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            if (!isEnded)
              TextButton(
                onPressed: onPay,
                child: const Text("Pay"),
              ),
            if (!isEnded)
              IconButton(
                onPressed: onPause,
                icon: Icon(
                  isPaused ? Icons.play_arrow_rounded : Icons.pause_circle_outline,
                ),
                tooltip: isPaused ? 'Resume' : 'Pause',
              ),
          ],
        ),
      ),
    );
  }

  String _fmt(DateTime? d) {
    if (d == null) return '--/--';
    final dd = d.day.toString().padLeft(2, '0');
    final mm = d.month.toString().padLeft(2, '0');
    return '$dd/$mm';
  }

  IconData _iconFor(String? type) {
    switch (type) {
      case 'subscription':
        return Icons.subscriptions_outlined;
      case 'emi':
        return Icons.account_balance_wallet_outlined;
      case 'utility':
        return Icons.lightbulb_outline;
      case 'reminder':
        return Icons.alarm_rounded;
      case 'recurring':
        return Icons.autorenew_rounded;
      default:
        return Icons.repeat_rounded;
    }
  }
}
