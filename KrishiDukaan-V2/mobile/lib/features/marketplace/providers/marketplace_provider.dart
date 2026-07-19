import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/app_config.dart';
import '../../../core/providers/user_provider.dart';
import 'package:flutter_riverpod/legacy.dart';
import '../../../core/models/catalog_model.dart';
import '../../../core/models/review_model.dart';
import '../../../core/models/store_model.dart';
import '../../../core/models/listing_model.dart';
import '../../../core/providers/location_provider.dart';
import '../../../core/utils/geo_utils.dart';
import '../data/catalog_repository.dart';
import '../data/listing_repository.dart';
import '../data/review_repository.dart';
import '../data/store_repository.dart';
import '../../../core/models/brand_model.dart';
import '../../brand/data/brand_repository.dart';

// ── Marketplace state ──────────────────────────────────────────────────────

/// Identifies one seller (retailer or manufacturer) whose storefront the
/// marketplace is currently scoped to. Carries every id form the schema uses
/// (phone / store doc id / auth uid) so products match no matter which field
/// generation they were written with.
class SellerFilter {
  final String? phone;
  final String? storeId;
  final String? uid;
  final String name;

  const SellerFilter({this.phone, this.storeId, this.uid, required this.name});

  bool get isEmpty =>
      (phone == null || phone!.isEmpty) &&
      (storeId == null || storeId!.isEmpty) &&
      (uid == null || uid!.isEmpty);
}

class MarketplaceState {
  final List<CatalogModel> products;
  final bool isLoading;
  final bool isLoadingMore;
  final bool hasMore;
  final String? category;
  final String searchQuery;
  final SellerFilter? seller;
  final String? error;
  final DocumentSnapshot? lastDoc;

  const MarketplaceState({
    this.products = const [],
    this.isLoading = false,
    this.isLoadingMore = false,
    this.hasMore = true,
    this.category,
    this.searchQuery = '',
    this.seller,
    this.error,
    this.lastDoc,
  });

  MarketplaceState copyWith({
    List<CatalogModel>? products,
    bool? isLoading,
    bool? isLoadingMore,
    bool? hasMore,
    String? Function()? category,
    String? searchQuery,
    SellerFilter? Function()? seller,
    String? Function()? error,
    DocumentSnapshot? Function()? lastDoc,
  }) => MarketplaceState(
    products: products ?? this.products,
    isLoading: isLoading ?? this.isLoading,
    isLoadingMore: isLoadingMore ?? this.isLoadingMore,
    hasMore: hasMore ?? this.hasMore,
    category: category != null ? category() : this.category,
    searchQuery: searchQuery ?? this.searchQuery,
    seller: seller != null ? seller() : this.seller,
    error: error != null ? error() : this.error,
    lastDoc: lastDoc != null ? lastDoc() : this.lastDoc,
  );
}

// ── Notifier ───────────────────────────────────────────────────────────────

class MarketplaceNotifier extends StateNotifier<MarketplaceState> {
  final CatalogRepository _repo;
  final Ref _ref;

  static const _pageSize = AppConfig.firestorePageSize;

  /// The full merged + filtered catalog for the current query. Fetched once per
  /// query; [loadMore] just reveals more of it so the grid keeps growing as the
  /// user scrolls instead of stopping after the first page.
  List<CatalogModel> _all = [];

  MarketplaceNotifier(this._repo, this._ref) : super(const MarketplaceState()) {
    loadProducts();
  }

