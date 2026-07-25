import 'dart:async';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/catalog_model.dart';
import '../../../core/models/store_model.dart';
import '../../../core/providers/location_provider.dart';
import '../../../core/utils/store_focus_route.dart';
import '../../../core/widgets/app_top_bar.dart';
import '../../../core/widgets/empty_state.dart';
import '../../../core/widgets/error_view.dart';
import '../../../core/widgets/product_card.dart';
import '../../../core/widgets/shimmer_product_card.dart';
import '../providers/marketplace_provider.dart';

const _categories = [
  'Pesticides',
  'Fertilizers',
  'Herbicides',
  'Bio Pesticides',
  'Sprayers',
  'Seeds',
  'Tools',
];

class MarketplaceScreen extends ConsumerStatefulWidget {
  final String? initialCategory;

  /// A one-shot token (from `?focus=`) that asks the screen to put the cursor
  /// straight into the search field. Home passes a fresh value on every tap so
  /// the keyboard pops up immediately instead of needing a second tap here.
  final String? searchFocusToken;

  /// Store-scoped browsing (from the Stores tab's "View Store Products"):
  /// when any of these is set, the grid shows only that seller's assortment.
  final String? sellerPhone;
  final String? sellerStoreId;
  final String? sellerUid;
  final String? sellerName;

  const MarketplaceScreen({
    super.key,
    this.initialCategory,
    this.searchFocusToken,
    this.sellerPhone,
    this.sellerStoreId,
    this.sellerUid,
    this.sellerName,
  });

  @override
  ConsumerState<MarketplaceScreen> createState() => _MarketplaceScreenState();
}

class _MarketplaceScreenState extends ConsumerState<MarketplaceScreen> {
  final _searchController = TextEditingController();
  final _searchFocus = FocusNode();
  final _scrollController = ScrollController();
  Timer? _debounce;
  String? _handledFocusToken;

  // Suggestions
  List<CatalogModel> _suggestionProducts = [];
  List<Map<String, dynamic>> _suggestionStores = [];
  List<Map<String, dynamic>> _suggestionShops = [];

  /// Builds a [SellerFilter] from the route params, or null when unscoped.
  SellerFilter? get _routeSeller {
    final phone = widget.sellerPhone;
    final storeId = widget.sellerStoreId;
    final uid = widget.sellerUid;
    if ((phone == null || phone.isEmpty) &&
        (storeId == null || storeId.isEmpty) &&
        (uid == null || uid.isEmpty)) {
      return null;
    }
    return SellerFilter(
      phone: phone,
      storeId: storeId,
      uid: uid,
      name: widget.sellerName ?? 'this store',
    );
  }

