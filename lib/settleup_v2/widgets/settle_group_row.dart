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
    this.onMenuPressed,
  });

  final String title;
  final String? subtitle;
  final double amount;
  final bool selected;
  final bool enabled;
  final Widget? leading;
  final VoidCallback onToggle;
  final VoidCallback? onMenuPressed;

  @override
  Widget build(BuildContext context) {
    final isPositive = amount >= 0;
    final textTheme = Theme.of(context).textTheme;
    final neutral = textTheme.bodyMedium?.color?.withValues(alpha: .72) ?? AppColors.ink500;
    final badgeColor = isPositive ? AppColors.mint : neutral;
    final badgeLabel = isPositive ? 'You get back' : 'You owe';
    final amountText = '₹${amount.abs().toStringAsFixed(2)}';
    final backgroundColor = selected
        ? AppColors.mint.withValues(alpha: .12)
        : Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: .32);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: enabled ? onToggle : null,
          borderRadius: BorderRadius.circular(20),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.m, vertical: AppSpacing.m),
            decoration: BoxDecoration(
              color: backgroundColor,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: selected
                    ? AppColors.mint.withValues(alpha: .7)
                    : Theme.of(context).dividerColor.withValues(alpha: enabled ? .18 : .08),
              ),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                AnimatedScale(
                  duration: const Duration(milliseconds: 120),
                  scale: selected ? 1 : .94,
                  child: Checkbox(
                    value: selected,
                    onChanged: enabled ? (_) => onToggle() : null,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                    side: BorderSide(color: Theme.of(context).dividerColor.withValues(alpha: .4)),
                    fillColor: WidgetStateProperty.resolveWith((states) {
                      if (states.contains(WidgetState.selected)) {
                        return AppColors.mint;
                      }
                      return Theme.of(context).colorScheme.surface;
                    }),
                  ),
                ),
                const SizedBox(width: AppSpacing.s),
                leading ??
                    CircleAvatar(
                      radius: 22,
                      backgroundColor: Theme.of(context).colorScheme.surface,
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
                            style: textTheme.bodySmall?.copyWith(color: neutral),
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: AppSpacing.m),
                // UX: Inline badge surfaces owed direction at a glance.
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: badgeColor.withValues(alpha: .14),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    '$badgeLabel $amountText',
                    style: textTheme.labelMedium?.copyWith(
                      color: badgeColor,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                const SizedBox(width: AppSpacing.s),
                IconButton(
                  onPressed: enabled ? onMenuPressed : null,
                  icon: const Icon(Icons.more_vert_rounded),
                  tooltip: 'More options',
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
