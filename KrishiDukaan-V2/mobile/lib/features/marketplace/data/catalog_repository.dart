import 'package:cloud_firestore/cloud_firestore.dart';
import '../../../core/constants/app_config.dart';
import '../../../core/models/catalog_model.dart';
import '../../../core/models/listing_model.dart' show VariantModel;

const _col = 'products';

/// Sources that mark a doc as a seller's COPY of a canonical manufacturer
/// product, rather than the canonical product itself. Copies never carry the
/// canonical doc's own display-only fields (videoUrl, composition, etc.) —
/// see [CatalogRepository.fetchById]'s copy-doc redirect for why that matters.
const _copySources = {
  'retailer_inventory_copy',
  'manufacturer_assigned',
  'admin_assigned',
};

class CatalogRepository {
  final _db = FirebaseFirestore.instance;

  // Cache snapshots to return as doc page cursors
  final _docCache = <String, DocumentSnapshot>{};

  /// Lightweight, bounded fetch for Home's preview rails (Trending /
  /// Featured / Top Deals) — together they only ever show ~30 cards, and
  /// [ProductCard] only reads price/discount/name/image/rating/distance from
  /// each one, none of which need [fetchAllMergedProducts]'s full
  /// cross-catalog seller merge. That merge scans the ENTIRE `products`
  /// collection *and* the ENTIRE `productReviews` collection on every call —
  /// Home was paying that cost (which only grows as the catalog does) just
  /// to render 30 cards, and it was the main reason the home screen got
  /// slower to open the more products/reviews existed. Marketplace search
  /// and category browsing still go through fetchAllMergedProducts, which
  /// genuinely needs every doc to compute a correct lowest-price/seller-count
  /// across sellers — Home doesn't merge sellers at all here, so a canonical
  /// product's OWN discount is used rather than the highest across copies.
  ///
  /// Ordered by createdAt so "latest" products are naturally favoured; a
  /// product doc with no createdAt field is skipped by Firestore's orderBy
  /// (unlike fetchAllMergedProducts, which sorts those last instead of
  /// dropping them) — acceptable here since this is a discovery preview, not
  /// the definitive catalog listing.
  Future<List<CatalogModel>> fetchHomeRailProducts({int limit = 60}) async {
    final snap = await _db
        .collection(_col)
        .orderBy('createdAt', descending: true)
        .limit(limit)
        .get();

    final products = snap.docs
        .where((doc) {
          final data = doc.data() as Map<String, dynamic>? ?? {};
          return data['isActive'] != false;
        })
        .map((doc) => CatalogModel.fromFirestore(doc))
        .where((p) =>
            p.name.isNotEmpty &&
            p.imageUrl.isNotEmpty &&
            p.price.isFinite &&
            !_copySources.contains(p.source))
        .toList();

    if (products.isEmpty) return products;

    // Ratings scoped to just these candidates instead of every review ever
    // submitted on the platform.
    final ids = products.map((p) => p.id).where((id) => id.isNotEmpty).toList();
    final ratingAgg = <String, _RatingAgg>{};
    for (var i = 0; i < ids.length; i += 30) {
      final chunk = ids.sublist(i, i + 30 > ids.length ? ids.length : i + 30);
      try {
        final reviewsSnap = await _db
            .collection('productReviews')
            .where('catalogId', whereIn: chunk)
            .get();
        for (final doc in reviewsSnap.docs) {
          final data = doc.data();
          final catalogId = (data['catalogId'] ?? '').toString();
          final rating = (data['rating'] as num?)?.toDouble() ?? 0.0;
          if (catalogId.isEmpty || rating <= 0.0) continue;
          final cur = ratingAgg[catalogId] ?? _RatingAgg(0.0, 0);
          ratingAgg[catalogId] = _RatingAgg(cur.sum + rating, cur.count + 1);
        }
      } catch (_) {
        // Ratings are decoration here — a failed chunk just leaves those
        // products on their own doc-level rating fallback below.
      }
    }

    return products.map((p) {
      final agg = ratingAgg[p.id];
      final count = agg?.count ?? 0;
      if (count == 0) return p;
      return p.copyWith(rating: agg!.sum / count, reviewCount: count);
    }).toList();
  }

