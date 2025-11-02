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
  });

  final List<AmountQuickChipOption> options;
  final double? selectedAmount;
  final ValueChanged<double> onSelected;

  @override
  Widget build(BuildContext context) {
    if (options.isEmpty) {
      return const SizedBox.shrink();
    }
    return Wrap(
      spacing: AppSpacing.s,
      runSpacing: AppSpacing.s,
      children: options.map((option) {
        final isSelected = selectedAmount != null &&
            (selectedAmount! - option.amount).abs() < 0.01;
        return ChoiceChip(
          label: Text(option.label),
          selected: isSelected,
          onSelected: (_) => onSelected(option.amount),
          selectedColor: AppColors.mint.withOpacity(.20),
          backgroundColor: Colors.white.withOpacity(.08),
          labelStyle: TextStyle(
            color: isSelected ? AppColors.mint : Colors.white,
            fontWeight: FontWeight.w600,
          ),
          side: BorderSide(
            color: isSelected
                ? AppColors.mint.withOpacity(.80)
                : Colors.white.withOpacity(.12),
          ),
        );
      }).toList(),
    );
  }
}
