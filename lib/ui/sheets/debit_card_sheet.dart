import 'package:flutter/material.dart';
import '../atoms/shiny_card.dart';

enum DebitCardAction { pay, manage, remind, paid }

class DebitCardSheet extends StatelessWidget {
  /// Display
  final String title;
  final String last4;

  /// Amount to show on the shiny card. If you can supply a numeric value,
  /// also pass [amountValue] to get nicer formatting (optional).
  final String amount;
  final double? amountValue;

  /// Visuals
  final ImageProvider? logo;
  final List<Color>? gradient;

  /// Data-driven details (optional)
  final DateTime? nextDue;
  final String? category;
  final String? note;

  /// Callbacks
  /// Use either the strongly typed [onTypedAction] or the legacy [onAction].
  final void Function(DebitCardAction action)? onTypedAction;
  final void Function(String action)?
      onAction; // legacy: "pay","manage","remind","paid"

  /// Misc
  final String? heroTag; // if you want to hero the card between list and sheet

  const DebitCardSheet({
    super.key,
    required this.title,
    required this.last4,
    required this.amount,
    this.amountValue,
    this.logo,
    this.gradient,
    this.nextDue,
    this.category,
    this.note,
    this.onTypedAction,
    this.onAction,
    this.heroTag,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final surface = theme.colorScheme.surface;
    final onSurface = theme.colorScheme.onSurface.withValues(alpha: .92);
    // final divider = theme.dividerColor.withValues(alpha: .24);
    final pillBorder = theme.colorScheme.onSurface.withValues(alpha: .14);

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: .38,
      minChildSize: .30,
      maxChildSize: .88,
      snap: true,
      snapSizes: const [.38, .70, .88],
      builder: (_, ctrl) => Material(
        // <-- ensures Ink effects render properly
        color: Colors.transparent,
        child: Container(
          decoration: BoxDecoration(
            color: surface,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
            boxShadow: const [
              BoxShadow(
                  blurRadius: 24,
                  color: Color(0x22000000),
                  offset: Offset(0, -8)),
            ],
          ),
          child: SafeArea(
            top: false,
            child: ListView(
              controller: ctrl,
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              children: [
                // drag handle
                Center(
                  child: Container(
                    width: 46,
                    height: 5,
                    decoration: BoxDecoration(
                      color: theme.colorScheme.onSurface.withValues(alpha: .12),
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                ),
                const SizedBox(height: 12),

                // Shiny card (optional hero)
                if (heroTag != null)
                  Hero(
                    tag: heroTag!,
                    child: _card(surface, onSurface),
                  )
                else
                  _card(surface, onSurface),

                const SizedBox(height: 14),

                // Primary actions (adaptive)
                _ActionRow(
                  onTap: _dispatch,
                  pillBorder: pillBorder,
                  tint: theme.colorScheme.primary,
                ),

                const SizedBox(height: 16),

                // Details (data-driven; hide when absent)
                Semantics(
                  header: true,
                  child: const Text('Details',
                      style: TextStyle(fontWeight: FontWeight.w900)),
                ),
                const SizedBox(height: 8),

                if (nextDue != null)
                  _kv(context, 'Next due', _fmtDate(nextDue!)),
                if ((category ?? '').trim().isNotEmpty)
                  _kv(context, 'Category', category!.trim()),
                if ((note ?? '').trim().isNotEmpty)
                  _kv(context, 'Notes', note!.trim()),

                if (nextDue == null &&
                    (category ?? '').isEmpty &&
                    (note ?? '').isEmpty)
                  _kv(context, '—', 'No additional details'),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // --- Widgets ---

  Widget _card(Color surface, Color onSurface) {
    return ShinyCard(
      title: title,
      last4: last4,
      amount: amountValue != null ? '₹ ${_fmtAmount(amountValue!)}' : amount,
      logo: logo,
      gradient: gradient ?? const [Color(0xFF1F3A5B), Color(0xFF0B1730)],
    );
  }

  Widget _kv(BuildContext context, String k, String v) {
    final keyStyle = Theme.of(context).textTheme.bodySmall?.copyWith(
          color: Theme.of(context).colorScheme.onSurface.withValues(alpha: .6),
        );
    final valStyle = Theme.of(context).textTheme.bodyMedium?.copyWith(
          fontWeight: FontWeight.w700,
        );

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Flexible(
            flex: 5,
            child: Text(k,
                style: keyStyle, maxLines: 2, overflow: TextOverflow.ellipsis),
          ),
          const SizedBox(width: 12),
          Flexible(
            flex: 9,
            child: Text(v, style: valStyle),
          ),
        ],
      ),
    );
  }

  // --- Actions plumbing ---

  void _dispatch(DebitCardAction action) {
    onTypedAction?.call(action);
    // Legacy string callback for backward compatibility
    switch (action) {
      case DebitCardAction.pay:
        onAction?.call('pay');
        break;
      case DebitCardAction.manage:
        onAction?.call('manage');
        break;
      case DebitCardAction.remind:
        onAction?.call('remind');
        break;
      case DebitCardAction.paid:
        onAction?.call('paid');
        break;
    }
  }

  // --- utils ---

  static String _fmtDate(DateTime d) {
    const m = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec'
    ];
    return '${m[d.month - 1]} ${d.day.toString().padLeft(2, '0')}';
  }

  static String _fmtAmount(double v) {
    final neg = v < 0;
    final n = v.abs();
    String s;
    if (n >= 10000000) {
      s = '${(n / 10000000).toStringAsFixed(1)}Cr';
    } else if (n >= 100000) {
      s = '${(n / 100000).toStringAsFixed(1)}L';
    } else if (n >= 1000) {
      s = '${(n / 1000).toStringAsFixed(1)}k';
    } else {
      s = n % 1 == 0 ? n.toStringAsFixed(0) : n.toStringAsFixed(2);
    }
    return neg ? '-$s' : s;
  }
}

/// Primary action pills as proper buttons with a11y + theming.
class _ActionRow extends StatelessWidget {
  final void Function(DebitCardAction action) onTap;
  final Color pillBorder;
  final Color tint;

  const _ActionRow({
    required this.onTap,
    required this.pillBorder,
    required this.tint,
  });

  @override
  Widget build(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width;
    final tight = w < 360;

    Widget pill(String label, IconData icon, DebitCardAction action,
        {String? tooltip}) {
      final child = Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16),
          if (!tight) const SizedBox(width: 6),
          if (!tight)
            Text(label, style: const TextStyle(fontWeight: FontWeight.w800)),
        ],
      );

      final button = OutlinedButton(
        onPressed: () => onTap(action),
        style: OutlinedButton.styleFrom(
          side: BorderSide(color: pillBorder),
          foregroundColor: Theme.of(context).colorScheme.onSurface,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle: const TextStyle(fontWeight: FontWeight.w800),
        ),
        child: child,
      );

      return Tooltip(message: tooltip ?? label, child: button);
    }

    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        pill('Pay', Icons.payment_rounded, DebitCardAction.pay),
        pill('Manage', Icons.tune_rounded, DebitCardAction.manage),
        pill('Remind', Icons.alarm_add_rounded, DebitCardAction.remind),
        pill('Mark paid', Icons.check_circle_outline_rounded,
            DebitCardAction.paid),
      ],
    );
  }
}
