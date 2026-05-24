import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/constants.dart';
import '../shared/models.dart';

/// Single point of contact with Firestore. Collection names mirror the web
/// app schema described in KRISHIDUKAN_PROJECT_SPEC.md.
class FirestoreRepository {
  FirestoreRepository(this._db);
  final FirebaseFirestore _db;

  // ---- Products ----------------------------------------------------------

  Stream<List<Product>> watchProducts({int limit = 100}) {
    return _db
        .collection('products')
        .orderBy('name')
        .limit(limit)
        .snapshots()
        .map((s) => s.docs
            .where((d) {
              // Mirror the web's filter: only show docs that have a non-empty
              // image AND a non-zero price AND a name.
              final m = d.data();
              final img = m['image'] ?? m['img'] ?? m['imageUrl'] ?? '';
              final price = _asInt(m['price'] ?? m['priceInr'] ?? 0);
              final name = (m['name'] ?? '').toString().trim();
              return name.isNotEmpty && price > 0 && img is String && img.isNotEmpty;
            })
            .map(_productFromDoc)
            .toList());
  }

  Future<Product?> fetchProduct(String id) async {
    final doc = await _db.collection('products').doc(id).get();
    if (!doc.exists) return null;
    return _productFromDoc(doc);
  }

  Future<List<Product>> searchProducts(String query) async {
    final snap = await _db.collection('products').limit(200).get();
    final q = query.trim().toLowerCase();
    final products = snap.docs
        .map(_productFromDoc)
        .where((p) => p.name.isNotEmpty)
        .toList();
    if (q.isEmpty) {
      products.sort((a, b) => a.name.compareTo(b.name));
      return products;
    }
    return products
        .where((p) =>
            p.name.toLowerCase().contains(q) ||
            p.category.toLowerCase().contains(q))
        .toList()
      ..sort((a, b) => a.name.compareTo(b.name));
  }

  // ---- Stores ------------------------------------------------------------

  /// Mirrors the web's fetchStores: merges 'stores' + 'retailers' collections.
  Stream<List<Store>> watchStores({int limit = 50}) {
    final controller = StreamController<List<Store>>();
    List<Store> storesList = [];
    List<Store> retailersList = [];

    void emit() => controller.add([...storesList, ...retailersList]);

    final storesSub = _db
        .collection('stores')
        .limit(limit)
        .snapshots()
        .listen((s) {
      storesList = s.docs.map(_storeFromDoc).toList();
      emit();
    }, onError: controller.addError);

    final retailersSub = _db
        .collection('retailers')
        .limit(limit)
        .snapshots()
        .listen((s) {
      retailersList = s.docs.map(_storeFromDoc).toList();
      emit();
    }, onError: controller.addError);

    controller.onCancel = () {
      storesSub.cancel();
      retailersSub.cancel();
    };

    return controller.stream;
  }

  // ---- Users / role ------------------------------------------------------

  /// Upsert the signed-in user's profile (uid → users/{uid}).
  Future<void> upsertUserProfile({
    required String uid,
    required String phone,
    UserRole? role,
  }) async {
    await _db.collection('users').doc(uid).set(
      {
        'phone': phone,
        if (role != null) 'role': role.name,
        'updatedAt': FieldValue.serverTimestamp(),
      },
      SetOptions(merge: true),
    );
  }

  Future<UserRole?> fetchUserRole(String uid) async {
    final doc = await _db.collection('users').doc(uid).get();
    return UserRoleX.tryParse(doc.data()?['role'] as String?);
  }

  Future<void> setSubscribed(String uid, bool subscribed) async {
    await _db.collection('users').doc(uid).set(
      {
        'subscribed': subscribed,
        'subscribedAt':
            subscribed ? FieldValue.serverTimestamp() : null,
      },
      SetOptions(merge: true),
    );
  }

  Future<Map<String, dynamic>?> fetchUserProfile(String uid) async {
    final doc = await _db.collection('users').doc(uid).get();
    return doc.data();
  }

  Future<void> setUserPaid(String uid, bool isPaid, int totalSeats) async {
    await _db.collection('users').doc(uid).set(
      {
        'isPaid': isPaid,
        'totalSeats': totalSeats,
        'updatedAt': FieldValue.serverTimestamp(),
      },
      SetOptions(merge: true),
    );
  }

  // ---- Subscriptions ---------------------------------------------------------

