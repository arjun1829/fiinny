import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/app_config.dart';
import '../../../core/models/catalog_model.dart';
import '../../../core/models/review_model.dart';
import '../../../core/providers/location_provider.dart';
import '../data/catalog_repository.dart';
import '../data/listing_repository.dart';
import '../data/review_repository.dart';

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
        hasMore: results.length >= AppConfig.firestorePageSize,
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
    if (!state.hasMore || state.isLoadingMore || state.lastDoc == null) return;

    state = state.copyWith(isLoadingMore: true);

    try {
      final results = await _repo.fetchPageWithDocs(
        category: state.category,
        searchQuery: state.searchQuery,
        startAfter: state.lastDoc,
      );

      state = state.copyWith(
        products: [...state.products, ...results.map((r) => r.model)],
        isLoadingMore: false,
        hasMore: results.length >= AppConfig.firestorePageSize,
        lastDoc: results.isNotEmpty ? () => results.last.doc : () => state.lastDoc,
      );
    } catch (_) {
      state = state.copyWith(isLoadingMore: false);
    }
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

final listingsForCatalogProvider =
    StreamProvider.family<List<dynamic>, String>((ref, catalogId) {
  final location = ref.watch(locationProvider).valueOrNull;
  return ref.read(listingRepositoryProvider).watchListingsForCatalog(
        catalogId,
        userLat: location?.lat,
        userLng: location?.lng,
      );
});

final _reviewRepo = ReviewRepository();

final productReviewsProvider =
    FutureProvider.family<List<ReviewModel>, String>((ref, catalogId) {
  return _reviewRepo.fetchProductReviews(catalogId);
});
