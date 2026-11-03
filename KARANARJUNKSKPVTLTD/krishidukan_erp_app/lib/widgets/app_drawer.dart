import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../app/navigation.dart';
import '../app/tab_screens.dart';
import '../app/theme.dart';
import '../core/access.dart';
import '../core/erp_links.dart';
import '../features/auth/auth_repository.dart';
import '../features/billing/b2b_invoice_screen.dart';
import '../features/billing/pos_screen.dart';
import '../features/business/expenses_screen.dart';
import '../features/business/online_orders_screen.dart';
import '../features/business/stock_movements_screen.dart';
import '../features/business/suppliers_screen.dart';
import '../features/khata/khata_screen.dart';
import '../features/settings/theme_provider.dart';
import 'all_features_sheet.dart';
import 'ui.dart';

class AppDrawer extends ConsumerWidget {
  const AppDrawer({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(appUserProvider).valueOrNull;
    final tab = ref.watch(currentTabProvider);
    final variant = ref.watch(themeVariantProvider);
    final access = ref.watch(accessProvider);
    final stack = access == null ? const <AppTab>[] : stackTabsFor(access);

    void go(AppTab t) {
      Navigator.of(context).pop();
      ref.read(currentTabProvider.notifier).state = t;
    }

    // Screens that don't live on the bottom bar (and the native ledgers)
    // open as pages with a back arrow.
    void push(Widget w) {
      final nav = Navigator.of(context);
      nav.pop();
      nav.push(MaterialPageRoute<void>(builder: (_) => w));
    }

    void web(String path) {
      Navigator.of(context).pop();
      openErp(context, path);
    }

    return Drawer(
      width: 300,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 4, 8, 0),
              child: IconButton(
                tooltip: 'Close menu',
                onPressed: () => Navigator.of(context).pop(),
                icon: Icon(Icons.close_rounded, color: AppColors.ink),
              ),
            ),
            InkWell(
              onTap: () => go(AppTab.account),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 6, 20, 18),
                child: Row(
                  children: [
                    InitialAvatar(user?.name ?? '', size: 48),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            user?.name ?? '—',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppText.body.copyWith(
                                fontSize: 15.5, fontWeight: FontWeight.w700),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            user?.businessName ?? '',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppText.label,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const Divider(),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(vertical: 8),
                children: [
                  if (access != null && (access.pos || access.b2b)) ...[
                    const _DrawerLabel('Quick actions'),
                    if (access.pos)
                      _DrawerItem(Icons.add_shopping_cart_rounded, 'New POS bill',
                          onTap: () => push(const PosScreen())),
                    if (access.b2b)
                      _DrawerItem(Icons.note_add_outlined, 'New B2B invoice',
                          onTap: () => push(const B2bInvoiceScreen())),
                    const _DrawerLabel('Screens'),
                  ],
                  // Role + plan decide what's listed; the same lists drive the
                  // bottom bar, so the two can never disagree.
                  for (final t in access == null ? const <AppTab>[] : tabsFor(access))
                    _DrawerItem(
                      tabMeta[t]!.icon,
                      tabMeta[t]!.drawerLabel,
                      selected: stack.contains(t) && tab == t,
                      onTap: () => stack.contains(t) ? go(t) : push(TabPage(t)),
                    ),
                  if (access != null &&
                      (access.khata ||
                          access.suppliers ||
                          access.stockMovements ||
                          access.expenses ||
                          access.onlineOrders)) ...[
                    const _DrawerLabel('Ledgers & records'),
                    if (access.khata)
                      _DrawerItem(Icons.menu_book_outlined, 'Khata (Udhari)',
                          onTap: () => push(const KhataScreen())),
                    if (access.suppliers)
                      _DrawerItem(Icons.local_shipping_outlined, 'Supplier ledger',
                          onTap: () => push(const SuppliersScreen())),
                    if (access.stockMovements)
                      _DrawerItem(Icons.swap_vert_rounded, 'Stock movement',
                          onTap: () => push(const StockMovementsScreen())),
                    if (access.expenses)
                      _DrawerItem(Icons.receipt_outlined, 'Expenses',
                          onTap: () => push(const ExpensesScreen())),
                    if (access.onlineOrders)
                      _DrawerItem(Icons.shopping_bag_outlined, 'Online orders',
                          onTap: () => push(const OnlineOrdersScreen())),
                  ],
                  const _DrawerLabel('Web ERP'),
                  _DrawerItem(Icons.grid_view_rounded, 'All features',
                      onTap: () {
                    Navigator.of(context).pop();
                    showAllFeatures(context);
                  }),
                  // The app has native Khata / Stock where the plan allows;
                  // the web shortcuts stay for everything it doesn't.
                  if (access == null || !access.khata)
                    _DrawerItem(Icons.menu_book_outlined, 'Khata',
                        external: true, onTap: () => web('/digital-khata')),
                  if (access == null || !access.products)
                    _DrawerItem(Icons.inventory_2_outlined, 'Items & stock',
                        external: true, onTap: () => web('/rates')),
                  _DrawerItem(Icons.workspace_premium_outlined, 'Upgrade plan',
                      external: true, onTap: () => web('/pricing')),
                  const _DrawerLabel('Display'),
                  SwitchListTile(
                    contentPadding: const EdgeInsets.symmetric(horizontal: 20),
                    secondary: Icon(Icons.dark_mode_outlined,
                        color: AppColors.inkDim, size: 22),
                    title: Text('Dark mode', style: AppText.body),
                    value: variant == AppThemeVariant.dark,
                    onChanged: (on) => ref
                        .read(themeVariantProvider.notifier)
                        .set(on ? AppThemeVariant.dark : AppThemeVariant.light),
                  ),
                ],
              ),
            ),
            const Divider(),
            _DrawerItem(
              Icons.logout_rounded,
              'Log out',
              color: AppColors.critical,
              // The dialog opens over the drawer so its context stays alive
              // for the whole confirm → sign-out sequence.
              onTap: () => confirmSignOut(context, ref),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}

Future<void> confirmSignOut(BuildContext context, WidgetRef ref) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Log out?'),
      content: Text(
        'You\'ll need to sign in again to see your business figures.',
        style: TextStyle(color: AppColors.inkDim),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx, false),
          child: const Text('Cancel'),
        ),
        FilledButton(
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.critical,
            minimumSize: const Size(0, 42),
          ),
          onPressed: () => Navigator.pop(ctx, true),
          child: const Text('Log out'),
        ),
      ],
    ),
  );
  if (ok ?? false) await ref.read(authRepositoryProvider).signOut();
}

class _DrawerLabel extends StatelessWidget {
  const _DrawerLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 6),
      child: Text(text, style: AppText.small),
    );
  }
}

class _DrawerItem extends StatelessWidget {
  const _DrawerItem(
    this.icon,
    this.label, {
    required this.onTap,
    this.selected = false,
    this.external = false,
    this.color,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool selected;
  final bool external;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = color ?? (selected ? AppColors.primary : AppColors.ink);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 1),
      child: Material(
        color: selected ? AppColors.primarySoft : Colors.transparent,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            child: Row(
              children: [
                Icon(icon,
                    size: 22,
                    color: color ?? (selected ? c : AppColors.inkDim)),
                const SizedBox(width: 14),
                Expanded(
                  child: Text(
                    label,
                    style: TextStyle(
                      fontSize: 14.5,
                      fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                      color: c,
                    ),
                  ),
                ),
                if (external)
                  Icon(Icons.north_east_rounded,
                      size: 15, color: AppColors.inkMute),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
