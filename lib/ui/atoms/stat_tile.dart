import 'package:flutter/material.dart';
import 'package:lifemap/ui/atoms/delta_chip.dart';
import 'package:lifemap/ui/tonal/tonal_card.dart';
import 'package:lifemap/ui/tokens.dart' show AppColors;

/// Clean money tile: leading icon bubble + big amount + label + tiny delta chip.
class StatTile extends StatelessWidget {
  final IconData icon;
  final String label;          // e.g. "Total Income"
  final double amount;         // numeric amount
  final String currency;       // e.g. "₹" or "$"
  final double? deltaPercent;  // +/- 1.78 => 1.78%
  final VoidCallback? onMenu;

  const StatTile({
    Key? key,
    required this.icon,
    required this.label,
    required this.amount,
    this.currency = '₹',
    this.deltaPercent,
    this.onMenu,
  }) : super(key: key);

  String _format(double v) {
    final s = v.toStringAsFixed(0);
    final buf = StringBuffer();
    for (int i = 0; i < s.length; i++) {
      final fromEnd = s.length - i;
      buf.write(s[i]);
      if (fromEnd > 1 && fromEnd % 3 == 1) buf.write(',');
    }
    return buf.toString();
  }

  @override
  Widget build(BuildContext context) {
    return TonalCard(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          // icon bubble
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: AppColors.mint.withValues(alpha: .12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: AppColors.mint, size: 24),
          ),
          const SizedBox(width: 12),

          // amount + label + delta
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  crossAxisAlignment: WrapCrossAlignment.center,
                  spacing: 8,
                  children: [
                    Text(
                      '$currency${_format(amount)}',
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    if (deltaPercent != null)
                      DeltaChip(value: deltaPercent!, dense: true),
                  ],
                ),
                const SizedBox(height: 4),
                Text(label,
                    style: TextStyle(
                      color: Colors.black.withValues(alpha: .55),
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    )),
              ],
            ),
          ),

          // menu
          IconButton(
            onPressed: onMenu,
            splashRadius: 20,
            icon: const Icon(Icons.more_vert_rounded),
          )
        ],
      ),
    );
  }
}