  Future<List<CatalogModel>> fetchAllMergedProducts() async {
    try {
      final futures = await Future.wait([
        _db.collection(_col).get(),
        _db.collection('productReviews').get().catchError((_) => _emptyQuerySnapshot()),
      ]);

      final productsSnap = futures[0];
      final reviewsSnap = futures[1];

      // Cache the document snapshots for pagination cursors
      for (final doc in productsSnap.docs) {
        _docCache[doc.id] = doc;
      }

      // Aggregate reviews rating by catalogId
      final ratingAgg = <String, _RatingAgg>{};
      if (reviewsSnap.docs.isNotEmpty) {
        for (final doc in reviewsSnap.docs) {
          final data = doc.data() as Map<String, dynamic>? ?? {};
          final catalogId = (data['catalogId'] ?? '').toString();
          final rating = (data['rating'] as num?)?.toDouble() ?? 0.0;
          if (catalogId.isEmpty || rating <= 0.0) continue;

          final cur = ratingAgg[catalogId] ?? _RatingAgg(0.0, 0);
          ratingAgg[catalogId] = _RatingAgg(cur.sum + rating, cur.count + 1);
        }
      }

      // Track all matched document IDs under each name key
      final idsByKey = <String, List<String>>{};

      // Parse all active products
      final allMapped = productsSnap.docs.where((doc) {
        final data = doc.data() as Map<String, dynamic>? ?? {};
        return data['isActive'] != false;
      }).map((doc) => CatalogModel.fromFirestore(doc)).toList();

      // Sort by createdAt descending
      allMapped.sort((a, b) {
        if (a.createdAt == null) return 1;
        if (b.createdAt == null) return -1;
        return b.createdAt!.compareTo(a.createdAt!);
      });

      final retailerCopies = allMapped.where((p) => _copySources.contains(p.source)).toList();
      final raw = allMapped.where((p) =>
          p.name.isNotEmpty &&
          p.imageUrl.isNotEmpty &&
          p.price.isFinite &&
          !_copySources.contains(p.source)).toList();

      // Per-seller discount map: nameKey -> { normalizedPhone: discountPct }
      // Phones are stored in both +91-prefixed and 10-digit forms; normalise to
      // 10-digit so product_detail lookup (which also normalises) always matches.
      String normPhone(String? p) {
        if (p == null || p.isEmpty) return '';
        if (p.startsWith('+91') && p.length > 3) return p.substring(3);
        if (p.startsWith('91') && p.length == 12) return p.substring(2);
        return p;
      }

      /// Union of package sizes across the canonical product and a seller's copy.
      ///
      /// The PACKAGE SIZE chips read the merged card's own `variants`, which
      /// used to come from the canonical doc alone. A retailer who adds a size
      /// to their copy (5L on a catalogue product that only lists 1L) could
      /// never surface it — the chip was missing, so the size was unselectable
      /// and its stock invisible, no matter what their inventory said.
      ///
      /// Sizes are APPENDED, never reordered: existing entries keep their index
      /// because `_selectedVariantIdx` on the product page indexes into this
      /// list. Only label+price are carried; per-store stock and pricing live
      /// on that store's availability entry, resolved separately at order time.
      ///
      /// Mirrors web's unionVariants in app/firebase.ts.
      List<VariantModel>? unionVariants(
        List<VariantModel>? base,
        List<VariantModel>? extra,
      ) {
        if (extra == null || extra.isEmpty) return base;
        final out = <VariantModel>[...?base];
        final seen = out.map((v) => v.label.trim().toLowerCase()).toSet();
        for (final v in extra) {
          final label = v.label.trim();
          if (label.isEmpty || !seen.add(label.toLowerCase())) continue;
          out.add(VariantModel(label: label, price: v.price, stock: v.stock));
        }
        return out.isNotEmpty ? out : base;
      }

      final sellerDiscountsByKey = <String, Map<String, double>>{};
      void recordSellerDiscount(String key, String? uid, String? phone, double pct) {
        if (pct <= 0.0) return;
        final map = sellerDiscountsByKey[key] ?? <String, double>{};
        // Store by both normalized phone and original uid so callers using either key find it
        final normalizedPhone = normPhone(phone);
        if (normalizedPhone.isNotEmpty) {
          map[normalizedPhone] = pct;
          map['+91$normalizedPhone'] = pct; // cover +91 variant too
        }
        if (uid != null && uid.isNotEmpty && !uid.startsWith('+')) map[uid] = pct;
        sellerDiscountsByKey[key] = map;
      }

      final anyOnlineByKey = <String, bool>{};
      void markOnline(String key, bool isOnline) {
        if (isOnline) anyOnlineByKey[key] = true;
      }

      final byName = <String, CatalogModel>{};
      for (final p in raw) {
        final key = p.name.toLowerCase().trim();
        recordSellerDiscount(key, p.id, p.retailerPhone, p.maxDiscountPct);
        final pIsOnline = p.sellMode != 'offline_store_only' && p.isOnline != false;
        markOnline(key, pIsOnline);

        final ids = idsByKey[key] ?? [];
        ids.add(p.id);
        idsByKey[key] = ids;

        final existing = byName[key];
        if (existing == null) {
          byName[key] = p.copyWith(
            availability: p.availability != null ? List.from(p.availability!) : [],
          );
          continue;
        }

        final existingIsManufacturer = existing.source == 'manufacturer_inventory';
        final pIsManufacturer = p.source == 'manufacturer_inventory';
        final canonical = (!existingIsManufacturer && pIsManufacturer)
            ? p.copyWith(availability: p.availability != null ? List.from(p.availability!) : [])
            : existing;
        final secondary = (!existingIsManufacturer && pIsManufacturer) ? existing : p;

        final av = canonical.availability != null ? List<AvailabilityEntry>.from(canonical.availability!) : <AvailabilityEntry>[];
        for (final entry in (secondary.availability ?? <AvailabilityEntry>[])) {
          final dup = av.any((a) =>
              a.storeId == entry.storeId ||
              (entry.storePhone != null && entry.storePhone!.isNotEmpty && a.storePhone == entry.storePhone));
          if (!dup) av.add(entry);
        }

        final secondaryStoreId = secondary.retailerId ?? '';
        final secondaryPhone = secondary.retailerPhone;
        final alreadyPresent = av.any((a) =>
            (secondaryStoreId.isNotEmpty && a.storeId == secondaryStoreId) ||
            (secondaryPhone != null && secondaryPhone.isNotEmpty && a.storePhone == secondaryPhone));

        if (!alreadyPresent && (secondaryStoreId.isNotEmpty || (secondaryPhone != null && secondaryPhone.isNotEmpty))) {
          av.add(AvailabilityEntry(
            storeId: secondaryStoreId,
            storePhone: secondaryPhone,
            storeName: secondary.store,
            stockLevel: secondary.stock ?? 'In Stock',
            sellingPrice: secondary.price,
            isOnline: secondary.sellMode != 'offline_store_only' && secondary.isOnline != false,
            variants: secondary.variants,
          ));
        }

        final mergedMaxDiscount = (canonical.maxDiscountPct > secondary.maxDiscountPct)
            ? canonical.maxDiscountPct
            : secondary.maxDiscountPct;

        byName[key] = canonical.copyWith(
          availability: av.isNotEmpty ? av : null,
          variants: unionVariants(canonical.variants, secondary.variants),
          maxDiscountPct: mergedMaxDiscount,
        );
      }

      // Merge retailer copies
      for (final copy in retailerCopies) {
        if (copy.name.isEmpty || copy.price <= 0.0) continue;
        final key = copy.name.toLowerCase().trim();

        final copyStoreId = copy.retailerId ?? '';
        final copyPhone = copy.retailerPhone;
        if (copyStoreId.isEmpty && (copyPhone == null || copyPhone.isEmpty)) continue;

        final copyIds = idsByKey[key] ?? [];
        if (!copyIds.contains(copy.id)) {
          copyIds.add(copy.id);
          idsByKey[key] = copyIds;
        }

        final copyIsOnline = copy.sellMode != 'offline_store_only' && copy.isOnline != false;
        markOnline(key, copyIsOnline);

        final copyDiscountPct = copy.maxDiscountPct;
        recordSellerDiscount(key, copyStoreId, copyPhone, copyDiscountPct);

        final canonical = byName[key];
        if (canonical == null) {
          // No canonical product exists for this item yet. Promote this copy
          // to a standalone marketplace product so the retailer's listing is visible.
          final avEntry = AvailabilityEntry(
            storeId: copyStoreId,
            storePhone: copyPhone,
            storeName: copy.store,
            stockLevel: copy.stock ?? 'In Stock',
            sellingPrice: copy.price,
            isOnline: copyIsOnline,
            variants: copy.variants,
          );
          byName[key] = copy.copyWith(
            availability: [avEntry],
            variants: copy.variants,
            maxDiscountPct: copyDiscountPct,
            isOnline: copyIsOnline,
            sellMode: copyIsOnline ? 'online_delivery' : 'offline_store_only',
          );
          continue;
        }

        final av = canonical.availability != null ? List<AvailabilityEntry>.from(canonical.availability!) : <AvailabilityEntry>[];
        
        int existingIndex = -1;
        for (int i = 0; i < av.length; i++) {
          final a = av[i];
          if ((copyStoreId.isNotEmpty && a.storeId == copyStoreId) ||
              (copyPhone != null && copyPhone.isNotEmpty && a.storePhone == copyPhone)) {
            existingIndex = i;
            break;
          }
        }

        if (existingIndex != -1) {
          final existing = av[existingIndex];
          av[existingIndex] = AvailabilityEntry(
            storeId: existing.storeId,
            storePhone: existing.storePhone,
            storeName: existing.storeName,
            stockLevel: existing.stockLevel,
            sellingPrice: copy.price,
            isOnline: copyIsOnline,
            variants: copy.variants ?? existing.variants,
          );
        } else {
          av.add(AvailabilityEntry(
            storeId: copyStoreId,
            storePhone: copyPhone,
            storeName: copy.store,
            stockLevel: copy.stock ?? 'In Stock',
            sellingPrice: copy.price,
            isOnline: copyIsOnline,
            variants: copy.variants,
          ));
        }

        final newMax = (canonical.maxDiscountPct > copyDiscountPct) ? canonical.maxDiscountPct : copyDiscountPct;
        byName[key] = canonical.copyWith(
          availability: av,
          variants: unionVariants(canonical.variants, copy.variants),
          maxDiscountPct: newMax,
        );
      }

      // Final processing: lowestPrice, ratings, sellerCount
      return byName.entries.map((entry) {
        final key = entry.key;
        final p = entry.value;

        final prices = (p.availability ?? [])
            .map((a) => a.sellingPrice)
            .where((v) => v > 0.0)
            .toList();
        final lowestPrice = prices.isNotEmpty
            ? prices.reduce((a, b) => a < b ? a : b)
            : null;

        double sum = 0.0;
        int count = 0;
        for (final id in (idsByKey[key] ?? [p.id])) {
          final agg = ratingAgg[id];
          if (agg != null) {
            sum += agg.sum;
            count += agg.count;
          }
        }

        final averageRating = count > 0 ? sum / count : p.rating;
        final reviewCount = count > 0 ? count : p.reviewCount;

        final mergedOnline = anyOnlineByKey[key] ?? false;
        final mergedSellMode = mergedOnline ? "online_delivery" : "offline_store_only";

        final canonOwnerId = p.id;
        final canonPhone = p.createdByPhone ?? p.retailerPhone;

        final currentAv = p.availability ?? [];
        final hasCanonEntry = canonOwnerId.isEmpty && (canonPhone == null || canonPhone.isEmpty)
            ? true
            : currentAv.any((a) =>
                (canonOwnerId.isNotEmpty && a.storeId == canonOwnerId) ||
                (canonPhone != null && canonPhone.isNotEmpty && a.storePhone == canonPhone));

        final finalAvailability = hasCanonEntry
            ? currentAv
            : [
                ...currentAv,
                AvailabilityEntry(
                  storeId: canonOwnerId,
                  storePhone: canonPhone,
                  storeName: p.store,
                  stockLevel: p.stock ?? 'In Stock',
                  sellingPrice: p.price,
                  isOnline: p.sellMode != 'offline_store_only' && p.isOnline != false,
                ),
              ];

        // Seller count should be the unique stores selling this product
        final sellerCount = finalAvailability.map((a) => a.storePhone ?? a.storeId).toSet().length;

        return p.copyWith(
          isOnline: mergedOnline,
          sellMode: mergedSellMode,
          availability: finalAvailability.isNotEmpty ? finalAvailability : null,
          lowestPrice: lowestPrice,
          rating: averageRating,
          reviewCount: reviewCount,
          sellerCount: sellerCount,
          price: lowestPrice ?? p.price,
          // Web parity: surface the per-seller discount map so the product
          // detail store tiles can show how much each store discounts.
          sellerDiscounts: sellerDiscountsByKey[key] ?? const {},
          mergedProductIds: idsByKey[key] ?? [p.id],
        );
      }).toList();

    } catch (e) {
      return [];
    }
  }

