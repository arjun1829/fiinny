// lib/widgets/premium/premium_chip.dart
import 'package:flutter/material.dart';

import '../../themes/tokens.dart';

class PremiumChip extends StatelessWidget {
  final VoidCallback onTap;
  final String label;
  const PremiumChip({super.key, required this.onTap, this.label = 'Go Premium'});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(999),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: Fx.s12, vertical: Fx.s6),
        decoration: BoxDecoration(
          color: Fx.mintDark.withValues(alpha: .10),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: Fx.mintDark.withValues(alpha: .25)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.auto_awesome_rounded, size: 16, color: Fx.mintDark),
            const SizedBox(width: Fx.s6),
            Text(label, style: const TextStyle(fontWeight: FontWeight.w800, color: Fx.mintDark)),
          ],
        ),
      ),
    );
  }
}
