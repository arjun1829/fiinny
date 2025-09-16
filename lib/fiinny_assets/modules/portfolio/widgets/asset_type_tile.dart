import 'package:flutter/material.dart';
import '../widgets/asset_type_tile.dart';

/// Reusable tile for selecting an asset type (Stocks, Gold, etc.)
class AssetTypeTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final String? subtitle;
  final VoidCallback? onTap;
  final bool disabled;

  const AssetTypeTile({
    super.key,
    required this.icon,
    required this.label,
    this.subtitle,
    this.onTap,
    this.disabled = false,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cardColor = disabled
        ? theme.colorScheme.surfaceVariant
        : theme.colorScheme.surface;
    final fg = disabled
        ? theme.colorScheme.onSurface.withOpacity(0.45)
        : theme.colorScheme.onSurface;

    return InkWell(
      onTap: disabled ? null : onTap,
      borderRadius: BorderRadius.circular(16),
      child: Ink(
        decoration: BoxDecoration(
          color: cardColor,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: disabled
                ? theme.colorScheme.outlineVariant
                : theme.colorScheme.outline.withOpacity(0.5),
          ),
          boxShadow: [
            BoxShadow(
              blurRadius: 10,
              spreadRadius: 1,
              offset: const Offset(0, 4),
              color: Colors.black.withOpacity(0.05),
            ),
          ],
        ),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 36, color: fg),
              const SizedBox(height: 10),
              Text(label,
                  style: theme.textTheme.titleMedium?.copyWith(color: fg)),
              if (subtitle != null) ...[
                const SizedBox(height: 4),
                Text(
                  subtitle!,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodySmall?.copyWith(color: fg),
                ),
              ],
              if (!disabled) ...[
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text('Select',
                        style:
                        theme.textTheme.labelLarge?.copyWith(color: fg)),
                    const SizedBox(width: 6),
                    Icon(Icons.chevron_right, color: fg, size: 20),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
