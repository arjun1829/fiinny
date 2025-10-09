// lib/screens/subs_bills/widgets/large_accent_card.dart
import 'package:flutter/material.dart';
import 'package:lifemap/ui/glass/glass_card.dart';
import 'package:lifemap/ui/tokens.dart';

/// Generic tall card used by each SKU section (Subscriptions/Bills/Recurring/EMIs).
class LargeAccentCard extends StatelessWidget {
  final Color accent;
  final String title;
  final Widget metric;     // big number text widget
  final List<Widget> rows; // item rows (brand + title + meta + actions)
  final Widget? trailing;  // e.g. "Manage" button
  final VoidCallback? onAdd;
  final EdgeInsetsGeometry? padding;

  const LargeAccentCard({
    super.key,
    required this.accent,
    required this.title,
    required this.metric,
    required this.rows,
    this.trailing,
    this.onAdd,
    this.padding,
  });

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      accent: accent,
      showGloss: true,
      padding: padding ?? const EdgeInsets.all(AppSpacing.l),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // header
          Row(
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(color: accent, shape: BoxShape.circle),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
              ),
              if (trailing != null) trailing!,
            ],
          ),

          const SizedBox(height: 8),

          // metric
          DefaultTextStyle.merge(
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900),
            child: metric,
          ),

          const SizedBox(height: 6),

          // rows
          ..._intersperse(rows, const SizedBox(height: 10)),

          if (onAdd != null) ...[
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: onAdd,
                icon: const Icon(Icons.add),
                label: const Text('Add New'),
                style: TextButton.styleFrom(foregroundColor: accent),
              ),
            ),
          ],
        ],
      ),
    );
  }

  List<Widget> _intersperse(List<Widget> children, Widget spacer) {
    if (children.isEmpty) return children;
    return [
      for (int i = 0; i < children.length; i++) ...[
        children[i],
        if (i != children.length - 1) spacer,
      ],
    ];
  }
}