  Future<List<AppSubscription>> fetchSubscriptions(String ownerId) async {
    final snap = await _db
        .collection('subscriptions')
        .where('ownerId', isEqualTo: ownerId)
        .get();
    final subs = snap.docs.map(_subFromDoc).toList();
    subs.sort((a, b) =>
        (b.createdAt ?? DateTime(0)).compareTo(a.createdAt ?? DateTime(0)));
    return subs;
  }

  Future<String> createSubscription({
    required String ownerId,
    required String ownerType,
    required int seatsPurchased,
    required double amountPaid,
    String? razorpayOrderId,
    String? razorpayPaymentId,
  }) async {
    final now = DateTime.now();
    final expiry = DateTime(now.year, now.month + 1, now.day);
    final ref = _db.collection('subscriptions').doc();
    await ref.set({
      'ownerId': ownerId,
      'ownerType': ownerType,
      'planName': 'Standard',
      'seatsPurchased': seatsPurchased,
      'amountPaid': amountPaid,
      'currency': 'INR',
      'startDate': Timestamp.fromDate(now),
      'expiryDate': Timestamp.fromDate(expiry),
      'razorpayOrderId': razorpayOrderId,
      'razorpayPaymentId': razorpayPaymentId,
      'subscriptionStatus': 'active',
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    });
    return ref.id;
  }

  Future<List<SeatListing>> fetchSeatListings(String ownerId) async {
    final snap = await _db
        .collection('retailerSeatListings')
        .where('ownerId', isEqualTo: ownerId)
        .get();
    final listings = snap.docs.map(_seatFromDoc).toList();
    listings.sort((a, b) =>
        (b.assignedAt ?? DateTime(0)).compareTo(a.assignedAt ?? DateTime(0)));
    return listings;
  }

  SeatStats computeSeatStats(
      List<AppSubscription> subs, List<SeatListing> listings) {
    final activeSubs = subs.where((s) => s.isActive).toList();
    final totalPurchased =
        activeSubs.fold<int>(0, (acc, s) => acc + s.seatsPurchased);
    final activeUsed = listings.where((l) => l.isActive).length;
    final available = (totalPurchased - activeUsed).clamp(0, totalPurchased);
    final expiringSoon = activeSubs.where((s) => s.isExpiringSoon).length;
    return SeatStats(
      totalPurchased: totalPurchased,
      activeUsed: activeUsed,
      available: available,
      expiringSoon: expiringSoon,
    );
  }

  // ---- Inventory (retailer) --------------------------------------------------

  Future<List<InventoryRow>> fetchRetailerInventory(String ownerId) async {
    final productsSnap = await _db
        .collection('products')
        .where('ownerId', isEqualTo: ownerId)
        .where('ownerType', isEqualTo: 'retailer')
        .get();
    if (productsSnap.docs.isEmpty) return [];

    final productIds = productsSnap.docs.map((d) => d.id).toList();
    final inventoryMap = <String, Map<String, dynamic>>{};

    // Firestore 'in' queries are limited to 10 at a time.
    for (var i = 0; i < productIds.length; i += 10) {
      final chunk = productIds.skip(i).take(10).toList();
      final invSnap = await _db
          .collection('inventory')
          .where('productId', whereIn: chunk)
          .get();
      for (final d in invSnap.docs) {
        final data = d.data();
        final pid = data['productId'] as String? ?? '';
        if (!inventoryMap.containsKey(pid)) inventoryMap[pid] = data;
      }
    }

    final rows = <InventoryRow>[];
    for (final pd in productsSnap.docs) {
      final inv = inventoryMap[pd.id];
      if (inv == null) continue;
      final qty = _asInt(inv['stockQuantity'] ?? inv['stock'] ?? 0);
      final thresh = _asInt(inv['reorderThreshold'] ?? inv['reorderAt'] ?? 5);
      final status = qty <= 0
          ? 'out_of_stock'
          : qty <= thresh
              ? 'low_stock'
              : 'in_stock';
      rows.add(InventoryRow(
        inventoryId: inv['id'] as String? ?? pd.id,
        productId: pd.id,
        productName: (pd.data()['name'] ?? '') as String,
        category: (pd.data()['category'] ?? '') as String,
        unit: (pd.data()['unit'] ?? '') as String,
        stockQuantity: qty,
        sellingPrice: _asDouble(inv['sellingPrice'] ?? inv['price'] ?? 0),
        reorderThreshold: thresh,
        status: status,
        imageUrl: _pickImage(pd.data()),
        source: pd.data()['source'] as String?,
        updatedAt: (inv['updatedAt'] as Timestamp?)?.toDate(),
      ));
    }
    rows.sort((a, b) =>
        (b.updatedAt ?? DateTime(0)).compareTo(a.updatedAt ?? DateTime(0)));
    return rows;
  }

