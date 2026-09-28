import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../features/analytics/bills_screen.dart';
import '../features/analytics/overview_screen.dart';
import '../features/analytics/position_screen.dart';
import '../features/analytics/receivables_screen.dart';
import '../features/auth/auth_repository.dart';
import '../features/auth/login_screen.dart';
import '../features/profile/profile_screen.dart';
import '../features/settings/theme_provider.dart';
import '../widgets/erp_fab.dart';
import '../widgets/nav_dock.dart';
import 'theme.dart';

class KrishiDukanErpApp extends ConsumerWidget {
  const KrishiDukanErpApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final variant = ref.watch(themeVariantProvider);
    // AppColors reads this synchronously wherever it's referenced during the
    // build pass that KeyedSubtree below is about to force.
    AppColors.variant = variant;

    return MaterialApp(
      title: 'KrishiDukan ERP',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      // A theme switch changes hardcoded AppColors.* reads scattered through
      // every screen, not just ThemeData — those don't rebuild on their own
      // when their ancestor widgets are const (Flutter skips rebuilding a
      // subtree whose incoming widget is identical to the last one). Keying
      // this subtree on the variant forces Flutter to tear down and rebuild
      // the whole app fresh on every switch, guaranteeing every screen picks
      // up the new palette. The cost — losing the selected nav tab and scroll
      // position — only happens on this rare, deliberate settings action.
      home: KeyedSubtree(
        key: ValueKey(variant),
        child: const _Root(),
      ),
    );
  }
}

class _Root extends ConsumerWidget {
  const _Root();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authStateProvider);

    return auth.when(
      loading: () => const _Splash(),
      error: (_, __) => const LoginScreen(),
      data: (user) {
        if (user == null) return const LoginScreen();
        // Signed in — resolve the tenant before showing any figures.
        return ref.watch(appUserProvider).when(
              loading: () => const _Splash(),
              error: (e, __) => _AccessDenied(message: _messageFor(e)),
              data: (appUser) {
                if (appUser == null) return const LoginScreen();
                if (!appUser.canViewAnalytics) {
                  return const _AccessDenied(
                    message:
                        'Your role does not include analytics access. Ask your admin for the admin or analyst role.',
                  );
                }
                return const HomeShell();
              },
            );
      },
    );
  }

  static String _messageFor(Object e) => e is TenantAccessException
      ? e.message
      : 'Could not load your account. Check your connection and try again.';
}

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  static const _screens = [
    OverviewScreen(),
    ReceivablesScreen(),
    BillsScreen(),
    PositionScreen(),
    ProfileScreen(),
  ];

  static const _items = [
    NavItem(Icons.insights_rounded, 'Overview'),
    NavItem(Icons.payments_rounded, 'Payments'),
    NavItem(Icons.receipt_long_rounded, 'Bills'),
    NavItem(Icons.account_balance_rounded, 'Position'),
    NavItem(Icons.person_rounded, 'Account'),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBody: true,
      body: Stack(
        children: [
          IndexedStack(index: _index, children: _screens),
          const Positioned(
            right: 14,
            bottom: 92,
            child: ErpFab(),
          ),
        ],
      ),
      bottomNavigationBar: NavDock(
        items: _items,
        index: _index,
        onSelect: (i) => setState(() => _index = i),
      ),
    );
  }
}

class _Splash extends StatelessWidget {
  const _Splash();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _BrandMark(),
            SizedBox(height: 22),
            SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          ],
        ),
      ),
    );
  }
}

class _BrandMark extends StatelessWidget {
  const _BrandMark();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 52,
      height: 52,
      decoration: BoxDecoration(
        color: AppColors.accent,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Icon(Icons.eco, size: 28, color: AppColors.accentInk),
    );
  }
}

class _AccessDenied extends ConsumerStatefulWidget {
  const _AccessDenied({required this.message});

  final String message;

  @override
  ConsumerState<_AccessDenied> createState() => _AccessDeniedState();
}

class _AccessDeniedState extends ConsumerState<_AccessDenied> {
  bool _busy = false;
  String? _error;

  Future<void> _signOut() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(authRepositoryProvider).signOut();
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Could not sign out. Check your connection.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final email = ref.watch(authStateProvider).valueOrNull?.email;

    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.lock_outline, size: 48, color: AppColors.inkMute),
              const SizedBox(height: 18),
              Text(
                widget.message,
                textAlign: TextAlign.center,
                style: TextStyle(color: AppColors.inkDim, fontSize: 13),
              ),
              if (email != null) ...[
                const SizedBox(height: 18),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: AppColors.card,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.person_outline,
                          size: 15, color: AppColors.inkMute),
                      const SizedBox(width: 8),
                      Flexible(
                        child: Text(
                          'Signed in as $email',
                          style:
                              TextStyle(fontSize: 12, color: AppColors.inkDim),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              if (_error != null) ...[
                const SizedBox(height: 14),
                Text(
                  _error!,
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppColors.critical, fontSize: 13),
                ),
              ],
              const SizedBox(height: 24),
              FilledButton.icon(
                style: FilledButton.styleFrom(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 22, vertical: 14),
                ),
                onPressed: _busy ? null : _signOut,
                icon: _busy
                    ? SizedBox(
                        height: 16,
                        width: 16,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: AppColors.accentInk),
                      )
                    : const Icon(Icons.logout, size: 18),
                label: Text(
                    _busy ? 'Signing out…' : 'Sign in with another account'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
