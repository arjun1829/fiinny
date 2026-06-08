import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/catalog_model.dart';
import '../../../core/widgets/app_brand_icon.dart';
import '../../../core/widgets/empty_state.dart';
import '../../../core/widgets/error_view.dart';
import '../../../core/widgets/product_card.dart';
import '../providers/marketplace_provider.dart';

const _categories = [
  'Fertilizers',
  'Seeds',
  'Pesticides',
  'Irrigation',
  'Tools',
  'Organic',
];

class MarketplaceScreen extends ConsumerStatefulWidget {
  const MarketplaceScreen({super.key});

  @override
  ConsumerState<MarketplaceScreen> createState() => _MarketplaceScreenState();
}

class _MarketplaceScreenState extends ConsumerState<MarketplaceScreen> {
  final _searchController = TextEditingController();
  final _scrollController = ScrollController();
  Timer? _debounce;

  // Suggestions
  List<CatalogModel> _suggestionProducts = [];
  List<Map<String, dynamic>> _suggestionStores = [];

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
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
        });
      }
      return;
    }

    try {
      // Products: reuse catalog repository
      final repo = ref.read(catalogRepositoryProvider);
      final prods = await repo.fetchPage(searchQuery: query, limit: 8);

      // Stores: filter from pre-loaded stores list in memory
      final allStores = ref.read(storesListProvider).valueOrNull ?? [];
      final queryLower = query.toLowerCase();
      final stores = allStores
          .where((s) {
            final nameMatch = s.name.toLowerCase().contains(queryLower);
            final cityMatch = s.city?.toLowerCase().contains(queryLower) ?? false;
            final stateMatch = s.state?.toLowerCase().contains(queryLower) ?? false;
            final phoneMatch = s.phone?.contains(queryLower) ?? false;
            return nameMatch || cityMatch || stateMatch || phoneMatch;
          })
          .take(8)
          .map((s) => {
                'id': s.id,
                'name': s.name,
                'phone': s.phone,
                'lat': s.lat,
                'lng': s.lng,
              })
          .toList();

      if (mounted) {
        setState(() {
          _suggestionProducts = prods;
          _suggestionStores = stores;
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
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        titleSpacing: 16,
        title: Row(
          children: [
            const AppBrandIcon(size: 34),
            const SizedBox(width: 10),
            Text(
              'Marketplace',
              style: AppTextStyles.heading2.copyWith(color: Colors.white),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.map_outlined, color: Colors.white),
            tooltip: 'Store locator',
            onPressed: () => context.go('/stores'),
          ),
        ],
      ),
      body: Column(
        children: [
          // Search bar
          Container(
            color: AppColors.primary,
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: Column(
              children: [
                TextField(
                  controller: _searchController,
                  onChanged: (q) {
                    _debounce?.cancel();
                    _debounce = Timer(const Duration(milliseconds: 400), () {
                      ref.read(marketplaceProvider.notifier).search(q);
                      _fetchSuggestions(q);
                    });
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
                              ref.read(marketplaceProvider.notifier).reset();
                              setState(() {
                                _suggestionProducts = [];
                                _suggestionStores = [];
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

                // Suggestions dropdown
                if ((_suggestionProducts.isNotEmpty ||
                        _suggestionStores.isNotEmpty) &&
                    _searchController.text.isNotEmpty)
                  Container(
                    margin: const EdgeInsets.only(top: 8),
                    constraints: const BoxConstraints(maxHeight: 220),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: [
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
                                      borderRadius: BorderRadius.circular(12),
                                      child: Image.network(
                                        p.imageUrl,
                                        width: 48,
                                        height: 48,
                                        fit: BoxFit.cover,
                                      ),
                                    )
                                  : const Icon(Icons.agriculture),
                              title: Text(p.name),
                              subtitle: const Text('Product'),
                              onTap: () => context.go('/product/${p.id}'),
                            ),
                          ),

                        // Store suggestions
                        if (_suggestionStores.isNotEmpty)
                          const Divider(height: 1),
                        if (_suggestionStores.isNotEmpty)
                          ..._suggestionStores.map(
                            (s) => ListTile(
                              leading: const Icon(Icons.store),
                              title: Text(s['name'] ?? s['phone'] ?? 'Store'),
                              subtitle: const Text('Store'),
                              onTap: () => _openStoreLocation(s),
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
                    selected: state.category == cat,
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
    if (state.isLoading && state.products.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    if (state.error != null && state.products.isEmpty) {
      return ErrorView(
        message: state.error!,
        onRetry: () =>
            ref.read(marketplaceProvider.notifier).loadProducts(refresh: true),
      );
    }

    if (state.products.isEmpty) {
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
        crossAxisCount: 2,
        childAspectRatio: 0.72,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
      ),
      itemCount: state.products.length + (state.isLoadingMore ? 2 : 0),
      itemBuilder: (context, index) {
        if (index >= state.products.length) {
          return Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Center(child: CircularProgressIndicator()),
          );
        }
        final product = state.products[index];
        return ProductCard(
          product: product,
          onTap: () => context.go('/product/${product.id}'),
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
