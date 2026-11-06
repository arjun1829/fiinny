import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/access.dart';
import '../features/auth/auth_repository.dart';
import '../features/auth/login_screen.dart';
import '../features/settings/theme_provider.dart';
import '../widgets/app_drawer.dart';
import '../widgets/offline_banner.dart';
import '../widgets/ui.dart';
import 'navigation.dart';
import 'tab_screens.dart';
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
      // Screens read AppColors.* directly, and const subtrees don't rebuild
      // on their own — keying on the variant remounts the app so every screen
      // picks up the new palette. Only happens on a deliberate theme switch.
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

    final child = auth.when(
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
                if (!appUser.can.canUseApp) {
                  return const _AccessDenied(
                    message:
                        'This app is for your business team (admin, analyst, shopkeeper or sales). '
                        'Retailer and manufacturer accounts use their portal in the web ERP.',
                  );
                }
                return const HomeShell();
              },
            );
      },
    );

    // Cross-fade between splash → login → app instead of hard cuts.
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 280),
      child: KeyedSubtree(key: ValueKey(child.runtimeType), child: child),
    );
  }

  static String _messageFor(Object e) => e is TenantAccessException
      ? e.message
      : 'Could not load your account. Check your connection and try again.';
}

class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  final _scaffold = GlobalKey<ScaffoldState>();

  @override
  Widget build(BuildContext context) {
    final access = ref.watch(accessProvider);
    if (access == null) return const _Splash();

    // Role and plan decide which screens exist. Selection is a tab (not an
    // index) so a plan entitlement arriving a beat after the role never
    // jumps the user to a different screen.
    final stack = stackTabsFor(access);
    final bar = barTabsFor(access);
    final more = barHasMore(access);
    final requested = ref.watch(currentTabProvider);
    final tab = stack.contains(requested) ? requested : stack.first;
    final barIndex = bar.indexOf(tab);

    // Android back from any tab goes to the first tab, then exits.
    return PopScope(
      canPop: tab == stack.first,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) {
          ref.read(currentTabProvider.notifier).state = stack.first;
        }
      },
      child: Scaffold(
        key: _scaffold,
        drawer: const AppDrawer(),
        body: Column(
          children: [
            const OfflineBanner(),
            Expanded(
              child: IndexedStack(
                index: stack.indexOf(tab),
                children: [
                  for (final t in stack)
                    KeyedSubtree(key: ValueKey(t), child: screenForTab(t)),
                ],
              ),
            ),
          ],
        ),
        bottomNavigationBar: bar.length + (more ? 1 : 0) < 2
            ? null
            : DecoratedBox(
                decoration: BoxDecoration(
                  border: Border(top: BorderSide(color: AppColors.border)),
                ),
                child: NavigationBar(
                  // A screen reached from the drawer lights up "More".
                  selectedIndex: barIndex >= 0 ? barIndex : bar.length,
                  onDestinationSelected: (i) {
                    if (i == bar.length) {
                      _scaffold.currentState?.openDrawer();
                    } else {
                      ref.read(currentTabProvider.notifier).state = bar[i];
                    }
                  },
                  destinations: [
                    for (final t in bar)
                      NavigationDestination(
                        icon: Icon(tabMeta[t]!.icon),
                        selectedIcon: Icon(tabMeta[t]!.selectedIcon),
                        label: tabMeta[t]!.barLabel,
                      ),
                    if (more)
                      const NavigationDestination(
                        icon: Icon(Icons.menu_rounded),
                        label: 'More',
                      ),
                  ],
                ),
              ),
      ),
    );
  }
}

class _Splash extends StatelessWidget {
  const _Splash();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const BrandLogo(size: 112),
            const SizedBox(height: 28),
            SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(
                strokeWidth: 2.4,
                color: AppColors.primary,
              ),
            ),
          ],
        ),
      ),
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
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(28),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  IconBadge(
                    icon: Icons.lock_outline_rounded,
                    color: AppColors.warning,
                    size: 68,
                  ),
                  const SizedBox(height: 20),
                  Text('Access needed', style: AppText.title),
                  const SizedBox(height: 8),
                  Text(
                    widget.message,
                    textAlign: TextAlign.center,
                    style: TextStyle(color: AppColors.inkDim, fontSize: 14),
                  ),
                  if (email != null) ...[
                    const SizedBox(height: 20),
                    AppCard(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 12),
                      child: Row(
                        children: [
                          InitialAvatar(email, size: 32),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('Signed in as', style: AppText.small),
                                Text(email,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: AppText.body),
                              ],
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
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: _busy ? null : _signOut,
                      icon: _busy
                          ? SizedBox(
                              height: 16,
                              width: 16,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2, color: AppColors.onPrimary),
                            )
                          : const Icon(Icons.swap_horiz_rounded, size: 20),
                      label: Text(_busy
                          ? 'Signing out…'
                          : 'Sign in with another account'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
