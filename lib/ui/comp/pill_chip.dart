import 'package:flutter/material.dart';

/// Consistent pill-shaped chip used across friend & group detail screens.
class PillChip extends StatelessWidget {
  const PillChip(
    this.text, {
    Key? key,
    this.icon,
    this.fg,
    this.bg,
    this.padding = const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
    this.textStyle,
  }) : super(key: key);

  final String text;
  final IconData? icon;
  final Color? fg;
  final Color? bg;
  final EdgeInsetsGeometry padding;
  final TextStyle? textStyle;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final foreground = fg ?? theme.colorScheme.onSurface.withValues(alpha: 0.84);
    final background = bg ?? theme.colorScheme.surface.withValues(alpha: 0.18);

    final style = (textStyle ?? theme.textTheme.labelMedium)?.copyWith(
      fontWeight: FontWeight.w700,
      color: foreground,
    );

    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: foreground.withValues(alpha: 0.22)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 16, color: foreground),
            const SizedBox(width: 6),
          ],
          Text(text, style: style),
        ],
      ),
    );
  }
}