  /// All merged products matching [category] / [searchQuery], unpaginated.
  /// The full catalog is fetched + merged in one shot, so the marketplace pages
  /// through this result in memory rather than re-querying Firestore per page.
  Future<List<CatalogModel>> fetchFiltered({
    String? category,
    String? searchQuery,
  }) async {
    final allProducts = await fetchAllMergedProducts();
    var filtered = allProducts;

    if (category != null && category.isNotEmpty) {
      filtered = filtered
          .where((p) => p.category.toLowerCase() == category.toLowerCase())
          .toList();
    }

    if (searchQuery != null && searchQuery.trim().isNotEmpty) {
      final query = searchQuery.trim().toLowerCase();
      filtered = filtered.where((p) {
        final nameMatch = p.name.toLowerCase().contains(query);
        final descMatch = p.description?.toLowerCase().contains(query) ?? false;
        final catMatch = p.category.toLowerCase().contains(query);
        final storeMatch = p.store?.toLowerCase().contains(query) ?? false;
        final availMatch = (p.availability ?? []).any((av) =>
            av.storeName?.toLowerCase().contains(query) ?? false);

        return nameMatch || descMatch || catMatch || storeMatch || availMatch;
      }).toList();

      // Sort by relevance: name match > category/store match > description match
      filtered.sort((a, b) {
        final aName = a.name.toLowerCase();
        final bName = b.name.toLowerCase();
        
        final aNameStarts = aName.startsWith(query);
        final bNameStarts = bName.startsWith(query);
        if (aNameStarts && !bNameStarts) return -1;
        if (!aNameStarts && bNameStarts) return 1;

        final aNameContains = aName.contains(query);
        final bNameContains = bName.contains(query);
        if (aNameContains && !bNameContains) return -1;
        if (!aNameContains && bNameContains) return 1;

        return 0; // maintain original order for other matches
      });
    }

    return filtered;
  }

