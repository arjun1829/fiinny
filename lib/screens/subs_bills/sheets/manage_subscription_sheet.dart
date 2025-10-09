import 'package:flutter/material.dart';
import 'package:lifemap/details/models/shared_item.dart';
import 'package:lifemap/ui/tokens.dart';

class ManageSubscriptionSheet extends StatelessWidget {
  final SharedItem item;

  /// All are async so callers can await and then dismiss / show snackbars.
  final Future<void> Function() onPauseResume;
  final Future<void> Function() onCancel;
  final Future<void> Function() onMarkPaid;
  final Future<void> Function() onHistory;
  final Future<void> Function() onNudge;
  final Future<void> Function(int daysBefore) onQuickReminder;

  const ManageSubscriptionSheet({
    super.key,
    required this.item,
    required this.onPauseResume,
    required this.onCancel,
    required this.onMarkPaid,
    required this.onHistory,
    required this.onNudge,
    required this.onQuickReminder,
  });

  @override
  Widget build(BuildContext context) {
    final paused = item.rule.status == 'paused';
    final dark = Colors.black.withOpacity(.92);

    Future<void> _rem(int days) => onQuickReminder(days);

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              height: 4, width: 40,
              margin: const EdgeInsets.only(bottom: 12),
              decoration: BoxDecoration(color: Colors.black12, borderRadius: BorderRadius.circular(999)),
            ),
            Row(
              children: [
                const Icon(Icons.tune_rounded, color: AppColors.mint),
                const SizedBox(width: 8),
                Expanded(
                  child: Text('Manage ${item.title ?? 'subscription'}',
                      style: TextStyle(fontWeight: FontWeight.w900, color: dark)),
                ),
              ],
            ),
            const SizedBox(height: 10),

            _Tile(
              icon: paused ? Icons.play_circle_outline_rounded : Icons.pause_circle_outline_rounded,
              label: paused ? 'Resume' : 'Pause',
              onTap: onPauseResume,
            ),
            _Tile(
              icon: Icons.cancel_outlined,
              label: 'Cancel (end)',
              danger: true,
              onTap: onCancel,
            ),
            _Tile(
              icon: Icons.check_circle_outline_rounded,
              label: 'Mark last due as paid',
              onTap: onMarkPaid,
            ),
            _Tile(
              icon: Icons.receipt_long_rounded,
              label: 'Billing history',
              onTap: onHistory,
            ),
            _Tile(
              icon: Icons.notifications_active_outlined,
              label: 'Nudge me now',
              onTap: onNudge,
            ),

            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerLeft,
              child: Text('Quick reminder', style: TextStyle(color: dark, fontWeight: FontWeight.w800)),
            ),
            const SizedBox(height: 6),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _RemChip(label: 'On due', onTap: () => _rem(0)),
                _RemChip(label: '1 day before', onTap: () => _rem(1)),
                _RemChip(label: '3 days before', onTap: () => _rem(3)),
                _RemChip(label: '1 week before', onTap: () => _rem(7)),
              ],
            ),
            const SizedBox(height: 4),
          ],
        ),
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool danger;
  final Future<void> Function() onTap;

  const _Tile({
    required this.icon,
    required this.label,
    required this.onTap,
    this.danger = false,
  });

  @override
  Widget build(BuildContext context) {
    final color = danger ? Colors.red : Colors.black87;
    return ListTile(
      dense: true,
      leading: Icon(icon, color: color),
      title: Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w600)),
      onTap: () async => onTap(),
    );
  }
}

class _RemChip extends StatelessWidget {
  final String label;
  final Future<void> Function() onTap;
  const _RemChip({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return ActionChip(
      label: Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
      onPressed: () async => onTap(),
      shape: StadiumBorder(side: BorderSide(color: Colors.black.withOpacity(.15))),
      backgroundColor: Colors.white,
    );
  }
}
