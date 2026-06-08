import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/providers/locale_provider.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/widgets/app_brand_icon.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userAsync = ref.watch(currentUserProvider);
    final locale = ref.watch(localeProvider);
    final isHindi = locale.languageCode == 'hi';

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        titleSpacing: 16,
        title: Row(
          children: [
            const AppBrandIcon(size: 34),
            const SizedBox(width: 10),
            Text(
              isHindi ? 'प्रोफ़ाइल' : 'Profile',
              style: AppTextStyles.heading2.copyWith(color: Colors.white),
            ),
          ],
        ),
        automaticallyImplyLeading: false,
      ),
      body: userAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => const Center(child: Text('Failed to load profile.')),
        data: (user) {
          if (user == null) {
            return _GuestView(isHindi: isHindi);
          }
          return _ProfileBody(user: user, isHindi: isHindi, locale: locale);
        },
      ),
    );
  }
}

class _ProfileBody extends ConsumerWidget {
  final dynamic user;
  final bool isHindi;
  final dynamic locale;
  const _ProfileBody({
    required this.user,
    required this.isHindi,
    required this.locale,
  });

  String _roleLabel(String role, bool hindi) {
    switch (role) {
      case 'manufacturer':
        return hindi ? 'निर्माता' : 'Manufacturer';
      case 'retailer':
        return hindi ? 'खुदरा विक्रेता' : 'Retailer';
      default:
        return hindi ? 'उपभोक्ता' : 'Consumer';
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Avatar + name
        Center(
          child: Column(
            children: [
              const SizedBox(height: 8),
              CircleAvatar(
                radius: 40,
                backgroundColor: AppColors.primaryContainer,
                child: Text(
                  user.name.isNotEmpty ? user.name[0].toUpperCase() : '?',
                  style: AppTextStyles.heading1.copyWith(
                    color: AppColors.primary,
                    fontSize: 32,
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Text(user.name, style: AppTextStyles.heading2),
              const SizedBox(height: 4),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color: AppColors.primaryContainer,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  _roleLabel(user.role, isHindi),
                  style: AppTextStyles.caption.copyWith(
                    color: AppColors.primary,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),

        // Account info card
        _Card(
          title: isHindi ? 'खाता जानकारी' : 'Account Info',
          children: [
            _InfoRow(
              icon: Icons.phone_outlined,
              label: isHindi ? 'फ़ोन' : 'Phone',
              value: user.phone,
            ),
            _InfoRow(
              icon: Icons.badge_outlined,
              label: isHindi ? 'भूमिका' : 'Role',
              value: _roleLabel(user.role, isHindi),
            ),
          ],
        ),
        const SizedBox(height: 12),

        // Quick links
        _Card(
          title: isHindi ? 'त्वरित लिंक' : 'Quick Links',
          children: [
            _LinkRow(
              icon: Icons.receipt_long_outlined,
              label: isHindi ? 'ऑर्डर इतिहास' : 'Order History',
              onTap: () => context.push('/orders'),
            ),
            if (user.canAccessDashboard)
              _LinkRow(
                icon: Icons.dashboard_outlined,
                label: isHindi ? 'विक्रेता डैशबोर्ड' : 'Seller Dashboard',
                onTap: () => context.push('/dashboard'),
              ),
          ],
        ),
        const SizedBox(height: 12),

        // Language toggle
        _Card(
          title: isHindi ? 'भाषा' : 'Language',
          children: [
            _LanguageTile(
              label: 'English',
              selected: !isHindi,
              onTap: () => ref
                  .read(localeProvider.notifier)
                  .setLocale(const Locale('en')),
            ),
            _LanguageTile(
              label: 'हिंदी (Hindi)',
              selected: isHindi,
              onTap: () => ref
                  .read(localeProvider.notifier)
                  .setLocale(const Locale('hi')),
            ),
          ],
        ),
        const SizedBox(height: 24),

        // Logout
        OutlinedButton.icon(
          onPressed: () async {
            await FirebaseAuth.instance.signOut();
            if (context.mounted) context.go('/');
          },
          icon: const Icon(Icons.logout, color: AppColors.error),
          label: Text(
            isHindi ? 'लॉग आउट' : 'Logout',
            style: AppTextStyles.bodyMedium.copyWith(color: AppColors.error),
          ),
          style: OutlinedButton.styleFrom(
            side: const BorderSide(color: AppColors.error),
            padding: const EdgeInsets.symmetric(vertical: 14),
            minimumSize: const Size(double.infinity, 0),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),
        const SizedBox(height: 8),
        Center(
          child: Text('KrishiDukaan v1.0.0', style: AppTextStyles.caption),
        ),
        const SizedBox(height: 80),
      ],
    );
  }
}

class _GuestView extends StatelessWidget {
  final bool isHindi;
  const _GuestView({required this.isHindi});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.person_outline,
            size: 72,
            color: AppColors.onSurfaceVariant,
          ),
          const SizedBox(height: 16),
          Text(
            isHindi
                ? 'खाते तक पहुंचने के लिए लॉगिन करें'
                : 'Login to access your account',
            style: AppTextStyles.body,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: () => context.push('/login'),
            child: Text(isHindi ? 'साइन इन करें' : 'Sign In'),
          ),
        ],
      ),
    );
  }
}

class _Card extends StatelessWidget {
  final String title;
  final List<Widget> children;
  const _Card({required this.title, required this.children});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: AppColors.cardShadow,
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: AppTextStyles.heading3),
          const SizedBox(height: 8),
          ...children,
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Icon(icon, size: 18, color: AppColors.onSurfaceVariant),
          const SizedBox(width: 10),
          Text(
            label,
            style: AppTextStyles.caption.copyWith(
              color: AppColors.onSurfaceVariant,
            ),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              value,
              style: AppTextStyles.bodyMedium,
              textAlign: TextAlign.end,
            ),
          ),
        ],
      ),
    );
  }
}

class _LinkRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  const _LinkRow({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          children: [
            Icon(icon, size: 18, color: AppColors.primary),
            const SizedBox(width: 10),
            Expanded(child: Text(label, style: AppTextStyles.bodyMedium)),
            const Icon(
              Icons.chevron_right,
              size: 18,
              color: AppColors.onSurfaceVariant,
            ),
          ],
        ),
      ),
    );
  }
}

class _LanguageTile extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _LanguageTile({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          children: [
            Icon(
              selected ? Icons.radio_button_checked : Icons.radio_button_off,
              color: selected ? AppColors.primary : AppColors.onSurfaceVariant,
              size: 20,
            ),
            const SizedBox(width: 10),
            Text(label, style: AppTextStyles.bodyMedium),
          ],
        ),
      ),
    );
  }
}
