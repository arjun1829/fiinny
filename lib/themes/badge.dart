import 'package:flutter/material.dart';
import 'tokens.dart';

class PillBadge extends StatelessWidget {
  final String text;
  final Color color;
  final IconData? icon;

  const PillBadge(this.text, {super.key, required this.color, this.icon});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: Fx.s10, vertical: Fx.s4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withOpacity(0.28)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (icon != null) ...[Icon(icon, size: 14, color: color), const SizedBox(width: 6)],
        Text(text, style: TextStyle(fontWeight: FontWeight.w700, color: color, fontSize: 12)),
      ]),
    );
  }
}
