import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/constants.dart';
import '../../core/i18n.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../data/firestore_repository.dart';

// ─── Screen ───────────────────────────────────────────────────────────────────

class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});
  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  int _step = 0;
  UserRole? _role;
  bool _locationAllowed = false;

  static const _kSteps = 3;

  Future<void> _finish() async {
    if (_role != null) {
      await ref.read(sessionProvider.notifier).setRole(_role!);
    }
    final session = ref.read(sessionProvider);
    if (session.uid != null) {
      await ref.read(firestoreRepoProvider).upsertUserProfile(
            uid: session.uid!,
            phone: session.phone ?? '',
            role: _role,
          );
    }
    await ref.read(sessionProvider.notifier).completeOnboarding();
    if (!mounted) return;
    context.go('/home');
  }

  void _next() {
    if (_step < _kSteps - 1) {
      setState(() => _step++);
    } else {
      _finish();
    }
  }

  bool get _canContinue => _step != 2 || _role != null;

  @override
  Widget build(BuildContext context) {
    final loc = ref.watch(localeProvider);
    final bottomPad = MediaQuery.paddingOf(context).bottom;
    final topPad = MediaQuery.paddingOf(context).top;

    return Scaffold(
      backgroundColor: Colors.white,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // ── Progress header ──────────────────────────────────────────────
          SizedBox(height: topPad + 16),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Row(
              children: [
                // Step dots
                for (int i = 0; i < _kSteps; i++) ...[
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 300),
                    curve: Curves.easeInOut,
                    height: 8,
                    width: i == _step ? 28 : 8,
                    decoration: BoxDecoration(
                      color: i <= _step
                          ? AppColors.primary
                          : AppColors.border,
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                  if (i < _kSteps - 1) const SizedBox(width: 6),
                ],
                const Spacer(),
                // Skip (steps 0 and 1 only)
                if (_step < 2)
                  GestureDetector(
                    onTap: _next,
                    child: Padding(
                      padding: const EdgeInsets.all(4),
                      child: Text(
                        Strings.t('skip', loc),
                        style: const TextStyle(
                          color: AppColors.muted,
                          fontWeight: FontWeight.w600,
                          fontSize: 14,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),

          const SizedBox(height: 8),

          // ── Step content ─────────────────────────────────────────────────
          Expanded(
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 280),
              transitionBuilder: (child, anim) => FadeTransition(
                opacity: anim,
                child: SlideTransition(
                  position: Tween(
                    begin: const Offset(0.06, 0),
                    end: Offset.zero,
                  ).animate(anim),
                  child: child,
                ),
              ),
              child: KeyedSubtree(
                key: ValueKey(_step),
                child: switch (_step) {
                  0 => _LangStep(
                      selected: loc,
                      onSelect: (l) =>
                          ref.read(localeProvider.notifier).state = l,
                    ),
                  1 => _LocationStep(
                      allowed: _locationAllowed,
                      onAllow: () => setState(() => _locationAllowed = true),
                    ),
                  _ => _RoleStep(
                      selected: _role,
                      onSelect: (r) => setState(() => _role = r),
                    ),
                },
              ),
            ),
          ),

          // ── Continue button ──────────────────────────────────────────────
          Padding(
            padding: EdgeInsets.fromLTRB(24, 8, 24, bottomPad + 20),
            child: ElevatedButton(
              onPressed: _canContinue ? _next : null,
              child: Text(
                _step < _kSteps - 1
                    ? Strings.t('continue_btn', loc)
                    : Strings.t('get_started', loc),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Step 0 — Language ────────────────────────────────────────────────────────

class _LangStep extends StatelessWidget {
  const _LangStep({required this.selected, required this.onSelect});
  final AppLocale selected;
  final ValueChanged<AppLocale> onSelect;

  static const _meta = <AppLocale, ({String emoji, String native})>{
    AppLocale.en: (emoji: '🇬🇧', native: 'English'),
    AppLocale.hi: (emoji: '🇮🇳', native: 'हिन्दी'),
    AppLocale.mr: (emoji: '🇮🇳', native: 'मराठी'),
  };

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 16),
          // Illustration area
          Center(
            child: Container(
              width: 88,
              height: 88,
              decoration: BoxDecoration(
                color: AppColors.tintEmerald,
                shape: BoxShape.circle,
              ),
              child: const Center(
                child: Text('🌐', style: TextStyle(fontSize: 40)),
              ),
            ),
          ),
          const SizedBox(height: 28),
          const Text(
            'Choose your language',
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w800,
              height: 1.2,
              color: AppColors.text,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'You can always change this later in settings.',
            style: TextStyle(fontSize: 14, color: AppColors.muted),
          ),
          const SizedBox(height: 28),
          for (final locale in AppLocale.values) ...[
            _LangCard(
              locale: locale,
              emoji: _meta[locale]!.emoji,
              native: _meta[locale]!.native,
              selected: locale == selected,
              onTap: () => onSelect(locale),
            ),
            const SizedBox(height: 12),
          ],
        ],
      ),
    );
  }
}

class _LangCard extends StatelessWidget {
  const _LangCard({
    required this.locale,
    required this.emoji,
    required this.native,
    required this.selected,
    required this.onTap,
  });
  final AppLocale locale;
  final String emoji;
  final String native;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        decoration: BoxDecoration(
          color: selected ? AppColors.primary.withValues(alpha: 0.06) : AppColors.surfaceAlt,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: selected ? AppColors.primary : AppColors.border,
            width: selected ? 2 : 1,
          ),
        ),
        child: Row(
          children: [
            Text(emoji, style: const TextStyle(fontSize: 28)),
            const SizedBox(width: 16),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  locale.label,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: AppColors.text,
                  ),
                ),
                if (native != locale.label)
                  Text(
                    native,
                    style: const TextStyle(fontSize: 13, color: AppColors.muted),
                  ),
              ],
            ),
            const Spacer(),
            if (selected)
              const Icon(Icons.check_circle_rounded,
                  color: AppColors.primary, size: 22),
          ],
        ),
      ),
    );
  }
}