  Future<void> loadProducts({bool refresh = false}) async {
    if (state.isLoading) return;

    state = state.copyWith(
      isLoading: true,
      error: () => null,
      products: refresh ? [] : null,
      hasMore: refresh ? true : null,
    );

    try {
      _all = await _repo.fetchFiltered(
        category: state.category,
        searchQuery: state.searchQuery,
      );

      // Store-scoped browsing ("View store products" from the Stores tab):
      // keep only products this seller shows. The merged catalog already
      // accumulates every seller's availability entries, so matching against
      // them plus the owner fields yields the seller's full assortment.
      final seller = state.seller;
      if (seller != null && !seller.isEmpty) {
        _all = _all.where((p) => _soldBySeller(p, seller)).toList();
      }

      final stores = await _ref.read(storesListProvider.future).catchError((_) {
        return <StoreModel>[];
      });
      final userLocation = _ref.read(locationProvider).value;
      _all = enrichProductsWithNearestStoreDistance(
        products: _all,
        stores: stores,
        userLocation: userLocation,
      );

      final firstPage = _all.take(_pageSize).toList();
      state = state.copyWith(
        products: firstPage,
        isLoading: false,
        hasMore: firstPage.length < _all.length,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: () => 'Failed to load products. Please try again.',
      );
    }
  }

  /// Reveals the next page from the already-fetched in-memory list.
  void loadMore() {
    if (state.isLoading || state.isLoadingMore || !state.hasMore) return;
    final current = state.products.length;
    if (current >= _all.length) {
      state = state.copyWith(hasMore: false);
      return;
    }
    final next = _all.take(current + _pageSize).toList();
    state = state.copyWith(products: next, hasMore: next.length < _all.length);
  }

  void setCategory(String? category) {
    if (state.category == category) return;
    state = state.copyWith(category: () => category, searchQuery: '');
    loadProducts(refresh: true);
  }

  void search(String query) {
    if (state.searchQuery == query) return;
    state = state.copyWith(searchQuery: query, category: () => null);
    loadProducts(refresh: true);
  }

  /// Scopes the marketplace to one seller's storefront (or clears the scope
  /// when [seller] is null). Category chips and search keep working WITHIN
  /// the scoped store — only the explicit "view all" action removes it.
  void setSeller(SellerFilter? seller) {
    final current = state.seller;
    final same = (seller == null && current == null) ||
        (seller != null &&
            current != null &&
            seller.phone == current.phone &&
            seller.storeId == current.storeId &&
            seller.uid == current.uid);
    if (same) return;
    state = state.copyWith(
      seller: () => seller,
      category: () => null,
      searchQuery: '',
    );
    loadProducts(refresh: true);
  }

  void clearSeller() => setSeller(null);

  /// Clears category + search. Deliberately KEEPS the seller scope: inside a
  /// store, "All" means "all of this store's products", and leaving the store
  /// is its own explicit action (the ✕ on the store banner).
  void reset() {
    state = state.copyWith(category: () => null, searchQuery: '');
    loadProducts(refresh: true);
  }

  // ── Seller matching ────────────────────────────────────────────────────

  /// Last-10-digits phone normalisation so +91 98…, 98… and 91 98… all match.
  static String _normPhone(String p) {
    final digits = p.replaceAll(RegExp(r'\D'), '');
    return digits.length >= 10 ? digits.substring(digits.length - 10) : digits;
  }

  static bool _soldBySeller(CatalogModel p, SellerFilter seller) {
    // Seller's identity keys: raw ids + normalised phone forms.
    final rawKeys = <String>{
      if (seller.phone != null && seller.phone!.isNotEmpty) seller.phone!,
      if (seller.storeId != null && seller.storeId!.isNotEmpty)
        seller.storeId!,
      if (seller.uid != null && seller.uid!.isNotEmpty) seller.uid!,
    };
    final phoneKeys = rawKeys.map(_normPhone).where((k) => k.length == 10).toSet();

    bool matches(String? candidate) {
      if (candidate == null || candidate.isEmpty) return false;
      if (rawKeys.contains(candidate)) return true;
      final norm = _normPhone(candidate);
      return norm.length == 10 && phoneKeys.contains(norm);
    }

    // Any availability entry (assigned/copied sellers)…
    for (final av in p.availability ?? const <AvailabilityEntry>[]) {
      if (matches(av.storeId) || matches(av.storePhone)) return true;
    }
    // …or the product's own owner fields (canonical docs).
    return matches(p.retailerPhone) ||
        matches(p.retailerId) ||
        matches(p.createdByPhone) ||
        matches(p.manufacturerPhone) ||
        matches(p.manufacturerId);
  }
}

