import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/providers/app_info_provider.dart';
import '../../../core/providers/locale_provider.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/widgets/app_brand_icon.dart';
import '../../../core/widgets/app_top_bar.dart';
import '../../reels/data/reels_repository.dart';

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
        elevation: 0,
        backgroundColor: Colors.transparent,
        foregroundColor: Colors.white,
        flexibleSpace: Container(
          decoration: BoxDecoration(gradient: topBarGradient()),
        ),
        titleSpacing: 16,
        title: Row(
          children: [
            const AppBrandIcon(size: 30),
            const SizedBox(width: 10),
            Text(
              isHindi ? 'प्रोफ़ाइल' : 'Profile',
              style: AppTextStyles.heading2
                  .copyWith(color: Colors.white, fontSize: 18),
            ),
          ],
        ),
        automaticallyImplyLeading: true,
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
              // Username — tap to set/edit (sellers only)
              if (user.isSeller)
                GestureDetector(
                  onTap: () => showModalBottomSheet(
                    context: context,
                    isScrollControlled: true,
                    backgroundColor: Colors.transparent,
                    builder: (_) => _SetUsernameSheet(user: user),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          user.username != null
                              ? '@${user.username}'
                              : (isHindi
                                  ? '+ यूज़रनेम जोड़ें'
                                  : '+ Add username'),
                          style: AppTextStyles.bodyMedium.copyWith(
                            color: user.username != null
                                ? AppColors.primary
                                : AppColors.onSurfaceVariant,
                            fontWeight: user.username != null
                                ? FontWeight.w600
                                : FontWeight.normal,
                          ),
                        ),
                        const SizedBox(width: 4),
                        Icon(
                          Icons.edit_outlined,
                          size: 14,
                          color: user.username != null
                              ? AppColors.primary
                              : AppColors.onSurfaceVariant,
                        ),
                      ],
                    ),
                  ),
                ),
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

        // Prompt to finish profile when key fields are missing.
        if (!user.isProfileComplete) ...[
          InkWell(
            onTap: () => context.push('/profile/edit'),
            borderRadius: BorderRadius.circular(12),
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.secondaryContainer.withValues(alpha: 0.4),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: AppColors.secondary.withValues(alpha: 0.4),
                ),
              ),
              child: Row(
                children: [
                  const Icon(Icons.info_outline, color: AppColors.secondary),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      isHindi
                          ? 'अपनी प्रोफ़ाइल पूरी करें (नाम, पता${user.isSeller ? ', दुकान का नाम' : ''})'
                          : 'Complete your profile (name, address${user.isSeller ? ', shop name' : ''})',
                      style: AppTextStyles.bodySmall,
                    ),
                  ),
                  const Icon(Icons.chevron_right,
                      size: 18, color: AppColors.onSurfaceVariant),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
        ],

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
              icon: Icons.edit_outlined,
              label: isHindi ? 'प्रोफ़ाइल संपादित करें' : 'Edit Profile',
              onTap: () => context.push('/profile/edit'),
            ),
            _LinkRow(
              icon: Icons.receipt_long_outlined,
              label: isHindi ? 'ऑर्डर इतिहास' : 'Order History',
              onTap: () => context.push('/orders'),
            ),
            _LinkRow(
              icon: Icons.support_agent_outlined,
              label: isHindi ? 'सहायता और समर्थन' : 'Help & Support',
              onTap: () => context.push('/support'),
            ),
            if (user.isSeller)
              _LinkRow(
                icon: user.canAccessDashboard
                    ? Icons.dashboard_outlined
                    : Icons.lock_outline,
                label: user.canAccessDashboard
                    ? (isHindi ? 'विक्रेता डैशबोर्ड' : 'Seller Dashboard')
                    : (isHindi
                        ? 'विक्रेता डैशबोर्ड (सदस्यता लें)'
                        : 'Seller Dashboard (Subscribe)'),
                // Unpaid sellers are redirected to the paywall by the router
                // guard on /dashboard, so they can purchase a subscription.
                onTap: () => context.push('/dashboard'),
              ),
            if (user.isSeller)
              _LinkRow(
                icon: Icons.storefront_outlined,
                label: isHindi ? 'मेरी दुकान' : 'My Shop',
                onTap: () => context.push('/shop/${user.phone}'),
              ),
            if (user.isSeller)
              _LinkRow(
                icon: Icons.alternate_email,
                label: user.username != null
                    ? '@${user.username}'
                    : (isHindi ? 'यूज़रनेम सेट करें' : 'Set Username'),
                onTap: () => showModalBottomSheet(
                  context: context,
                  isScrollControlled: true,
                  backgroundColor: Colors.transparent,
                  builder: (_) => _SetUsernameSheet(user: user),
                ),
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
          child: Text(
            ref.watch(appVersionProvider).maybeWhen(
                  data: (v) => 'KrishiDukan v$v',
                  orElse: () => 'KrishiDukan',
                ),
            style: AppTextStyles.caption,
          ),
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

// ── Username bottom sheet ─────────────────────────────────────────────────────

enum _CheckState { idle, checking, available, taken, invalid }

class _SetUsernameSheet extends ConsumerStatefulWidget {
  final dynamic user;
  const _SetUsernameSheet({required this.user});

  @override
  ConsumerState<_SetUsernameSheet> createState() => _SetUsernameSheetState();
}

class _SetUsernameSheetState extends ConsumerState<_SetUsernameSheet> {
  final _ctrl = TextEditingController();
  _CheckState _checkState = _CheckState.idle;
  bool _saving = false;

  static final _validPattern = RegExp(r'^[a-z0-9_]{3,20}$');

  @override
  void initState() {
    super.initState();
    if (widget.user.username != null) {
      _ctrl.text = widget.user.username as String;
      _checkState = _CheckState.available;
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _onChanged(String raw) async {
    final val = raw.toLowerCase().trim();
    if (val.isEmpty) {
      setState(() => _checkState = _CheckState.idle);
      return;
    }
    if (!_validPattern.hasMatch(val)) {
      setState(() => _checkState = _CheckState.invalid);
      return;
    }
    setState(() => _checkState = _CheckState.checking);
    final repo = ReelsRepository();
    final available = await repo.checkUsernameAvailable(
      val,
      widget.user.phone as String,
    );
    if (!mounted) return;
    setState(() =>
        _checkState = available ? _CheckState.available : _CheckState.taken);
  }

  Future<void> _save() async {
    final handle = _ctrl.text.toLowerCase().trim();
    if (!_validPattern.hasMatch(handle)) return;
    setState(() => _saving = true);
    try {
      final repo = ReelsRepository();
      await repo.setUsername(
        username: handle,
        phone: widget.user.phone as String,
        businessName:
            (widget.user.businessName ?? widget.user.name ?? '') as String,
        role: widget.user.role as String,
        oldUsername: widget.user.username as String?,
      );
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to save: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomPad = MediaQuery.of(context).viewInsets.bottom;
    final canSave = _checkState == _CheckState.available && !_saving;

    Widget? statusWidget;
    switch (_checkState) {
      case _CheckState.checking:
        statusWidget = const Row(children: [
          SizedBox(
              width: 14,
              height: 14,
              child: CircularProgressIndicator(strokeWidth: 2)),
          SizedBox(width: 8),
          Text('Checking…'),
        ]);
      case _CheckState.available:
        statusWidget = Row(children: [
          const Icon(Icons.check_circle, color: Colors.green, size: 16),
          const SizedBox(width: 6),
          Text('@${_ctrl.text.toLowerCase()} is available',
              style: const TextStyle(color: Colors.green)),
        ]);
      case _CheckState.taken:
        statusWidget = Row(children: [
          const Icon(Icons.cancel, color: Colors.red, size: 16),
          const SizedBox(width: 6),
          Text('@${_ctrl.text.toLowerCase()} is taken',
              style: const TextStyle(color: Colors.red)),
        ]);
      case _CheckState.invalid:
        statusWidget = const Text(
          'Only a–z, 0–9 and _ allowed (3–20 chars)',
          style: TextStyle(color: Colors.orange),
        );
      case _CheckState.idle:
        statusWidget = null;
    }

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.fromLTRB(24, 24, 24, 24 + bottomPad),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.only(bottom: 20),
              decoration: BoxDecoration(
                color: AppColors.divider,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          Text('Set Username', style: AppTextStyles.heading2),
          const SizedBox(height: 6),
          Text(
            'A unique handle others can use to find your shop. Once set, it can be changed later.',
            style: AppTextStyles.bodySmall
                .copyWith(color: AppColors.onSurfaceVariant),
          ),
          const SizedBox(height: 20),
          TextField(
            controller: _ctrl,
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'[a-zA-Z0-9_]')),
              LengthLimitingTextInputFormatter(20),
            ],
            onChanged: (v) {
              _ctrl.value = _ctrl.value.copyWith(
                text: v.toLowerCase(),
                selection: TextSelection.collapsed(
                    offset: v.toLowerCase().length),
              );
              _onChanged(v);
            },
            decoration: InputDecoration(
              prefixText: '@',
              prefixStyle: AppTextStyles.bodyMedium
                  .copyWith(color: AppColors.primary, fontWeight: FontWeight.bold),
              hintText: 'yourshopname',
              border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12)),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide:
                    const BorderSide(color: AppColors.primary, width: 2),
              ),
            ),
            autofocus: true,
          ),
          if (statusWidget != null) ...[
            const SizedBox(height: 8),
            statusWidget,
          ],
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: canSave ? _save : null,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primary,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
              ),
              child: _saving
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                  : const Text('Save Username'),
            ),
          ),
        ],
      ),
    );
  }
}
