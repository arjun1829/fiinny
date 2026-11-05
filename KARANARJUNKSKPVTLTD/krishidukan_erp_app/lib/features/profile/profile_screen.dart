import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/erp_links.dart';
import '../../core/format.dart';
import '../../widgets/app_drawer.dart';
import '../../widgets/ui.dart';
import '../auth/auth_repository.dart';
import '../settings/theme_provider.dart';
import '../subscription/subscription_repository.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  Future<void> _changePassword(BuildContext context, WidgetRef ref) async {
    final email = ref.read(appUserProvider).valueOrNull?.email ?? '';
    final messenger = ScaffoldMessenger.of(context);
    if (email.isEmpty) return;
    try {
      await ref.read(authRepositoryProvider).sendPasswordReset(email);
      messenger.showSnackBar(
        SnackBar(content: Text('Password reset link sent to $email')),
      );
    } catch (_) {
      messenger.showSnackBar(
        const SnackBar(
            content: Text('Could not send the reset link. Try again.')),
      );
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(appUserProvider).valueOrNull;

    return Column(
      children: [
        const PageHeader(title: 'Account'),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
            children: [
              AppCard(
                child: Row(
                  children: [
                    InitialAvatar(user?.name ?? '', size: 56),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            user?.name ?? '—',
                            style: AppText.title.copyWith(fontSize: 18),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            user?.email ?? '',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppText.label,
                          ),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 6,
                            runSpacing: 6,
                            children: [
                              if ((user?.businessName ?? '').isNotEmpty)
                                StatusChip(user!.businessName,
                                    color: AppColors.inkDim, dot: false),
                              if (user != null)
                                StatusChip(_roleLabel(user.role),
                                    color: AppColors.primary, dot: false),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SectionHeader('Subscription'),
              const _SubscriptionCard(),
              const SectionHeader('Appearance'),
              const _ThemePicker(),
              const SectionHeader('Settings'),
              AppCard(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Column(
                  children: [
                    _SettingsTile(
                      icon: Icons.language_rounded,
                      label: 'Open web ERP',
                      sub: 'karanarjunerp.com',
                      external: true,
                      onTap: () => openErp(context),
                    ),
                    const Divider(indent: 56),
                    _SettingsTile(
                      icon: Icons.lock_reset_rounded,
                      label: 'Change password',
                      sub: 'We\'ll email you a reset link',
                      onTap: () => _changePassword(context, ref),
                    ),
                    const Divider(indent: 56),
                    _SettingsTile(
                      icon: Icons.settings_outlined,
                      label: 'Business settings',
                      sub: 'Invoice format, users, roles',
                      external: true,
                      onTap: () => openErp(context, '/settings'),
                    ),
                    const Divider(indent: 56),
                    _SettingsTile(
                      icon: Icons.logout_rounded,
                      label: 'Log out',
                      color: AppColors.critical,
                      onTap: () => confirmSignOut(context, ref),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              Center(
                child: Text(
                  'KrishiDukan ERP · Figures are read-only here.\nCreate and edit in the web ERP.',
                  textAlign: TextAlign.center,
                  style: AppText.small,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  static String _roleLabel(String role) => switch (role) {
        'admin' => 'Admin',
        'analyst' => 'Analyst',
        'master' => 'Owner',
        _ => role.isEmpty ? '—' : role[0].toUpperCase() + role.substring(1),
      };
}

class _ThemePicker extends ConsumerWidget {
  const _ThemePicker();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selected = ref.watch(themeVariantProvider);
    return AppCard(
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          for (final v in AppThemeVariant.values) ...[
            if (v != AppThemeVariant.values.first) const SizedBox(width: 10),
            Expanded(
              child: _ThemeOption(
                variant: v,
                selected: v == selected,
                onTap: () => ref.read(themeVariantProvider.notifier).set(v),
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

  // Fixed preview swatches — they show what tapping looks like, so they
  // can't read the live (other) palette.
  static const _swatch = {
    AppThemeVariant.light: (
      Color(0xFFF3F5F9),
      Color(0xFFFFFFFF),
      Color(0xFF1463E6)
    ),
    AppThemeVariant.dark: (
      Color(0xFF0E1116),
      Color(0xFF1F242E),
      Color(0xFF4C8DFF)
    ),
  };

  @override
  Widget build(BuildContext context) {
    final (bg, card, primary) = _swatch[variant]!;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected ? AppColors.primary : AppColors.border,
            width: selected ? 2 : 1,
          ),
        ),
        child: Column(
          children: [
            Container(
              height: 54,
              padding: const EdgeInsets.all(7),
              decoration: BoxDecoration(
                color: bg,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: const Color(0x22000000)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Container(
                    height: 10,
                    decoration: BoxDecoration(
                      color: primary,
                      borderRadius: BorderRadius.circular(3),
                    ),
                  ),
                  const SizedBox(height: 5),
                  Expanded(
                    child: Container(
                      decoration: BoxDecoration(
                        color: card,
                        borderRadius: BorderRadius.circular(3),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  selected
                      ? Icons.radio_button_checked_rounded
                      : Icons.radio_button_off_rounded,
                  size: 16,
                  color: selected ? AppColors.primary : AppColors.inkMute,
                ),
                const SizedBox(width: 6),
                Text(
                  variant.label,
                  style: TextStyle(
                    fontSize: 13.5,
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                    color: AppColors.ink,
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
    final s = sub.valueOrNull;

    // The pay button renders in every state — loading, error, no plan — so
    // the way to pay is never hidden behind a status we failed to read.
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (sub.isLoading)
            const SkeletonBox(height: 44)
          else if (sub.hasError || s == null)
            Text('Could not load your plan status.', style: AppText.label)
          else
            _SubscriptionStatus(s: s),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: () => openErp(context, '/pricing'),
              icon: const Icon(Icons.workspace_premium_outlined, size: 18),
              label: Text(s?.status == SubStatus.active
                  ? 'Manage subscription'
                  : 'Upgrade plan'),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Opens the pricing page on karanarjunerp.com. Sign in there with '
            'this same account — your plan updates here automatically.',
            style: AppText.small,
          ),
        ],
      ),
    );
  }
}

class _SubscriptionStatus extends StatelessWidget {
  const _SubscriptionStatus({required this.s});

  final TenantSubscription s;

  @override
  Widget build(BuildContext context) {
    final (label, color) = switch (s.status) {
      SubStatus.active => ('Active', AppColors.good),
      SubStatus.trial => ('Trial', AppColors.primary),
      SubStatus.pastDue => ('Payment due', AppColors.warning),
      SubStatus.suspended => ('Suspended', AppColors.critical),
      SubStatus.cancelled => ('Cancelled', AppColors.critical),
      SubStatus.none => ('No active plan', AppColors.critical),
    };
    final dateColor = s.isExpired
        ? AppColors.critical
        : s.isExpiringSoon
            ? AppColors.warning
            : AppColors.inkMute;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            IconBadge(
                icon: Icons.workspace_premium_outlined,
                color: AppColors.primary,
                size: 36),
            const SizedBox(width: 12),
            Expanded(
              child: Text(s.planName,
                  style: AppText.body
                      .copyWith(fontSize: 16, fontWeight: FontWeight.w700)),
            ),
            StatusChip(label, color: color),
          ],
        ),
        if (s.expiresAt != null) ...[
          const SizedBox(height: 10),
          Row(
            children: [
              Icon(
                s.isExpired || s.isExpiringSoon
                    ? Icons.warning_amber_rounded
                    : Icons.event_outlined,
                size: 15,
                color: dateColor,
              ),
              const SizedBox(width: 6),
              Text(
                s.isExpired
                    ? 'Expired on ${fmtFullDate(s.expiresAt!)}'
                    : 'Renews / expires on ${fmtFullDate(s.expiresAt!)}',
                style: TextStyle(fontSize: 12.5, color: dateColor),
              ),
            ],
          ),
        ],
      ],
    );
  }
}

class _SettingsTile extends StatelessWidget {
  const _SettingsTile({
    required this.icon,
    required this.label,
    required this.onTap,
    this.sub,
    this.color,
    this.external = false,
  });

  final IconData icon;
  final String label;
  final String? sub;
  final Color? color;
  final bool external;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = color ?? AppColors.ink;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
        child: Row(
          children: [
            Icon(icon, size: 22, color: color ?? AppColors.inkDim),
            const SizedBox(width: 18),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label,
                      style: TextStyle(
                          fontSize: 14.5,
                          fontWeight: FontWeight.w600,
                          color: c)),
                  if (sub != null) ...[
                    const SizedBox(height: 2),
                    Text(sub!, style: AppText.small),
                  ],
                ],
              ),
            ),
            Icon(
              external ? Icons.north_east_rounded : Icons.chevron_right_rounded,
              size: external ? 16 : 20,
              color: AppColors.inkMute,
            ),
          ],
        ),
      ),
    );
  }
}