// ── Providers ──────────────────────────────────────────────────────────────

final catalogRepositoryProvider = Provider((_) => CatalogRepository());
final listingRepositoryProvider = Provider((_) => ListingRepository());
final storeRepositoryProvider = Provider((_) => StoreRepository());

final marketplaceProvider =
    StateNotifierProvider<MarketplaceNotifier, MarketplaceState>((ref) {
      return MarketplaceNotifier(ref.read(catalogRepositoryProvider), ref);
    });

List<CatalogModel> enrichProductsWithNearestStoreDistance({
  required List<CatalogModel> products,
  required List<StoreModel> stores,
  required LatLng? userLocation,
}) {
  if (products.isEmpty || stores.isEmpty) {
    return products;
  }

  final effectiveLocation =
      userLocation ?? const LatLng(AppConfig.defaultLat, AppConfig.defaultLng);

  String normPhone(String p) {
    final digits = p.replaceAll(RegExp(r'\D'), '');
    if (digits.length >= 10) return digits.substring(digits.length - 10);
    return digits;
  }

  final storeById = <String, StoreModel>{};
  final storeByUid = <String, StoreModel>{};
  final storeByPhone = <String, StoreModel>{};
  final storeByName = <String, StoreModel>{};

  for (final s in stores) {
    storeById[s.id] = s;
    if (s.userId != null && s.userId!.isNotEmpty) storeByUid[s.userId!] = s;
    final phone = s.phone;
    if (phone != null && phone.isNotEmpty) {
      final normalized = normPhone(phone);
      storeByPhone[normalized] = s;
    }
    final normalizedName = s.name.trim().toLowerCase();
    if (normalizedName.isNotEmpty) storeByName[normalizedName] = s;
  }

  StoreModel? resolveStore({
    String? storeId,
    String? storePhone,
    String? storeName,
  }) {
    if (storePhone != null && storePhone.isNotEmpty) {
      final normalized = normPhone(storePhone);
      final byPhone = storeByPhone[normalized];
      if (byPhone != null) return byPhone;
    }
    if (storeId != null && storeId.isNotEmpty) {
      final normalizedId = normPhone(storeId);
      final byId =
          storeById[storeId] ??
          storeByUid[storeId] ??
          storeByPhone[normalizedId];
      if (byId != null) return byId;
    }
    if (storeName != null && storeName.trim().isNotEmpty) {
      return storeByName[storeName.trim().toLowerCase()];
    }
    return null;
  }

  double? nearestDistanceFor(CatalogModel product) {
    double? nearest;

    void consider(StoreModel? store) {
      if (store == null || !store.hasLocation) return;
      final distance = GeoUtils.distanceKm(
        effectiveLocation.lat,
        effectiveLocation.lng,
        store.lat!,
        store.lng!,
      );
      if (nearest == null || distance < nearest!) {
        nearest = distance;
      }
    }

    for (final av in product.availability ?? const <AvailabilityEntry>[]) {
      consider(
        resolveStore(
          storeId: av.storeId,
          storePhone: av.storePhone,
          storeName: av.storeName,
        ),
      );
    }

    // Fallback to product owner store when needed.
    consider(
      resolveStore(
        storeId: product.retailerId ?? '',
        storePhone: product.retailerPhone ?? product.createdByPhone,
        storeName: product.store,
      ),
    );

    return nearest;
  }

  return products
      .map((p) => p.copyWith(nearestStoreDistanceKm: nearestDistanceFor(p)))
      .toList(growable: false);
}

final rawAllProductsProvider = FutureProvider<List<CatalogModel>>((ref) async {
  return ref.read(catalogRepositoryProvider).fetchAllMergedProducts();
});

