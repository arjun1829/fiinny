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

class MarketplaceState {
  final List<CatalogModel> products;
  final bool isLoading;
  final bool isLoadingMore;
  final bool hasMore;
  final String? category;
  final String searchQuery;
  final String? error;
  final DocumentSnapshot? lastDoc;

  const MarketplaceState({
    this.products = const [],
    this.isLoading = false,
    this.isLoadingMore = false,
    this.hasMore = true,
    this.category,
    this.searchQuery = '',
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
    String? Function()? error,
    DocumentSnapshot? Function()? lastDoc,
  }) =>
      MarketplaceState(
        products: products ?? this.products,
        isLoading: isLoading ?? this.isLoading,
        isLoadingMore: isLoadingMore ?? this.isLoadingMore,
        hasMore: hasMore ?? this.hasMore,
        category: category != null ? category() : this.category,
        searchQuery: searchQuery ?? this.searchQuery,
        error: error != null ? error() : this.error,
        lastDoc: lastDoc != null ? lastDoc() : this.lastDoc,
      );
}

// ── Notifier ───────────────────────────────────────────────────────────────

class MarketplaceNotifier extends StateNotifier<MarketplaceState> {
  final CatalogRepository _repo;

  static const _pageSize = AppConfig.firestorePageSize;

  /// The full merged + filtered catalog for the current query. Fetched once per
  /// query; [loadMore] just reveals more of it so the grid keeps growing as the
  /// user scrolls instead of stopping after the first page.
  List<CatalogModel> _all = [];

  MarketplaceNotifier(this._repo) : super(const MarketplaceState()) {
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
    state = state.copyWith(
      products: next,
      hasMore: next.length < _all.length,
    );
  }

  void setCategory(String? category) {
    if (state.category == category) return;
    state = state.copyWith(
      category: () => category,
      searchQuery: '',
    );
    loadProducts(refresh: true);
  }

  void search(String query) {
    if (state.searchQuery == query) return;
    state = state.copyWith(searchQuery: query, category: () => null);
    loadProducts(refresh: true);
  }

  void reset() {
    state = state.copyWith(
      category: () => null,
      searchQuery: '',
    );
    loadProducts(refresh: true);
  }
}

// ── Providers ──────────────────────────────────────────────────────────────

final catalogRepositoryProvider = Provider((_) => CatalogRepository());
final listingRepositoryProvider = Provider((_) => ListingRepository());
final storeRepositoryProvider = Provider((_) => StoreRepository());

final marketplaceProvider =
    StateNotifierProvider<MarketplaceNotifier, MarketplaceState>((ref) {
  return MarketplaceNotifier(ref.read(catalogRepositoryProvider));
});

/// All merged catalog products, fetched once. Home-page rails (featured + top
/// deals) derive from this so the screen makes a single Firestore round-trip
/// instead of one per section.
final allMergedProductsProvider = FutureProvider<List<CatalogModel>>((ref) {
  return ref.read(catalogRepositoryProvider).fetchAllMergedProducts();
});

final featuredProductsProvider = FutureProvider<List<CatalogModel>>((ref) async {
  final all = await ref.watch(allMergedProductsProvider.future);
  return all.take(6).toList();
});

/// Products with the biggest seller discounts, highest first — powers the
/// "Top Deals" rail on the home page.
final topDealsProvider = FutureProvider<List<CatalogModel>>((ref) async {
  final all = await ref.watch(allMergedProductsProvider.future);
  final deals = all.where((p) => p.maxDiscountPct > 0).toList()
    ..sort((a, b) => b.maxDiscountPct.compareTo(a.maxDiscountPct));
  return deals.take(10).toList();
});

final catalogDetailProvider =
    FutureProvider.family<CatalogModel?, String>((ref, catalogId) {
  return ref.read(catalogRepositoryProvider).fetchById(catalogId);
});

final storesListProvider = FutureProvider<List<StoreModel>>((ref) {
  return ref.read(storeRepositoryProvider).fetchStores();
});

final listingsForCatalogProvider =
    FutureProvider.family<List<ListingModel>, String>((ref, catalogId) async {
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
  final storeByUid = <String, StoreModel>{}; // Firebase UID → store (legacy storeId)
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
  final seenKeys = <String>{}; // deduplicate by normalised phone, fallback to storeId

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
    if (location != null && lat != null && lng != null && lat != 0.0 && lng != 0.0) {
      distanceKm = GeoUtils.distanceKm(location.lat, location.lng, lat, lng);
    }

    // Name resolution: store name → av.storeName → store owner name → phone.
    // Each step skips empty strings so a blank profile field can't shadow a good
    // fallback (this is what left some stores nameless before).
    final resolvedName = (store?.name.isNotEmpty == true ? store!.name : null) ??
        (name.isNotEmpty ? name : null) ??
        (store?.ownerName?.isNotEmpty == true ? store!.ownerName! : null) ??
        phone;

    listings.add(ListingModel(
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
    ));
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
      final stockQty = (av.stockLevel?.toLowerCase() == 'out of stock') ? 0 : 99;

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
    final ownerStockQty = (product.stock?.toLowerCase() == 'out of stock') ? 0 : 99;
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

final productReviewsProvider =
    FutureProvider.family<List<ReviewModel>, String>((ref, catalogId) {
  return _reviewRepo.fetchProductReviews(catalogId);
});

final storeReviewsProvider =
    FutureProvider.family<List<ReviewModel>, String>((ref, storePhone) {
  return _reviewRepo.fetchStoreReviews(storePhone);
});

final userProductReviewProvider =
    FutureProvider.family<ReviewModel?, String>((ref, catalogId) {
  final userAsync = ref.watch(currentUserProvider);
  final phone = userAsync.value?.phone ?? '';
  if (phone.isEmpty) return Future.value(null);
  return _reviewRepo.getUserProductReview(catalogId, phone);
});

final userStoreReviewProvider =
    FutureProvider.family<ReviewModel?, String>((ref, storePhone) {
  final userAsync = ref.watch(currentUserProvider);
  final phone = userAsync.value?.phone ?? '';
  if (phone.isEmpty) return Future.value(null);
  return _reviewRepo.getUserStoreReview(storePhone, phone);
});

final brandRepositoryProvider = Provider((_) => BrandRepository());

final brandByUidProvider =
    FutureProvider.family<BrandModel?, String>((ref, uid) {
  return ref.read(brandRepositoryProvider).fetchBrandByUid(uid);
});

/// Resolves a product's manufacturer brand robustly. Phone is the reliable key
/// — manufacturers live at `manufacturers/{phone}`, a direct doc read — so we
/// try it first and only fall back to the UID `where`-query (which misses when
/// `manufacturerId` is actually a phone, or when auth UIDs differ, e.g. UAT).
final productBrandProvider =
    FutureProvider.family<BrandModel?, ({String? uid, String? phone})>(
        (ref, ids) async {
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

final brandProductsProvider =
    FutureProvider.family<List<CatalogModel>, String>((ref, phone) {
  return ref.read(brandRepositoryProvider).fetchBrandProducts(phone);
});
