import 'dart:async';
import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';

import '../../../core/models/listing_model.dart';
import '../../../core/models/order_model.dart';

class DashboardRepository {
  final _db = FirebaseFirestore.instance;
  final _storage = FirebaseStorage.instance;

  // ── Stats ────────────────────────────────────────────────────────────────

  Future<Map<String, int>> fetchStats(String sellerPhone) async {
    final uid = FirebaseAuth.instance.currentUser?.uid ?? '';

    // Products: phone, retailerId (legacy), and ownerId (web new schema)
    final productFutures = <Future<QuerySnapshot>>[
      _db.collection('products').where('retailerPhone', isEqualTo: sellerPhone).get(),
      if (uid.isNotEmpty)
        _db.collection('products').where('retailerId', isEqualTo: uid).get(),
      if (uid.isNotEmpty)
        _db.collection('products').where('ownerId', isEqualTo: uid).get(),
    ];
    final orderFutures = <Future<QuerySnapshot>>[
      _db.collection('orders').where('sellerPhone', isEqualTo: sellerPhone).get(),
      if (uid.isNotEmpty)
        _db.collection('orders').where('sellerId', isEqualTo: uid).get(),
    ];

    final productResults = await Future.wait(productFutures);
    final orderResults   = await Future.wait(orderFutures);

    final seen = <String>{};
    final allProducts = productResults
        .expand((s) => s.docs)
        .where((d) => seen.add(d.id))
        .toList();

    final seenOrders = <String>{};
    final allOrders = orderResults
        .expand((s) => s.docs)
        .where((d) => seenOrders.add(d.id))
        .toList();

    return {
      'totalListings': allProducts.length,
      'inStock': allProducts.where(_isDocInStock).length,
      'pendingOrders': allOrders.where((d) => d['status'] == 'placed').length,
      'totalOrders': allOrders.length,
    };
  }

  static bool _isDocInStock(DocumentSnapshot d) {
    final qty = d['stockQuantity'];
    if (qty is num) return qty > 0;
    final stock = d['stock'];
    if (stock is num) return stock > 0;
    // Web writes stock: "In Stock" string — any non-"out" string counts
    if (stock is String && stock.isNotEmpty) {
      return !stock.toLowerCase().startsWith('out');
    }
    // No explicit stock field: active products default to in-stock
    return d['isActive'] != false;
  }

  // ── Listings CRUD ─────────────────────────────────────────────────────────

  /// Streams the seller's own products.
  /// Queries by retailerPhone, retailerId (legacy), and ownerId (web new schema)
  /// so products created via web or mobile both appear.
  Stream<List<ListingModel>> watchMyListings(String sellerPhone) {
    final uid = FirebaseAuth.instance.currentUser?.uid ?? '';

    final streams = <Stream<QuerySnapshot>>[
      _db.collection('products').where('retailerPhone', isEqualTo: sellerPhone).snapshots(),
    ];
    if (uid.isNotEmpty) {
      streams.add(_db.collection('products').where('retailerId', isEqualTo: uid).snapshots());
      streams.add(_db.collection('products')
          .where('ownerId', isEqualTo: uid)
          .where('ownerType', isEqualTo: 'retailer')
          .snapshots());
    }

    if (streams.length == 1) {
      return streams[0].map((s) => s.docs.map(ListingModel.fromFirestore).toList());
    }

    final controller = StreamController<List<ListingModel>>();
    final results = List<List<DocumentSnapshot>>.filled(streams.length, []);

    void emit() {
      final seen = <String>{};
      final merged = results
          .expand((docs) => docs)
          .where((d) => seen.add(d.id))
          .map(ListingModel.fromFirestore)
          .toList();
      if (!controller.isClosed) controller.add(merged);
    }

    final subs = List.generate(streams.length,
        (i) => streams[i].listen((s) { results[i] = s.docs; emit(); },
            onError: controller.addError));

    controller.onCancel = () { for (final s in subs) { s.cancel(); } };
    return controller.stream;
  }

