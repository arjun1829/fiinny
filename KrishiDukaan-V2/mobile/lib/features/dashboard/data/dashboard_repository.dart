import 'dart:async';
import 'dart:developer' as dev;
import 'dart:io';


import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';

import '../../../core/data/paged_feed.dart';
import '../../../core/models/listing_model.dart';
import '../../../core/models/order_model.dart';
import '../../../core/models/subscription_model.dart';
import 'seller_earnings.dart';
import '../../../core/session/shop_session.dart';

class SeatStats {
  final int totalPurchased;
  final int activeUsed;
  final int available;

  /// Active subscriptions expiring within 5 days — the same window web's
  /// subscription dashboard flags.
  final int expiringSoon;

  const SeatStats({
    required this.totalPurchased,
    required this.activeUsed,
    required this.available,
    this.expiringSoon = 0,
  });
}

/// A seller's all-time order totals (see fetchSellerOrderTotals).
class SellerOrderTotals {
  final int count;
  final double revenue;
  final int paid;
  final double paidAmount;
  final Map<String, int> status;

  const SellerOrderTotals({
    this.count = 0,
    this.revenue = 0,
    this.paid = 0,
    this.paidAmount = 0,
    this.status = const {},
  });

  factory SellerOrderTotals.fromMap(Map<dynamic, dynamic> m) {
    final status = <String, int>{};
    final raw = m['status'];
    if (raw is Map) {
      raw.forEach((k, v) => status['$k'] = (v as num?)?.toInt() ?? 0);
    }
    return SellerOrderTotals(
      count: (m['count'] as num?)?.toInt() ?? 0,
      revenue: (m['revenue'] as num?)?.toDouble() ?? 0,
      paid: (m['paid'] as num?)?.toInt() ?? 0,
      paidAmount: (m['paidAmount'] as num?)?.toDouble() ?? 0,
      status: status,
    );
  }

  SellerOrderTotals operator +(SellerOrderTotals o) => SellerOrderTotals(
        count: count + o.count,
        revenue: revenue + o.revenue,
        paid: paid + o.paid,
        paidAmount: paidAmount + o.paidAmount,
        status: {
          for (final k in {...status.keys, ...o.status.keys})
            k: (status[k] ?? 0) + (o.status[k] ?? 0),
        },
      );

  int countOf(String s) => status[s] ?? 0;
}

class DashboardRepository {
  final _db = FirebaseFirestore.instance;
  final _storage = FirebaseStorage.instance;

  // ── Stats ────────────────────────────────────────────────────────────────

  /// Lifetime engagement counters from productStats/{id} for the given
  /// products. Legacy values on the product docs are added by the caller.
  Future<Map<String, int>> fetchProductStatsTotals(List<String> ids) async {
    final totals = {'impressions': 0, 'clicks': 0, 'directionRequests': 0};
    // 30 ids per query (the whereIn limit), all in parallel.
    final snaps = await Future.wait([
      for (var i = 0; i < ids.length; i += 30)
        _db
            .collection('productStats')
            .where(FieldPath.documentId,
                whereIn: ids.sublist(i, i + 30 > ids.length ? ids.length : i + 30))
            .get()
            .then<QuerySnapshot<Map<String, dynamic>>?>((s) => s)
            // Unreadable stats — the caller still shows the legacy counters.
            .catchError((_) => null),
    ]);
    for (final snap in snaps) {
      for (final doc in snap?.docs ?? const <QueryDocumentSnapshot<Map<String, dynamic>>>[]) {
        final d = doc.data();
        for (final field in totals.keys.toList()) {
          totals[field] = totals[field]! + ((d[field] as num?)?.toInt() ?? 0);
        }
      }
    }
    return totals;
  }