  Future<void> updateInventoryStock(
      String inventoryId, int qty, double price, int reorderAt) async {
    await _db.collection('inventory').doc(inventoryId).update({
      'stockQuantity': qty,
      'sellingPrice': price,
      'reorderThreshold': reorderAt,
      'isAvailable': qty > 0,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  // ---- Catalogue (manufacturer) ----------------------------------------------

  Future<List<ManufacturerProductRow>> fetchManufacturerCatalogue(
      String ownerId) async {
    final snap = await _db
        .collection('products')
        .where('ownerId', isEqualTo: ownerId)
        .where('ownerType', isEqualTo: 'manufacturer')
        .get();
    final rows = snap.docs.map((d) {
      final m = d.data();
      return ManufacturerProductRow(
        productId: d.id,
        productName: (m['name'] ?? '') as String,
        category: (m['category'] ?? '') as String,
        unit: (m['unit'] ?? '') as String,
        price: _asDouble(m['price'] ?? m['defaultPrice'] ?? 0),
        isActive: (m['isActive'] ?? true) as bool,
        imageUrl: _pickImage(m),
        updatedAt: (m['updatedAt'] as Timestamp?)?.toDate(),
      );
    }).toList();
    rows.sort((a, b) =>
        (b.updatedAt ?? DateTime(0)).compareTo(a.updatedAt ?? DateTime(0)));
    return rows;
  }

  Future<void> createManufacturerProduct({
    required String ownerId,
    required String name,
    required String category,
    required String unit,
    required double price,
    required String description,
    required List<String> images,
    String? sourceProductId,
  }) async {
    final now = FieldValue.serverTimestamp();
    await _db.collection('products').add({
      'name': name,
      'category': category,
      'unit': unit,
      'price': price,
      'description': description,
      'image': images.isNotEmpty ? images.first : '',
      'images': images,
      'ownerId': ownerId,
      'ownerType': 'manufacturer',
      'isActive': true,
      'source': 'manufacturer_inventory',
      if (sourceProductId != null) 'sourceProductId': sourceProductId,
      'createdAt': now,
      'updatedAt': now,
    });
  }

  // ---- Subscription mappers --------------------------------------------------

  AppSubscription _subFromDoc(DocumentSnapshot<Map<String, dynamic>> d) {
    final m = d.data() ?? {};
    final status = m['subscriptionStatus'] as String? ?? 'active';
    return AppSubscription(
      id: d.id,
      ownerId: (m['ownerId'] ?? '') as String,
      ownerType: (m['ownerType'] ?? 'retailer') as String,
      planName: (m['planName'] ?? 'Standard') as String,
      seatsPurchased: _asInt(m['seatsPurchased'] ?? 0),
      amountPaid: _asDouble(m['amountPaid'] ?? 0),
      status: (status == 'expired' || status == 'cancelled') ? status : 'active',
      startDate: (m['startDate'] as Timestamp?)?.toDate(),
      expiryDate: (m['expiryDate'] as Timestamp?)?.toDate(),
      razorpayOrderId: m['razorpayOrderId'] as String?,
      razorpayPaymentId: m['razorpayPaymentId'] as String?,
      createdAt: (m['createdAt'] as Timestamp?)?.toDate(),
    );
  }

  SeatListing _seatFromDoc(DocumentSnapshot<Map<String, dynamic>> d) {
    final m = d.data() ?? {};
    final status = m['status'] as String? ?? 'active';
    return SeatListing(
      id: d.id,
      ownerId: (m['ownerId'] ?? '') as String,
      listingType: m['listingType'] == 'assigned' ? 'assigned' : 'own',
      status: (status == 'released' || status == 'expired') ? status : 'active',
      retailerId: m['retailerId'] as String?,
      productId: m['productId'] as String?,
      assignedAt: (m['assignedAt'] as Timestamp?)?.toDate(),
      expiresAt: (m['expiresAt'] as Timestamp?)?.toDate(),
    );
  }

  // ---- Mappers -----------------------------------------------------------

  Product _productFromDoc(DocumentSnapshot<Map<String, dynamic>> d) {
    final m = d.data() ?? const <String, dynamic>{};
    return Product(
      id: d.id,
      name: (m['name'] ?? '') as String,
      brand: (m['brand'] ?? '') as String,
      category: (m['category'] ?? '') as String,
      priceInr: _asInt(m['priceInr'] ?? m['price']),
      mrpInr: _asInt(m['mrpInr'] ?? m['mrp'] ?? m['oldPrice'] ?? m['originalPrice'] ?? 0),
      unit: (m['unit'] ?? 'unit') as String,
      imageUrl: _pickImage(m),
      rating: _asDouble(m['rating']),
      description: (m['description'] ?? '') as String,
    );
  }

  // Web app is hosted at this URL; Firestore image fields store relative paths
  // like /product-images/Product_Images/Power Plus.png that must be resolved.
  static const _webBase = 'https://krishidukan-e8315.web.app';

  static String _resolveUrl(String raw) {
    if (!raw.startsWith('/')) return raw;
    // Decode each segment first (handles paths already stored as "%20" in
    // Firestore), then re-encode — prevents double-encoding like "%20"→"%2520".
    final encoded = raw
        .split('/')
        .map((seg) => Uri.encodeComponent(Uri.decodeComponent(seg)))
        .join('/');
    return '$_webBase$encoded';
  }

  static String _pickImage(Map<String, dynamic> m) {
    // Check 'image' first — the web app stores relative Firebase Hosting
    // paths here (e.g. /product-images/Product_Images/Power Plus.png).
    // 'imageUrl' is checked second as it may contain stale Unsplash URLs.
    for (final key in const [
      'image',
      'img',
      'imageUrl',
      'imageURL',
      'image_url',
      'photoUrl',
      'photoURL',
      'photo',
      'thumbnail',
      'thumb',
      'coverUrl',
      'cover',
    ]) {
      final v = m[key];
      if (v is String && v.isNotEmpty) return _resolveUrl(v);
    }
    // List of images (e.g. images: [...]) — take the first.
    for (final key in const ['images', 'photos', 'gallery']) {
      final v = m[key];
      if (v is List && v.isNotEmpty) {
        final first = v.first;
        if (first is String && first.isNotEmpty) return _resolveUrl(first);
        if (first is Map && first['url'] is String) {
          return _resolveUrl(first['url'] as String);
        }
      }
    }
    return '';
  }

  Store _storeFromDoc(DocumentSnapshot<Map<String, dynamic>> d) {
    final m = d.data() ?? const <String, dynamic>{};
    final geo = m['location'];
    double lat = 0;
    double lng = 0;
    if (geo is GeoPoint) {
      lat = geo.latitude;
      lng = geo.longitude;
    } else {
      lat = _asDouble(m['lat']);
      lng = _asDouble(m['lng']);
    }
    final rawStock = m['stock'];
    final stockList = rawStock is List
        ? rawStock.whereType<String>().toList()
        : <String>[];
    return Store(
      id: d.id,
      name: _asString(m['name'] ?? m['shopName']),
      address: _asString(m['address']),
      distanceKm: _asDouble(m['distanceKm']),
      lat: lat,
      lng: lng,
      phone: _asString(m['phone'] ?? m['mobile']),
      inStock: (m['inStock'] ?? true) is bool ? (m['inStock'] ?? true) as bool : true,
      status: _asString(m['status'], fallback: 'Open Now'),
      stock: stockList,
    );
  }

  static String _asString(Object? v, {String fallback = ''}) {
    if (v is String) return v;
    if (v == null) return fallback;
    // Firestore nested map or unexpected type — return fallback rather than crash.
    return fallback;
  }

  static int _asInt(Object? v) {
    if (v is int) return v;
    if (v is num) return v.toInt();
    if (v is String) return int.tryParse(v) ?? 0;
    return 0;
  }

  static double _asDouble(Object? v) {
    if (v is double) return v;
    if (v is num) return v.toDouble();
    if (v is String) return double.tryParse(v) ?? 0;
    return 0;
  }
}

final firestoreRepoProvider = Provider<FirestoreRepository>(
  (_) => FirestoreRepository(FirebaseFirestore.instance),
);

// Streams the screens watch.
final productsStreamProvider = StreamProvider<List<Product>>(
  (ref) => ref.watch(firestoreRepoProvider).watchProducts(),
);

final storesStreamProvider = StreamProvider<List<Store>>(
  (ref) => ref.watch(firestoreRepoProvider).watchStores(),
);

final productByIdProvider = FutureProvider.family<Product?, String>(
  (ref, id) => ref.watch(firestoreRepoProvider).fetchProduct(id),
);