  Future<void> addListing({
    required String sellerPhone,
    required String sellerName,
    required String catalogId,
    required double price,
    required int stockQuantity,
    String? sellerAddress,
    double? lat,
    double? lng,
  }) async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    await _db.collection('products').add({
      // Legacy field names used by security rules for update/delete ownership checks
      'retailerPhone': sellerPhone,
      'retailerId': uid,
      // Store name fields matching legacy schema
      'store': sellerName,
      'sellerType': 'retailer',
      'catalogId': catalogId,
      'price': price,
      'stock': stockQuantity,
      'address': sellerAddress,
      if (lat != null && lng != null) ...{
        'lat': lat,
        'lng': lng,
      },
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> updateListing(
      String listingId, Map<String, dynamic> data) async {
    await _db.collection('products').doc(listingId).update({
      ...data,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> deleteListing(String listingId) async {
    await _db.collection('products').doc(listingId).delete();
  }

  // ── Discount ──────────────────────────────────────────────────────────────

  Future<void> setDiscount(
    String listingId, {
    required bool isActive,
    required double percentage,
    DateTime? startDate,
    DateTime? endDate,
  }) async {
    await _db.collection('products').doc(listingId).update({
      'discount': {
        'isActive': isActive,
        'percentage': percentage,
        if (startDate != null) 'startDate': Timestamp.fromDate(startDate),
        if (endDate != null) 'endDate': Timestamp.fromDate(endDate),
      },
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  // ── Delivery settings ─────────────────────────────────────────────────────

  Future<Map<String, dynamic>?> fetchDeliverySettings(
      String sellerPhone) async {
    final doc = await _db
        .collection('deliverySettings')
        .doc(sellerPhone)
        .get();
    return doc.exists ? doc.data() : null;
  }

  Future<void> saveDeliverySettings(
    String sellerPhone,
    Map<String, dynamic> settings,
  ) async {
    await _db
        .collection('deliverySettings')
        .doc(sellerPhone)
        .set(settings, SetOptions(merge: true));
  }

  // ── Seller orders ─────────────────────────────────────────────────────────

  Stream<List<OrderModel>> watchSellerOrders(String sellerPhone) {
    final uid = FirebaseAuth.instance.currentUser?.uid ?? '';

    final streams = <Stream<QuerySnapshot>>[
      _db
          .collection('orders')
          .where('sellerPhone', isEqualTo: sellerPhone)
          .snapshots(),
    ];
    if (uid.isNotEmpty) {
      streams.add(_db
          .collection('orders')
          .where('sellerId', isEqualTo: uid)
          .snapshots());
    }
    // Include bySellerId = sellerPhone for legacy support
    streams.add(_db
        .collection('orders')
        .where('sellerId', isEqualTo: sellerPhone)
        .snapshots());

    final controller = StreamController<List<OrderModel>>();
    final results = List<List<DocumentSnapshot>>.filled(streams.length, []);

    void emit() {
      try {
        final seen = <String>{};
        final merged = results
            .expand((docs) => docs)
            .where((d) => seen.add(d.id))
            .toList();

        merged.sort((a, b) {
          try {
            final dataA = a.data() as Map<String, dynamic>? ?? {};
            final dataB = b.data() as Map<String, dynamic>? ?? {};

            final rawA = dataA['createdAt'];
            final rawB = dataB['createdAt'];

            int timeA = 0;
            if (rawA is Timestamp) {
              timeA = rawA.millisecondsSinceEpoch;
            } else if (rawA is String) {
              timeA = DateTime.tryParse(rawA)?.millisecondsSinceEpoch ?? 0;
            }

            int timeB = 0;
            if (rawB is Timestamp) {
              timeB = rawB.millisecondsSinceEpoch;
            } else if (rawB is String) {
              timeB = DateTime.tryParse(rawB)?.millisecondsSinceEpoch ?? 0;
            }

            return timeB.compareTo(timeA);
          } catch (e) {
            return 0;
          }
        });

        if (!controller.isClosed) {
          final mappedOrders = <OrderModel>[];
          for (final doc in merged) {
            try {
              mappedOrders.add(OrderModel.fromFirestore(doc));
            } catch (err, stack) {
              print('Error mapping order ${doc.id}: $err');
              print(stack.toString());
            }
          }
          controller.add(mappedOrders);
        }
      } catch (err, stack) {
        print('Error in watchSellerOrders emit: $err');
        print(stack.toString());
      }
    }

    final subs = List.generate(streams.length, (i) {
      return streams[i].listen((s) {
        results[i] = s.docs;
        emit();
      }, onError: (_) {
        // A single query may be denied by rules (e.g. sellerId == phone is not
        // permitted — rules only allow sellerId == uid). Silence it so the
        // other queries (sellerPhone, sellerId == uid) still populate results.
      });
    });

    controller.onCancel = () {
      for (final s in subs) {
        s.cancel();
      }
    };
    return controller.stream;
  }

  Future<void> updateOrderStatus(String orderId, String status) async {
    final fsStatus = switch (status) {
      'cancelled' => 'rejected',
      'dispatched' => 'out_for_delivery',
      _ => status,
    };
    await _db.collection('orders').doc(orderId).update({
      'status': fsStatus,
      'statusHistory': FieldValue.arrayUnion([
        {'status': fsStatus, 'at': DateTime.now().toIso8601String()},
      ]),
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  // ── Image upload ──────────────────────────────────────────────────────────

  Future<String> uploadListingImage(File imageFile, String sellerPhone) async {
    final uid = FirebaseAuth.instance.currentUser?.uid ?? sellerPhone;
    final ref = _storage
        .ref()
        .child('listings/$uid/${DateTime.now().millisecondsSinceEpoch}.jpg');
    final task = await ref.putFile(imageFile);
    return await task.ref.getDownloadURL();
  }
}
