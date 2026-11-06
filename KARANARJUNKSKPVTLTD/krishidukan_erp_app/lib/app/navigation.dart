import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/access.dart';
import '../features/analytics/models.dart';
import '../features/auth/auth_repository.dart';

/// Re-created whenever the signed-in user changes, so the next person to log
/// in starts on Home with no leftover filters.
String? _uid(Ref ref) =>
    ref.watch(authStateProvider.select((a) => a.valueOrNull?.uid));

/// Every top-level screen. Owners (analytics roles) get the first five on the
/// bottom bar; sell / customers / stock are the staff screens that exist
/// because the app can now bill and manage stock — for owners they open from
/// the drawer. Which ones a person actually sees depends on role AND plan
/// (core/access.dart) — see [stackTabsFor].
enum AppTab { home, bills, dues, business, account, sell, customers, stock }

class TabMeta {
  const TabMeta(this.icon, this.selectedIcon, this.barLabel, this.drawerLabel);
  final IconData icon;
  final IconData selectedIcon;
  final String barLabel;
  final String drawerLabel;
}

const tabMeta = <AppTab, TabMeta>{
  AppTab.home: TabMeta(Icons.home_outlined, Icons.home_rounded, 'Home', 'Home'),
  AppTab.bills: TabMeta(Icons.receipt_long_outlined, Icons.receipt_long_rounded,
      'Bills', 'Bills'),
  AppTab.dues: TabMeta(Icons.account_balance_wallet_outlined,
      Icons.account_balance_wallet_rounded, 'Dues', 'Dues & collections'),
  AppTab.business: TabMeta(Icons.store_mall_directory_outlined,
      Icons.store_mall_directory_rounded, 'Business', 'Business position'),
  AppTab.account: TabMeta(Icons.person_outline_rounded, Icons.person_rounded,
      'Account', 'Profile & plan'),
  AppTab.sell: TabMeta(Icons.point_of_sale_outlined,
      Icons.point_of_sale_rounded, 'Sell', 'Sell'),
  AppTab.customers: TabMeta(Icons.people_alt_outlined, Icons.people_alt_rounded,
      'Customers', 'Customers'),
  AppTab.stock: TabMeta(Icons.inventory_2_outlined, Icons.inventory_2_rounded,
      'Stock', 'Stock'),
};

/// Every screen this role + plan may open, in drawer order.
List<AppTab> tabsFor(Access a) => [
      if (a.analytics) AppTab.home,
      if (a.can.canViewBills) AppTab.sell,
      if (a.bills) AppTab.bills,
      if (a.customers) AppTab.customers,
      if (a.products) AppTab.stock,
      if (a.analytics) AppTab.dues,
      if (a.analytics) AppTab.business,
      AppTab.account,
    ];

/// Owner layout = the redesigned five tabs. Anyone without analytics access
/// (shopkeeper, sales) gets a bar built from what their role allows.
const _ownerBar = [
  AppTab.home,
  AppTab.bills,
  AppTab.dues,
  AppTab.business,
  AppTab.account
];
const _staffPriority = [
  AppTab.sell,
  AppTab.bills,
  AppTab.customers,
  AppTab.stock,
  AppTab.account
];

/// Tabs that live in the shell's IndexedStack (switched in place, state kept).
List<AppTab> stackTabsFor(Access a) {
  final all = tabsFor(a);
  return a.analytics ? _ownerBar.where(all.contains).toList() : all;
}

/// What the bottom bar shows. Staff get four screens plus a "More" item that
/// opens the drawer (they have no header menu button); owners get all five.
List<AppTab> barTabsFor(Access a) {
  final stack = stackTabsFor(a);
  if (a.analytics) return stack;
  return _staffPriority.where(stack.contains).take(4).toList();
}

bool barHasMore(Access a) => !a.analytics;

/// Lives in a provider (not widget state) so any screen — e.g. a Home tile —
/// can switch tabs directly instead of making the user hunt for the section.
final currentTabProvider = StateProvider<AppTab>((ref) {
  _uid(ref);
  return AppTab.home;
});

/// Payment-status filter on the Bills tab. "Unpaid" spans both pending and
/// partly-paid bills — that's what an owner means by "who still owes me".
enum BillStatusFilter { all, unpaid, paid }

extension BillStatusFilterX on BillStatusFilter {
  String get label => switch (this) {
        BillStatusFilter.all => 'All',
        BillStatusFilter.unpaid => 'Unpaid',
        BillStatusFilter.paid => 'Paid',
      };

  bool matches(Bill b) => switch (this) {
        BillStatusFilter.all => true,
        BillStatusFilter.unpaid => b.paymentState != PaymentState.paid,
        BillStatusFilter.paid => b.paymentState == PaymentState.paid,
      };
}

final billStatusFilterProvider = StateProvider<BillStatusFilter>((ref) {
  _uid(ref);
  return BillStatusFilter.all;
});

/// Channel filter on the Bills tab. `null` = every channel.
final billChannelFilterProvider = StateProvider<Channel?>((ref) {
  _uid(ref);
  return null;
});

/// Jump to the Bills tab with a status filter already applied.
void openBills(WidgetRef ref,
    {BillStatusFilter status = BillStatusFilter.all, Channel? channel}) {
  ref.read(billStatusFilterProvider.notifier).state = status;
  ref.read(billChannelFilterProvider.notifier).state = channel;
  ref.read(currentTabProvider.notifier).state = AppTab.bills;
}