// ─── Step 1 — Location ────────────────────────────────────────────────────────

class _LocationStep extends StatelessWidget {
  const _LocationStep({required this.allowed, required this.onAllow});
  final bool allowed;
  final VoidCallback onAllow;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        children: [
          const SizedBox(height: 12),
          // Map pin illustration
          Stack(
            alignment: Alignment.center,
            children: [
              Container(
                width: 180,
                height: 180,
                decoration: BoxDecoration(
                  color: AppColors.tintEmerald,
                  shape: BoxShape.circle,
                ),
              ),
              // Outer ring
              Container(
                width: 220,
                height: 220,
                decoration: BoxDecoration(
                  color: AppColors.tintEmerald.withValues(alpha: 0.4),
                  shape: BoxShape.circle,
                ),
              ),
              // Pin
              Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 72,
                    height: 72,
                    decoration: BoxDecoration(
                      color: allowed ? AppColors.inStockFg : AppColors.primary,
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      allowed ? Icons.check_rounded : Icons.location_on_rounded,
                      color: Colors.white,
                      size: 36,
                    ),
                  ),
                  const SizedBox(height: 4),
                  // Pin tail
                  Container(
                    width: 12,
                    height: 16,
                    decoration: BoxDecoration(
                      color: allowed ? AppColors.inStockFg : AppColors.primary,
                      borderRadius: const BorderRadius.only(
                        bottomLeft: Radius.circular(6),
                        bottomRight: Radius.circular(6),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 32),
          const Text(
            'Find stores near you',
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w800,
              color: AppColors.text,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 10),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 12),
            child: Text(
              'We use your location to show which nearby shops have the products you need in stock — no guessing.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: AppColors.muted,
                fontSize: 14,
                height: 1.55,
              ),
            ),
          ),
          const SizedBox(height: 32),
          if (!allowed)
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: onAllow,
                icon: const Icon(Icons.my_location_rounded),
                label: const Text('Allow location access'),
              ),
            )
          else
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 16, vertical: 8),
                  decoration: BoxDecoration(
                    color: AppColors.inStockBg,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: const [
                      Icon(Icons.check_rounded,
                          size: 16, color: AppColors.inStockFg),
                      SizedBox(width: 6),
                      Text(
                        'Location enabled',
                        style: TextStyle(
                          color: AppColors.inStockFg,
                          fontWeight: FontWeight.w700,
                          fontSize: 14,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
        ],
      ),
    );
  }
}

// ─── Step 2 — Role ────────────────────────────────────────────────────────────

class _RoleStep extends StatelessWidget {
  const _RoleStep({required this.selected, required this.onSelect});
  final UserRole? selected;
  final ValueChanged<UserRole> onSelect;

  static const _roles = <UserRole, ({IconData icon, String subtitle})>{
    UserRole.customer: (
      icon: Icons.shopping_basket_rounded,
      subtitle: 'Browse products, compare prices, find nearby stores.',
    ),
    UserRole.retailer: (
      icon: Icons.storefront_rounded,
      subtitle: 'Manage your shop inventory and incoming orders.',
    ),
    UserRole.manufacturer: (
      icon: Icons.factory_rounded,
      subtitle: 'Manage your product catalog and dealer network.',
    ),
  };

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 16),
          const Text(
            'Who are you?',
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w800,
              color: AppColors.text,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Pick the role that fits you best. You can switch later.',
            style: TextStyle(fontSize: 14, color: AppColors.muted),
          ),
          const SizedBox(height: 24),
          for (final role in UserRole.values) ...[
            _RoleCard(
              role: role,
              meta: _roles[role]!,
              selected: role == selected,
              onTap: () => onSelect(role),
            ),
            const SizedBox(height: 12),
          ],
        ],
      ),
    );
  }
}

class _RoleCard extends StatelessWidget {
  const _RoleCard({
    required this.role,
    required this.meta,
    required this.selected,
    required this.onTap,
  });
  final UserRole role;
  final ({IconData icon, String subtitle}) meta;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: selected
              ? AppColors.primary.withValues(alpha: 0.06)
              : AppColors.surfaceAlt,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: selected ? AppColors.primary : AppColors.border,
            width: selected ? 2 : 1,
          ),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: selected
                    ? AppColors.primary
                    : AppColors.border.withValues(alpha: 0.6),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(
                meta.icon,
                color: selected ? Colors.white : AppColors.muted,
                size: 24,
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    role.label,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: selected ? AppColors.primary : AppColors.text,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    meta.subtitle,
                    style: const TextStyle(
                      fontSize: 13,
                      color: AppColors.muted,
                      height: 1.4,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Icon(
              selected
                  ? Icons.check_circle_rounded
                  : Icons.radio_button_unchecked_rounded,
              color: selected ? AppColors.primary : AppColors.border,
              size: 22,
            ),
          ],
        ),
      ),
    );
  }
}
