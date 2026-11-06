/// What a signed-in ERP role may do in this app.
///
/// Every flag is derived from firestore.rules, not from what would be nice:
/// the app never offers an action the rules would reject halfway through a
/// sale. Where the web route table (src/utils/routePermissions.ts) is
/// stricter than the rules, the web wins, so a role never sees more here
/// than it does in the browser.
///
///   collection            admin/analyst  shopkeeper  sales
///   salesOrders  read          ✓             ✓          ✓
///   salesOrders  create        ✓             ✓          ✓
///   counters     r/w           ✓             ✓          ✗
///   products     write         ✓             ✗          ✗
///   inventoryBatches read      ✓             ✓          ✗
///   inventoryBatches write     ✓             ✗          ✗
///   retailers    read          ✓             ✓          ✓
///   retailers    create/update ✓             ✓          ✗
///   retailers/*/payments       ✓             ✗          ✗
///
/// Billing deducts stock (products + inventoryBatches writes) in the same
/// transaction as the invoice, so only admin/analyst can bill. A shopkeeper
/// sale would be rejected by the rules at commit — the web POS has the same
/// limit today.
enum ErpRole { manager, shopkeeper, sales, other }

ErpRole roleFromString(String role) => switch (role) {
      'admin' || 'analyst' || 'master' => ErpRole.manager,
      'shopkeeper' => ErpRole.shopkeeper,
      'sales' => ErpRole.sales,
      _ => ErpRole.other,
    };

class Capabilities {
  const Capabilities._(this.role);

  factory Capabilities.of(String role) => Capabilities._(roleFromString(role));

  final ErpRole role;

  bool get _manager => role == ErpRole.manager;

  /// Owner dashboards (Overview / Payments / Position) read supplier and
  /// payment collections that only admin/analyst can open.
  bool get canViewAnalytics => _manager;

  /// Bill ledger — web /order-history is admin/analyst/shopkeeper.
  bool get canViewBills => _manager || role == ErpRole.shopkeeper;

  bool get canViewCustomers =>
      _manager || role == ErpRole.shopkeeper || role == ErpRole.sales;
  bool get canEditCustomers => _manager || role == ErpRole.shopkeeper;

  /// retailers/{id}/payments is admin/analyst only.
  bool get canViewPayments => _manager;
  bool get canRecordPayment => _manager;

  /// Khata collections only update salesOrders (amountPaid), which the rules
  /// allow shopkeepers to do — the web /digital-khata is open to them too.
  bool get canCollectKhata => _manager || role == ErpRole.shopkeeper;

  bool get canViewProducts =>
      _manager || role == ErpRole.shopkeeper || role == ErpRole.sales;
  bool get canViewBatches => _manager || role == ErpRole.shopkeeper;
  bool get canEditProducts => _manager;

  /// POS and B2B both write products + inventoryBatches.
  bool get canBill => _manager;

  /// Sales users only see the retailers assigned to them (useSalesFilter.ts).
  bool get isScopedToAssignedRetailers => role == ErpRole.sales;

  /// Anything to show at all. Portal users (retailer/manufacturer) have their
  /// own web portals and nothing in this app.
  bool get canUseApp => role != ErpRole.other;
}
