import 'package:cloud_firestore/cloud_firestore.dart';
import '../../../core/constants/app_config.dart';
import '../../../core/models/catalog_model.dart';

const _col = 'products';

class CatalogRepository {
  final _db = FirebaseFirestore.instance;

  // Cache snapshots to return as doc page cursors
  final _docCache = <String, DocumentSnapshot>{};

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

      final copySources = {'retailer_inventory_copy', 'manufacturer_assigned', 'admin_assigned'};
      final retailerCopies = allMapped.where((p) => copySources.contains(p.source)).toList();
      final raw = allMapped.where((p) =>
          p.name.isNotEmpty &&
          p.imageUrl.isNotEmpty &&
          p.price.isFinite &&
          !copySources.contains(p.source)).toList();

      // Per-seller discount map: nameKey -> { sellerUidOrPhone: discountPct }
      final sellerDiscountsByKey = <String, Map<String, double>>{};
      void recordSellerDiscount(String key, String? uid, String? phone, double pct) {
        if (pct <= 0.0) return;
        final map = sellerDiscountsByKey[key] ?? <String, double>{};
        if (uid != null && uid.isNotEmpty) map[uid] = pct;
        if (phone != null && phone.isNotEmpty) map[phone] = pct;
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
        markOnline(key, p.isOnline == true);

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
            isOnline: secondary.isOnline,
            variants: secondary.variants,
          ));
        }

        final mergedMaxDiscount = (canonical.maxDiscountPct > secondary.maxDiscountPct)
            ? canonical.maxDiscountPct
            : secondary.maxDiscountPct;

        byName[key] = canonical.copyWith(
          availability: av.isNotEmpty ? av : null,
          maxDiscountPct: mergedMaxDiscount,
        );
      }

      // Merge retailer copies
      for (final copy in retailerCopies) {
        if (copy.name.isEmpty || copy.price <= 0.0) continue;
        final key = copy.name.toLowerCase().trim();
        final canonical = byName[key];
        if (canonical == null) continue;

        final copyIds = idsByKey[key] ?? [];
        if (!copyIds.contains(copy.id)) {
          copyIds.add(copy.id);
          idsByKey[key] = copyIds;
        }

        final copyStoreId = copy.retailerId ?? '';
        final copyPhone = copy.retailerPhone;
        if (copyStoreId.isEmpty && (copyPhone == null || copyPhone.isEmpty)) continue;

        markOnline(key, copy.isOnline == true);

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

        final copyDiscountPct = copy.maxDiscountPct;
        recordSellerDiscount(key, copyStoreId, copyPhone, copyDiscountPct);

        if (existingIndex != -1) {
          final existing = av[existingIndex];
          av[existingIndex] = AvailabilityEntry(
            storeId: existing.storeId,
            storePhone: existing.storePhone,
            storeName: existing.storeName,
            stockLevel: existing.stockLevel,
            sellingPrice: copy.price,
            isOnline: copy.isOnline ?? existing.isOnline,
            variants: copy.variants ?? existing.variants,
          );
        } else {
          av.add(AvailabilityEntry(
            storeId: copyStoreId,
            storePhone: copyPhone,
            storeName: copy.store,
            stockLevel: copy.stock ?? 'In Stock',
            sellingPrice: copy.price,
            isOnline: copy.isOnline,
            variants: copy.variants,
          ));
        }

        final newMax = (canonical.maxDiscountPct > copyDiscountPct) ? canonical.maxDiscountPct : copyDiscountPct;
        byName[key] = canonical.copyWith(
          availability: av,
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
                  isOnline: p.isOnline,
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
        );
      }).toList();

    } catch (e) {
      return [];
    }
  }

  Future<List<CatalogModel>> fetchPage({
    String? category,
    String? searchQuery,
    DocumentSnapshot? startAfter,
    int limit = AppConfig.firestorePageSize,
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
    }

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

    return models.map((m) {
      final doc = _docCache[m.id] ?? _docCache.values.first;
      return (model: m, doc: doc);
    }).toList();
  }

  Future<CatalogModel?> fetchById(String catalogId) async {
    final list = await fetchAllMergedProducts();
    for (final p in list) {
      if (p.id == catalogId) return p;
    }
    return null;
  }

  Future<List<CatalogModel>> fetchFeatured({int limit = 6}) async {
    final list = await fetchAllMergedProducts();
    return list.take(limit).toList();
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
