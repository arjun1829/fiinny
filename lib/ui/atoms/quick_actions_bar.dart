import 'package:flutter/material.dart';
import 'package:lifemap/ui/tonal/tonal_card.dart';
import 'package:lifemap/ui/tokens.dart' show AppColors;

/// Row of quick actions like Top Up / Transfer / Request / History.
class QuickActionsBar extends StatelessWidget {
  final void Function(String action)? onTap;

  const QuickActionsBar({Key? key, this.onTap}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final items = const [
      _QA('Top Up', Icons.add_box_outlined, 'topup'),
      _QA('Transfer', Icons.sync_alt_rounded, 'transfer'),
      _QA('Request', Icons.request_page_outlined, 'request'),
      _QA('History', Icons.schedule_rounded, 'history'),
    ];

    return TonalCard(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: items
            .map((it) => _QuickButton(
          label: it.label,
          icon: it.icon,
          onTap: () => onTap?.call(it.key),
        ))
            .toList(),
      ),
    );
  }
}

class _QuickButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final VoidCallback? onTap;

  const _QuickButton({
    Key? key,
    required this.label,
    required this.icon,
    this.onTap,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        child: Column(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: AppColors.mint.withOpacity(.14),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: AppColors.mint, size: 22),
            ),
            const SizedBox(height: 6),
            Text(label,
                style: const TextStyle(
                    fontSize: 12, fontWeight: FontWeight.w700)),
          ],
        ),
      ),
    );
  }
}

class _QA {
  final String label;
  final IconData icon;
  final String key;
  const _QA(this.label, this.icon, this.key);
}
