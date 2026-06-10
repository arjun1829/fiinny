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

    // Query by phone AND uid — web saves retailerPhone only when uidIndex existed,
    // older products only have retailerId (the Firebase Auth UID).
    final futures = [
      _db.collection('products').where('retailerPhone', isEqualTo: sellerPhone).get(),
      if (uid.isNotEmpty)
        _db.collection('products').where('retailerId', isEqualTo: uid).get(),
      _db.collection('orders').where('sellerPhone', isEqualTo: sellerPhone).get(),
      if (uid.isNotEmpty)
        _db.collection('orders').where('sellerId', isEqualTo: uid).get(),
    ];

    final results = await Future.wait(futures);
    final productSnaps = results.sublist(0, uid.isNotEmpty ? 2 : 1);
    final orderSnaps  = results.sublist(uid.isNotEmpty ? 2 : 1);

    // Deduplicate by doc ID across both product queries
    final seen = <String>{};
    final allProducts = productSnaps
        .expand((s) => s.docs)
        .where((d) => seen.add(d.id))
        .toList();

    final seenOrders = <String>{};
    final allOrders = orderSnaps
        .expand((s) => s.docs)
        .where((d) => seenOrders.add(d.id))
        .toList();

    return {
      'totalListings': allProducts.length,
      'inStock': allProducts
          .where((d) {
            final stock = d['stock'];
            return stock is num
                ? stock > 0
                : (d['stockQuantity'] as num? ?? 0) > 0;
          })
          .length,
      'pendingOrders': allOrders.where((d) => d['status'] == 'placed').length,
      'totalOrders': allOrders.length,
    };
  }

  // ── Listings CRUD ─────────────────────────────────────────────────────────

  /// Streams the seller's own products, querying by both retailerPhone and
  /// retailerId so legacy products (uid-only) and new products (phone) both appear.
  Stream<List<ListingModel>> watchMyListings(String sellerPhone) {
    final uid = FirebaseAuth.instance.currentUser?.uid ?? '';

    final byPhone = _db
        .collection('products')
        .where('retailerPhone', isEqualTo: sellerPhone)
        .snapshots();

    if (uid.isEmpty) {
      return byPhone.map((s) => s.docs.map(ListingModel.fromFirestore).toList());
    }

    final byUid = _db
        .collection('products')
        .where('retailerId', isEqualTo: uid)
        .snapshots();

    // Merge two streams without rxdart: use a StreamController
    final controller = StreamController<List<ListingModel>>();
    List<DocumentSnapshot> phoneResults = [];
    List<DocumentSnapshot> uidResults   = [];

    void emit() {
      final seen = <String>{};
      final merged = [...phoneResults, ...uidResults]
          .where((d) => seen.add(d.id))
          .map(ListingModel.fromFirestore)
          .toList();
      if (!controller.isClosed) controller.add(merged);
    }

    final sub1 = byPhone.listen((s) { phoneResults = s.docs; emit(); },
        onError: controller.addError);
    final sub2 = byUid.listen((s)   { uidResults   = s.docs; emit(); },
        onError: controller.addError);

    controller.onCancel = () { sub1.cancel(); sub2.cancel(); };
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

    final byPhone = _db
        .collection('orders')
        .where('sellerPhone', isEqualTo: sellerPhone)
        .snapshots();

    if (uid.isEmpty) {
      return byPhone.map((s) => s.docs.map(OrderModel.fromFirestore).toList());
    }

    // Legacy orders stored sellerId as phone string; newer ones use sellerPhone.
    // Also check sellerId == uid for any orders written before this fix.
    final bySellerId = _db
        .collection('orders')
        .where('sellerId', isEqualTo: sellerPhone)
        .snapshots();

    final controller = StreamController<List<OrderModel>>();
    List<DocumentSnapshot> phoneResults    = [];
    List<DocumentSnapshot> sellerIdResults = [];

    void emit() {
      final seen = <String>{};
      final merged = [...phoneResults, ...sellerIdResults]
          .where((d) => seen.add(d.id))
          .toList()
        ..sort((a, b) {
          final ta = (a['createdAt'] as Timestamp?)?.millisecondsSinceEpoch ?? 0;
          final tb = (b['createdAt'] as Timestamp?)?.millisecondsSinceEpoch ?? 0;
          return tb.compareTo(ta);
        });
      if (!controller.isClosed) {
        controller.add(merged.map(OrderModel.fromFirestore).toList());
      }
    }

    final sub1 = byPhone.listen((s)     { phoneResults    = s.docs; emit(); },
        onError: controller.addError);
    final sub2 = bySellerId.listen((s)  { sellerIdResults = s.docs; emit(); },
        onError: controller.addError);

    controller.onCancel = () { sub1.cancel(); sub2.cancel(); };
    return controller.stream;
  }

  Future<void> updateOrderStatus(String orderId, String status) async {
    await _db.collection('orders').doc(orderId).update({
      'status': status,
      'statusHistory': FieldValue.arrayUnion([
        {'status': status, 'at': DateTime.now().toIso8601String()},
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