  Future<List<CatalogModel>> fetchPage({
    String? category,
    String? searchQuery,
    DocumentSnapshot? startAfter,
    int limit = AppConfig.firestorePageSize,
  }) async {
    final filtered =
        await fetchFiltered(category: category, searchQuery: searchQuery);

    int startIdx = 0;
    if (startAfter != null) {
      final idx = filtered.indexWhere((p) => p.id == startAfter.id);
      if (idx != -1) {
        startIdx = idx + 1;
      }
    }

    return filtered.skip(startIdx).take(limit).toList();
  }

  Future<List<({CatalogModel model, DocumentSnapshot doc})>> fetchPageWithDocs({
    String? category,
    String? searchQuery,
    DocumentSnapshot? startAfter,
    int limit = AppConfig.firestorePageSize,
  }) async {
    final models = await fetchPage(
      category: category,
      searchQuery: searchQuery,
      startAfter: startAfter,
      limit: limit,
    );

    return models
        .where((m) => _docCache.containsKey(m.id))
        .map((m) => (model: m, doc: _docCache[m.id]!))
        .toList();
  }

  Future<CatalogModel?> fetchById(String catalogId) async {
    final list = await fetchAllMergedProducts();
    for (final p in list) {
      if (p.id == catalogId) return p;
    }
    try {
      final doc = await _db.collection('products').doc(catalogId).get();
      if (!doc.exists) return null;
      // Unlike fetchAllMergedProducts (already filtered), this direct-by-id
      // fallback previously rendered a deactivated product anyway — a stale
      // deep link (share message, notification, browser history) could reach
      // it even after it was taken down. Mirror the same isActive check here.
      final data = doc.data();
      if (data != null && data['isActive'] == false) return null;

      // A retailer/manufacturer COPY doc (source in _copySources) never
      // carries the canonical product's own display-only fields — videoUrl,
      // composition, nitrogen/phosphorus/potassium, etc. Only the
      // manufacturer's ORIGINAL doc does. Navigating here with a copy's id
      // (e.g. "More products from this seller", which queries copies
      // directly — see fetchMoreFromRetailer below) used to return that
      // copy's bare fields, silently showing "no video"/"no composition"
      // even when the product genuinely has one (confirmed live for Gripper
      // GR: the canonical doc has videoUrl, its 847 retailer copies don't).
      // `list` above already holds every canonical merged product, so redirect
      // there by manufacturerProductId instead of returning the copy as-is.
      final source = data?['source']?.toString();
      final manufacturerProductId = data?['manufacturerProductId']?.toString();
      if (source != null &&
          _copySources.contains(source) &&
          manufacturerProductId != null &&
          manufacturerProductId.isNotEmpty) {
        for (final p in list) {
          if (p.id == manufacturerProductId) return p;
        }
      }

      return CatalogModel.fromFirestore(doc);
    } catch (_) {}
    return null;
  }

