import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../../../core/data/paged_feed.dart';
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
      final savings = sellerItems.fold<double>(0, (s, i) => s + i.lineSavings);
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
                  // Pre-discount price and % — same fields web orders carry,
                  // so order history and invoices can show the saving.
                  if (i.hasDiscount) 'originalPrice': i.originalPrice,
                  if (i.hasDiscount) 'discountPct': i.discountPct,
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
        if (savings > 0) 'mrpSubtotal': subtotal + savings,
        if (savings > 0) 'totalSavings': savings,
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

  /// The current user's orders — as buyer and as seller — newest first, 30
  /// at a time per query: live for the first page, [PagedFeed.loadMore] for
  /// older ones. Each query is separate so a permission denial on one (e.g.
  /// phone queries when myPhone() fails in rules) never hides the others.
  PagedFeed<OrderModel> customerOrdersFeed() {
    final user = FirebaseAuth.instance.currentUser;
    final phone = user?.phoneNumber ?? '';
    final orders = _db.collection('orders');
    return PagedFeed<OrderModel>(
      queries: [
        if (user != null) orders.where('customerId', isEqualTo: user.uid),
        if (phone.isNotEmpty) orders.where('customerPhone', isEqualTo: phone),
        if (phone.isNotEmpty) orders.where('sellerPhone', isEqualTo: phone),
      ],
      map: OrderModel.fromFirestore,
    );
  }

  Future<OrderModel?> fetchById(String orderId) async {
    final doc = await _db.collection('orders').doc(orderId).get();
    if (!doc.exists) return null;
    return OrderModel.fromFirestore(doc);
  }
}
