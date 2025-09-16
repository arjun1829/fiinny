import 'package:flutter/material.dart';

/// Step 1 of the Add Asset flow: pick a type (Stocks, Gold, ...).
/// Navigates to `/add-asset-entry` with arguments: {'type': 'stock'|'gold'}.
class AssetTypePickerScreen extends StatelessWidget {
  const AssetTypePickerScreen({super.key});

  void _goToEntry(BuildContext context, String type) {
    Navigator.pushNamed(
      context,
      '/add-asset-entry',
      arguments: {'type': type},
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Add Asset'),
      ),
      body: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Choose a type', style: theme.textTheme.titleLarge),
            const SizedBox(height: 12),
            Expanded(
              child: GridView.count(
                crossAxisCount: 2,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 1.05,
                children: [
                  _AssetTypeTile(
                    icon: Icons.show_chart,
                    label: 'Stocks',
                    subtitle: 'NSE/BSE symbols',
                    onTap: () => _goToEntry(context, 'stock'),
                  ),
                  _AssetTypeTile(
                    icon: Icons.circle, // gold dot look
                    label: 'Gold',
                    subtitle: 'Grams / ETF',
                    onTap: () => _goToEntry(context, 'gold'),
                  ),
                  _AssetTypeTile(
                    icon: Icons.currency_bitcoin,
                    label: 'Crypto',
                    subtitle: 'Coming soon',
                    disabled: true,
                  ),
                  _AssetTypeTile(
                    icon: Icons.home_rounded,
                    label: 'Real Estate',
                    subtitle: 'Coming soon',
                    disabled: true,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Tip: You can start with Stocks and Gold now. '
                        'We’ll add more asset types later.',
                    style: theme.textTheme.bodySmall,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Simple local tile widget (kept private to avoid extra files right now).
class _AssetTypeTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final String? subtitle;
  final VoidCallback? onTap;
  final bool disabled;

  const _AssetTypeTile({
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
