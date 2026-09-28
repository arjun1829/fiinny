import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app/theme.dart';
import '../../core/format.dart';
import '../../widgets/erp_fab.dart';
import '../../widgets/kpi_card.dart';
import '../auth/auth_repository.dart';
import '../settings/theme_provider.dart';
import '../subscription/subscription_repository.dart';

const _pricingUrl = 'https://karanarjun-pvt-ltd.web.app/pricing';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(appUserProvider).valueOrNull;
    final initial =
        (user?.name.isNotEmpty ?? false) ? user!.name[0].toUpperCase() : '?';

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(14, 8, 14, 96),
          children: [
            Text('ACCOUNT', style: kMicro),
            const SizedBox(height: 16),
            Row(
              children: [
                Container(
                  width: 52,
                  height: 52,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: AppColors.accent,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Text(
                    initial,
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      color: AppColors.accentInk,
                    ),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        user?.name ?? '—',
                        style: TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w700,
                          letterSpacing: -0.3,
                          color: AppColors.ink,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        user?.email ?? '',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style:
                            TextStyle(fontSize: 12, color: AppColors.inkMute),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SectionTitle('Access'),
            Panel(
              child: Column(
                children: [
                  _InfoRow(label: 'Business', value: user?.businessName ?? '—'),
                  const Divider(height: 22),
                  _InfoRow(label: 'Role', value: user?.role ?? '—'),
                ],
              ),
            ),
            const SectionTitle('Subscription'),
            const _SubscriptionCard(),
            const SectionTitle('Appearance'),
            const _ThemePicker(),
            const SectionTitle('Actions'),
            Panel(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Column(
                children: [
                  _ActionTile(
                    icon: Icons.open_in_new,
                    label: 'Open full ERP',
                    sub: 'Billing, inventory and settings',
                    onTap: () => launchUrl(
                      Uri.parse(erpUrl),
                      mode: LaunchMode.externalApplication,
                    ),
                  ),
                  const Divider(height: 1),
                  _ActionTile(
                    icon: Icons.logout,
                    label: 'Sign out',
                    color: AppColors.critical,
                    onTap: () async {
                      final confirmed = await showDialog<bool>(
                        context: context,
                        builder: (ctx) => AlertDialog(
                          title: const Text('Sign out?'),
                          content: Text(
                            'You will need to sign in again to see your analytics.',
                            style: TextStyle(color: AppColors.inkDim),
                          ),
                          actions: [
                            TextButton(
                              onPressed: () => Navigator.pop(ctx, false),
                              child: const Text('Cancel'),
                            ),
                            FilledButton(
                              onPressed: () => Navigator.pop(ctx, true),
                              child: const Text('Sign out'),
                            ),
                          ],
                        ),
                      );
                      if (confirmed ?? false) {
                        await ref.read(authRepositoryProvider).signOut();
                      }
                    },
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            Center(
              child: Text(
                'Read-only companion to the web ERP.',
                style: TextStyle(fontSize: 11, color: AppColors.inkMute),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ThemePicker extends ConsumerWidget {
  const _ThemePicker();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selected = ref.watch(themeVariantProvider);

    return Panel(
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          for (final variant in AppThemeVariant.values) ...[
            if (variant != AppThemeVariant.values.first)
              const SizedBox(width: 10),
            Expanded(
              child: _ThemeOption(
                variant: variant,
                selected: variant == selected,
                onTap: () =>
                    ref.read(themeVariantProvider.notifier).set(variant),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _ThemeOption extends StatelessWidget {
  const _ThemeOption({
    required this.variant,
    required this.selected,
    required this.onTap,
  });

  final AppThemeVariant variant;
  final bool selected;
  final VoidCallback onTap;

  // Static swatches so a variant's preview is visible even while a different
  // variant is currently active — these describe what tapping it looks like,
  // so they can't read the live (different) AppColors.
  static const _swatches = {
    AppThemeVariant.dark: (
      Color(0xFF080C0A),
      Color(0xFFD7F94F),
      Color(0xFFEAF2ED)
    ),
    AppThemeVariant.light: (
      Color(0xFFF5F7F6),
      Color(0xFF2E7D32),
      Color(0xFF10201A)
    ),
  };

  @override
  Widget build(BuildContext context) {
    final (bg, accent, ink) = _swatches[variant]!;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: selected ? AppColors.accent : AppColors.border,
            width: selected ? 2 : 1,
          ),
        ),
        child: Column(
          children: [
            Container(
              height: 40,
              decoration: BoxDecoration(
                color: bg,
                borderRadius: BorderRadius.circular(9),
                border: Border.all(color: ink.withValues(alpha: 0.12)),
              ),
              child: Center(
                child: Container(
                  width: 18,
                  height: 18,
                  decoration:
                      BoxDecoration(color: accent, shape: BoxShape.circle),
                ),
              ),
            ),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (selected) ...[
                  Icon(Icons.check_circle, size: 12, color: AppColors.accent),
                  const SizedBox(width: 4),
                ],
                Text(
                  variant.label,
                  style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w700,
                    color: selected ? AppColors.ink : AppColors.inkDim,
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

class _SubscriptionCard extends ConsumerWidget {
  const _SubscriptionCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sub = ref.watch(subscriptionProvider);

    return sub.when(
      loading: () => const Panel(
        padding: EdgeInsets.all(20),
        child: Center(
          child: SizedBox(
            height: 18,
            width: 18,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      ),
      error: (_, __) => const EmptyNote('Could not load subscription status.'),
      data: (s) {
        // Master-tenant / platform accounts carry no subscription at all.
        if (s == null) return const SizedBox.shrink();

        final (label, color) = switch (s.status) {
          SubStatus.active => ('Active', AppColors.good),
          SubStatus.trial => ('Trial', AppColors.b2b),
          SubStatus.pastDue => ('Payment due', AppColors.warning),
          SubStatus.suspended => ('Suspended', AppColors.critical),
          SubStatus.cancelled => ('Cancelled', AppColors.critical),
          SubStatus.none => ('No active plan', AppColors.critical),
        };

        return Panel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      s.planName,
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: AppColors.ink,
                      ),
                    ),
                  ),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      label.toUpperCase(),
                      style: kMicro.copyWith(color: color, letterSpacing: 0.6),
                    ),
                  ),
                ],
              ),
              if (s.expiresAt != null) ...[
                const SizedBox(height: 8),
                Row(
                  children: [
                    Icon(
                      s.isExpired || s.isExpiringSoon
                          ? Icons.warning_amber_rounded
                          : Icons.event_outlined,
                      size: 13,
                      color: s.isExpired
                          ? AppColors.critical
                          : s.isExpiringSoon
                              ? AppColors.warning
                              : AppColors.inkMute,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      s.isExpired
                          ? 'Expired ${fmtFullDate(s.expiresAt!)}'
                          : 'Renews / expires ${fmtFullDate(s.expiresAt!)}',
                      style: TextStyle(
                        fontSize: 12,
                        color: s.isExpired
                            ? AppColors.critical
                            : s.isExpiringSoon
                                ? AppColors.warning
                                : AppColors.inkDim,
                      ),
                    ),
                  ],
                ),
              ],
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: () => launchUrl(
                    Uri.parse(_pricingUrl),
                    mode: LaunchMode.externalApplication,
                  ),
                  icon: const Icon(Icons.workspace_premium_outlined, size: 17),
                  label: Text(
                    s.status == SubStatus.active
                        ? 'Manage subscription'
                        : 'Upgrade plan',
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: TextStyle(fontSize: 12.5, color: AppColors.inkDim)),
        Text(
          value,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: AppColors.ink,
          ),
        ),
      ],
    );
  }
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({
    required this.icon,
    required this.label,
    required this.onTap,
    this.sub,
    this.color,
  });

  final IconData icon;
  final String label;
  final String? sub;
  final Color? color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = color ?? AppColors.ink;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        child: Row(
          children: [
            Icon(icon, size: 18, color: c),
            const SizedBox(width: 13),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: TextStyle(
                        fontSize: 13.5, fontWeight: FontWeight.w600, color: c),
                  ),
                  if (sub != null) ...[
                    const SizedBox(height: 2),
                    Text(sub!,
                        style:
                            TextStyle(fontSize: 11, color: AppColors.inkMute)),
                  ],
                ],
              ),
            ),
            Icon(Icons.chevron_right, size: 18, color: AppColors.inkMute),
          ],
        ),
      ),
    );
  }
}