  Future<List<CatalogModel>> fetchFeatured({int limit = 6}) async {
    final list = await fetchAllMergedProducts();
    return list.take(limit).toList();
  }

  /// "More products from this seller" rail on the product page's Retailer
  /// Profile section. Queries the global `products` collection directly by
  /// `retailerPhone` rather than a per-retailer subcollection mirror — that
  /// mirror (`retailers/{phone}/products`) is only written by the web
  /// dashboard, so a retailer who only ever used the mobile app to manage
  /// their inventory would show an empty rail if this read it instead.
  ///
  /// Equality-only filter, sorted in memory rather than via `orderBy` — an
  /// `orderBy` on a field other than the equality filter needs a composite
  /// index (this repo has been bitten by undeployed indexes before, see
  /// ReelsRepository.fetchSellerReels), so a plain `retailerPhone==` query is
  /// deliberately kept index-free.
  Future<List<CatalogModel>> fetchMoreFromRetailer(
    String retailerPhone, {
    required String excludeId,
    int limit = 8,
  }) async {
    if (retailerPhone.isEmpty) return [];
    try {
      final snap = await _db
          .collection(_col)
          .where('retailerPhone', isEqualTo: retailerPhone)
          .get();
      final products = snap.docs
          .map(CatalogModel.fromFirestore)
          .where((p) => p.id != excludeId && p.isActive && p.name.isNotEmpty)
          .toList()
        ..sort((a, b) => (b.createdAt ?? DateTime(0)).compareTo(a.createdAt ?? DateTime(0)));
      return products.take(limit).toList();
    } catch (_) {
      return [];
    }
  }
}

class _RatingAgg {
  final double sum;
  final int count;
  _RatingAgg(this.sum, this.count);
}

// Fallback empty QuerySnapshot mock
QuerySnapshot<Map<String, dynamic>> _emptyQuerySnapshot() {
  return QuerySnapshotMock();
}

class QuerySnapshotMock implements QuerySnapshot<Map<String, dynamic>> {
  @override
  List<QueryDocumentSnapshot<Map<String, dynamic>>> get docs => [];
  
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
