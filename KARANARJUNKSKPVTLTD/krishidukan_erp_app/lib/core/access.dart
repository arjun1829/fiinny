import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../features/auth/auth_repository.dart';
import '../features/subscription/subscription_repository.dart';
import 'roles.dart';

/// Role (firestore.rules) AND plan (subscriptionPlans.ts) — the web applies
/// both gates to every route, so the app does too. Screen keys are the web's
/// AppScreen ids for the matching route in routePermissions.ts.
class Access {
  const Access({required this.can, required this.sub, required this.planLoaded});

  final Capabilities can;
  final TenantSubscription? sub;

  /// False while tenantSubscriptions is still loading — callers show a
  /// spinner rather than a "not in your plan" message that flips a second
  /// later.
  final bool planLoaded;

  bool _plan(String screen) => sub?.allowsScreen(screen) ?? false;

  /// /pos → 'pos'
  bool get pos => can.canBill && _plan('pos');

  /// /b2b-invoice → 'worklist'
  bool get b2b => can.canBill && _plan('worklist');

  bool get anyBilling => pos || b2b;

  /// /inventory → 'inventory'
  bool get products => can.canViewProducts && _plan('inventory');

  /// /worklist (B2B partners) or /customers (POS customers).
  bool get customers =>
      can.canViewCustomers && (_plan('worklist') || _plan('customers'));

  /// The owner tabs predate plan gating in this app and stay role-only so an
  /// existing install keeps every screen it had.
  bool get analytics => can.canViewAnalytics;

  /// /digital-khata → 'khata' (admin/analyst/shopkeeper on the web).
  bool get khata => can.canCollectKhata && _plan('khata');

  /// /inventory/stock-movement → 'inventory'; stockMovements is admin-only.
  bool get stockMovements => can.canEditProducts && _plan('inventory');

  /// /expenses → 'expenses'; expenses are admin/analyst only in the rules.
  bool get expenses => can.canViewAnalytics && _plan('expenses');

  /// /supplier-ledger → 'worklist'; suppliers are admin/analyst only.
  bool get suppliers => can.canViewAnalytics && _plan('worklist');

  /// /online-orders → 'online_orders'; onlineOrders is admin/analyst only.
  bool get onlineOrders => can.canViewAnalytics && _plan('online_orders');

  /// Managers keep the Bills tab they always had; a shopkeeper needs the
  /// plan's order_history screen, exactly like /order-history on the web.
  bool get bills =>
      can.canViewAnalytics || (can.canViewBills && _plan('order_history'));
}

final accessProvider = Provider<Access?>((ref) {
  final user = ref.watch(appUserProvider).valueOrNull;
  if (user == null) return null;
  final sub = ref.watch(subscriptionProvider);
  return Access(
    can: user.can,
    sub: sub.valueOrNull,
    planLoaded: sub.hasValue || sub.hasError,
  );
});
