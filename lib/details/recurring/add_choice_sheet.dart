import 'package:flutter/material.dart';

class AddChoiceSheet extends StatelessWidget {
  final void Function(String key) onPick;
  const AddChoiceSheet({Key? key, required this.onPick}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    Widget card({
      required IconData icon,
      required String title,
      required String subtitle,
      required String pick,
    }) {
      return InkWell(
        onTap: () => onPick(pick),
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
                backgroundColor: Colors.teal.withOpacity(.1),
                child: Icon(icon, color: Colors.teal),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
                    const SizedBox(height: 4),
                    Text(subtitle, style: TextStyle(color: Colors.grey[700], fontWeight: FontWeight.w600)),
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
      minimum: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(height: 4, width: 42, margin: const EdgeInsets.only(bottom: 10),
              decoration: BoxDecoration(color: Colors.grey[300], borderRadius: BorderRadius.circular(99))),
          card(
            icon: Icons.repeat_rounded,
            title: 'Recurring bill',
            subtitle: 'Monthly / weekly — amount + due day',
            pick: 'recurring',
          ),
          const SizedBox(height: 10),
          card(
            icon: Icons.subscriptions_rounded,
            title: 'Subscription',
            subtitle: 'Apps, OTT, gym — billing day',
            pick: 'subscription',
          ),
          const SizedBox(height: 10),
          card(
            icon: Icons.account_balance_rounded,
            title: 'EMI / Loan',
            subtitle: 'Link an existing loan as recurring EMI',
            pick: 'emi',
          ),
          const SizedBox(height: 10),
          card(
            icon: Icons.alarm_rounded,
            title: 'Custom reminder',
            subtitle: 'Light reminder with cadence',
            pick: 'custom',
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}