  void _applyRouteSeller() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        ref.read(marketplaceProvider.notifier).setSeller(_routeSeller);
      }
    });
  }

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (widget.initialCategory != null) {
        ref
            .read(marketplaceProvider.notifier)
            .setCategory(widget.initialCategory);
      }
    });
    if (_routeSeller != null) _applyRouteSeller();
    _maybeFocusSearch();
  }

  @override
  void didUpdateWidget(covariant MarketplaceScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.initialCategory != oldWidget.initialCategory) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        ref
            .read(marketplaceProvider.notifier)
            .setCategory(widget.initialCategory);
      });
    }
    // Navigating to /marketplace with different (or no) seller params re-scopes
    // (or un-scopes) the grid — e.g. Home's "See all" always shows everything.
    if (widget.sellerPhone != oldWidget.sellerPhone ||
        widget.sellerStoreId != oldWidget.sellerStoreId ||
        widget.sellerUid != oldWidget.sellerUid) {
      _applyRouteSeller();
    }
    _maybeFocusSearch();
  }

  /// Focus the search field when a new focus token arrives (e.g. the user tapped
  /// "Search" on the home page). Guarded by [_handledFocusToken] so a rebuild
  /// for any other reason doesn't keep stealing focus.
  void _maybeFocusSearch() {
    final token = widget.searchFocusToken;
    if (token == null || token == _handledFocusToken) return;
    _handledFocusToken = token;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _searchFocus.requestFocus();
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    _searchFocus.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 300) {
      ref.read(marketplaceProvider.notifier).loadMore();
    }
  }

  Future<void> _fetchSuggestions(String q) async {
    final query = q.trim();
    if (query.isEmpty) {
      if (mounted) {
        setState(() {
          _suggestionProducts = [];
          _suggestionStores = [];
          _suggestionShops = [];
        });
      }
      return;
    }

    try {
      // Products: reuse catalog repository
      final repo = ref.read(catalogRepositoryProvider);
      final prodsF = repo.fetchPage(searchQuery: query, limit: 8);

      // Stores: filter from pre-loaded stores list in memory
      final allStores = ref.read(storesListProvider).value ?? [];
      final queryLower = query.toLowerCase();
      final stores = allStores.where((s) {
        final nameMatch = s.name.toLowerCase().contains(queryLower);
        final phoneMatch = s.phone?.contains(queryLower) ?? false;
        return nameMatch || phoneMatch;
      }).toList();

      // Sort to prioritize name start matches
      stores.sort((a, b) {
        final aName = a.name.toLowerCase();
        final bName = b.name.toLowerCase();
        final aStarts = aName.startsWith(queryLower);
        final bStarts = bName.startsWith(queryLower);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return 0;
      });

      final storeSuggestions = stores
          .take(8)
          .map(
            (s) => {
              'id': s.id,
              'name': s.name,
              'phone': s.phone,
              'lat': s.lat,
              'lng': s.lng,
            },
          )
          .toList();

      final prods = await prodsF;

      if (mounted) {
        setState(() {
          _suggestionProducts = prods;
          _suggestionStores = storeSuggestions;
          _suggestionShops = [];
        });
      }
    } catch (e) {
      // swallow errors silently
    }
  }

  void _openStoreLocation(Map<String, dynamic> s) {
    context.go(
      storeFocusRoute(
        name: (s['name'] as String?) ?? 'Store',
        phone: s['phone'] as String?,
        id: s['id'] as String?,
        lat: (s['lat'] as num?)?.toDouble(),
        lng: (s['lng'] as num?)?.toDouble(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(marketplaceProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppTopBar(
        title: 'Marketplace',
        actions: [
          TopBarAction(
            icon: Icons.map_outlined,
            tooltip: 'Store locator',
            onPressed: () => context.go('/stores'),
          ),
          TopBarAction(
            icon: Icons.person_outline,
            tooltip: 'Profile',
            onPressed: () => context.push('/profile'),
          ),
        ],
      ),
      body: Column(
        children: [
          // Search bar — lives in the same gradient block as the top bar but
          // with breathing room and rounded bottom corners so it never touches.
          ClipRRect(
            borderRadius: const BorderRadius.vertical(
              bottom: Radius.circular(20),
            ),
            child: Stack(
              children: [
                const Positioned.fill(
                  child: TopBarBackdrop(
                    borderRadius: BorderRadius.vertical(
                      bottom: Radius.circular(20),
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
                  child: Column(
                    children: [
                      Container(
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(16),
                          boxShadow: const [
                            BoxShadow(
                              color: Color(0x14000000),
                              blurRadius: 10,
                              offset: Offset(0, 3),
                            ),
                          ],
                        ),
                        child: TextField(
                          controller: _searchController,
                          focusNode: _searchFocus,
                          textInputAction: TextInputAction.search,
                          onChanged: (q) {
                            _debounce?.cancel();
                            _debounce = Timer(
                              const Duration(milliseconds: 400),
                              () {
                                ref
                                    .read(marketplaceProvider.notifier)
                                    .search(q);
                                _fetchSuggestions(q);
                              },
                            );
                          },
                          style: AppTextStyles.body,
                          decoration: InputDecoration(
                            hintText: 'Search products...',
                            hintStyle: AppTextStyles.body.copyWith(
                              color: AppColors.onSurfaceVariant,
                            ),
                            prefixIcon: const Icon(
                              Icons.search,
                              color: AppColors.primary,
                            ),
                            suffixIcon: _searchController.text.isNotEmpty
                                ? IconButton(
                                    icon: const Icon(Icons.close),
                                    onPressed: () {
                                      _searchController.clear();
                                      ref
                                          .read(marketplaceProvider.notifier)
                                          .reset();
                                      setState(() {
                                        _suggestionProducts = [];
                                        _suggestionStores = [];
                                        _suggestionShops = [];
                                      });
                                    },
                                  )
                                : null,
                            filled: true,
                            fillColor: Colors.white,
                            // Hairline outline keeps the white field visible
                            // on the white top-bar backdrop.
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(16),
                              borderSide: const BorderSide(
                                color: AppColors.topBarBorder,
                              ),
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(16),
                              borderSide: const BorderSide(
                                color: AppColors.topBarBorder,
                              ),
                            ),
                            focusedBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(16),
                              borderSide: const BorderSide(
                                color: AppColors.primary,
                                width: 1.5,
                              ),
                            ),
                            contentPadding: const EdgeInsets.symmetric(
                              vertical: 0,
                              horizontal: 16,
                            ),
                          ),
                        ),
                      ),

                      // Suggestions dropdown
                      if ((_suggestionShops.isNotEmpty ||
                              _suggestionProducts.isNotEmpty ||
                              _suggestionStores.isNotEmpty) &&
                          _searchController.text.isNotEmpty)
                        Container(
                          margin: const EdgeInsets.only(top: 8),
                          constraints: const BoxConstraints(maxHeight: 280),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: AppColors.topBarBorder),
                            boxShadow: const [
                              BoxShadow(color: Colors.black12, blurRadius: 8),
                            ],
                          ),
                          child: ListView(
                            shrinkWrap: true,
                            children: [
                              // Product suggestions
                              if (_suggestionProducts.isNotEmpty)
                                ..._suggestionProducts.map(
                                  (p) => ListTile(
                                    leading: p.imageUrl.isNotEmpty
                                        ? ClipRRect(
                                            borderRadius: BorderRadius.circular(
                                              12,
                                            ),
                                            child: CachedNetworkImage(
                                              imageUrl: p.imageUrl,
                                              width: 48,
                                              height: 48,
                                              fit: BoxFit.contain,
                                              memCacheWidth: 150,
                                            ),
                                          )
                                        : const Icon(Icons.agriculture),
                                    title: Text(p.name),
                                    subtitle: const Text('Product'),
                                    onTap: () =>
                                        context.push('/product/${p.id}'),
                                  ),
                                ),

                              // Store suggestions
                              if (_suggestionStores.isNotEmpty)
                                const Divider(height: 1),
                              if (_suggestionStores.isNotEmpty)
                                ..._suggestionStores.map(
                                  (s) => ListTile(
                                    leading: const Icon(Icons.store),
                                    title: Text(
                                      s['name'] ?? s['phone'] ?? 'Store',
                                    ),
                                    subtitle: const Text('Nearby Store'),
                                    onTap: () => _openStoreLocation(s),
                                  ),
                                ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // Store-scope banner — shown while browsing one seller's storefront
          if (state.seller != null)
            _SellerBanner(
              name: state.seller!.name,
              onClear: () =>
                  ref.read(marketplaceProvider.notifier).clearSeller(),
            ),

          // Category filter chips
          SizedBox(
            height: 48,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              children: [
                _CategoryChip(
                  label: 'All',
                  selected: state.category == null && state.searchQuery.isEmpty,
                  onTap: () => ref.read(marketplaceProvider.notifier).reset(),
                ),
                ..._categories.map(
                  (cat) => _CategoryChip(
                    label: cat,
                    selected:
                        state.category?.toLowerCase() == cat.toLowerCase(),
                    onTap: () =>
                        ref.read(marketplaceProvider.notifier).setCategory(cat),
                  ),
                ),
              ],
            ),
          ),

          // Product grid
          Expanded(child: _buildGrid(state)),
        ],
      ),
    );
  }

  Widget _buildGrid(MarketplaceState state) {
    final stores = ref.watch(storesListProvider).value ?? const <StoreModel>[];
    final userLocation = ref.watch(locationProvider).value;
    final products = enrichProductsWithNearestStoreDistance(
      products: state.products,
      stores: stores,
      userLocation: userLocation,
    );

    if (state.isLoading && state.products.isEmpty) {
      // Skeleton grid instead of a lone spinner — the page keeps its shape
      // while loading, which reads as fast even when the network isn't.
      return const ShimmerProductGrid(itemCount: 9);
    }

    if (state.error != null && products.isEmpty) {
      return ErrorView(
        message: state.error!,
        onRetry: () =>
            ref.read(marketplaceProvider.notifier).loadProducts(refresh: true),
      );
    }

    if (products.isEmpty) {
      final seller = state.seller;
      if (seller != null && state.category == null && state.searchQuery.isEmpty) {
        // The scoped store genuinely has nothing listed — offer the way out,
        // since clearing category/search can't help here.
        return EmptyState(
          title: 'No products from ${seller.name}',
          subtitle: 'This store hasn\'t listed any products yet',
          icon: Icons.storefront_outlined,
          actionLabel: 'Browse all products',
          onAction: () {
            _searchController.clear();
            ref.read(marketplaceProvider.notifier).clearSeller();
          },
        );
      }
      return EmptyState(
        title: 'No products found',
        subtitle: seller != null
            ? 'Try a different category or search within ${seller.name}'
            : 'Try a different category or search term',
        icon: Icons.search_off,
        actionLabel: 'Clear filters',
        onAction: () {
          _searchController.clear();
          ref.read(marketplaceProvider.notifier).reset();
        },
      );
    }

    return GridView.builder(
      controller: _scrollController,
      padding: const EdgeInsets.all(12),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        childAspectRatio: 0.54,
        crossAxisSpacing: 10,
        mainAxisSpacing: 10,
      ),
      itemCount: products.length + (state.isLoadingMore ? 3 : 0),
      itemBuilder: (context, index) {
        if (index >= products.length) {
          return const ShimmerProductCard();
        }
        final product = products[index];
        return ProductCard(
          product: product,
          onTap: () => context.push('/product/${product.id}'),
        );
      },
    );
  }
}

/// Banner shown while the grid is scoped to one seller's storefront: makes
/// the scope impossible to miss and carries the single exit action.
class _SellerBanner extends StatelessWidget {
  final String name;
  final VoidCallback onClear;

  const _SellerBanner({required this.name, required this.onClear});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 10, 12, 2),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(
        color: AppColors.primary.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.primary.withValues(alpha: 0.25)),
      ),
      child: Row(
        children: [
          const Icon(Icons.storefront, size: 18, color: AppColors.primary),
          const SizedBox(width: 8),
          Expanded(
            child: RichText(
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              text: TextSpan(
                style: AppTextStyles.bodySmall
                    .copyWith(color: AppColors.onSurface),
                children: [
                  const TextSpan(text: 'Products from '),
                  TextSpan(
                    text: name,
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      color: AppColors.primary,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 8),
          GestureDetector(
            onTap: onClear,
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                    color: AppColors.primary.withValues(alpha: 0.35)),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'View all',
                    style: AppTextStyles.caption.copyWith(
                      color: AppColors.primary,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(width: 3),
                  const Icon(Icons.close, size: 13, color: AppColors.primary),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CategoryChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _CategoryChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    // Custom animated pill instead of the stock Material FilterChip: solid
    // brand fill + white text when active, quiet outline otherwise — matches
    // the web marketplace's category pills and reads instantly at a glance.
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOut,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 7),
          decoration: BoxDecoration(
            color: selected ? AppColors.primary : Colors.white,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: selected ? AppColors.primary : AppColors.divider,
            ),
            boxShadow: selected
                ? [
                    BoxShadow(
                      color: AppColors.primary.withValues(alpha: 0.25),
                      blurRadius: 8,
                      offset: const Offset(0, 3),
                    ),
                  ]
                : null,
          ),
          child: Text(
            label,
            style: AppTextStyles.bodySmall.copyWith(
              color: selected ? Colors.white : AppColors.onSurface,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
            ),
          ),
        ),
      ),
    );
  }
}
