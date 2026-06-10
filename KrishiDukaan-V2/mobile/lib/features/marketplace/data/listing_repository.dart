import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../../../core/models/listing_model.dart';
import '../../../core/utils/geo_utils.dart';

// Legacy schema: product data lives in 'products'. Each product doc can be
// a single-retailer listing (fields: store, retailerPhone, retailerId, stock)
// or carry an availability array: [{storeId, storePhone, storeName, stockLevel, sellingPrice}]
// where storeId = retailer phone (via uidIndex) or Firebase Auth UID fallback.
const _col = 'products';

class ListingRepository {
  final _db = FirebaseFirestore.instance;

  // ─── Public API ────────────────────────────────────────────────────────────

  /// "Available At" tab.
  Stream<List<ListingModel>> watchListingsForCatalog(
    String catalogId, {
    double? userLat,
    double? userLng,
  }) {
    return _db
        .collection(_col)
        .doc(catalogId)
        .snapshots()
        .asyncExpand((snap) async* {
      if (!snap.exists) { yield <ListingModel>[]; return; }

      final d = snap.data() as Map<String, dynamic>;
      final productPrice = (d['price'] as num?)?.toDouble() ?? 0.0;
      final rawAv = d['availability'] as List?;

      List<ListingModel> listings;
      try {
        if (rawAv != null && rawAv.isNotEmpty) {
          listings = await _resolveFromAvailability(
              catalogId, rawAv, productPrice);
        } else {
          listings = await _resolveOwnerListing(catalogId, d, productPrice);
        }
      } catch (_) {
        yield <ListingModel>[];
        return;
      }

      // Distance sort + set distanceKm
      if (userLat != null && userLng != null) {
        for (final l in listings) {
          if (l.hasLocation) {
            l.distanceKm =
                GeoUtils.distanceKm(userLat, userLng, l.sellerLat!, l.sellerLng!);
          }
        }
        listings.sort((a, b) {
          if (a.distanceKm == null) return 1;
          if (b.distanceKm == null) return -1;
          return a.distanceKm!.compareTo(b.distanceKm!);
        });
      }

      yield listings;
    });
  }

  Future<ListingModel?> fetchById(String listingId) async {
    final doc = await _db.collection(_col).doc(listingId).get();
    if (!doc.exists) return null;
    return _productDocToListing(doc);
  }

