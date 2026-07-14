import 'dart:async';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/catalog_model.dart';
import '../../../core/models/store_model.dart';
import '../../../core/providers/location_provider.dart';
import '../../../core/widgets/app_top_bar.dart';
import '../../../core/widgets/empty_state.dart';
import '../../../core/widgets/error_view.dart';
import '../../../core/widgets/product_card.dart';
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

  const MarketplaceScreen({
    super.key,
    this.initialCategory,
    this.searchFocusToken,
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

  Future<void> _openStoreLocation(Map<String, dynamic> s) async {
    final lat = s['lat'];
    final lng = s['lng'];
    if (lat != null && lng != null) {
      final url = Uri.parse(
        'https://www.google.com/maps/search/?api=1&query=$lat,$lng',
      );
      if (await canLaunchUrl(url)) {
        await launchUrl(url);
        return;
      }
    }

    if (!mounted) return;
    context.go('/stores');
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
                              color: Colors.black26,
                              blurRadius: 8,
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
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(16),
                              borderSide: BorderSide.none,
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
      return const Center(child: CircularProgressIndicator());
    }

    if (state.error != null && products.isEmpty) {
      return ErrorView(
        message: state.error!,
        onRetry: () =>
            ref.read(marketplaceProvider.notifier).loadProducts(refresh: true),
      );
    }

    if (products.isEmpty) {
      return EmptyState(
        title: 'No products found',
        subtitle: 'Try a different category or search term',
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
      itemCount: products.length + (state.isLoadingMore ? 2 : 0),
      itemBuilder: (context, index) {
        if (index >= products.length) {
          return Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Center(child: CircularProgressIndicator()),
          );
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
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: FilterChip(
        label: Text(label, style: AppTextStyles.bodySmall),
        selected: selected,
        onSelected: (_) => onTap(),
        selectedColor: AppColors.primaryContainer,
        checkmarkColor: AppColors.primary,
        side: BorderSide(
          color: selected ? AppColors.primary : AppColors.divider,
        ),
      ),
    );
  }
}