final allMergedProductsProvider = Provider<AsyncValue<List<CatalogModel>>>((ref) {
  final productsAsync = ref.watch(rawAllProductsProvider);
  final storesAsync = ref.watch(storesListProvider);
  final userLocation = ref.watch(locationProvider).value;

  return productsAsync.when(
    data: (products) {
      final stores = storesAsync.value ?? [];
      final enriched = enrichProductsWithNearestStoreDistance(
        products: products,
        stores: stores,
        userLocation: userLocation,
      );
      return AsyncValue.data(enriched);
    },
    error: (err, stack) => AsyncValue.error(err, stack),
    loading: () => const AsyncValue.loading(),
  );
});

final featuredProductsProvider = Provider<AsyncValue<List<CatalogModel>>>((ref) {
  final allAsync = ref.watch(allMergedProductsProvider);
  return allAsync.when(
    data: (all) => AsyncValue.data(all.take(6).toList()),
    error: (err, stack) => AsyncValue.error(err, stack),
    loading: () => const AsyncValue.loading(),
  );
});

/// Products with the biggest seller discounts, highest first — powers the
/// "Top Deals" rail on the home page.
final topDealsProvider = Provider<AsyncValue<List<CatalogModel>>>((ref) {
  final allAsync = ref.watch(allMergedProductsProvider);
  return allAsync.when(
    data: (all) {
      final deals = all.where((p) => p.maxDiscountPct > 0).toList()
        ..sort((a, b) => b.maxDiscountPct.compareTo(a.maxDiscountPct));
      return AsyncValue.data(deals.take(10).toList());
    },
    error: (err, stack) => AsyncValue.error(err, stack),
    loading: () => const AsyncValue.loading(),
  );
});

/// "Trending Near You" — exactly as it works on the web (taking the top products)
final trendingProductsProvider = Provider<AsyncValue<List<CatalogModel>>>((ref) {
  final allAsync = ref.watch(allMergedProductsProvider);
  return allAsync.when(
    data: (all) => AsyncValue.data(all.take(10).toList()),
    error: (err, stack) => AsyncValue.error(err, stack),
    loading: () => const AsyncValue.loading(),
  );
});

final catalogDetailProvider = FutureProvider.family<CatalogModel?, String>((
  ref,
  catalogId,
) async {
  // Check in-memory list first — avoids a redundant Firestore round-trip when
  // the marketplace has already loaded all products into the cache.
  final allAsync = ref.read(allMergedProductsProvider);
  final cached = allAsync.value?.where((p) => p.id == catalogId).firstOrNull;
  if (cached != null) return cached;
  // Fall back to a targeted Firestore fetch (e.g. direct deep-link entry).
  return ref.read(catalogRepositoryProvider).fetchById(catalogId);
});

final storesListProvider = FutureProvider<List<StoreModel>>((ref) {
  return ref.read(storeRepositoryProvider).fetchStores();
});

/// Stores enriched with the distance from the user's current location and
/// sorted nearest-first. Stores without a usable location sink to the bottom.
final storesByDistanceProvider = FutureProvider<List<StoreModel>>((ref) async {
  final stores = await ref.watch(storesListProvider.future);
  final user = ref.watch(locationProvider).value;

  for (final s in stores) {
    if (user != null && s.hasLocation) {
      s.distanceKm = GeoUtils.distanceKm(user.lat, user.lng, s.lat!, s.lng!);
    } else {
      s.distanceKm = null;
    }
  }

  final sorted = [...stores]
    ..sort((a, b) {
      final da = a.distanceKm;
      final db = b.distanceKm;
      if (da == null && db == null) return 0;
      if (da == null) return 1;
      if (db == null) return -1;
      return da.compareTo(db);
    });
  return sorted;
});

