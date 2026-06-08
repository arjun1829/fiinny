import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
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

  MarketplaceNotifier(this._repo) : super(const MarketplaceState()) {
    loadProducts();
  }

  Future<void> loadProducts({bool refresh = false}) async {
    if (state.isLoading) return;

    state = state.copyWith(
      isLoading: true,
      error: () => null,
      products: refresh ? [] : null,
      lastDoc: refresh ? () => null : null,
      hasMore: refresh ? true : null,
    );

    try {
      final results = await _repo.fetchPageWithDocs(
        category: state.category,
        searchQuery: state.searchQuery,
      );

      state = state.copyWith(
        products: results.map((r) => r.model).toList(),
        isLoading: false,
        // Since we query all products and filter in memory, we don't paginate page-by-page from firestore anymore
        hasMore: false,
        lastDoc: results.isNotEmpty ? () => results.last.doc : () => null,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: () => 'Failed to load products. Please try again.',
      );
    }
  }

  Future<void> loadMore() async {
    // No-op since we load all products at once to perform accurate in-memory merging/deduping
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

final featuredProductsProvider = FutureProvider<List<CatalogModel>>((ref) {
  return ref.read(catalogRepositoryProvider).fetchFeatured();
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
  final location = ref.watch(locationProvider).valueOrNull;
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
  for (final s in storesList) {
    storeById[s.id] = s;
    final p = s.phone;
    if (p != null && p.isNotEmpty) {
      storeByPhone[p] = s;
      // Normalise ±91 prefix so matching is phone-format-agnostic
      if (p.startsWith('+91') && p.length > 3) storeByPhone[p.substring(3)] = s;
      if (!p.startsWith('+91') && p.length == 10) storeByPhone['+91$p'] = s;
    }
  }

  StoreModel? findStore(String? id, String? phone) {
    if (phone != null && phone.isNotEmpty) {
      final s = storeByPhone[phone];
      if (s != null) return s;
    }
    if (id != null && id.isNotEmpty) {
      return storeById[id] ?? storeByPhone[id];
    }
    return null;
  }

  final listings = <ListingModel>[];
  final seenKeys = <String>{}; // deduplicate by phone, fallback to storeId

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
    final key = phone.isNotEmpty ? phone : storeId;
    if (key.isEmpty || !seenKeys.add(key)) return;

    final lat = store?.lat;
    final lng = store?.lng;
    double? distanceKm;
    if (location != null && lat != null && lng != null && lat != 0.0 && lng != 0.0) {
      distanceKm = GeoUtils.distanceKm(location.lat, location.lng, lat, lng);
    }

    // Name resolution: store lookup → av.storeName → phone number (never blank)
    final resolvedName = (store?.name?.isNotEmpty == true ? store!.name : null) ??
        (name.isNotEmpty ? name : null) ??
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
        isOnline: av.isOnline ?? true,
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
    addListing(
      storeId: ownerId,
      phone: ownerPhone,
      name: ownerStore?.name ?? product.store ?? '',
      price: product.price,
      stockQty: 99,
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
