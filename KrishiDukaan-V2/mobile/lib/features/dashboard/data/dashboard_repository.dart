import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';

import '../../../core/models/listing_model.dart';
import '../../../core/models/order_model.dart';

class SeatStats {
  final int totalPurchased;
  final int activeUsed;
  final int available;

  const SeatStats({
    required this.totalPurchased,
    required this.activeUsed,
    required this.available,
  });
}

class DashboardRepository {
  final _db = FirebaseFirestore.instance;
  final _storage = FirebaseStorage.instance;

  // ── Stats ────────────────────────────────────────────────────────────────

  Future<Map<String, int>> fetchStats(String sellerPhone) async {
    final uid = FirebaseAuth.instance.currentUser?.uid ?? '';

    // Products: phone, retailerId (legacy), and ownerId (web new schema)
    final productFutures = <Future<QuerySnapshot>>[
      _db
          .collection('products')
          .where('retailerPhone', isEqualTo: sellerPhone)
          .get(),
      _db
          .collection('products')
          .where('manufacturerPhone', isEqualTo: sellerPhone)
          .get(),
      if (uid.isNotEmpty)
        _db.collection('products').where('retailerId', isEqualTo: uid).get(),
      if (uid.isNotEmpty)
        _db
            .collection('products')
            .where('manufacturerId', isEqualTo: uid)
            .get(),
      if (uid.isNotEmpty)
        _db.collection('products').where('ownerId', isEqualTo: uid).get(),
    ];
    final orderFutures = <Future<QuerySnapshot>>[
      _db
          .collection('orders')
          .where('sellerPhone', isEqualTo: sellerPhone)
          .get(),
      if (uid.isNotEmpty)
        _db.collection('orders').where('sellerId', isEqualTo: uid).get(),
    ];

    final productResults = await Future.wait(productFutures);
    final orderResults = await Future.wait(orderFutures);

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

  /// Fetches another seller's active listings by phone only.
  /// Used by the shop profile screen so it never mixes in the current user's
  /// uid (which causes wrong data / iOS stream hangs on other people's profiles).
  Future<List<ListingModel>> fetchSellerListings(String sellerPhone) async {
    final futures = await Future.wait([
      _db.collection('products').where('retailerPhone', isEqualTo: sellerPhone).get(),
      _db.collection('products').where('manufacturerPhone', isEqualTo: sellerPhone).get(),
      _db.collection('listings').where('sellerPhone', isEqualTo: sellerPhone).get(),
    ]);
    final seen = <String>{};
    return futures
        .expand((snap) => snap.docs)
        .where((d) => seen.add(d.id))
        .map(ListingModel.fromFirestore)
        .toList();
  }

  /// Streams the seller's own products.
  /// Queries by retailerPhone, retailerId (legacy), and ownerId (web new schema)
  /// so products created via web or mobile both appear.
  Stream<List<ListingModel>> watchMyListings(String sellerPhone) {
    final uid = FirebaseAuth.instance.currentUser?.uid ?? '';

    final streams = <Stream<QuerySnapshot>>[
      _db
          .collection('products')
          .where('retailerPhone', isEqualTo: sellerPhone)
          .snapshots(),
      _db
          .collection('products')
          .where('manufacturerPhone', isEqualTo: sellerPhone)
          .snapshots(),
      _db
          .collection('listings')
          .where('sellerPhone', isEqualTo: sellerPhone)
          .snapshots(),
    ];
    if (uid.isNotEmpty) {
      streams.add(
        _db
            .collection('products')
            .where('retailerId', isEqualTo: uid)
            .snapshots(),
      );
      streams.add(
        _db
            .collection('products')
            .where('manufacturerId', isEqualTo: uid)
            .snapshots(),
      );
      streams.add(
        _db.collection('products').where('ownerId', isEqualTo: uid).snapshots(),
      );
    }

    if (streams.length == 1) {
      return streams[0].map(
        (s) => s.docs.map(ListingModel.fromFirestore).toList(),
      );
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

    final subs = List.generate(
      streams.length,
      (i) => streams[i].listen((s) {
        results[i] = s.docs;
        emit();
      }, onError: controller.addError),
    );

    controller.onCancel = () {
      for (final s in subs) {
        s.cancel();
      }
    };
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
    List<VariantModel> variants = const [],
    List<String> images = const [],
    String? productName,
    String? category,
    String? description,
    bool isActive = true,
    String? sellMode,
    bool? gstApplicable,
    double? gstRate,
  }) async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    await _db.collection('products').add({
      // Legacy field names used by security rules for update/delete ownership checks
      'retailerPhone': sellerPhone,
      'retailerId': uid,
      'ownerId': uid,
      'ownerType': 'retailer',
      'source': 'retailer_inventory_copy',
      // Store name fields matching legacy schema
      'store': sellerName,
      'sellerType': 'retailer',
      'catalogId': catalogId,
      'price': price,
      'stock': stockQuantity,
      'stockQuantity': stockQuantity,
      'address': sellerAddress,
      if (lat != null && lng != null) ...{'lat': lat, 'lng': lng},
      'name': productName,
      'category': category,
      'description': description,
      'images': images,
      if (images.isNotEmpty) 'imageUrl': images.first,
      if (images.isNotEmpty) 'image': images.first,
      'variants': variants.map((v) => v.toMap()).toList(),
      'isActive': isActive,
      'isOnline': sellMode != 'offline_store_only',
      'sellMode': sellMode,
      'gstApplicable': gstApplicable,
      'gstRate': gstRate,
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> updateListing(
    String listingId,
    Map<String, dynamic> data, {
    String collectionPath = 'products',
  }) async {
    await _db.collection(collectionPath).doc(listingId).update({
      ...data,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> deleteListing(
    String listingId, {
    String collectionPath = 'products',
  }) async {
    // Before deleting the copy, mark the seller as Out of Stock on the canonical
    // doc so the marketplace product page immediately reflects the removal.
    if (collectionPath == 'products') {
      await syncMarketMirror(listingId, isProductActive: false);
      await syncInventoryDoc(listingId, isProductActive: false);
    }
    await _db.collection(collectionPath).doc(listingId).delete();
  }

  // ── Discount ──────────────────────────────────────────────────────────────

  /// Writes a discount on the seller's product copy using the canonical FLAT
  /// schema shared with the web dashboard (`discountEnabled`, `discountPct`,
  /// `discountStartDate`, `discountEndDate`, `effectiveDiscountPct`), then
  /// mirrors the effective percentage into the marketplace `availability[]`
  /// entry so the product page and web show the same value.
  Future<void> setDiscount(
    String listingId, {
    required bool isActive,
    required double percentage,
    DateTime? startDate,
    DateTime? endDate,
  }) async {
    final effective = _effectivePct(isActive, percentage, startDate, endDate);
    await _db.collection('products').doc(listingId).update({
      'discountEnabled': isActive,
      'discountType': 'percentage',
      'discountPct': percentage,
      'discountStartDate': startDate != null
          ? Timestamp.fromDate(startDate)
          : null,
      'discountEndDate': endDate != null ? Timestamp.fromDate(endDate) : null,
      'effectiveDiscountPct': effective,
      'updatedAt': FieldValue.serverTimestamp(),
    });
    // Mirror the RAW percentage + validity fields (not the pre-collapsed
    // `effective` value) so readers can re-check date validity live, the
    // same way DiscountModel.fromProductData already does for the seller's
    // own copy — a pre-collapsed value would freeze at whatever was true
    // when this was saved and never reflect the discount expiring later.
    await syncMarketMirror(
      listingId,
      discountPct: percentage,
      discountEnabled: isActive,
      discountStartDate: startDate,
      discountEndDate: endDate,
    );
    await syncInventoryDoc(
      listingId,
      discountEnabled: isActive,
      discountPct: percentage,
      effectiveDiscountPct: effective,
      startDate: startDate,
      endDate: endDate,
    );
  }

  /// The active (date-filtered) discount percentage — mirrors web's
  /// `getActiveDiscountPct`.
  static double _effectivePct(
    bool enabled,
    double pct,
    DateTime? start,
    DateTime? end,
  ) {
    if (!enabled || pct <= 0) return 0;
    final now = DateTime.now();
    if (start != null && now.isBefore(start)) return 0;
    if (end != null && now.isAfter(end)) return 0;
    return pct;
  }

  /// Mirrors a seller's price / stock / discount change from their own product
  /// copy into the canonical product's `availability[]` entry, which is what
  /// the marketplace product page ("Available At") and the web dashboard read.
  ///
  /// [sellerProductId] is the seller's own product copy doc. The canonical doc
  /// is found via `manufacturerProductId` (assigned products) or
  /// `originalProductId` (retailer copies from the catalog). For standalone
  /// retailer products (no canonical parent) this is a no-op.
  ///
  /// Best-effort: failures never block the primary write.
  Future<void> syncMarketMirror(
    String sellerProductId, {
    double? sellingPrice,
    String? stockLevel,
    double? discountPct,
    bool? discountEnabled,
    DateTime? discountStartDate,
    DateTime? discountEndDate,
    bool? isProductActive,
  }) async {
    try {
      final sellerSnap = await _db
          .collection('products')
          .doc(sellerProductId)
          .get();
      if (!sellerSnap.exists) return;
      final s = sellerSnap.data()!;
      final rootId =
          (s['manufacturerProductId'] ?? s['originalProductId']) as String?;
      if (rootId == null || rootId.isEmpty || rootId == sellerProductId) return;

      final ownerId =
          (s['ownerId'] ?? s['retailerId'] ?? s['retailerDocId'])?.toString() ??
          '';
      final ownerPhone =
          (s['retailerPhone'] ?? s['ownerPhone'])?.toString() ?? '';

      final rootRef = _db.collection('products').doc(rootId);
      await _db.runTransaction((txn) async {
        final rootSnap = await txn.get(rootRef);
        if (!rootSnap.exists) return;
        final raw = rootSnap.data()?['availability'];
        if (raw is! List || raw.isEmpty) return;

        var changed = false;
        final updated = raw.map((e) {
          final entry = Map<String, dynamic>.from(e as Map);
          final sid = (entry['storeId'] ?? '').toString();
          final sphone = (entry['storePhone'] ?? '').toString();
          final matches =
              (ownerId.isNotEmpty && sid == ownerId) ||
              (ownerPhone.isNotEmpty &&
                  (sphone == ownerPhone || sid == ownerPhone));
          if (!matches) return entry;
          changed = true;
          if (sellingPrice != null) entry['sellingPrice'] = sellingPrice;
          // isProductActive=false overrides everything — seller hidden from marketplace
          if (isProductActive == false) {
            entry['stockLevel'] = 'Out of Stock';
          } else if (stockLevel != null) {
            entry['stockLevel'] = stockLevel;
          }
          if (discountPct != null) entry['discountPct'] = discountPct;
          if (discountEnabled != null) entry['discountEnabled'] = discountEnabled;
          if (discountStartDate != null) {
            entry['discountStartDate'] = Timestamp.fromDate(discountStartDate);
          } else if (discountEnabled != null) {
            // Discount saved with no start date — clear any previous one.
            entry['discountStartDate'] = null;
          }
          if (discountEndDate != null) {
            entry['discountEndDate'] = Timestamp.fromDate(discountEndDate);
          } else if (discountEnabled != null) {
            entry['discountEndDate'] = null;
          }
          return entry;
        }).toList();

        if (changed) txn.update(rootRef, {'availability': updated});
      });
    } catch (_) {
      // Best-effort mirror — the primary write already succeeded.
    }
  }

  /// Pushes a seller's price / stock / discount edit into the matching
  /// `inventory/{id}` doc (found by `productId`). The web dashboard reads
  /// price & stock from `inventory` (with the product doc only as a fallback),
  /// so without this a mobile edit would not appear on the seller's own web
  /// dashboard. No-op when the product has no inventory record. Best-effort.
  Future<void> syncInventoryDoc(
    String sellerProductId, {
    double? sellingPrice,
    int? stockQuantity,
    bool? isProductActive,
    bool? discountEnabled,
    double? discountPct,
    double? effectiveDiscountPct,
    DateTime? startDate,
    DateTime? endDate,
  }) async {
    try {
      final snap = await _db
          .collection('inventory')
          .where('productId', isEqualTo: sellerProductId)
          .get();
      if (snap.docs.isEmpty) return;

      final data = <String, dynamic>{'updatedAt': FieldValue.serverTimestamp()};
      if (sellingPrice != null) data['sellingPrice'] = sellingPrice;
      if (stockQuantity != null) {
        data['stockQuantity'] = stockQuantity;
        // isProductActive=false overrides stock-based availability
        data['isAvailable'] = isProductActive == false
            ? false
            : stockQuantity > 0;
      } else if (isProductActive != null) {
        data['isAvailable'] = isProductActive;
      }
      if (discountEnabled != null) {
        data['discountEnabled'] = discountEnabled;
        data['discountType'] = 'percentage';
        data['discountPct'] = discountPct ?? 0;
        data['effectiveDiscountPct'] = effectiveDiscountPct ?? 0;
        data['discountStartDate'] = startDate != null
            ? Timestamp.fromDate(startDate)
            : null;
        data['discountEndDate'] = endDate != null
            ? Timestamp.fromDate(endDate)
            : null;
      }

      for (final doc in snap.docs) {
        await doc.reference.update(data);
      }
    } catch (_) {
      // Best-effort — the seller's product copy is already updated.
    }
  }

  // ── Delivery settings ─────────────────────────────────────────────────────

  Future<Map<String, dynamic>?> fetchDeliverySettings(
    String sellerPhone,
  ) async {
    final doc = await _db.collection('deliverySettings').doc(sellerPhone).get();
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
      streams.add(
        _db.collection('orders').where('sellerId', isEqualTo: uid).snapshots(),
      );
    }
    // Include bySellerId = sellerPhone for legacy support
    streams.add(
      _db
          .collection('orders')
          .where('sellerId', isEqualTo: sellerPhone)
          .snapshots(),
    );

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
              debugPrint('Error mapping order ${doc.id}: $err');
              debugPrint(stack.toString());
            }
          }
          controller.add(mappedOrders);
        }
      } catch (err, stack) {
        debugPrint('Error in watchSellerOrders emit: $err');
        debugPrint(stack.toString());
      }
    }

    final subs = List.generate(streams.length, (i) {
      return streams[i].listen(
        (s) {
          results[i] = s.docs;
          emit();
        },
        onError: (_) {
          // A single query may be denied by rules (e.g. sellerId == phone is not
          // permitted — rules only allow sellerId == uid). Silence it so the
          // other queries (sellerPhone, sellerId == uid) still populate results.
        },
      );
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

  /// Uploads a product/listing image and returns its public download URL.
  ///
  /// Path MUST live under `product-images/` — storage.rules only grants
  /// `write: if request.auth != null` on `product-images/**` (and
  /// `blog-covers/**` / `reels/{docId}/**`); every other path, including the
  /// old `listings/{uid}/...` this used to write to, falls through to the
  /// default-deny rule at the bottom of storage.rules and every upload here
  /// failed with `firebase_storage/unauthorized` — silently sinking the whole
  /// "Add/Edit Product" save (image upload runs before the Firestore write).
  /// Naming matches web's `product-images/{timestamp}-{filename}` convention.
  Future<String> uploadListingImage(File imageFile, String sellerPhone) async {
    final safeName = imageFile.path
        .split('/')
        .last
        .replaceAll(RegExp(r'\s+'), '_');
    final ref = _storage.ref().child(
      'product-images/${DateTime.now().millisecondsSinceEpoch}-$safeName',
    );
    final task = await ref.putFile(imageFile);
    return await task.ref.getDownloadURL();
  }

  // ── Seat stats ────────────────────────────────────────────────────────────

  /// Computes real seat stats from `subscriptions` + `retailerSeatListings`,
  /// matching web's `computeSeatStats` logic exactly:
  ///   totalPurchased = sum of seatsPurchased from active (non-expired) subs
  ///   activeUsed     = count of seat listings with status=active & expiresAt > now
  ///   available      = max(0, totalPurchased - activeUsed)
  Future<SeatStats> fetchSeatStats(String ownerPhone) async {
    final uid = FirebaseAuth.instance.currentUser?.uid ?? '';
    final now = DateTime.now();

    // Fetch subscriptions — try by phone and by uid in parallel
    final subFutures = <Future<QuerySnapshot>>[
      if (ownerPhone.isNotEmpty)
        _db
            .collection('subscriptions')
            .where('ownerPhone', isEqualTo: ownerPhone)
            .where('subscriptionStatus', isEqualTo: 'active')
            .get(),
      if (uid.isNotEmpty)
        _db
            .collection('subscriptions')
            .where('ownerId', isEqualTo: uid)
            .where('subscriptionStatus', isEqualTo: 'active')
            .get(),
    ];

    // Fetch seat listings — by ownerPhone, uid, and manufacturerPhone
    final seatFutures = <Future<QuerySnapshot>>[
      if (ownerPhone.isNotEmpty)
        _db
            .collection('retailerSeatListings')
            .where('ownerPhone', isEqualTo: ownerPhone)
            .where('status', isEqualTo: 'active')
            .get(),
      if (uid.isNotEmpty)
        _db
            .collection('retailerSeatListings')
            .where('ownerId', isEqualTo: uid)
            .where('status', isEqualTo: 'active')
            .get(),
      if (ownerPhone.isNotEmpty)
        _db
            .collection('retailerSeatListings')
            .where('manufacturerPhone', isEqualTo: ownerPhone)
            .where('status', isEqualTo: 'active')
            .get(),
    ];

    final results = await Future.wait([
      Future.wait(subFutures),
      Future.wait(seatFutures),
    ]);

    final subSnaps = results[0];
    final seatSnaps = results[1];

    // Deduplicate subscriptions by doc id
    final seenSub = <String>{};
    int totalPurchased = 0;
    for (final snap in subSnaps) {
      for (final doc in snap.docs) {
        if (!seenSub.add(doc.id)) continue;
        final d = doc.data() as Map<String, dynamic>? ?? {};
        final expiry = d['expiryDate'] as Timestamp?;
        if (expiry != null && expiry.toDate().isBefore(now)) continue;
        final seats = (d['seatsPurchased'] as num?)?.toInt() ?? 0;
        totalPurchased += seats;
      }
    }

    // Deduplicate seat listings by doc id; count only active + non-expired
    final seenSeat = <String>{};
    int activeUsed = 0;
    for (final snap in seatSnaps) {
      for (final doc in snap.docs) {
        if (!seenSeat.add(doc.id)) continue;
        final d = doc.data() as Map<String, dynamic>? ?? {};
        final expiry = d['expiresAt'] as Timestamp?;
        if (expiry == null || expiry.toDate().isBefore(now)) continue;
        activeUsed++;
      }
    }

    return SeatStats(
      totalPurchased: totalPurchased,
      activeUsed: activeUsed,
      available: (totalPurchased - activeUsed).clamp(0, totalPurchased),
    );
  }
}
