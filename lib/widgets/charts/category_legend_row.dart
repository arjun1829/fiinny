import 'package:flutter/material.dart';

import '../../ui/typography/amount_text.dart';
import 'pie_touch_chart.dart';

class CategoryLegendRow extends StatelessWidget {
  const CategoryLegendRow({
    super.key,
    required this.slices,
    required this.total,
    required this.onSelect,
    this.selected,
  });

  final List<PieSlice> slices;
  final double total;
  final PieSlice? selected;
  final ValueChanged<PieSlice?> onSelect;

  @override
  Widget build(BuildContext context) {
    if (slices.isEmpty) {
      return const Text('Not enough data', style: TextStyle(fontWeight: FontWeight.w600));
    }

    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final slice in slices)
          FilterChip(
            label: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 10,
                  height: 10,
                  margin: const EdgeInsets.only(right: 6),
                  decoration: BoxDecoration(
                    color: slice.color,
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
                Text(slice.label, style: const TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(width: 6),
                AmountText(
                  slice.value,
                  decimalDigits: 0,
                  baseStyle: Theme.of(context).textTheme.labelMedium,
                ),
                if (total > 0) ...[
                  const SizedBox(width: 6),
                  Text(
                    '${((slice.value / total) * 100).clamp(0, 100).toStringAsFixed(0)}%',
                    style: Theme.of(context).textTheme.labelSmall,
                  ),
                ],
              ],
            ),
            selected: selected?.key == slice.key,
            onSelected: (_) => onSelect(selected?.key == slice.key ? null : slice),
            backgroundColor: slice.color.withValues(alpha: 0.12),
            selectedColor: slice.color.withValues(alpha: 0.22),
            labelStyle: Theme.of(context).textTheme.labelMedium,
          ),
        if (selected != null)
          TextButton.icon(
            onPressed: () => onSelect(null),
            icon: const Icon(Icons.close, size: 16),
            label: const Text('Clear'),
          ),
      ],
    );
  }
}