final listingsForCatalogProvider = FutureProvider.family<List<ListingModel>, String>((
  ref,
  catalogId,
) async {
  final location = ref.watch(locationProvider).value;
  final product = await ref.watch(catalogDetailProvider(catalogId).future);
  if (product == null) return [];

  // Stores list enriches with geo/address/name — tolerate failures
  List<StoreModel> storesList;
  try {
    storesList = await ref.watch(storesListProvider.future);
  } catch (_) {
    storesList = [];
  }

  // Build lookup maps for fast enrichment
  final storeByPhone = <String, StoreModel>{};
  final storeById = <String, StoreModel>{};
  final storeByUid =
      <String, StoreModel>{}; // Firebase UID → store (legacy storeId)
  for (final s in storesList) {
    storeById[s.id] = s;
    final uid = s.userId;
    if (uid != null && uid.isNotEmpty) storeByUid[uid] = s;
    final p = s.phone;
    if (p != null && p.isNotEmpty) {
      storeByPhone[p] = s;
      // Normalise ±91 prefix so matching is phone-format-agnostic
      if (p.startsWith('+91') && p.length > 3) storeByPhone[p.substring(3)] = s;
      if (!p.startsWith('+91') && p.length == 10) storeByPhone['+91$p'] = s;
    }
  }

  // Resolve a store from an availability entry the same robust way the web does:
  // match by phone, by doc.id, by id-as-phone, OR by id-as-Firebase-UID. The last
  // case covers legacy entries whose storeId is a UID while the store doc is keyed
  // by phone — without it those sellers resolve to no profile (and a blank name).
  StoreModel? findStore(String? id, String? phone) {
    if (phone != null && phone.isNotEmpty) {
      final s = storeByPhone[phone];
      if (s != null) return s;
    }
    if (id != null && id.isNotEmpty) {
      return storeById[id] ?? storeByPhone[id] ?? storeByUid[id];
    }
    return null;
  }

  // Normalise to 10-digit so +919876543210 and 9876543210 dedup as the same seller
  String normPhone(String p) {
    if (p.startsWith('+91') && p.length > 3) return p.substring(3);
    if (p.startsWith('91') && p.length == 12) return p.substring(2);
    return p;
  }

  final listings = <ListingModel>[];
  final seenKeys =
      <String>{}; // deduplicate by normalised phone, fallback to storeId

  void addListing({
    required String storeId,
    required String phone,
    required String name,
    required double price,
    required int stockQty,
    required bool isOnline,
    required List<VariantModel> variants,
    StoreModel? store,
  }) {
    final key = phone.isNotEmpty ? normPhone(phone) : storeId;
    if (key.isEmpty || !seenKeys.add(key)) return;

    final lat = store?.lat;
    final lng = store?.lng;
    double? distanceKm;
    if (location != null &&
        lat != null &&
        lng != null &&
        lat != 0.0 &&
        lng != 0.0) {
      distanceKm = GeoUtils.distanceKm(location.lat, location.lng, lat, lng);
    }

    // Name resolution: store name → av.storeName → store owner name → phone.
    // Each step skips empty strings so a blank profile field can't shadow a good
    // fallback (this is what left some stores nameless before).
    final resolvedName =
        (store?.name.isNotEmpty == true ? store!.name : null) ??
        (name.isNotEmpty ? name : null) ??
        (store?.ownerName?.isNotEmpty == true ? store!.ownerName! : null) ??
        phone;

    listings.add(
      ListingModel(
        id: storeId.isNotEmpty ? storeId : phone,
        catalogId: product.id,
        sellerPhone: phone,
        sellerName: resolvedName,
        sellerType: 'retailer',
        sellerAddress: store?.address,
        sellerLat: lat,
        sellerLng: lng,
        price: price,
        stockQuantity: stockQty,
        isOnline: isOnline,
        variants: variants,
        distanceKm: distanceKm,
      ),
    );
  }

  // 1. Iterate availability array — this is the source of truth for all assigned sellers
  if (product.availability != null) {
    for (final av in product.availability!) {
      final storeId = av.storeId;
      final phone = av.storePhone ?? '';
      final store = findStore(storeId, phone.isNotEmpty ? phone : null);
      final resolvedPhone = phone.isNotEmpty ? phone : (store?.phone ?? '');

      // Fix price: 0.0 means not set → fall back to product MRP
      final price = av.sellingPrice > 0 ? av.sellingPrice : product.price;
      final stockQty = (av.stockLevel?.toLowerCase() == 'out of stock')
          ? 0
          : 99;

      addListing(
        storeId: storeId,
        phone: resolvedPhone,
        name: av.storeName ?? store?.name ?? '',
        price: price,
        stockQty: stockQty,
        // Online ordering (Buy Now / Add to Cart) is shown ONLY when the seller
        // has explicitly turned on online delivery (isOnline == true). A missing
        // flag means they never enabled it, so default to offline — otherwise
        // every store would wrongly get buy buttons.
        isOnline: av.isOnline == true,
        variants: av.variants ?? [],
        store: store,
      );
    }
  }

  // 2. Add the owner's store if not already covered by availability
  final ownerPhone = product.retailerPhone ?? product.createdByPhone ?? '';
  final ownerId = product.retailerId ?? '';
  if (ownerPhone.isNotEmpty || ownerId.isNotEmpty) {
    final ownerStore = findStore(
      ownerId.isNotEmpty ? ownerId : null,
      ownerPhone.isNotEmpty ? ownerPhone : null,
    );
    final isOnline = product.sellMode != 'offline_store_only';
    final ownerStockQty = (product.stock?.toLowerCase() == 'out of stock')
        ? 0
        : 99;
    addListing(
      storeId: ownerId,
      phone: ownerPhone,
      name: ownerStore?.name ?? product.store ?? '',
      price: product.price,
      stockQty: ownerStockQty,
      isOnline: isOnline,
      variants: [],
      store: ownerStore,
    );
  }

  // Sort ascending by distance; sellers without location go to end
  listings.sort((a, b) {
    if (a.distanceKm == null) return 1;
    if (b.distanceKm == null) return -1;
    return a.distanceKm!.compareTo(b.distanceKm!);
  });

  return listings;
});

