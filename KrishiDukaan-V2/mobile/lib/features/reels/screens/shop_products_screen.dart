import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/listing_model.dart';
import '../../../core/widgets/price_tag.dart';
import '../../../core/widgets/app_top_bar.dart';
import '../providers/reels_provider.dart';

/// Full product catalogue for one shop — the page a visitor lands on from the
/// shop profile's "Products" stat or its "View All" tile.
///
/// The shop profile itself only has room for a short horizontal preview row,
/// which answers neither "how many does this shop have" nor "show me all of
/// them". This is that page: a plain searchable grid, scoped to a single
/// seller, with its own count in the header.
///
/// Rendering is deliberately incremental ([_pageSize] at a time, growing as
/// the user scrolls). A manufacturer account in production carries 800+
/// listings; building that many tiles — each with its own network image — in
/// one pass is exactly the "lot of loading on the user side" this page exists
/// to avoid.
class ShopProductsScreen extends ConsumerStatefulWidget {
  final String shopPhone;
  final String? shopName;

  const ShopProductsScreen({
    super.key,
    required this.shopPhone,
    this.shopName,
  });

  @override
  ConsumerState<ShopProductsScreen> createState() => _ShopProductsScreenState();
}

class _ShopProductsScreenState extends ConsumerState<ShopProductsScreen> {
  static const _pageSize = 24;

  final _scrollController = ScrollController();
  final _searchController = TextEditingController();

  int _visibleCount = _pageSize;
  String _query = '';

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scrollController.hasClients) return;
    final pos = _scrollController.position;
    if (pos.pixels >= pos.maxScrollExtent - 400) {
      setState(() => _visibleCount += _pageSize);
    }
  }

  List<ListingModel> _filter(List<ListingModel> all) {
    final active = all.where((l) => l.isActive).toList();
    if (_query.isEmpty) return active;
    final q = _query.toLowerCase();
    return active.where((l) {
      final name = (l.productName ?? '').toLowerCase();
      final category = (l.category ?? '').toLowerCase();
      return name.contains(q) || category.contains(q);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final listingsAsync = ref.watch(shopListingsProvider(widget.shopPhone));

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppTopBar(
        title: widget.shopName?.trim().isNotEmpty == true
            ? widget.shopName!.trim()
            : 'Products',
      ),
      body: listingsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.error_outline,
                    size: 44, color: AppColors.onSurfaceVariant),
                const SizedBox(height: 12),
                Text(
                  'Could not load this shop\'s products.',
                  textAlign: TextAlign.center,
                  style: AppTextStyles.body
                      .copyWith(color: AppColors.onSurfaceVariant),
                ),
                const SizedBox(height: 12),
                OutlinedButton(
                  onPressed: () =>
                      ref.invalidate(shopListingsProvider(widget.shopPhone)),
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
        ),
        data: (all) {
          final products = _filter(all);
          final totalActive = all.where((l) => l.isActive).length;
          final shown = products.length < _visibleCount
              ? products.length
              : _visibleCount;

          return Column(
            children: [
              // Count + search
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _query.isEmpty
                          ? '$totalActive ${totalActive == 1 ? 'product' : 'products'}'
                          : '${products.length} of $totalActive ${totalActive == 1 ? 'product' : 'products'}',
                      style: AppTextStyles.bodyMedium
                          .copyWith(color: AppColors.onSurfaceVariant),
                    ),
                    if (totalActive > 0) ...[
                      const SizedBox(height: 10),
                      TextField(
                        controller: _searchController,
                        onChanged: (v) => setState(() {
                          _query = v.trim();
                          // A narrower list should start from the top again,
                          // otherwise the previously grown page size hides
                          // how few results actually matched.
                          _visibleCount = _pageSize;
                        }),
                        decoration: InputDecoration(
                          isDense: true,
                          hintText: 'Search products in this shop',
                          prefixIcon: const Icon(Icons.search, size: 20),
                          suffixIcon: _query.isNotEmpty
                              ? IconButton(
                                  icon: const Icon(Icons.clear, size: 18),
                                  onPressed: () {
                                    _searchController.clear();
                                    setState(() {
                                      _query = '';
                                      _visibleCount = _pageSize;
                                    });
                                  },
                                )
                              : null,
                          filled: true,
                          fillColor: Colors.white,
                          contentPadding:
                              const EdgeInsets.symmetric(vertical: 12),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide:
                                const BorderSide(color: AppColors.divider),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide:
                                const BorderSide(color: AppColors.divider),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),

              if (products.isEmpty)
                Expanded(
                  child: Center(
                    child: Padding(
                      padding: const EdgeInsets.all(32),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            _query.isEmpty
                                ? Icons.inventory_2_outlined
                                : Icons.search_off,
                            size: 48,
                            color: AppColors.onSurfaceVariant,
                          ),
                          const SizedBox(height: 10),
                          Text(
                            _query.isEmpty
                                ? 'This shop has no products listed yet.'
                                : 'No products match "$_query".',
                            textAlign: TextAlign.center,
                            style: AppTextStyles.body
                                .copyWith(color: AppColors.onSurfaceVariant),
                          ),
                        ],
                      ),
                    ),
                  ),
                )
              else
                Expanded(
                  child: GridView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.fromLTRB(12, 4, 12, 24),
                    gridDelegate:
                        const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      crossAxisSpacing: 10,
                      mainAxisSpacing: 10,
                      childAspectRatio: 0.72,
                    ),
                    itemCount: shown,
                    itemBuilder: (_, i) =>
                        _ShopProductCard(listing: products[i]),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _ShopProductCard extends StatelessWidget {
  final ListingModel listing;
  const _ShopProductCard({required this.listing});

  @override
  Widget build(BuildContext context) {
    final dp = listing.displayPrice;
    return GestureDetector(
      onTap: () => context.push('/product/${listing.catalogId}'),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.divider),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Stack(
                children: [
                  Positioned.fill(
                    child: listing.imageUrl != null &&
                            listing.imageUrl!.isNotEmpty
                        ? CachedNetworkImage(
                            imageUrl: listing.imageUrl!,
                            fit: BoxFit.cover,
                            memCacheWidth: 400,
                            errorWidget: (_, _, _) => _placeholder(),
                            placeholder: (_, _) => _placeholder(),
                          )
                        : _placeholder(),
                  ),
                  if (dp.hasOffer)
                    Positioned(top: 8, left: 0, child: _OfferRibbon(pct: dp.pct)),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    listing.productName ?? 'Product',
                    style: AppTextStyles.bodySmall
                        .copyWith(fontWeight: FontWeight.w600),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 6),
                  PriceTag(value: dp, fontSize: 14),
                  if (!listing.isInStock)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        'Out of stock',
                        style: AppTextStyles.caption
                            .copyWith(color: AppColors.error),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _placeholder() => Container(
        color: AppColors.primaryContainer.withValues(alpha: 0.3),
        child: const Center(
          child: Icon(Icons.image_outlined, color: AppColors.primary, size: 30),
        ),
      );
}

/// Small "X% OFF" ribbon for the top-left of a product image.
class _OfferRibbon extends StatelessWidget {
  final int pct;
  const _OfferRibbon({required this.pct});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
        decoration: const BoxDecoration(
          color: Color(0xFF16A34A),
          borderRadius: BorderRadius.only(
            topRight: Radius.circular(6),
            bottomRight: Radius.circular(6),
          ),
        ),
        child: Text(
          '$pct% OFF',
          style: const TextStyle(
            color: Colors.white,
            fontSize: 9,
            fontWeight: FontWeight.w800,
          ),
        ),
      );
}
