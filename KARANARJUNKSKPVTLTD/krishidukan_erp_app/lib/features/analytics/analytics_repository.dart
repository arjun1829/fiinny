import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/tenant_path.dart';
import '../auth/auth_repository.dart';
import 'business_type.dart';
import 'models.dart';

/// Same read windows as the web Master Analytics, so the app can never show a
/// different total than the ERP for the same period.
const _salesLimit = 500;
const _onlineLimit = 300;

class AnalyticsRepository {
  AnalyticsRepository(this._db, this._tenantId,
      {this.fetchOnlineChannel = true});

  final FirebaseFirestore _db;
  final String _tenantId;

  /// False for manufacturer-plan tenants — MANUFACTURER_SCREENS in the web's
  /// subscriptionPlans.ts never includes 'online_orders', so that collection
  /// is never written to and there's no point spending a read (or risking a
  /// permission-denied) fetching it.
  final bool fetchOnlineChannel;

  Future<List<Bill>> fetchBills() async {
    final sales = await tenantCollection(_db, _tenantId, 'salesOrders')
        .orderBy('invoiceDate', descending: true)
        .limit(_salesLimit)
        .get();

    final bills = [
      for (final doc in sales.docs)
        if (!_isDeleted(doc.data())) Bill.fromSalesOrder(doc.id, doc.data()),
    ];

    // onlineOrders is optional per tenant; a missing/denied collection must not
    // blank out the whole dashboard.
    if (fetchOnlineChannel) {
      try {
        final online = await tenantCollection(_db, _tenantId, 'onlineOrders')
            .orderBy('createdAt', descending: true)
            .limit(_onlineLimit)
            .get();
        bills.addAll([
          for (final doc in online.docs)
            if (!_isDeleted(doc.data()))
              Bill.fromOnlineOrder(doc.id, doc.data()),
        ]);
      } on FirebaseException {
        // tenant has no online channel — leave the list as-is
      }
    }

    bills.sort((a, b) => b.date.compareTo(a.date));
    return bills;
  }

  Future<PositionSnapshot> fetchPosition() async {
    final results = await Future.wait([
      tenantCollection(_db, _tenantId, 'suppliers').get(),
      tenantCollection(_db, _tenantId, 'retailers').get(),
      tenantCollection(_db, _tenantId, 'products').get(),
      _optional('purchaseOrders'),
      _optional('supplierInvoices'),
      _optional('supplierPayments'),
    ]);

    final suppliers = results[0]!.docs;
    final retailers = results[1]!.docs;
    final products = results[2]!.docs;

    final supplierOutstanding = suppliers.fold<double>(
      0,
      (s, d) => s + asDouble(d.data()['outstandingBalance']),
    );

    // Retailer dues: totalSales − totalPaid, denormalized on each retailer doc
    // and kept in sync by every invoice/payment mutation in the web ERP.
    final dues = <NamedAmount>[];
    var retailerOutstanding = 0.0;
    for (final d in retailers) {
      final data = d.data();
      final due = asDouble(data['totalSales']) - asDouble(data['totalPaid']);
      if (due <= 0) continue;
      retailerOutstanding += due;
      dues.add(NamedAmount(
        (data['name'] as String?) ?? 'Unnamed',
        due,
        retailerId: d.id,
        phone: ((data['number'] ?? data['phone']) as String?)?.trim() ?? '',
      ));
    }
    dues.sort((a, b) => b.amount.compareTo(a.amount));

    // Inventory value = farmer selling price × loose pieces (web parity).
    final inventoryValue = products.fold<double>(
      0,
      (s, d) =>
          s +
          asDouble(d.data()['loosePieces']) *
              asDouble(d.data()['sellingPrice']),
    );

    // Kept per-record (not pre-summed) so the Position screen can re-total
    // them for whichever time range is selected — same purchaseOrders +
    // supplierInvoices split the web sums in AnalyticsPage.tsx.
    final purchaseFlow = [
      for (final d in results[3]?.docs ??
          <QueryDocumentSnapshot<Map<String, dynamic>>>[])
        DatedAmount(
          _flowDate(d.data(), 'poDate') ?? DateTime.now(),
          asDouble(d.data()['totalAmount'] ?? d.data()['amount']),
        ),
      for (final d in results[4]?.docs ??
          <QueryDocumentSnapshot<Map<String, dynamic>>>[])
        DatedAmount(
          _flowDate(d.data(), 'invoiceDate') ?? DateTime.now(),
          asDouble(d.data()['netAmount']),
        ),
    ];

    final paymentFlow = [
      for (final d in results[5]?.docs ??
          <QueryDocumentSnapshot<Map<String, dynamic>>>[])
        DatedAmount(
          _flowDate(d.data(), 'date') ?? DateTime.now(),
          asDouble(d.data()['amount']),
        ),
    ];

    return PositionSnapshot(
      supplierOutstanding: supplierOutstanding,
      retailerOutstanding: retailerOutstanding,
      inventoryValue: inventoryValue,
      purchaseFlow: purchaseFlow,
      paymentFlow: paymentFlow,
      topRetailerDues: dues.take(5).toList(),
    );
  }

  /// A record's business date: its own dated field first (poDate/invoiceDate/
  /// date, matching supplierAnalytics.ts's poDateVal/invDateVal/pmtDateVal),
  /// falling back to createdAt for older documents that predate that field.
  DateTime? _flowDate(Map<String, dynamic> d, String preferredField) =>
      tsToDate(d[preferredField]) ?? tsToDate(d['createdAt']);

  Future<QuerySnapshot<Map<String, dynamic>>?> _optional(String name) async {
    try {
      return await tenantCollection(_db, _tenantId, name).get();
    } on FirebaseException {
      return null;
    }
  }

  bool _isDeleted(Map<String, dynamic> d) =>
      d['deleted'] == true || d['status'] == 'cancelled';
}

final analyticsRepositoryProvider = Provider<AnalyticsRepository?>((ref) {
  final user = ref.watch(appUserProvider).valueOrNull;
  if (user == null) return null;
  final visibleChannels = ref.watch(visibleChannelsProvider);
  return AnalyticsRepository(
    ref.watch(firestoreProvider),
    user.tenantId,
    fetchOnlineChannel: visibleChannels.contains(Channel.online),
  );
});

final billsProvider = FutureProvider<List<Bill>>((ref) async {
  final repo = ref.watch(analyticsRepositoryProvider);
  if (repo == null) return [];
  return repo.fetchBills();
});

final positionProvider = FutureProvider<PositionSnapshot?>((ref) async {
  final repo = ref.watch(analyticsRepositoryProvider);
  if (repo == null) return null;
  return repo.fetchPosition();
});
