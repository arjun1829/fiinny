import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/providers/user_provider.dart';

class DashboardNavItem {
  final IconData icon;
  final String label;
  final String route;
  const DashboardNavItem(this.icon, this.label, this.route);
}

/// Mirrors web's persistent dashboard sidebar (app/dashboard/_components/
/// sidebar.tsx) — same 11 destinations, same order, same role conditionals.
/// Shared by the Dashboard drawer and the Profile tab's nav-hub section, so
/// both stay in sync with a single source of truth.
List<DashboardNavItem> buildDashboardNavItems({
  required bool isManufacturer,
  required bool isSeller,
}) {
  return [
    // Overview now lives on Profile itself (see profile_screen.dart) — the
    // old standalone /dashboard screen was a second, differently-laid-out
    // "Overview" that confused users navigating here from the drawer.
    const DashboardNavItem(Icons.dashboard_outlined, 'Overview', '/profile'),
    const DashboardNavItem(
        Icons.bar_chart_outlined, 'Analytics', '/dashboard/analytics'),
    DashboardNavItem(
      Icons.inventory_2_outlined,
      'Inventory',
      isManufacturer
          ? '/dashboard/manufacturer/catalog'
          : '/dashboard/inventory',
    ),
    if (isManufacturer)
      const DashboardNavItem(Icons.groups_outlined, 'Retailer network',
          '/dashboard/manufacturer/retailers'),
    if (isSeller)
      // Points at the management dashboard (history + active listings), not
      // the purchase screen — "Buy more seats" there routes on to
      // /subscription. Previously this was the only subscription entry point
      // and went straight to checkout, so a seller could buy seats but never
      // see what they owned or what was consuming it.
      const DashboardNavItem(Icons.credit_card_outlined, 'Subscription',
          '/dashboard/subscription'),
    const DashboardNavItem(
        Icons.video_collection_outlined, 'Reels', '/dashboard/reels'),
    const DashboardNavItem(
        Icons.receipt_long_outlined, 'Orders', '/dashboard/orders'),
    if (isSeller)
      // Customers who started an order for this seller's products but never
      // paid. Sits under Orders because it is the same question one step
      // earlier: the orders that didn't happen, and who to call about them.
      const DashboardNavItem(
          Icons.phone_in_talk_outlined, 'Enquiries', '/dashboard/enquiry'),
    if (isSeller)
      // Earnings + the bank account they are sent to. Sits next to Orders
      // because "what am I owed" is the question a seller asks straight after
      // looking at their orders.
      const DashboardNavItem(
          Icons.account_balance_wallet_outlined, 'Payouts', '/dashboard/payouts'),
    const DashboardNavItem(Icons.local_shipping_outlined, 'Delivery Settings',
        '/dashboard/delivery'),
    const DashboardNavItem(
        Icons.star_outline, 'Reviews', '/dashboard/reviews'),
    if (isManufacturer)
      const DashboardNavItem(Icons.business_outlined, 'Company Page',
          '/dashboard/manufacturer/brand'),
    const DashboardNavItem(Icons.account_circle_outlined,
        'Business Settings', '/dashboard/profile'),
  ];
}

/// Opened from the Overview screen's AppBar; leaf dashboard screens keep
/// their normal back-button navigation instead of repeating this drawer.
class DashboardDrawer extends ConsumerWidget {
  const DashboardDrawer({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider).value;
    final isManufacturer = ref.watch(isManufacturerProvider);
    final isSeller = user?.isSeller ?? false;

    final items = buildDashboardNavItems(
      isManufacturer: isManufacturer,
      isSeller: isSeller,
    );

    return Drawer(
      child: SafeArea(
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            Container(
              padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
              color: AppColors.primary,
              child: Row(
                children: [
                  const Icon(Icons.storefront, color: Colors.white, size: 28),
                  const SizedBox(width: 10),
                  Text('Dashboard',
                      style:
                          AppTextStyles.heading2.copyWith(color: Colors.white)),
                ],
              ),
            ),
            for (final item in items)
              ListTile(
                leading: Icon(item.icon, color: AppColors.primary),
                title: Text(item.label, style: AppTextStyles.bodyMedium),
                onTap: () {
                  Navigator.of(context).pop();
                  // Avoid pushing a duplicate screen on top of itself — most
                  // relevant for "Overview", since the drawer is opened from
                  // Profile (== Overview) and would otherwise stack a second
                  // copy of the same screen.
                  if (GoRouterState.of(context).uri.path != item.route) {
                    context.push(item.route);
                  }
                },
              ),
          ],
        ),
      ),
    );
  }
}
