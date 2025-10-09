import 'package:flutter/material.dart';

class FourSmallCards extends StatelessWidget {
  final Map<String, int> counts;
  final Map<String, DateTime?> nextDue;
  final void Function(String key) onTap;
  final void Function(String key) onAdd;

  const FourSmallCards({
    Key? key,
    required this.counts,
    required this.nextDue,
    required this.onTap,
    required this.onAdd,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final tiles = <_TileData>[
      _TileData('recurring', Icons.repeat_rounded, 'Recurring'),
      _TileData('subscription', Icons.subscriptions_rounded, 'Subscriptions'),
      _TileData('emi', Icons.account_balance_rounded, 'EMIs / Loans'),
      _TileData('reminder', Icons.alarm_rounded, 'Reminders'),
    ];

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: tiles.length,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2, mainAxisSpacing: 10, crossAxisSpacing: 10, childAspectRatio: 1.6,
      ),
      itemBuilder: (_, i) {
        final t = tiles[i];
        final c = counts[t.key] ?? 0;
        final d = nextDue[t.key];
        final dueTxt = d == null ? '--' : '${d.day}/${d.month}';

        return _card(
          child: InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: () => onTap(t.key),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    Icon(t.icon, size: 20),
                    const Spacer(),
                    IconButton(
                      tooltip: 'Add',
                      onPressed: () => onAdd(t.key),
                      icon: const Icon(Icons.add_circle_outline),
                      visualDensity: VisualDensity.compact,
                    ),
                  ]),
                  const Spacer(),
                  Text(t.label, style: const TextStyle(fontWeight: FontWeight.w900)),
                  const SizedBox(height: 6),
                  Wrap(spacing: 6, children: [
                    _miniPill('$c active'),
                    _miniPill('next: $dueTxt'),
                  ]),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _card({required Widget child}) => Container(
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: Colors.black12),
      boxShadow: const [BoxShadow(color: Color(0x14000000), blurRadius: 12, offset: Offset(0, 6))],
    ),
    child: child,
  );

  Widget _miniPill(String t) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(999),
      border: Border.all(color: Colors.black12),
    ),
    child: Text(t, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
  );
}

class _TileData {
  final String key;
  final IconData icon;
  final String label;
  _TileData(this.key, this.icon, this.label);
}