final _reviewRepo = ReviewRepository();

final productReviewsProvider = FutureProvider.family<List<ReviewModel>, String>(
  (ref, catalogId) {
    return _reviewRepo.fetchProductReviews(catalogId);
  },
);

final storeReviewsProvider = FutureProvider.family<List<ReviewModel>, String>((
  ref,
  storePhone,
) {
  return _reviewRepo.fetchStoreReviews(storePhone);
});

final userProductReviewProvider = FutureProvider.family<ReviewModel?, String>((
  ref,
  catalogId,
) {
  final userAsync = ref.watch(currentUserProvider);
  final phone = userAsync.value?.phone ?? '';
  if (phone.isEmpty) return Future.value(null);
  return _reviewRepo.getUserProductReview(catalogId, phone);
});

final userStoreReviewProvider = FutureProvider.family<ReviewModel?, String>((
  ref,
  storePhone,
) {
  final userAsync = ref.watch(currentUserProvider);
  final phone = userAsync.value?.phone ?? '';
  if (phone.isEmpty) return Future.value(null);
  return _reviewRepo.getUserStoreReview(storePhone, phone);
});

final brandRepositoryProvider = Provider((_) => BrandRepository());

final brandByUidProvider = FutureProvider.family<BrandModel?, String>((
  ref,
  uid,
) {
  return ref.read(brandRepositoryProvider).fetchBrandByUid(uid);
});

/// Resolves a product's manufacturer brand robustly. Phone is the reliable key
/// — manufacturers live at `manufacturers/{phone}`, a direct doc read — so we
/// try it first and only fall back to the UID `where`-query (which misses when
/// `manufacturerId` is actually a phone, or when auth UIDs differ, e.g. UAT).
final productBrandProvider =
    FutureProvider.family<BrandModel?, ({String? uid, String? phone})>((
      ref,
      ids,
    ) async {
      final repo = ref.read(brandRepositoryProvider);
      final phone = ids.phone;
      if (phone != null && phone.isNotEmpty) {
        final byPhone = await repo.fetchBrandByPhone(phone);
        if (byPhone != null) return byPhone;
      }
      final uid = ids.uid;
      if (uid != null && uid.isNotEmpty) {
        return repo.fetchBrandByUid(uid);
      }
      return null;
    });

final brandProductsProvider = FutureProvider.family<List<CatalogModel>, String>(
  (ref, phone) {
    return ref.read(brandRepositoryProvider).fetchBrandProducts(phone);
  },
);
