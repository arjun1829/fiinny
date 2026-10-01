import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_config.dart';
import '../../../core/providers/auth_provider.dart';
import '../../../core/router/app_router.dart';
import '../../../core/widgets/state_views.dart';

final _appVersionProvider = FutureProvider<String>((ref) async {
  final info = await PackageInfo.fromPlatform();
  return '${info.version} (${info.buildNumber})';
});

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentSalesUserProvider);
    final version = ref.watch(_appVersionProvider).value ?? '—';

    return Scaffold(
      appBar: AppBar(
        title: const Text('Profile'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => context.go(Routes.home),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          AppCard(
            padding: const EdgeInsets.all(18),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 27,
                  backgroundColor: AppColors.primary.withValues(alpha: 0.10),
                  child: Text(
                    user?.initials ?? '—',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: AppColors.primary,
                    ),
                  ),
                ),
                const SizedBox(width: 15),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        user?.displayName ?? 'Sales Executive',
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: AppColors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        user?.email ?? '',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 12.5,
                          color: AppColors.onSurfaceVariant,
                        ),
                      ),
                      const SizedBox(height: 7),
                      StatusChip(
                        label: user?.isAdmin == true
                            ? 'Administrator'
                            : 'Sales Executive',
                        color: AppColors.primary,
                        background: AppColors.primaryContainer,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          if (user?.phone.isNotEmpty ?? false) ...[
            const SizedBox(height: 22),
            const SectionLabel('Contact'),
            AppCard(
              padding: EdgeInsets.zero,
              child: _Row(
                icon: Icons.phone_outlined,
                title: 'Phone',
                subtitle: user!.phone,
              ),
            ),
          ],

          const SizedBox(height: 22),
          const SectionLabel('Support'),
          AppCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                _Row(
                  icon: Icons.mail_outline_rounded,
                  title: 'Email support',
                  subtitle: AppConfig.supportEmail,
                  onTap: () => launchUrl(
                    Uri(scheme: 'mailto', path: AppConfig.supportEmail),
                    mode: LaunchMode.externalApplication,
                  ),
                ),
                const Divider(height: 1, indent: 58),
                _Row(
                  icon: Icons.call_outlined,
                  title: 'Call support',
                  subtitle: AppConfig.supportPhone,
                  onTap: () => launchUrl(
                    Uri(scheme: 'tel', path: AppConfig.supportPhone),
                    mode: LaunchMode.externalApplication,
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 22),
          const SectionLabel('App'),
          AppCard(
            padding: EdgeInsets.zero,
            child: _Row(
              icon: Icons.info_outline_rounded,
              title: 'Version',
              subtitle: version,
            ),
          ),

          const SizedBox(height: 26),
          OutlinedButton.icon(
            onPressed: () => _confirmSignOut(context, ref),
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.error,
              side: BorderSide(color: AppColors.error.withValues(alpha: 0.4)),
            ),
            icon: const Icon(Icons.logout_rounded, size: 18),
            label: const Text('Sign out'),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmSignOut(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text(
          'You will need your email and password to sign back in.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Sign out'),
          ),
        ],
      ),
    );
    if (ok == true) {
      await ref.read(salesAuthRepositoryProvider).signOut();
    }
  }
}

class _Row extends StatelessWidget {
  const _Row({
    required this.icon,
    required this.title,
    required this.subtitle,
    this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      onTap: onTap,
      leading: Icon(icon, size: 20, color: AppColors.onSurfaceVariant),
      title: Text(
        title,
        style: const TextStyle(
          fontSize: 13.5,
          fontWeight: FontWeight.w700,
          color: AppColors.onSurface,
        ),
      ),
      subtitle: Text(
        subtitle,
        style: const TextStyle(
          fontSize: 12.5,
          color: AppColors.onSurfaceVariant,
        ),
      ),
      trailing: onTap == null
          ? null
          : const Icon(
              Icons.chevron_right_rounded,
              size: 20,
              color: AppColors.outline,
            ),
    );
  }
}
