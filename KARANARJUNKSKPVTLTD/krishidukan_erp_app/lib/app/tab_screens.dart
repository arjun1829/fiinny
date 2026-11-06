import 'package:flutter/material.dart';

import '../features/analytics/bills_screen.dart';
import '../features/analytics/position_screen.dart';
import '../features/analytics/receivables_screen.dart';
import '../features/billing/sell_screen.dart';
import '../features/catalog/products_screen.dart';
import '../features/customers/customers_screen.dart';
import '../features/home/home_screen.dart';
import '../features/profile/profile_screen.dart';
import 'navigation.dart';

/// The widget behind each [AppTab]. One map, used by the shell (tabs) and the
/// drawer (screens opened as pages), so the two can never drift apart.
Widget screenForTab(AppTab tab) => switch (tab) {
      AppTab.home => const HomeScreen(),
      AppTab.bills => const BillsScreen(),
      AppTab.dues => const ReceivablesScreen(),
      AppTab.business => const PositionScreen(),
      AppTab.account => const ProfileScreen(),
      AppTab.sell => const SellScreen(),
      AppTab.customers => const CustomersScreen(),
      AppTab.stock => const ProductsScreen(),
    };

/// A tab screen opened as a normal page (owners reach Sell / Customers / Stock
/// from the drawer). The screens bring their own Scaffold, so this only adds
/// the bar with the back arrow.
class TabPage extends StatelessWidget {
  const TabPage(this.tab, {super.key});

  final AppTab tab;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(tabMeta[tab]!.drawerLabel)),
        body: screenForTab(tab),
      );
}
