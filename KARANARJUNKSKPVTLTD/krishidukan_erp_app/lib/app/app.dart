import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/access.dart';
import '../features/analytics/bills_screen.dart';
import '../features/analytics/overview_screen.dart';
import '../features/analytics/position_screen.dart';
import '../features/analytics/receivables_screen.dart';
import '../features/auth/auth_repository.dart';
import '../features/auth/login_screen.dart';
import '../features/billing/b2b_invoice_screen.dart';
import '../features/billing/pos_screen.dart';
import '../features/billing/sell_screen.dart';
import '../features/business/expenses_screen.dart';
import '../features/business/online_orders_screen.dart';
import '../features/business/stock_movements_screen.dart';
import '../features/business/suppliers_screen.dart';
import '../features/khata/khata_screen.dart';
import '../features/catalog/products_screen.dart';
import '../features/customers/customers_screen.dart';
import '../features/profile/profile_screen.dart';
import '../features/settings/theme_provider.dart';
import '../widgets/erp_fab.dart' show erpUrl;
import '../widgets/nav_dock.dart';
import '../widgets/offline_banner.dart';
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
  }

  static String _messageFor(Object e) => e is TenantAccessException
      ? e.message
      : 'Could not load your account. Check your connection and try again.';
}

/// One navigable screen. Which ones exist depends on the signed-in role and
/// the tenant's plan (see core/access.dart) — the dock and the drawer are
/// both built from this same list, so they can never disagree.
class _Dest {
  const _Dest(this.id, this.icon, this.label, this.screen);
  final String id;
  final IconData icon;
  final String label;
  final Widget screen;
}

List<_Dest> _destinationsFor(Access a) => [
      if (a.analytics)
        const _Dest('overview', Icons.insights_rounded, 'Overview', OverviewScreen()),
      if (a.can.canViewBills)
        const _Dest('sell', Icons.point_of_sale_rounded, 'Sell', SellScreen()),
      if (a.bills)
        const _Dest('bills', Icons.receipt_long_rounded, 'Bills', BillsScreen()),
      if (a.customers)
        const _Dest('customers', Icons.people_alt_rounded, 'Customers', CustomersScreen()),
      if (a.products)
        const _Dest('products', Icons.inventory_2_rounded, 'Stock', ProductsScreen()),
      if (a.analytics)
        const _Dest('payments', Icons.payments_rounded, 'Payments due', ReceivablesScreen()),
      if (a.analytics)
        const _Dest('position', Icons.account_balance_rounded, 'Position', PositionScreen()),
      const _Dest('account', Icons.person_rounded, 'Account', ProfileScreen()),
    ];

/// Dock order: the first four of these that the role has, then "More".
const _dockPriority = [
  'overview', 'sell', 'customers', 'products', 'bills', 'payments', 'account'
];

