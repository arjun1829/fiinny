// lib/widgets/empty_state_card.dart
import 'package:flutter/material.dart';
import '../themes/tokens.dart';
import '../themes/glass_card.dart';

class EmptyStateCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final String ctaText;
  final VoidCallback onTap;

  const EmptyStateCard({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.ctaText,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      radius: Fx.r24,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Icon(icon, color: Fx.mintDark, size: 26),
            const SizedBox(width: Fx.s8),
            Text(title, style: Fx.title),
          ]),
          const SizedBox(height: Fx.s8),
          Text(subtitle, style: Fx.label),
          const SizedBox(height: Fx.s12),
          FilledButton(onPressed: onTap, child: Text(ctaText)),
        ],
      ),
    );
  }
}