  Future<Map<String, int>> fetchStats(String sellerPhone) async {
    final uid = ShopSession.sellerUid();

    // Products: phone, retailerId (legacy), and ownerId (web new schema).
    //
    // manufacturerPhone/manufacturerId are NOT ownership fields — every
    // retailer-assignment copy of a manufacturer's product also stamps the
    // original manufacturer's phone/uid onto the copy for traceability, even
    // though the copy is owned by the retailer (ownerType: 'retailer'). A raw
    // equality match on manufacturerPhone/manufacturerId therefore returns
    // every retailer's copy of every assigned product — a manufacturer with
    // 5 real products assigned to 100+ retailers showed 600+ "products" here.
    // ownerType=='manufacturer' is only ever true on the manufacturer's own
    // doc, never on a retailer's copy, so it's the safe scope. The bare
    // ownerId==uid branch below already covers self-owned docs for both
    // roles (ownerId uniquely identifies one account), so no
    // manufacturerId==uid branch is needed at all.
    // One OR query (each product read once), and the order counts from the
    // seller's stats docs instead of every order the seller ever had.
    final productFilter = _myProductsFilter(sellerPhone, uid);
    final productsFuture = productFilter == null
        ? Future.value(<QueryDocumentSnapshot<Map<String, dynamic>>>[])
        : _db.collection('products').where(productFilter).get().then((s) => s.docs);
    final totalsFuture = fetchSellerOrderTotals(sellerPhone);

    final allProducts = await productsFuture;
    final totals = await totalsFuture;

    return {
      'totalListings': allProducts.length,
      'inStock': allProducts.where(_isDocInStock).length,
      'pendingOrders': totals.countOf('placed'),
      'totalOrders': totals.count,
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
  ///
  /// The manufacturerPhone branch is scoped to ownerType=='manufacturer' —
  /// without it, every retailer's assignment-copy of this seller's products
  /// (which also carries the seller's phone in manufacturerPhone purely for
  /// traceability) was counted as one of THIS seller's own products, which is
  /// why "My Shop" showed hundreds of phantom products for a manufacturer who
  /// had only a handful and had assigned them out to many retailers.
  Future<List<ListingModel>> fetchSellerListings(String sellerPhone) async {
    final futures = await Future.wait([
      _db.collection('products').where('retailerPhone', isEqualTo: sellerPhone).get(),
      _db
          .collection('products')
          .where('manufacturerPhone', isEqualTo: sellerPhone)
          .where('ownerType', isEqualTo: 'manufacturer')
          .get(),
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
  /// Matches retailerPhone, retailerId (legacy), and ownerId (web new schema)
  /// so products created via web or mobile both appear.
  ///
  /// manufacturerPhone is scoped to ownerType=='manufacturer' — see the
  /// comment on fetchStats above for why an unscoped match pulls in every
  /// retailer's copy of this seller's assigned products. No manufacturerId==
  /// uid match is needed: ownerId==uid already covers self-owned docs
  /// (ownerId uniquely identifies one account).
  ///
  /// The product matches run as ONE OR query, so a product carrying several
  /// of these fields (a retailer's own product usually has retailerPhone,
  /// retailerId and ownerId) is read once, not once per listener. The legacy
  /// `listings` collection keeps its own listener.
  Stream<List<ListingModel>> watchMyListings(String sellerPhone) {
    final uid = ShopSession.sellerUid();

    final productFilter = _myProductsFilter(sellerPhone, uid);

    final streams = <Stream<QuerySnapshot>>[
      if (productFilter != null)
        _db.collection('products').where(productFilter).snapshots(),
      _db
          .collection('listings')
          .where('sellerPhone', isEqualTo: sellerPhone)
          .snapshots(),
    ];

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

  /// The seller's own products (see watchMyListings for the fields), as one
  /// filter for an OR query; null when there is nothing to match.
  static Filter? _myProductsFilter(String sellerPhone, String uid) {
    final matches = <Filter>[
      if (sellerPhone.isNotEmpty) Filter('retailerPhone', isEqualTo: sellerPhone),
      if (sellerPhone.isNotEmpty)
        Filter.and(
          Filter('manufacturerPhone', isEqualTo: sellerPhone),
          Filter('ownerType', isEqualTo: 'manufacturer'),
        ),
      if (uid.isNotEmpty) Filter('retailerId', isEqualTo: uid),
      if (uid.isNotEmpty) Filter('ownerId', isEqualTo: uid),
    ];
    if (matches.isEmpty) return null;
    return matches.length == 1 ? matches.single : _anyOf(matches);
  }

  /// Filter.or over a list (it takes up to 30 positional filters).
  static Filter _anyOf(List<Filter> f) {
    assert(f.length >= 2 && f.length <= 4);
    switch (f.length) {
      case 2:
        return Filter.or(f[0], f[1]);
      case 3:
        return Filter.or(f[0], f[1], f[2]);
      default:
        return Filter.or(f[0], f[1], f[2], f[3]);
    }
  }

  /// The candidate still exists under this name (a card can trail a rename
  /// or delete by a few seconds); otherwise the listing is added unlinked,
  /// as before, rather than failing the whole save.
  Future<bool> _confirmLink(String productId, String nameKey) async {
    try {
      final snap = await _db.collection('products').doc(productId).get();
      final d = snap.data();
      if (d == null || d['isActive'] == false) return false;
      return (d['name'] ?? '').toString().toLowerCase().trim() == nameKey;
    } catch (_) {
      return false;
    }
  }

  Future<void> addListing({
    required String sellerPhone,
    required String sellerName,
    required String catalogId,
    required double price,
    required int stockQuantity,
    bool isCopy = false,
    String? originalProductId,
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
    // Same three fields the web's Edit Product writes: GST is INCLUDED in the
    // price unless the seller says otherwise; a product can ship free or carry
    // an extra delivery charge on top of the seller's weight slab.
    bool gstIncluded = true,
    double extraDeliveryCharge = 0,
    bool freeDelivery = false,
    // Web-parity product detail fields. All optional so existing callers and
    // older app versions keep working; each is only written when non-empty so
    // a product never gains a meaningless empty array/map.
    Map<String, dynamic>? categoryInfo,
    List<Map<String, String>>? composition,
    List<Map<String, String>>? customFields,
    String? videoUrl,
    // The marketplace product whose name matches [productName], when the
    // seller typed it instead of picking it. Linked to (like a pick) unless
    // the seller already lists that name, so the product keeps one seller
    // list and checkout can price this store. See [_confirmLink].
    String? linkCandidateId,
  }) async {
    final uid = ShopSession.sellerUidOrNull();
    final now = DateTime.now();

    // ── 1. Subscription & Seat Limit Enforcement ────────────────────────────
    final stats = await fetchSeatStats(sellerPhone);
    if (stats.totalPurchased <= 0) {
      throw Exception(
        'No active subscription found. Please purchase a subscription to add products to your store.',
      );
    }

    // Cross-check active products in Firestore to prevent desync
    final activeProductSnaps = await Future.wait([
      if (sellerPhone.isNotEmpty)
        _db
            .collection('products')
            .where('retailerPhone', isEqualTo: sellerPhone)
            .where('isActive', isEqualTo: true)
            .get(),
      if (uid != null && uid.isNotEmpty)
        _db
            .collection('products')
            .where('ownerId', isEqualTo: uid)
            .where('isActive', isEqualTo: true)
            .get(),
    ]);
    final seenProductIds = <String>{};
    final nameKey = (productName ?? '').toLowerCase().trim();
    var listsSameName = false;
    for (final snap in activeProductSnaps) {
      for (final d in snap.docs) {
        seenProductIds.add(d.id);
        final data = d.data() as Map<String, dynamic>? ?? const {};
        if ((data['name'] ?? '').toString().toLowerCase().trim() == nameKey) {
          listsSameName = true;
        }
      }
    }
    final activeCount = seenProductIds.length;
    final usedSeats = stats.activeUsed > activeCount ? stats.activeUsed : activeCount;

    if (usedSeats >= stats.totalPurchased) {
      throw Exception(
        'Seat limit reached ($usedSeats/${stats.totalPurchased} seats used). You cannot add more products. Please purchase more seats to expand your store.',
      );
    }

    // Determine latest subscription expiry date for the seat listing
    Timestamp? subExpiry;
    final subQueries = <Future<QuerySnapshot>>[
      if (sellerPhone.isNotEmpty)
        _db
            .collection('subscriptions')
            .where('ownerPhone', isEqualTo: sellerPhone)
            .where('subscriptionStatus', isEqualTo: 'active')
            .get(),
      if (uid != null && uid.isNotEmpty)
        _db
            .collection('subscriptions')
            .where('ownerId', isEqualTo: uid)
            .where('subscriptionStatus', isEqualTo: 'active')
            .get(),
    ];
    for (final snap in await Future.wait(subQueries)) {
      for (final doc in snap.docs) {
        final d = doc.data() as Map<String, dynamic>? ?? {};
        final exp = d['expiryDate'] as Timestamp?;
        if (exp != null && exp.toDate().isAfter(now)) {
          if (subExpiry == null || exp.toDate().isAfter(subExpiry.toDate())) {
            subExpiry = exp;
          }
        }
      }
    }
    final expiresAt = subExpiry ?? Timestamp.fromDate(now.add(const Duration(days: 365)));

    if (!isCopy && !listsSameName && nameKey.isNotEmpty &&
        linkCandidateId != null && linkCandidateId.isNotEmpty &&
        await _confirmLink(linkCandidateId, nameKey)) {
      isCopy = true;
      originalProductId = linkCandidateId;
      catalogId = linkCandidateId;
    }

    // ── 2. Create Product, Inventory, and Seat Listing ──────────────────────
    final productRef = _db.collection('products').doc();
    final inventoryRef = _db.collection('inventory').doc();
    final seatListingRef = _db.collection('retailerSeatListings').doc();
    final batch = _db.batch();

    final isOnline = sellMode != 'offline_store_only';
    final storeAvEntry = {
      'storeId': uid ?? sellerPhone,
      'storePhone': sellerPhone,
      'storeName': sellerName,
      'stockLevel': stockQuantity > 0 ? 'In Stock' : 'Out of Stock',
      'sellingPrice': price,
      'isOnline': isOnline,
      if (variants.isNotEmpty)
        'variants': variants.map((v) => v.toMap()).toList(),
    };

    final origId = originalProductId ?? (isCopy ? catalogId : null);

    batch.set(productRef, {
      // Legacy field names used by security rules for update/delete ownership checks
      'retailerPhone': sellerPhone,
      'retailerId': uid,
      'ownerId': uid,
      'ownerType': 'retailer',
      'source': isCopy ? 'retailer_inventory_copy' : 'retailer_inventory',
      if (isCopy && origId != null && origId.isNotEmpty) ...{
        'originalProductId': origId,
        'manufacturerProductId': origId,
      },
      'availability': [storeAvEntry],
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
      // Base pack size web reads (inventory table, duplicate check, cards).
      if (variants.isNotEmpty) 'unit': variants.first.label,
      'isActive': isActive,
      'isOnline': sellMode != 'offline_store_only',
      'sellMode': sellMode,
      'gstApplicable': gstApplicable,
      'gstRate': gstRate,
      // Included only makes sense when GST applies — web stores false otherwise.
      'gstIncluded': gstApplicable == true ? gstIncluded : false,
      'extraDeliveryCharge': freeDelivery ? 0 : extraDeliveryCharge,
      'freeDelivery': freeDelivery,
      // Same field names the web dashboard writes (inventory-firestore.ts), so
      // a product created on either platform renders identically on both.
      if (categoryInfo != null && categoryInfo.isNotEmpty)
        'categoryInfo': categoryInfo,
      if (composition != null && composition.isNotEmpty)
        'composition': composition,
      if (customFields != null && customFields.isNotEmpty)
        'customFields': customFields,
      if (videoUrl != null && videoUrl.trim().isNotEmpty)
        'videoUrl': videoUrl.trim(),
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    });

    // Web's dashboard inventory table joins products <-> inventory by
    // productId and silently drops any product with no matching inventory
    // doc (no error shown). Mirrors what web's own createProductAndInventory does.
    batch.set(inventoryRef, {
      'id': inventoryRef.id,
      'ownerId': uid,
      'ownerPhone': sellerPhone,
      'ownerType': 'retailer',
      'retailerId': uid,
      'retailerPhone': sellerPhone,
      'productId': productRef.id,
      'stockQuantity': stockQuantity,
      'sellingPrice': price,
      'reorderThreshold': 5,
      'isAvailable': stockQuantity > 0,
      'updatedAt': FieldValue.serverTimestamp(),
    });

    // Retailer seat listing consumed
    batch.set(seatListingRef, {
      'id': seatListingRef.id,
      'ownerId': uid ?? sellerPhone,
      'ownerPhone': sellerPhone.isNotEmpty ? sellerPhone : null,
      'ownerType': 'retailer',
      'manufacturerId': null,
      'manufacturerPhone': null,
      'retailerDocId': sellerPhone.isNotEmpty ? sellerPhone : null,
      'retailerId': uid ?? sellerPhone,
      'retailerPhone': sellerPhone.isNotEmpty ? sellerPhone : null,
      'productId': productRef.id,
      'manufacturerProductId': origId,
      'listingType': isCopy ? 'assigned' : 'own',
      'status': 'active',
      'assignedAt': FieldValue.serverTimestamp(),
      'expiresAt': expiresAt,
      'releasedAt': null,
    });

    // Increment user product count
    if (sellerPhone.isNotEmpty) {
      batch.set(
        _db.collection('users').doc(sellerPhone),
        {
          'productCount': FieldValue.increment(1),
          'updatedAt': FieldValue.serverTimestamp(),
        },
        SetOptions(merge: true),
      );
    }

    if (isCopy && origId != null && origId.isNotEmpty) {
      final originalRef = _db.collection('products').doc(origId);
      batch.update(originalRef, {
        'availability': FieldValue.arrayUnion([storeAvEntry]),
        'updatedAt': FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();

    // Ensure a retailers/profiles doc exists so this store appears in the store locator.
    // If the retailer never saved their full profile, fetchStores() won't find them.
    if (sellerPhone.isNotEmpty) {
      try {
        final retailerRef = _db.collection('retailers').doc(sellerPhone);
        final profileRef = _db.collection('profiles').doc(sellerPhone);
        final rSnap = await retailerRef.get();
        if (!rSnap.exists) {
          final storeData = <String, dynamic>{
            'userId': uid,
            'retailerId': uid,
            'role': 'retailer',
            'name': sellerName,
            'shopName': sellerName,
            'ownerName': sellerName,
            'phone': sellerPhone,
            'ownerPhone': sellerPhone,
            'active': true,
            'status': 'Active',
            'onlineDelivery': isOnline,
            if (sellerAddress != null && sellerAddress.isNotEmpty)
              'address': sellerAddress,
            if (lat != null && lng != null) ...{
              'lat': lat,
              'lng': lng,
              'geo': GeoPoint(lat, lng),
              'location': {'lat': lat, 'lng': lng},
            },
            'createdAt': FieldValue.serverTimestamp(),
            'updatedAt': FieldValue.serverTimestamp(),
          };
          await Future.wait([
            retailerRef.set(storeData, SetOptions(merge: true)),
            profileRef.set({
              ...storeData,
              if (sellerAddress != null && sellerAddress.isNotEmpty)
                'address': {'line1': sellerAddress},
            }, SetOptions(merge: true)),
          ]);
        }
      } catch (e) {
        dev.log('Failed to ensure retailer/profile doc: $e');
      }
    }
  }

  Future<void> updateListing(
    String listingId,
    Map<String, dynamic> data, {
    String collectionPath = 'products',
  }) async {
    if (collectionPath == 'products' && data.containsKey('isActive')) {
      final newActive = data['isActive'] == true;
      try {
        final docRef = _db.collection('products').doc(listingId);
        final prevSnap = await docRef.get();
        if (prevSnap.exists) {
          final pData = prevSnap.data() as Map<String, dynamic>;
          final prevActive = pData['isActive'] != false;
          final sellerPhone =
              (pData['retailerPhone'] ?? pData['ownerPhone'] ?? '') as String;
          final uid = (pData['ownerId'] ??
              pData['retailerId'] ??
              ShopSession.sellerUid()) as String;

          if (!prevActive && newActive) {
            // Reactivating: verify seat availability
            final stats = await fetchSeatStats(sellerPhone);
            if (stats.totalPurchased <= 0) {
              throw Exception(
                'No active subscription found. Purchase a subscription to reactivate this product.',
              );
            }
            if (stats.available <= 0) {
              throw Exception(
                'Seat limit reached (${stats.activeUsed}/${stats.totalPurchased} used). Please purchase more seats to reactivate this product.',
              );
            }

            final now = DateTime.now();
            Timestamp? subExpiry;
            final subSnap = await _db
                .collection('subscriptions')
                .where('subscriptionStatus', isEqualTo: 'active')
                .where('ownerPhone', isEqualTo: sellerPhone)
                .get();
            for (final subDoc in subSnap.docs) {
              final exp = (subDoc.data()['expiryDate'] as Timestamp?)?.toDate();
              if (exp != null && exp.isAfter(now)) {
                if (subExpiry == null || exp.isAfter(subExpiry.toDate())) {
                  subExpiry = Timestamp.fromDate(exp);
                }
              }
            }
            final expiresAt = subExpiry ??
                Timestamp.fromDate(now.add(const Duration(days: 365)));

            final seatSnaps = await _db
                .collection('retailerSeatListings')
                .where('productId', isEqualTo: listingId)
                .get();

            if (seatSnaps.docs.isNotEmpty) {
              final seatBatch = _db.batch();
              for (final sDoc in seatSnaps.docs) {
                seatBatch.update(sDoc.reference, {
                  'status': 'active',
                  'expiresAt': expiresAt,
                  'releasedAt': null,
                });
              }
              await seatBatch.commit();
            } else {
              await _db.collection('retailerSeatListings').add({
                'ownerId': uid.isNotEmpty ? uid : sellerPhone,
                'ownerPhone': sellerPhone.isNotEmpty ? sellerPhone : null,
                'ownerType': 'retailer',
                'manufacturerId': null,
                'manufacturerPhone': null,
                'retailerDocId': sellerPhone.isNotEmpty ? sellerPhone : null,
                'retailerId': uid.isNotEmpty ? uid : sellerPhone,
                'retailerPhone': sellerPhone.isNotEmpty ? sellerPhone : null,
                'productId': listingId,
                'manufacturerProductId':
                    pData['originalProductId'] ?? pData['catalogId'],
                'listingType': pData['source'] == 'retailer_inventory_copy'
                    ? 'assigned'
                    : 'own',
                'status': 'active',
                'assignedAt': FieldValue.serverTimestamp(),
                'expiresAt': expiresAt,
                'releasedAt': null,
              });
            }

            if (sellerPhone.isNotEmpty) {
              await _db.collection('users').doc(sellerPhone).set({
                'productCount': FieldValue.increment(1),
                'updatedAt': FieldValue.serverTimestamp(),
              }, SetOptions(merge: true));
            }
          } else if (prevActive && !newActive) {
            // Deactivating: release seat listing
            final seatSnaps = await _db
                .collection('retailerSeatListings')
                .where('productId', isEqualTo: listingId)
                .where('status', isEqualTo: 'active')
                .get();
            if (seatSnaps.docs.isNotEmpty) {
              final seatBatch = _db.batch();
              for (final sDoc in seatSnaps.docs) {
                seatBatch.update(sDoc.reference, {
                  'status': 'released',
                  'releasedAt': FieldValue.serverTimestamp(),
                });
              }
              await seatBatch.commit();
            }
            if (sellerPhone.isNotEmpty) {
              await _db.collection('users').doc(sellerPhone).set({
                'productCount': FieldValue.increment(-1),
                'updatedAt': FieldValue.serverTimestamp(),
              }, SetOptions(merge: true));
            }
          }
        }
      } catch (e) {
        if (e is Exception && e.toString().contains('Seat limit reached')) {
          rethrow;
        }
        dev.log('Failed to update seat status during updateListing: $e');
      }
    }

    if (collectionPath == 'products') {
      try {
        final docRef = _db.collection(collectionPath).doc(listingId);
        final docSnap = await docRef.get();
        if (docSnap.exists) {
          final p = docSnap.data();
          final rawAv = p?['availability'];
          if (rawAv is List && rawAv.isNotEmpty) {
            final updatedAv = rawAv.map((e) {
              final entry = Map<String, dynamic>.from(e as Map);
              if (data.containsKey('isOnline')) {
                entry['isOnline'] = data['isOnline'] == true;
              }
              if (data.containsKey('price')) {
                entry['sellingPrice'] = data['price'];
              }
              if (data.containsKey('stockQuantity')) {
                final qty = data['stockQuantity'];
                entry['stockLevel'] =
                    (qty is num && qty > 0) ? 'In Stock' : 'Out of Stock';
              }
              return entry;
            }).toList();
            data['availability'] = updatedAv;
          }
        }
      } catch (e) {
        dev.log('Failed to sync availability in updateListing: $e');
      }
    }

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

      try {
        final seatSnaps = await _db
            .collection('retailerSeatListings')
            .where('productId', isEqualTo: listingId)
            .where('status', isEqualTo: 'active')
            .get();
        if (seatSnaps.docs.isNotEmpty) {
          final seatBatch = _db.batch();
          for (final doc in seatSnaps.docs) {
            seatBatch.update(doc.reference, {
              'status': 'released',
              'releasedAt': FieldValue.serverTimestamp(),
            });
          }
          await seatBatch.commit();
        }

        final productDoc = await _db.collection('products').doc(listingId).get();
        final pData = productDoc.data();
        final phone =
            (pData?['retailerPhone'] ?? pData?['ownerPhone']) as String?;
        final wasActive = pData?['isActive'] != false;
        if (wasActive && phone != null && phone.isNotEmpty) {
          await _db.collection('users').doc(phone).set({
            'productCount': FieldValue.increment(-1),
            'updatedAt': FieldValue.serverTimestamp(),
          }, SetOptions(merge: true));
        }
      } catch (e) {
        dev.log('Failed to release seat on delete: $e');
      }
    }
    await _db.collection(collectionPath).doc(listingId).delete();
  }

  // ── Discount ──────────────────────────────────────────────────────────────

  /// Writes a discount on the seller's product copy using the canonical FLAT
  /// schema shared with the web dashboard (`discountEnabled`, `discountPct`,
  /// `discountStartDate`, `discountEndDate`, `effectiveDiscountPct`), then
  /// mirrors the effective percentage into the marketplace `availability[]`
  /// entry so the product page and web show the same value.
  /// Saves a seller's discount.
  ///
  /// [discountType] is `'percentage'` or `'fixed_amount'`, matching web's
  /// discount-panel. It used to be hardcoded to `'percentage'` here, which
  /// silently CORRUPTED a fixed-amount discount set on web: web reads its
  /// discount state back from the `inventory` doc, so any mobile save flipped
  /// the type to percentage and left a stale `discountFixedAmt` behind — the
  /// rupee discount simply disappeared for buyers.
  ///
  /// [bulkEnabled]/[bulkTiers] are carried through untouched for the same
  /// reason: they're web-only fields today, and omitting them from a mobile
  /// save would wipe a seller's tier table.
  Future<void> setDiscount(
    String listingId, {
    required bool isActive,
    required double percentage,
    String discountType = 'percentage',
    double fixedAmount = 0,
    DateTime? startDate,
    DateTime? endDate,
    bool? bulkEnabled,
    List<Map<String, dynamic>>? bulkTiers,
  }) async {
    final effective = _effectivePct(isActive, percentage, startDate, endDate);
    await _db.collection('products').doc(listingId).update({
      'discountEnabled': isActive,
      'discountType': discountType,
      'discountPct': percentage,
      'discountFixedAmt': fixedAmount,
      'discountStartDate': startDate != null
          ? Timestamp.fromDate(startDate)
          : null,
      'discountEndDate': endDate != null ? Timestamp.fromDate(endDate) : null,
      'effectiveDiscountPct': effective,
      if (bulkEnabled != null) 'bulkDiscountEnabled': bulkEnabled,
      if (bulkTiers != null) 'bulkDiscountTiers': bulkTiers,
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
      discountType: discountType,
      discountFixedAmt: fixedAmount,
      effectiveDiscountPct: effective,
      startDate: startDate,
      endDate: endDate,
      bulkEnabled: bulkEnabled,
      bulkTiers: bulkTiers,
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
    bool? isOnline,
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
          if (isOnline != null) entry['isOnline'] = isOnline;
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
    /// 'percentage' | 'fixed_amount'. Null means "leave whatever is stored" —
    /// see the note in the discount block below for why that matters.
    String? discountType,
    double? discountFixedAmt,
    double? effectiveDiscountPct,
    DateTime? startDate,
    DateTime? endDate,
    bool? bulkEnabled,
    List<Map<String, dynamic>>? bulkTiers,
    // GST + delivery, mirrored onto the inventory row the web dashboard reads
    // (the seller's product copy stays the source of truth). All-or-nothing:
    // passing gstApplicable writes the whole set.
    bool? gstApplicable,
    double? gstRate,
    bool? gstIncluded,
    double? extraDeliveryCharge,
    bool? freeDelivery,
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
      if (gstApplicable != null) {
        data['gstApplicable'] = gstApplicable;
        data['gstRate'] = gstApplicable ? (gstRate ?? 0) : 0;
        data['gstIncluded'] = gstApplicable ? (gstIncluded ?? true) : false;
        data['extraDeliveryCharge'] =
            (freeDelivery ?? false) ? 0 : (extraDeliveryCharge ?? 0);
        data['freeDelivery'] = freeDelivery ?? false;
      }
      if (discountEnabled != null) {
        data['discountEnabled'] = discountEnabled;
        data['discountPct'] = discountPct ?? 0;
        data['effectiveDiscountPct'] = effectiveDiscountPct ?? 0;
        // `discountType` was hardcoded to 'percentage' here. The web dashboard
        // reads a product's discount state back OUT of this inventory doc, so
        // that hardcode silently converted a seller's fixed-amount (₹)
        // discount into a percentage one on any mobile save — including an
        // unrelated price/stock edit that happens to pass discountEnabled —
        // leaving a stale discountFixedAmt behind and making the ₹ discount
        // vanish for buyers. Only write the type when the caller actually
        // knows it; otherwise leave whatever is stored untouched.
        if (discountType != null) data['discountType'] = discountType;
        if (discountFixedAmt != null) {
          data['discountFixedAmt'] = discountFixedAmt;
        }
        // Same reasoning for bulk tiers: they're web-only fields today, so a
        // mobile save must carry them through rather than clear them.
        if (bulkEnabled != null) data['bulkDiscountEnabled'] = bulkEnabled;
        if (bulkTiers != null) data['bulkDiscountTiers'] = bulkTiers;
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

  /// Sets the ACCOUNT-level online-delivery flag for a seller.
  ///
  /// Distinct from a product's own `sellMode`/`isOnline`: this is the single
  /// switch that turns the seller's online selling on or off across their
  /// whole catalogue, so they never have to edit every product one by one.
  ///
  /// Writes every mirror web reads, in web's own precedence order (see
  /// fetchStoreOnlineDelivery in app/firebase.ts: profiles -> users ->
  /// retailers|manufacturers). users/{phone} is always written and allowed to
  /// throw; the profile mirrors are best-effort and use update() rather than
  /// set(merge:) so they never CREATE a near-empty public profile doc for a
  /// seller who has none — storefront readers would pick that up as a real
  /// (nameless) profile.
  Future<void> setAccountOnlineDelivery(
    String sellerPhone, {
    required bool enabled,
    required bool isManufacturer,
  }) async {
    if (sellerPhone.isEmpty) return;

    await _db.collection('users').doc(sellerPhone).set({
      'onlineDelivery': enabled,
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));

    final profileCollection = isManufacturer ? 'manufacturers' : 'retailers';
    for (final path in [profileCollection, 'profiles']) {
      try {
        await _db.collection(path).doc(sellerPhone).update({
          'onlineDelivery': enabled,
          'updatedAt': FieldValue.serverTimestamp(),
        });
      } catch (_) {
        // Mirror doesn't exist yet, or isn't writable — the gate reads
        // users/{phone}, which was already written above.
      }
    }
  }

  /// Saves just the GSTIN — used by the inline "enter GST to turn on Online
  /// Delivery" prompt, which needs to persist one field without going through
  /// the full profile form (and its other required fields). Same mirrors as
  /// setAccountOnlineDelivery, for the same reason: web reads gstin from
  /// retailers|manufacturers/{phone}, not users/{phone}. The role doc uses
  /// update() rather than set(merge:) so this can never CREATE a near-empty
  /// public profile doc for a seller who has none.
  Future<void> updateGstin(
    String sellerPhone, {
    required bool isManufacturer,
    required String gstin,
  }) async {
    if (sellerPhone.isEmpty) return;

    await _db.collection('users').doc(sellerPhone).set({
      'gstin': gstin,
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));

    final profileCollection = isManufacturer ? 'manufacturers' : 'retailers';
    try {
      await _db.collection(profileCollection).doc(sellerPhone).update({
        'gstin': gstin,
        'updatedAt': FieldValue.serverTimestamp(),
      });
    } catch (_) {
      // Mirror doesn't exist yet — users/{phone} above is already the source
      // of truth the enable-gate itself checks.
    }
  }

  /// Mirrors web's enableOnlineDeliveryWithGst (profile-persistence.ts): the
  /// single combined write that happens only after the seller has confirmed
  /// their GST number AND agreed to the Online Delivery Terms dialog. Writes
  /// gstin + gstRegistered + onlineDelivery:true + the terms-acceptance
  /// receipt across the same three collections as the other mirrors above.
  Future<void> enableOnlineDeliveryWithGst(
    String sellerPhone, {
    required bool isManufacturer,
    required String gstin,
    required Map<String, dynamic> termsAcceptance,
  }) async {
    if (sellerPhone.isEmpty) return;

    final payload = {
      'gstin': gstin,
      'gstRegistered': true,
      'onlineDelivery': true,
      'onlineDeliveryTerms': termsAcceptance,
      'updatedAt': FieldValue.serverTimestamp(),
    };

    await _db
        .collection('users')
        .doc(sellerPhone)
        .set(payload, SetOptions(merge: true));

    final profileCollection = isManufacturer ? 'manufacturers' : 'retailers';
    for (final path in [profileCollection, 'profiles']) {
      try {
        await _db.collection(path).doc(sellerPhone).update(payload);
      } catch (_) {
        // Mirror doesn't exist yet, or isn't writable — users/{phone} above
        // is already the source of truth the enable-gate itself checks.
      }
    }
  }

  /// Reads the seller's account-level online-delivery flag using web's exact
  /// precedence (profiles -> users -> retailers|manufacturers), so the toggle
  /// shows the same state the web dashboard would.
  Future<bool> fetchAccountOnlineDelivery(
    String sellerPhone, {
    required bool isManufacturer,
  }) async {
    if (sellerPhone.isEmpty) return false;
    final profileCollection = isManufacturer ? 'manufacturers' : 'retailers';
    for (final path in ['profiles', 'users', profileCollection]) {
      try {
        final snap = await _db.collection(path).doc(sellerPhone).get();
        final value = snap.data()?['onlineDelivery'];
        if (value is bool) return value;
      } catch (_) {
        // Unreadable mirror — fall through to the next one.
      }
    }
    return false;
  }

  // ── Seller orders ─────────────────────────────────────────────────────────

  /// The seller's orders, newest first, 30 at a time per query: live for the
  /// first page, [PagedFeed.loadMore] for older ones. Orders are filed under
  /// `sellerPhone` (app) or the seller's Auth UID in `sellerId` (older web
  /// orders). `sellerId == phone` is not queried: the rules only allow
  /// `sellerId == uid`, so that listener was always refused.
  PagedFeed<OrderModel> sellerOrdersFeed(String sellerPhone) {
    final uid = ShopSession.sellerUid();
    final orders = _db.collection('orders');
    return PagedFeed<OrderModel>(
      queries: [
        if (sellerPhone.isNotEmpty) orders.where('sellerPhone', isEqualTo: sellerPhone),
        if (uid.isNotEmpty) orders.where('sellerId', isEqualTo: uid),
      ],
      map: OrderModel.fromFirestore,
    );
  }

  /// The seller's orders created in [start, end) (all of them, one read), for
  /// the analytics window.
  Future<List<OrderModel>> fetchSellerOrdersInRange(
    String sellerPhone,
    DateTime start, [
    DateTime? end,
  ]) async {
    final uid = ShopSession.sellerUid();
    final orders = _db.collection('orders');
    Query<Map<String, dynamic>> windowed(Query<Map<String, dynamic>> q) {
      var out = q.where('createdAt', isGreaterThanOrEqualTo: Timestamp.fromDate(start));
      if (end != null) out = out.where('createdAt', isLessThan: Timestamp.fromDate(end));
      return out.orderBy('createdAt', descending: true);
    }

    final snaps = await Future.wait([
      if (sellerPhone.isNotEmpty)
        windowed(orders.where('sellerPhone', isEqualTo: sellerPhone))
            .get()
            .then<QuerySnapshot<Map<String, dynamic>>?>((s) => s)
            .catchError((_) => null),
      if (uid.isNotEmpty)
        windowed(orders.where('sellerId', isEqualTo: uid))
            .get()
            .then<QuerySnapshot<Map<String, dynamic>>?>((s) => s)
            .catchError((_) => null),
    ]);
    final byId = <String, OrderModel>{};
    for (final snap in snaps) {
      for (final d in snap?.docs ?? const <QueryDocumentSnapshot<Map<String, dynamic>>>[]) {
        try {
          byId[d.id] = OrderModel.fromFirestore(d);
        } catch (_) {}
      }
    }
    return byId.values.toList()
      ..sort((a, b) => (b.createdAt ?? DateTime(0)).compareTo(a.createdAt ?? DateTime(0)));
  }

  /// The seller's earnings totals and recent holds, live: sellerStats/{key}
  /// (2 docs) and the last [kPayoutHoldDays] + 2 days of sellerDailyStats per
  /// key the seller's orders are filed under. Feed to earningsFromStats.
  Stream<({Map<String, double> totals, List<EarningsHold> holds})>
      watchSellerEarningsStats(String sellerPhone) {
    final keys = _sellerKeys(sellerPhone);
    if (keys.isEmpty) {
      return Stream.value((totals: <String, double>{}, holds: <EarningsHold>[]));
    }
    final from = DateTime.now().subtract(const Duration(days: kPayoutHoldDays + 2));
    final fromKey = '${from.year}-${from.month.toString().padLeft(2, '0')}-${from.day.toString().padLeft(2, '0')}';

    final controller =
        StreamController<({Map<String, double> totals, List<EarningsHold> holds})>();
    final totalsByKey = <String, Map<String, dynamic>>{};
    final daysByKey = <String, List<Map<String, dynamic>>>{};
    var pending = keys.length * 2;
    final started = <String>{};

    void emit() {
      if (pending > 0 || controller.isClosed) return;
      final totals = <String, double>{};
      void add(String k, Object? v) => totals[k] = (totals[k] ?? 0) + ((v as num?)?.toDouble() ?? 0);
      for (final e in totalsByKey.values) {
        add('orders', e['orders']);
        add('gatewayFees', e['gatewayFees']);
        for (final phase in ['awaiting', 'delivered', 'transferred', 'settled']) {
          final b = e[phase];
          add(phase, b is Map ? b['net'] : null);
        }
      }
      final holds = <EarningsHold>[];
      for (final days in daysByKey.values) {
        for (final day in days) {
          final h = day['holds'];
          if (h is! Map) continue;
          for (final entry in h.values) {
            if (entry is! Map) continue;
            final net = (entry['net'] as num?)?.toDouble() ?? 0;
            final atMs = (entry['at'] as num?)?.toInt() ?? 0;
            final releaseMs = (entry['releaseAt'] as num?)?.toInt() ?? 0;
            if (net > 0 && atMs > 0) {
              holds.add(EarningsHold(
                net: net,
                deliveredAt: DateTime.fromMillisecondsSinceEpoch(atMs),
                releaseAt: releaseMs > 0 ? DateTime.fromMillisecondsSinceEpoch(releaseMs) : null,
              ));
            }
          }
        }
      }
      controller.add((totals: totals, holds: holds));
    }

    void ready(String id) {
      if (started.add(id)) pending--;
      emit();
    }

    final subs = <StreamSubscription>[];
    for (final key in keys) {
      subs.add(_db.collection('sellerStats').doc(key).snapshots().listen((d) {
        final e = d.data()?['earnings'];
        totalsByKey[key] = e is Map ? Map<String, dynamic>.from(e) : {};
        ready('t$key');
      }, onError: (_) => ready('t$key')));
      subs.add(_db
          .collection('sellerDailyStats')
          .where('sellerKey', isEqualTo: key)
          .where('date', isGreaterThanOrEqualTo: fromKey)
          .snapshots()
          .listen((s) {
        daysByKey[key] = s.docs.map((d) => d.data()).toList();
        ready('d$key');
      }, onError: (_) => ready('d$key')));
    }
    controller.onCancel = () {
      for (final s in subs) {
        s.cancel();
      }
    };
    return controller.stream;
  }

  /// The keys a seller's orders are filed under in sellerStats: the phone as
  /// +91 and 10 digits, and the Auth UID.
  List<String> _sellerKeys(String sellerPhone) {
    final uid = ShopSession.sellerUid();
    final digits = sellerPhone.replaceAll(RegExp(r'\D'), '');
    return <String>{
      if (digits.length >= 10) '+91${digits.substring(digits.length - 10)}',
      if (uid.isNotEmpty) uid,
    }.toList();
  }

  /// All-time order totals from sellerStats/{key}, kept by the
  /// sellerStatsOnOrderWrite Cloud Function: one doc per key the seller's
  /// orders are filed under (+91 phone, Auth UID), each order under one key.
  Future<SellerOrderTotals> fetchSellerOrderTotals(String sellerPhone) async {
    final docs = await Future.wait(_sellerKeys(sellerPhone).map((k) => _db
        .collection('sellerStats')
        .doc(k)
        .get()
        .then<DocumentSnapshot<Map<String, dynamic>>?>((d) => d)
        .catchError((_) => null)));
    var totals = const SellerOrderTotals();
    for (final d in docs) {
      final orders = d?.data()?['orders'];
      if (orders is Map) totals = totals + SellerOrderTotals.fromMap(orders);
    }
    return totals;
  }

  /// Writes a canonical order status (see FirestoreKeys.orderStatusFlow).
  /// No translation: the value passed in is the value stored, which is what the
  /// web seller/customer views read.
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
    final task = await ref.putFile(imageFile, _uploadedImageMetadata(imageFile));
    return await task.ref.getDownloadURL();
  }

  /// Every image upload lands at a new timestamped path, so the bytes behind a
  /// download URL never change. That lets phones and browsers keep them for a
  /// year instead of re-checking each image with Storage on every view — the
  /// same header web uses for banners and the reel pipeline for videos.
  SettableMetadata _uploadedImageMetadata(File imageFile) {
    final path = imageFile.path.toLowerCase();
    final contentType = path.endsWith('.png')
        ? 'image/png'
        : path.endsWith('.webp')
            ? 'image/webp'
            : 'image/jpeg';
    return SettableMetadata(
      contentType: contentType,
      cacheControl: 'public, max-age=31536000, immutable',
    );
  }

  /// Uploads a seller's profile/shop logo and returns its public download URL.
  ///
  /// Path MUST live under `profile-images/**` — same storage.rules-allowed
  /// prefix web's `uploadImageToStorage(file, "profile-images/logos")` uses
  /// for the exact same purpose (see app/dashboard/page.tsx handleLogoFile);
  /// any other prefix falls through to the default-deny rule.
  Future<String> uploadProfileLogo(File imageFile, String phone) async {
    final ref = _storage.ref().child(
      'profile-images/logos/${DateTime.now().millisecondsSinceEpoch}-$phone.jpg',
    );
    final task = await ref.putFile(imageFile, _uploadedImageMetadata(imageFile));
    return await task.ref.getDownloadURL();
  }

  /// Uploads a seller's shop banner and returns its public download URL. Same
  /// `profile-images/**` storage.rules prefix as the logo — web's dashboard
  /// banner uploader (handleBannerFile) writes to `profile-images/banners`.
  Future<String> uploadProfileBanner(File imageFile, String phone) async {
    final ref = _storage.ref().child(
      'profile-images/banners/${DateTime.now().millisecondsSinceEpoch}-$phone.jpg',
    );
    final task = await ref.putFile(imageFile, _uploadedImageMetadata(imageFile));
    return await task.ref.getDownloadURL();
  }

  // ── Seat stats ────────────────────────────────────────────────────────────

  /// Computes real seat stats from `subscriptions` + `retailerSeatListings`,
  /// matching web's `computeSeatStats` logic exactly:
  ///   totalPurchased = sum of seatsPurchased from active (non-expired) subs
  ///   activeUsed     = count of seat listings with status=active & expiresAt > now
  ///   available      = max(0, totalPurchased - activeUsed)
  Future<SeatStats> fetchSeatStats(String ownerPhone) async {
    final uid = ShopSession.sellerUid();
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
    int expiringSoon = 0;
    for (final snap in subSnaps) {
      for (final doc in snap.docs) {
        if (!seenSub.add(doc.id)) continue;
        final d = doc.data() as Map<String, dynamic>? ?? {};
        final expiry = d['expiryDate'] as Timestamp?;
        if (expiry != null && expiry.toDate().isBefore(now)) continue;
        final seats = (d['seatsPurchased'] as num?)?.toInt() ?? 0;
        totalPurchased += seats;
        // Web's tile is labelled "Subscriptions in 30 days" (isExpiringSoon,
        // app/dashboard/_lib/subscriptions-firestore.ts) - this used to say
        // <= 5, so the count almost never matched what the label promised.
        if (expiry != null &&
            expiry.toDate().difference(now).inDays <= 30) {
          expiringSoon++;
        }
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
      expiringSoon: expiringSoon,
    );
  }

  /// Full subscription purchase history, newest first.
  ///
  /// Dual-axis on `ownerPhone` + `ownerId` then deduped, because the two
  /// platforms key ownership differently (and admin grants key by phone).
  /// Deliberately unfiltered by status — history must show expired and
  /// revoked rows too, unlike fetchSeatStats which only sums active ones.
  /// Sorted client-side: an orderBy alongside these equality filters would
  /// need a composite index, and this repo has been bitten by undeployed
  /// indexes before.
  Future<List<SubscriptionModel>> fetchSubscriptionHistory(
    String ownerPhone,
  ) async {
    final uid = ShopSession.sellerUid();

    Future<List<QueryDocumentSnapshot>> byField(String field, String value) async {
      try {
        final snap = await _db
            .collection('subscriptions')
            .where(field, isEqualTo: value)
            .get();
        return snap.docs;
      } catch (_) {
        return const [];
      }
    }

    final results = await Future.wait([
      if (ownerPhone.isNotEmpty) byField('ownerPhone', ownerPhone),
      if (uid.isNotEmpty) byField('ownerId', uid),
    ]);

    final seen = <String>{};
    final subs = <SubscriptionModel>[];
    for (final docs in results) {
      for (final doc in docs) {
        if (!seen.add(doc.id)) continue;
        subs.add(SubscriptionModel.fromFirestore(doc));
      }
    }
    subs.sort((a, b) {
      final av = a.createdAt ?? a.startDate;
      final bv = b.createdAt ?? b.startDate;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return bv.compareTo(av);
    });
    return subs;
  }

  /// Seat listings currently consuming this seller's seats, with product
  /// name/image hydrated from the product docs (seat listings store neither).
  Future<List<SeatListingModel>> fetchActiveSeatListings(
    String ownerPhone,
  ) async {
    final uid = ShopSession.sellerUid();

    Future<List<QueryDocumentSnapshot>> byField(String field, String value) async {
      try {
        final snap = await _db
            .collection('retailerSeatListings')
            .where(field, isEqualTo: value)
            .where('status', isEqualTo: 'active')
            .get();
        return snap.docs;
      } catch (_) {
        return const [];
      }
    }

    // Same three axes fetchSeatStats uses, so the list and the seat counter
    // can never disagree about what is consuming a seat.
    final results = await Future.wait([
      if (ownerPhone.isNotEmpty) byField('ownerPhone', ownerPhone),
      if (uid.isNotEmpty) byField('ownerId', uid),
      if (ownerPhone.isNotEmpty) byField('manufacturerPhone', ownerPhone),
    ]);

    final seen = <String>{};
    var listings = <SeatListingModel>[];
    for (final docs in results) {
      for (final doc in docs) {
        if (!seen.add(doc.id)) continue;
        final model = SeatListingModel.fromFirestore(doc);
        if (!model.isCurrentlyActive) continue;
        listings.add(model);
      }
    }

    // Hydrate product names in whereIn chunks (Firestore caps at 30).
    final ids = listings
        .map((l) => l.productId)
        .where((id) => id.isNotEmpty)
        .toSet()
        .toList();
    final products = <String, Map<String, dynamic>>{};
    for (var i = 0; i < ids.length; i += 30) {
      final chunk = ids.sublist(i, i + 30 > ids.length ? ids.length : i + 30);
      try {
        final snap = await _db
            .collection('products')
            .where(FieldPath.documentId, whereIn: chunk)
            .get();
        for (final doc in snap.docs) {
          products[doc.id] = doc.data();
        }
      } catch (_) {
        // A deleted product just leaves the row unnamed.
      }
    }

    listings = listings.map((l) {
      final p = products[l.productId];
      if (p == null) return l;
      final images = p['images'];
      return l.copyWith(
        productName: (p['name'] ?? '').toString(),
        productImage: images is List && images.isNotEmpty
            ? images.first?.toString()
            : p['imageUrl']?.toString() ?? p['image']?.toString(),
      );
    }).toList();

    listings.sort((a, b) {
      final av = a.assignedAt, bv = b.assignedAt;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return bv.compareTo(av);
    });
    return listings;
  }

  // Seat release deliberately lives in ManufacturerRepository
  // .removeProductAssignment, not here. A bare status flip on the seat
  // listing (what this class used to expose) leaves the retailer's product
  // copy live and orderable on the marketplace after their seat is revoked —
  // web has always done the full cleanup.
}
