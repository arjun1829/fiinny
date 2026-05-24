import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/constants.dart';
import '../../core/i18n.dart';
import '../../core/session.dart';
import '../../core/theme.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider);
    final loc = ref.watch(localeProvider);

    return Scaffold(
      appBar: AppBar(title: Text(Strings.t('profile', loc))),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 32,
                    backgroundColor:
                        AppColors.primary.withValues(alpha: 0.10),
                    child: const Icon(Icons.person,
                        size: 36, color: AppColors.primary),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          session.phone ?? 'Guest',
                          style: const TextStyle(
                              fontSize: 16, fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          session.role?.label ?? 'Set your role',
                          style: const TextStyle(color: AppColors.muted),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: () {},
                    icon: const Icon(Icons.edit_outlined),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          if (session.role != UserRole.customer)
            Card(
              color: AppColors.primary.withValues(alpha: 0.05),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    const Icon(Icons.workspace_premium,
                        color: AppColors.accent),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            session.isSubscribed
                                ? 'Pro plan active'
                                : 'Upgrade to Pro',
                            style: const TextStyle(
                                fontWeight: FontWeight.w700),
                          ),
                          const SizedBox(height: 4),
                          const Text(
                            'Unlock unlimited listings and analytics',
                            style: TextStyle(
                                color: AppColors.muted, fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                    TextButton(
                      onPressed: () => context.push('/subscribe'),
                      child: Text(session.isSubscribed
                          ? 'Manage'
                          : Strings.t('subscribe', loc)),
                    ),
                  ],
                ),
              ),
            ),
          const SizedBox(height: 8),
          if (session.role == UserRole.retailer ||
              session.role == UserRole.manufacturer)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: InkWell(
                onTap: () => context.push('/dashboard'),
                borderRadius: BorderRadius.circular(16),
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [Color(0xFF154212), Color(0xFF1F5A28)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.dashboard_outlined,
                          color: Colors.white, size: 28),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              session.role == UserRole.manufacturer
                                  ? 'Manufacturer Dashboard'
                                  : 'Retailer Dashboard',
                              style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 15),
                            ),
                            const SizedBox(height: 2),
                            const Text(
                              'Manage inventory, subscriptions & more',
                              style: TextStyle(
                                  color: Colors.white70, fontSize: 12),
                            ),
                          ],
                        ),
                      ),
                      const Icon(Icons.chevron_right, color: Colors.white),
                    ],
                  ),
                ),
              ),
            ),
          _section('Account', [
            _row(Icons.shopping_bag_outlined, 'My orders', () {}),
            _row(Icons.location_on_outlined, 'Addresses', () {}),
            _row(Icons.favorite_border, 'Wishlist', () {}),
          ]),
          _section('Preferences', [
            _row(Icons.language, 'Language', () => _showLangSheet(context, ref)),
            _row(Icons.notifications_none, 'Notifications', () {}),
          ]),
          _section('Support', [
            _row(Icons.help_outline, 'Help & FAQ', () {}),
            _row(Icons.policy_outlined, 'Privacy policy', () {}),
            _row(Icons.info_outline, 'About', () {}),
          ]),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.danger,
              side: const BorderSide(color: AppColors.danger),
            ),
            onPressed: () async {
              await ref.read(sessionProvider.notifier).signOut();
              if (context.mounted) context.go('/welcome');
            },
            icon: const Icon(Icons.logout),
            label: const Text('Sign out'),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _section(String title, List<Widget> rows) {
    return Padding(
      padding: const EdgeInsets.only(top: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 8),
            child: Text(title,
                style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: AppColors.muted,
                    letterSpacing: 0.6)),
          ),
          Card(child: Column(children: rows)),
        ],
      ),
    );
  }

  Widget _row(IconData i, String label, VoidCallback onTap) => ListTile(
        leading: Icon(i, color: AppColors.primary),
        title: Text(label),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      );

  void _showLangSheet(BuildContext context, WidgetRef ref) {
    showModalBottomSheet<void>(
      context: context,
      builder: (_) {
        final current = ref.read(localeProvider);
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final l in AppLocale.values)
                RadioListTile<AppLocale>(
                  value: l,
                  groupValue: current,
                  title: Text(l.label),
                  onChanged: (v) {
                    ref.read(localeProvider.notifier).state = v!;
                    Navigator.pop(context);
                  },
                ),
            ],
          ),
        );
      },
    );
  }
}