  /// Seller's own inventory (dashboard) — queries by phone AND uid so both
  /// legacy (uid-only) and new (phone-keyed) products are visible.
  Stream<List<ListingModel>> watchSellerListings(String sellerPhone) {
    final uid = FirebaseAuth.instance.currentUser?.uid ?? '';

    final byPhone = _db
        .collection(_col)
        .where('retailerPhone', isEqualTo: sellerPhone)
        .snapshots();

    if (uid.isEmpty) {
      return byPhone.map((s) => s.docs.map(_productDocToListing).toList());
    }

    final byUid = _db
        .collection(_col)
        .where('retailerId', isEqualTo: uid)
        .snapshots();

    final controller = StreamController<List<ListingModel>>();
    List<DocumentSnapshot> phoneResults = [];
    List<DocumentSnapshot> uidResults   = [];

    void emit() {
      final seen = <String>{};
      final merged = [...phoneResults, ...uidResults]
          .where((d) => seen.add(d.id))
          .map(_productDocToListing)
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

  // ─── Availability-array resolution ────────────────────────────────────────

  /// Resolves listings from the product's availability array.
  /// Each entry: { storeId, storePhone?, storeName?, stockLevel?, sellingPrice? }
  /// storeId = phone (via uidIndex) or UID fallback.
  Future<List<ListingModel>> _resolveFromAvailability(
    String catalogId,
    List rawAv,
    double productPrice,
  ) async {
    final seen = <String>{};
    final listings = <ListingModel>[];

    for (final entry in rawAv) {
      final av = entry as Map<String, dynamic>;
      final storeId    = av['storeId']    as String? ?? '';
      final storePhone = av['storePhone'] as String? ?? '';
      final storeName  = av['storeName']  as String? ?? '';
      final stockLevel = av['stockLevel'] as String? ?? 'In Stock';
      final sellingPrice =
          (av['sellingPrice'] as num?)?.toDouble() ?? productPrice;
      // Writers mirror the seller's effective discount into the entry so the
      // seller tile shows the same discounted price as the marketplace grid.
      final entryDiscount = DiscountModel.fromAvailabilityEntry(av);

      // Prefer explicit storePhone; fall back to storeId if it looks like a phone
      final phoneHint = storePhone.isNotEmpty
          ? storePhone
          : (_isPhone(storeId) ? storeId : '');

      // Deduplicate by phone or storeId
      final dedupKey = phoneHint.isNotEmpty ? phoneHint : storeId;
      if (dedupKey.isEmpty || seen.contains(dedupKey)) continue;
      seen.add(dedupKey);

      final profile = await _fetchProfile(storeId, phoneHint: phoneHint);

      // Resolve the display name — fallback chain so we never drop a seller
      // just because their Firestore profile isn't readable or storeName wasn't
      // stored at assignment time.
      // Use _ne() so empty-string profile fields don't block the fallback chain.
      final name = _ne(profile?['shopName'])  ??
                   _ne(profile?['name'])      ??
                   _ne(profile?['ownerName']) ??
                   (storeName.isNotEmpty ? storeName : null) ??
                   (phoneHint.isNotEmpty ? phoneHint : null) ??
                   storeId;
      if (name.isEmpty) continue;

      final phone = (profile?['phone'] as String? ??
                    (phoneHint.isNotEmpty ? phoneHint : storeId));

      final address = _extractAddress(profile, null);
      final lat     = _extractLat(profile, null);
      final lng     = _extractLng(profile, null);

      listings.add(ListingModel(
        id:           storeId,
        catalogId:    catalogId,
        sellerPhone:  phone,
        sellerName:   name,
        sellerType:   'retailer',
        sellerAddress: address,
        sellerLat:    lat,
        sellerLng:    lng,
        price:        sellingPrice,
        // Web doesn't track exact qty in availability — use stockLevel flag
        stockQuantity: stockLevel != 'Out of Stock' ? 99 : 0,
        variants:     [],
        discount:     entryDiscount,
      ));
    }

    return listings;
  }

  // ─── No availability array: single-retailer product ───────────────────────

  /// For products that have no availability array, the product doc itself
  /// IS the listing. Look up retailer profile for full store details.
  Future<List<ListingModel>> _resolveOwnerListing(
    String catalogId,
    Map<String, dynamic> d,
    double productPrice,
  ) async {
    final retailerPhone = d['retailerPhone'] as String? ?? '';
    final retailerId    = d['retailerId']    as String? ?? '';
    final storeName     = d['store']         as String? ?? d['storeName'] as String? ?? '';

    Map<String, dynamic>? profile;
    String phone = retailerPhone;

    if (retailerPhone.isNotEmpty) {
      profile = await _fetchProfile(retailerPhone);
    } else if (retailerId.isNotEmpty) {
      profile = await _fetchProfile(retailerId);
      phone = profile?['phone'] as String? ?? '';
    }

    // If no profile found, construct a minimal one from the product doc itself
    if (profile == null && storeName.isEmpty) return [];

    final name = _ne(profile?['shopName'])  ??
                 _ne(profile?['name'])      ??
                 _ne(profile?['ownerName']) ??
                 storeName;

    final address = _extractAddress(profile, d);
    final lat     = _extractLat(profile, d);
    final lng     = _extractLng(profile, d);

    final rawStock = d['stock'];
    final stock = rawStock is num
        ? rawStock.toInt()
        : (d['stockQuantity'] as num?)?.toInt() ??
          (rawStock is String && rawStock != 'Out of Stock' ? 99 : 0);

    return [
      ListingModel(
        id:           catalogId,
        catalogId:    catalogId,
        sellerPhone:  phone,
        sellerName:   name,
        sellerType:   'retailer',
        sellerAddress: address,
        sellerLat:    lat,
        sellerLng:    lng,
        price:        productPrice,
        stockQuantity: stock,
        variants:     [],
        discount:     _parseDiscount(d),
      ),
    ];
  }

  // ─── Profile resolution ────────────────────────────────────────────────────

  /// Resolves a retailer's profile map from Firestore.
  ///
  /// Lookup order:
  ///   1. profiles/{phoneHint}   — primary new schema (allow read: if true)
  ///   2. retailers/{phoneHint}  — explicit phone from availability entry
  ///   3. retailers/{storeId}    — storeId used as doc ID (phone or legacy UID)
  ///   4. stores/{storeId}       — older stores collection
  Future<Map<String, dynamic>?> _fetchProfile(
    String storeId, {
    String phoneHint = '',
  }) async {
    if (storeId.isEmpty) return null;
    try {
      // 1. Try profiles/{phoneHint} — primary new-schema source (public read)
      if (phoneHint.isNotEmpty) {
        final doc = await _db.collection('profiles').doc(phoneHint).get();
        if (doc.exists) return {'phone': phoneHint, ...doc.data()!};
      }

      // 1b. Try profiles/{storeId} if it looks like a phone
      if (_isPhone(storeId) && storeId != phoneHint) {
        final doc = await _db.collection('profiles').doc(storeId).get();
        if (doc.exists) return {'phone': storeId, ...doc.data()!};
      }

      // 2. Try retailers/{phoneHint} — legacy phone-keyed docs
      if (phoneHint.isNotEmpty && phoneHint != storeId) {
        final doc = await _db.collection('retailers').doc(phoneHint).get();
        if (doc.exists) return {'phone': phoneHint, ...doc.data()!};
      }

      // 3. Try retailers/{storeId} (covers phone-as-id AND uid-as-id legacy docs)
      final retailerDoc = await _db.collection('retailers').doc(storeId).get();
      if (retailerDoc.exists) {
        final d = retailerDoc.data()!;
        final phone = d['phone'] as String? ??
            (_isPhone(storeId) ? storeId : null);
        return {'phone': phone ?? '', ...d};
      }

      // 4. Try stores/{storeId}
      final storeDoc = await _db.collection('stores').doc(storeId).get();
      if (storeDoc.exists) return storeDoc.data();
    } catch (_) {
      // Swallow permission errors or transient failures for individual lookups
    }
    return null;
  }

  // ─── Inventory listing (dashboard) ────────────────────────────────────────

  static ListingModel _productDocToListing(DocumentSnapshot doc) {
    final d = doc.data() as Map<String, dynamic>;
    return ListingModel(
      id:           doc.id,
      catalogId:    doc.id,
      sellerPhone:  d['retailerPhone'] as String? ?? d['retailerId'] as String? ?? '',
      sellerName:   d['store'] as String? ?? d['storeName'] as String? ?? '',
      sellerType:   'retailer',
      sellerAddress: d['address'] as String?,
      sellerLat:    (d['lat'] as num?)?.toDouble(),
      sellerLng:    (d['lng'] as num?)?.toDouble(),
      price:        (d['price'] as num?)?.toDouble() ?? 0.0,
      stockQuantity: (d['stock'] as num?)?.toInt() ??
                     (d['stockQuantity'] as num?)?.toInt() ?? 0,
      variants:     [],
      discount:     _parseDiscount(d),
    );
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /// Returns [v] as a non-empty String, or null. Treats empty strings the same
  /// as null so the ?? fallback chain works correctly when Firestore stores "".
  static String? _ne(dynamic v) => v is String && v.isNotEmpty ? v : null;

  /// Returns true if [s] looks like an Indian phone number (10–13 digits,
  /// optionally prefixed with +91).
  static bool _isPhone(String s) {
    final stripped = s.startsWith('+91') ? s.substring(3) : s;
    return RegExp(r'^\d{10,13}$').hasMatch(stripped);
  }

  /// Extracts a display address from profile + product doc fallback.
  static String? _extractAddress(
      Map<String, dynamic>? profile, Map<String, dynamic>? d) {
    final addr = profile?['address'] as String? ?? d?['address'] as String?;
    if (addr != null && addr.isNotEmpty) return addr;
    final city  = profile?['city']  as String? ?? d?['city']  as String? ?? '';
    final state = profile?['state'] as String? ?? d?['state'] as String? ?? '';
    final parts = [city, state].where((s) => s.isNotEmpty).join(', ');
    return parts.isNotEmpty ? parts : null;
  }

  static double? _extractLat(
      Map<String, dynamic>? profile, Map<String, dynamic>? d) {
    final geoRaw = profile?['geo'];
    if (geoRaw is GeoPoint) return geoRaw.latitude;
    final geo = geoRaw is Map ? geoRaw : null;
    final locRaw = profile?['location'];
    final loc = locRaw is Map ? locRaw : null;
    return ((geo?['latitude'] ?? loc?['latitude'] ?? loc?['lat'] ?? d?['lat'])
            as num?)
        ?.toDouble();
  }

  static double? _extractLng(
      Map<String, dynamic>? profile, Map<String, dynamic>? d) {
    final geoRaw = profile?['geo'];
    if (geoRaw is GeoPoint) return geoRaw.longitude;
    final geo = geoRaw is Map ? geoRaw : null;
    final locRaw = profile?['location'];
    final loc = locRaw is Map ? locRaw : null;
    return ((geo?['longitude'] ?? loc?['longitude'] ?? loc?['lng'] ?? d?['lng'])
            as num?)
        ?.toDouble();
  }

  static DiscountModel? _parseDiscount(Map<String, dynamic> d) =>
      DiscountModel.fromProductData(d);
}