class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  final _scaffold = GlobalKey<ScaffoldState>();
  String? _current;

  @override
  Widget build(BuildContext context) {
    final access = ref.watch(accessProvider);
    if (access == null) return const _Splash();
    final dests = _destinationsFor(access);
    final ids = dests.map((d) => d.id).toList();
    // Selection is tracked by id, not index: plan entitlements arrive a beat
    // after the role, and a tab appearing must not jump the user elsewhere.
    final current = ids.contains(_current) ? _current! : ids.first;

    final dock = [
      for (final id in _dockPriority)
        if (ids.contains(id)) dests.firstWhere((d) => d.id == id)
    ].take(4).toList();
    final dockIndex = dock.indexWhere((d) => d.id == current);

    return Scaffold(
      key: _scaffold,
      extendBody: true,
      endDrawer: _MoreDrawer(
        dests: dests,
        current: current,
        access: access,
        onSelect: (id) {
          Navigator.of(context).pop();
          setState(() => _current = id);
        },
      ),
      body: Column(
        children: [
          const OfflineBanner(),
          Expanded(
            child: IndexedStack(
              index: ids.indexOf(current),
              children: [
                for (final d in dests)
                  KeyedSubtree(key: ValueKey(d.id), child: d.screen),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: NavDock(
        items: [
          for (final d in dock) NavItem(d.icon, d.label),
          const NavItem(Icons.menu_rounded, 'More'),
        ],
        // A screen reached from the drawer lights up "More".
        index: dockIndex >= 0 ? dockIndex : dock.length,
        onSelect: (i) {
          if (i == dock.length) {
            _scaffold.currentState?.openEndDrawer();
          } else {
            setState(() => _current = dock[i].id);
          }
        },
      ),
    );
  }
}

class _MoreDrawer extends ConsumerWidget {
  const _MoreDrawer({
    required this.dests,
    required this.current,
    required this.access,
    required this.onSelect,
  });

  final List<_Dest> dests;
  final String current;
  final Access access;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(appUserProvider).valueOrNull;
    void push(Widget w) {
      Navigator.of(context).pop();
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => w));
    }

    return Drawer(
      backgroundColor: AppColors.surface,
      child: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(12, 14, 12, 20),
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 0, 8, 14),
              child: Row(children: [
                const _BrandMark(),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(user?.businessName ?? '',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 15,
                              color: AppColors.ink)),
                      Text('${user?.name ?? ''} · ${user?.role ?? ''}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              fontSize: 12, color: AppColors.inkMute)),
                    ],
                  ),
                ),
              ]),
            ),
            if (access.anyBilling) ...[
              const _DrawerHeading('Quick actions'),
              if (access.pos)
                _DrawerTile(
                  icon: Icons.add_shopping_cart_rounded,
                  label: 'New POS bill',
                  onTap: () => push(const PosScreen()),
                ),
              if (access.b2b)
                _DrawerTile(
                  icon: Icons.note_add_rounded,
                  label: 'New B2B invoice',
                  onTap: () => push(const B2bInvoiceScreen()),
                ),
            ],
            const _DrawerHeading('Screens'),
            for (final d in dests)
              _DrawerTile(
                icon: d.icon,
                label: d.label,
                selected: d.id == current,
                onTap: () => onSelect(d.id),
              ),
            if (access.khata ||
                access.suppliers ||
                access.stockMovements ||
                access.expenses ||
                access.onlineOrders) ...[
              const _DrawerHeading('Ledgers & records'),
              if (access.khata)
                _DrawerTile(
                  icon: Icons.menu_book_rounded,
                  label: 'Khata (Udhari)',
                  onTap: () => push(const KhataScreen()),
                ),
              if (access.suppliers)
                _DrawerTile(
                  icon: Icons.local_shipping_rounded,
                  label: 'Supplier ledger',
                  onTap: () => push(const SuppliersScreen()),
                ),
              if (access.stockMovements)
                _DrawerTile(
                  icon: Icons.swap_vert_rounded,
                  label: 'Stock movement',
                  onTap: () => push(const StockMovementsScreen()),
                ),
              if (access.expenses)
                _DrawerTile(
                  icon: Icons.account_balance_wallet_rounded,
                  label: 'Expenses',
                  onTap: () => push(const ExpensesScreen()),
                ),
              if (access.onlineOrders)
                _DrawerTile(
                  icon: Icons.shopping_bag_rounded,
                  label: 'Online orders',
                  onTap: () => push(const OnlineOrdersScreen()),
                ),
            ],
            const _DrawerHeading('More'),
            _DrawerTile(
              icon: Icons.open_in_new_rounded,
              label: 'Open full web ERP',
              onTap: () {
                Navigator.of(context).pop();
                launchUrl(Uri.parse(erpUrl),
                    mode: LaunchMode.externalApplication);
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _DrawerHeading extends StatelessWidget {
  const _DrawerHeading(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(10, 16, 10, 6),
        child: Text(text.toUpperCase(), style: kMicro),
      );
}

class _DrawerTile extends StatelessWidget {
  const _DrawerTile({
    required this.icon,
    required this.label,
    required this.onTap,
    this.selected = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 2),
      child: ListTile(
        dense: true,
        selected: selected,
        selectedTileColor: AppColors.accent.withValues(alpha: 0.14),
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        leading: Icon(icon,
            size: 20,
            color: selected ? AppColors.accentDim : AppColors.inkDim),
        title: Text(label,
            style: TextStyle(
                fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                color: AppColors.ink,
                fontSize: 14)),
        onTap: onTap,
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
