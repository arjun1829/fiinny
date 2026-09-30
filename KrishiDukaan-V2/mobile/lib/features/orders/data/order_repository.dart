import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../../../core/models/cart_model.dart';
import '../../../core/models/order_model.dart';
import '../../../core/utils/delivery_utils.dart';

class OrderRepository {
  final _db = FirebaseFirestore.instance;

  /// Last-resort owner lookup for a cart item that carries no sellerPhone.
  ///
  /// Prefers a phone (the security rule reads `sellerPhone == myPhone()`) and
  /// falls back to the owner UID, matching how web-created orders are keyed.
  /// Returns '' only if the product doc is gone — never throws, because the
  /// payment has already succeeded by the time this runs and losing the order
  /// would be far worse than an imperfect key.
  Future<String> _resolveSellerKeyFromProduct(CartItemModel item) async {
    try {
      final snap = await _db.collection('products').doc(item.catalogId).get();
      final d = snap.data();
      if (d == null) return '';

      // 1. The ordered doc owns itself.
      final own = _ownerOf(d);
      if (own.isNotEmpty) return own;

      // 2. Ownerless CANONICAL catalog doc (source: 'admin', flagged
      //    online_delivery but carrying no retailer*/owner* fields at all).
      //    The real seller lives on a separate copy doc that the marketplace
      //    merges in by name — see CatalogRepository.fetchAllMergedProducts.
      //    Only trust it when a single seller stocks the product; if two do,
      //    guessing would credit one seller with another's order.
      final name = (d['name'] as String?)?.trim() ?? '';
      if (name.isEmpty) return '';

      final siblings =
          await _db.collection('products').where('name', isEqualTo: name).get();
      final owners = siblings.docs
          .map((s) => s.data())
          .where((s) => _copySources.contains(s['source'] as String? ?? ''))
          .map(_ownerOf)
          .where((o) => o.isNotEmpty)
          .toSet();

      if (owners.length == 1) return owners.first;
    } catch (_) {
      // Fall through — an unkeyed order still beats a dropped paid order.
      // backfillOrderSeller repairs whatever reaches Firestore unkeyed.
    }
    return '';
  }

  /// Sources marking a doc as a seller's copy of a canonical catalog product.
  static const _copySources = {
    'admin_assigned',
    'manufacturer_assigned',
    'retailer_inventory_copy',
  };

  /// First non-empty ownership field on a product doc, phone-first, or ''.
  static String _ownerOf(Map<String, dynamic> d) {
    // manufacturerPhone/createdByPhone: a manufacturer's own canonical listing
    // may carry only these (see manufacturer_repository.addCatalogProduct).
    for (final field in [
      'retailerPhone', 'ownerPhone', 'manufacturerPhone', 'createdByPhone',
      'retailerId', 'ownerId',
    ]) {
      final v = (d[field] as String?)?.trim();
      if (v != null && v.isNotEmpty) return v;
    }
    return '';
  }

