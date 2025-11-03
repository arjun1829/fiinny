import 'package:flutter/material.dart';
import 'package:lifemap/ui/tokens.dart' show AppColors, AppSpacing;

class AmountQuickChipOption {
  const AmountQuickChipOption({required this.label, required this.amount});

  final String label;
  final double amount;
}

class AmountQuickChips extends StatelessWidget {
  const AmountQuickChips({
    super.key,
    required this.options,
    required this.selectedAmount,
    required this.onSelected,
    this.onClear,
    this.clearLabel,
  });

  final List<AmountQuickChipOption> options;
  final double? selectedAmount;
  final ValueChanged<double> onSelected;
  final VoidCallback? onClear;
  final String? clearLabel;

  @override
  Widget build(BuildContext context) {
    if (options.isEmpty) {
      return const SizedBox.shrink();
    }
    final theme = Theme.of(context);
    final chips = <Widget>[
      for (final option in options)
        Builder(builder: (context) {
          final isSelected = selectedAmount != null &&
              (selectedAmount! - option.amount).abs() < 0.01;
          return ChoiceChip(
            label: Text(option.label),
            selected: isSelected,
            onSelected: (_) => onSelected(option.amount),
            selectedColor: AppColors.mint.withOpacity(.18),
            backgroundColor: theme.colorScheme.surfaceVariant.withOpacity(.35),
            labelStyle: TextStyle(
              color: isSelected ? AppColors.mint : theme.textTheme.bodyMedium?.color,
              fontWeight: FontWeight.w600,
            ),
            side: BorderSide(
              color: isSelected
                  ? AppColors.mint.withOpacity(.8)
                  : theme.dividerColor.withOpacity(.25),
            ),
          );
        }),
    ];

    if (onClear != null) {
      chips.add(ActionChip(
        label: Text(clearLabel ?? 'Clear'),
        onPressed: onClear,
        backgroundColor: Colors.transparent,
        side: BorderSide(color: theme.dividerColor.withOpacity(.25)),
        labelStyle: TextStyle(
          color: theme.textTheme.bodyMedium?.color?.withOpacity(.72),
          fontWeight: FontWeight.w600,
        ),
      ));
    }

    return Wrap(
      spacing: AppSpacing.s,
      runSpacing: AppSpacing.s,
      children: chips,
    );
  }
}
