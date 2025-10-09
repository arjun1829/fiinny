// lib/details/overview/upcoming_due_list.dart
import 'package:flutter/material.dart';
import '../models/shared_item.dart';
import '../services/recurring_service.dart';

class UpcomingDueList extends StatelessWidget {
  final String userPhone;
  final String friendId;

  const UpcomingDueList({
    Key? key,
    required this.userPhone,
    required this.friendId,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final svc = RecurringService();

    return StreamBuilder<List<SharedItem>>(
      stream: svc.streamByFriend(userPhone, friendId),
      builder: (context, snap) {
        final now = DateTime.now();
        final horizon = now.add(const Duration(days: 7));

        final items = (snap.data ?? const <SharedItem>[])
            .where((e) =>
        e.rule.status == 'active' &&
            e.nextDueAt != null &&
            !e.nextDueAt!.isBefore(now) &&
            !e.nextDueAt!.isAfter(horizon))
            .toList()
          ..sort((a, b) {
            final da = a.nextDueAt ?? DateTime.fromMillisecondsSinceEpoch(0);
            final db = b.nextDueAt ?? DateTime.fromMillisecondsSinceEpoch(0);
            return da.compareTo(db);
          });

        if (items.isEmpty) return const SizedBox.shrink();

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              "Upcoming (7 days)",
              style: TextStyle(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 8),
            ...items.take(3).map(_row),
          ],
        );
      },
    );
  }

  Widget _row(SharedItem e) {
    final DateTime? d = e.nextDueAt;
    final String dd = (d == null)
        ? '--/--'
        : "${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}";
    final String title = e.title ?? e.provider ?? e.type ?? 'Untitled';

    final String trailing =
        "₹${e.rule.amount.toStringAsFixed(0)}  •  $dd";

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          const Icon(Icons.calendar_month_rounded, size: 16, color: Colors.teal),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          Text(
            trailing,
            style: const TextStyle(color: Colors.black54, fontSize: 12),
          ),
        ],
      ),
    );
  }
}