  /// Creates one order doc per unique seller after successful payment.
  Future<void> createOrdersAfterPayment({
    required List<CartItemModel> items,
    required String customerName,
    required String customerPhone,
    required Map<String, dynamic> customerAddress,
    required String razorpayOrderId,
    required String razorpayPaymentId,

    /// Each seller's pricing — the SERVER's figures when create-cart-order
    /// returned them (what the customer was actually charged), else the
    /// checkout estimate. Keyed by seller phone.
    required Map<String, SellerPricing> pricingBySeller,

    /// The address state that picked the delivery slab; stored so the order
    /// (and its invoice) show which slab set applied.
    String? customerDeliveryState,
  }) async {
    final user = FirebaseAuth.instance.currentUser!;

    // Group cart items by seller. A cart item whose sellerPhone is empty (the
    // product carried no resolvable owner field) must NOT be grouped under ''
    // — that writes a paid order with no seller key, which no dashboard query
    // can ever match. Recover the owner from the product doc instead.
    final Map<String, List<CartItemModel>> bySeller = {};
    for (final item in items) {
      var key = item.sellerPhone.trim();
      if (key.isEmpty) key = await _resolveSellerKeyFromProduct(item);
      bySeller.putIfAbsent(key, () => []).add(item);
    }

    final batch = _db.batch();

    for (final entry in bySeller.entries) {
      final sellerPhone = entry.key;
      final sellerItems = entry.value;
      final sellerName = sellerItems.first.sellerName;

      final sp = _pricingFor(sellerPhone, pricingBySeller, sellerItems);
      final subtotal = sp.subtotal;
      final deliveryCharge = sp.deliveryCharge;
      // Included GST is already inside the prices; only EXCLUDED GST was added.
      final grandTotal = sp.total;
      final state = (customerDeliveryState ?? '').trim();

      final orderRef = _db.collection('orders').doc();
      batch.set(orderRef, {
        'customerId': user.uid,
        'customerName': customerName,
        'customerPhone': customerPhone,
        'customerAddress': customerAddress,
        // sellerId kept as phone for legacy query compatibility. May also be
        // an owner UID when the product carried no phone — web-created orders
        // are keyed that way too, so the dashboard matches either.
        'sellerId': sellerPhone,
        // sellerPhone backs the security rule `sellerPhone == myPhone()`, so
        // only write it when the key really is a phone — a UID here would make
        // the rule silently unsatisfiable for the seller.
        'sellerPhone':
            RegExp(r'^\+?[0-9]{10,13}$').hasMatch(sellerPhone) ? sellerPhone : '',
        'sellerName': sellerName,
        'sellerType': 'retailer',
        'items': sellerItems
            .map((i) => {
                  'catalogId': i.catalogId,
                  'name': i.catalogName,
                  if (i.catalogImage != null) 'image': i.catalogImage,
                  'price': i.price,
                  'quantity': i.quantity,
                  if (i.variantLabel != null) 'variantLabel': i.variantLabel,
                  'listingId': i.listingId,
                  'gstApplicable': i.gstApplicable,
                  'gstRate': i.gstRate,
                  // Per unit: backed out of the price when included, on top when
                  // not — what the invoice's tax column shows.
                  'gstAmount': i.unitGst,
                  // True when gstAmount was already inside `price` and was NOT
                  // added to the total. The invoice needs this to tell them apart.
                  'gstIncluded': i.gstIncluded,
                })
            .toList(),
        'subtotal': subtotal,
        // All GST in the order (included + added) — for the invoice.
        'totalGst': sp.gstTotal,
        // The part actually ADDED to the payable total (0 → field omitted).
        if (sp.gstAdded > 0) 'totalGstAdded': sp.gstAdded,
        'deliveryCharge': deliveryCharge,
        // Frozen delivery breakdown as charged (slab, extra, free, waived, and
        // which slab set applied), so the invoice never recomputes from
        // today's settings.
        'deliveryBreakdown': {
          ...sp.delivery.toMap(),
          if (state.isNotEmpty) 'customerDeliveryState': state,
        },
        if (state.isNotEmpty) 'customerDeliveryState': state,
        // `grandTotal` is the canonical final-total field (web writes it too);
        // `total` is kept as a mirror for backward compatibility with older
        // readers and the OrderModel fallback. Both hold the same value.
        'grandTotal': grandTotal,
        'total': grandTotal,
        // Rules require status == 'placed' on order create
        'status': 'placed',
        'payment': {
          'razorpayOrderId': razorpayOrderId,
          'razorpayPaymentId': razorpayPaymentId,
          'status': 'paid',
          'amount': grandTotal,
        },
        'createdAt': FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();
  }

  /// This seller's pricing: the server's / estimate's figure when there is one
  /// (matched on the phone's last 10 digits, since keys appear as "+91…" and
  /// bare), otherwise computed here from the lines with no delivery settings.
  SellerPricing _pricingFor(
    String sellerPhone,
    Map<String, SellerPricing> bySeller,
    List<CartItemModel> sellerItems,
  ) {
    final direct = bySeller[sellerPhone];
    if (direct != null) return direct;
    String tail(String v) {
      final d = v.replaceAll(RegExp(r'\D'), '');
      return d.length >= 10 ? d.substring(d.length - 10) : '';
    }

    final want = tail(sellerPhone);
    if (want.isNotEmpty) {
      for (final e in bySeller.entries) {
        if (tail(e.key) == want) return e.value;
      }
    }
    return computeSellerPricing(
      sellerPhone,
      [
        for (final i in sellerItems)
          CartPricingLine(
            sellerKey: sellerPhone,
            unitPrice: i.price,
            qty: i.quantity,
            weightKg: 0,
            gstApplicable: i.gstApplicable,
            gstRate: i.gstRate,
            gstIncluded: i.gstIncluded,
            extraDeliveryCharge: i.extraDeliveryCharge,
            freeDelivery: i.freeDelivery,
          ),
      ],
      null,
      null,
    );
  }

  /// Streams all orders for the current user — as buyer and as seller.
  /// Runs three separate queries so a permission denial on any one (e.g. phone
  /// queries when myPhone() fails in rules) never kills the other results.
  Stream<List<OrderModel>> watchCustomerOrders() {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return Stream.value([]);

    final phone = user.phoneNumber ?? '';

    final controller = StreamController<List<OrderModel>>();
    List<DocumentSnapshot> uidDocs    = [];
    List<DocumentSnapshot> buyerDocs  = [];
    List<DocumentSnapshot> sellerDocs = [];

    void emit() {
      final seen = <String>{};
      final orders = [...uidDocs, ...buyerDocs, ...sellerDocs]
          .where((d) => seen.add(d.id))
          .map((d) {
            try { return OrderModel.fromFirestore(d); } catch (_) { return null; }
          })
          .whereType<OrderModel>()
          .toList()
        ..sort((a, b) =>
            (b.createdAt ?? DateTime(0)).compareTo(a.createdAt ?? DateTime(0)));
      if (!controller.isClosed) controller.add(orders);
    }

    // Query 1: by Firebase Auth UID — always allowed by security rules
    final sub1 = _db.collection('orders')
        .where('customerId', isEqualTo: user.uid)
        .snapshots()
        .listen((s) { uidDocs = s.docs; emit(); }, onError: (_) {});

    // Queries 2 & 3: by phone — may be denied if myPhone() fails in rules; silenced
    StreamSubscription? sub2;
    StreamSubscription? sub3;
    if (phone.isNotEmpty) {
      sub2 = _db.collection('orders')
          .where('customerPhone', isEqualTo: phone)
          .snapshots()
          .listen((s) { buyerDocs = s.docs; emit(); }, onError: (_) {});
      sub3 = _db.collection('orders')
          .where('sellerPhone', isEqualTo: phone)
          .snapshots()
          .listen((s) { sellerDocs = s.docs; emit(); }, onError: (_) {});
    }

    controller.onCancel = () {
      sub1.cancel();
      sub2?.cancel();
      sub3?.cancel();
    };
    return controller.stream;
  }

  /// Streams the orders where the current user is the SELLER — the source of
  /// truth for their earnings.
  ///
  /// Orders are keyed inconsistently across platforms: mobile writes the
  /// seller's phone into both `sellerPhone` and `sellerId`, while web orders
  /// can carry the seller's Auth UID in `sellerId`. Querying only one field
  /// would silently under-report what a seller is owed, so both are queried
  /// and the results deduped.
  ///
  /// Each query silences its own errors rather than adding to the stream: a
  /// permission denial on one must not blank out the others (the same trap
  /// that previously made the orders screens flash data and then error).
  Stream<List<OrderModel>> watchSellerOrders() {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return Stream.value([]);

    final phone = user.phoneNumber ?? '';

    final controller = StreamController<List<OrderModel>>();
    List<DocumentSnapshot> byPhone = [];
    List<DocumentSnapshot> byId = [];
    List<DocumentSnapshot> byUid = [];

    void emit() {
      final seen = <String>{};
      final orders = [...byPhone, ...byId, ...byUid]
          .where((d) => seen.add(d.id))
          .map((d) {
            try { return OrderModel.fromFirestore(d); } catch (_) { return null; }
          })
          .whereType<OrderModel>()
          .toList();
      if (!controller.isClosed) controller.add(orders);
    }

    final subs = <StreamSubscription>[];
    if (phone.isNotEmpty) {
      subs.add(_db.collection('orders')
          .where('sellerPhone', isEqualTo: phone)
          .snapshots()
          .listen((s) { byPhone = s.docs; emit(); }, onError: (_) {}));
      subs.add(_db.collection('orders')
          .where('sellerId', isEqualTo: phone)
          .snapshots()
          .listen((s) { byId = s.docs; emit(); }, onError: (_) {}));
    }
    // Legacy web orders that recorded the seller's Auth UID.
    subs.add(_db.collection('orders')
        .where('sellerId', isEqualTo: user.uid)
        .snapshots()
        .listen((s) { byUid = s.docs; emit(); }, onError: (_) {}));

    controller.onCancel = () {
      for (final s in subs) {
        s.cancel();
      }
    };
    return controller.stream;
  }

  Future<OrderModel?> fetchById(String orderId) async {
    final doc = await _db.collection('orders').doc(orderId).get();
    if (!doc.exists) return null;
    return OrderModel.fromFirestore(doc);
  }
}
