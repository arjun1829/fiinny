import 'dart:async';
import 'dart:developer' as dev;
import 'dart:io';

import 'package:flutter/foundation.dart';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';

import '../../../core/models/listing_model.dart';
import '../../../core/models/order_model.dart';
import '../../../core/models/subscription_model.dart';

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

class DashboardRepository {
  final _db = FirebaseFirestore.instance;
  final _storage = FirebaseStorage.instance;

  // ── Stats ────────────────────────────────────────────────────────────────

  Future<Map<String, int>> fetchStats(String sellerPhone) async {
    final uid = FirebaseAuth.instance.currentUser?.uid ?? '';

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
    final productFutures = <Future<QuerySnapshot>>[
      _db
          .collection('products')
          .where('retailerPhone', isEqualTo: sellerPhone)
          .get(),
      _db
          .collection('products')
          .where('manufacturerPhone', isEqualTo: sellerPhone)
          .where('ownerType', isEqualTo: 'manufacturer')
          .get(),
      if (uid.isNotEmpty)
        _db.collection('products').where('retailerId', isEqualTo: uid).get(),
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
  /// Queries by retailerPhone, retailerId (legacy), and ownerId (web new schema)
  /// so products created via web or mobile both appear.
  ///
  /// manufacturerPhone is scoped to ownerType=='manufacturer' — see the
  /// comment on fetchStats above for why an unscoped match pulls in every
  /// retailer's copy of this seller's assigned products. No manufacturerId==
  /// uid stream is needed: the plain ownerId==uid stream below already
  /// covers self-owned docs (ownerId uniquely identifies one account).
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
          .where('ownerType', isEqualTo: 'manufacturer')
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
  }) async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
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
    for (final snap in activeProductSnaps) {
      for (final d in snap.docs) {
        seenProductIds.add(d.id);
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
              FirebaseAuth.instance.currentUser?.uid ??
              '') as String;

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
    final task = await ref.putFile(imageFile);
    return await task.ref.getDownloadURL();
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
    final task = await ref.putFile(imageFile);
    return await task.ref.getDownloadURL();
  }

  /// Uploads a seller's shop banner and returns its public download URL. Same
  /// `profile-images/**` storage.rules prefix as the logo — web's dashboard
  /// banner uploader (handleBannerFile) writes to `profile-images/banners`.
  Future<String> uploadProfileBanner(File imageFile, String phone) async {
    final ref = _storage.ref().child(
      'profile-images/banners/${DateTime.now().millisecondsSinceEpoch}-$phone.jpg',
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
    final uid = FirebaseAuth.instance.currentUser?.uid ?? '';

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
    final uid = FirebaseAuth.instance.currentUser?.uid ?? '';

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
