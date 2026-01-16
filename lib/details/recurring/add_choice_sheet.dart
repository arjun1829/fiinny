import 'package:flutter/material.dart';

/// Public config object so other screens (like Subs/Bills) can pass custom options.
class AddChoice {
  final IconData icon;
  final String title;
  final String subtitle;

  /// The value returned via `onPick(value)`.
  final String value;

  const AddChoice({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.value,
  });
}

class AddChoiceSheet extends StatelessWidget {
  final void Function(String key) onPick;

  /// Optional: override the default 4 choices with your own list.
  /// If null, the classic Recurring 4 options are shown (back-compat).
  final List<AddChoice>? options;

  /// Optional small title row at the top (e.g. "Add to Subs & Bills")
  final String? title;

  /// Accent for avatar/icon ring (defaults to teal)
  final Color accent;

  const AddChoiceSheet({
    super.key,
    required this.onPick,
    this.options,
    this.title,
    this.accent = Colors.teal,
  });

  List<AddChoice> get _defaultRecurringChoices => const [
        AddChoice(
          icon: Icons.repeat_rounded,
          title: 'Recurring bill',
          subtitle: 'Monthly / weekly — amount + due day',
          value: 'recurring',
        ),
        AddChoice(
          icon: Icons.subscriptions_rounded,
          title: 'Subscription',
          subtitle: 'Apps, OTT, gym — billing day',
          value: 'subscription',
        ),
        AddChoice(
          icon: Icons.account_balance_rounded,
          title: 'EMI / Loan',
          subtitle: 'Link an existing loan as recurring EMI',
          value: 'emi',
        ),
        AddChoice(
          icon: Icons.alarm_rounded,
          title: 'Custom reminder',
          subtitle: 'Light reminder with cadence',
          value: 'custom',
        ),
      ];

  @override
  Widget build(BuildContext context) {
    final opts = options ?? _defaultRecurringChoices;
    final bottomPad = MediaQuery.of(context).padding.bottom;

    Widget card(AddChoice c) {
      return InkWell(
        onTap: () => onPick(c.value),
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.grey[50],
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: Colors.grey.shade300),
          ),
          child: Row(
            children: [
              CircleAvatar(
                radius: 22,
                backgroundColor: accent.withValues(alpha: .10),
                child: Icon(c.icon, color: accent),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      c.title,
                      style: const TextStyle(
                        fontWeight: FontWeight.w900,
                        fontSize: 16,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      c.subtitle,
                      style: TextStyle(
                        color: Colors.grey[700],
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded),
            ],
          ),
        ),
      );
    }

    return SafeArea(
      minimum: EdgeInsets.fromLTRB(16, 16, 16, 16 + bottomPad),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              height: 4,
              width: 42,
              margin: const EdgeInsets.only(bottom: 12),
              decoration: BoxDecoration(
                color: Colors.grey[300],
                borderRadius: BorderRadius.circular(99),
              ),
            ),
            if (title != null) ...[
              Row(
                children: [
                  Icon(Icons.add_circle_outline, size: 18, color: accent),
                  const SizedBox(width: 6),
                  Text(
                    title!,
                    style: const TextStyle(
                      fontWeight: FontWeight.w900,
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
            ],
            for (int i = 0; i < opts.length; i++) ...[
              card(opts[i]),
              if (i != opts.length - 1) const SizedBox(height: 10),
            ],
          ],
        ),
      ),
    );
  }
}
