import 'package:flutter/material.dart';

/// Small % change badge like:  ↑ +1.78%   /   ↓ -0.34%
class DeltaChip extends StatelessWidget {
  final double value; // e.g. +1.78 (not 0.0178)
  final bool dense;

  const DeltaChip({super.key, required this.value, this.dense = false});

  @override
  Widget build(BuildContext context) {
    final up = value >= 0;
    final bg = (up ? Colors.green : Colors.red).withValues(alpha: .08);
    final fg = up ? Colors.green.shade700 : Colors.red.shade700;
    final icon = up ? Icons.trending_up_rounded : Icons.trending_down_rounded;
    final text = '${up ? '+' : ''}${value.toStringAsFixed(2)}%';

    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: dense ? 6 : 8,
        vertical: dense ? 3 : 4,
      ),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: fg.withValues(alpha: .25)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: dense ? 12 : 14, color: fg),
        const SizedBox(width: 4),
        Text(
          text,
          style: TextStyle(
            fontSize: dense ? 11 : 12,
            fontWeight: FontWeight.w700,
            color: fg,
          ),
        ),
      ]),
    );
  }
}
