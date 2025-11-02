import 'package:characters/characters.dart';
import 'package:flutter/material.dart';
import 'package:lifemap/ui/tokens.dart' show AppColors, AppSpacing;

class SettleGroupRow extends StatelessWidget {
  const SettleGroupRow({
    super.key,
    required this.title,
    required this.amount,
    required this.selected,
    required this.onToggle,
    this.subtitle,
    this.leading,
    this.enabled = true,
  });

  final String title;
  final String? subtitle;
  final double amount;
  final bool selected;
  final bool enabled;
  final Widget? leading;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final isPositive = amount >= 0;
    final label = isPositive ? 'You get back' : 'You owe';
    final color = isPositive ? AppColors.good : AppColors.bad;
    final amountText = '₹${amount.abs().toStringAsFixed(2)}';
    final textTheme = Theme.of(context).textTheme;

    return InkWell(
      onTap: enabled ? onToggle : null,
      borderRadius: BorderRadius.circular(16),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.s),
        child: Row(
          children: [
            leading ??
                CircleAvatar(
                  radius: 22,
                  backgroundColor: Colors.white.withOpacity(.06),
                  child: Text(title.characters.first.toUpperCase()),
                ),
            const SizedBox(width: AppSpacing.m),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: textTheme.bodyLarge?.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  if (subtitle != null && subtitle!.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(
                        subtitle!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: textTheme.bodySmall?.copyWith(
                          color: Colors.white.withOpacity(.6),
                        ),
                      ),
                    ),
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      '$label $amountText',
                      style: textTheme.labelLarge?.copyWith(
                        color: color,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: AppSpacing.m),
            AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: selected ? AppColors.mint.withOpacity(.18) : Colors.transparent,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: selected
                      ? AppColors.mint
                      : Colors.white.withOpacity(enabled ? .18 : .08),
                ),
              ),
              child: Icon(
                selected ? Icons.check_rounded : Icons.add,
                color: selected ? AppColors.mint : Colors.white70,
                size: 18,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
