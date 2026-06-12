import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/catalog_model.dart';
import '../../../core/models/listing_model.dart';
import '../../../core/models/review_model.dart';
import '../../../core/providers/cart_provider.dart';
import '../../../core/models/cart_model.dart';
import '../../../core/utils/currency_utils.dart';
import '../../../core/utils/geo_utils.dart';
import '../../../core/widgets/error_view.dart';
import '../providers/marketplace_provider.dart';
import '../widgets/review_sheet.dart';

class ProductDetailScreen extends ConsumerStatefulWidget {
  final String catalogId;
  const ProductDetailScreen({super.key, required this.catalogId});

  @override
  ConsumerState<ProductDetailScreen> createState() =>
      _ProductDetailScreenState();
}

class _ProductDetailScreenState extends ConsumerState<ProductDetailScreen> {
  int _selectedVariantIdx = 0;
  int _activeImageIdx = 0;

  @override
  Widget build(BuildContext context) {
    final catalogAsync = ref.watch(catalogDetailProvider(widget.catalogId));
    final listingsAsync =
        ref.watch(listingsForCatalogProvider(widget.catalogId));
    final reviewsAsync = ref.watch(productReviewsProvider(widget.catalogId));
    final allProductsState = ref.watch(marketplaceProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: catalogAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorView(message: 'Failed to load product.'),
        data: (catalog) {
          if (catalog == null) {
            return const ErrorView(message: 'Product not found.');
          }

          final variants = catalog.variants;
          final hasVariants = variants != null && variants.length > 1;
          final selectedVariant =
              hasVariants ? variants[_selectedVariantIdx] : null;
          final displayPrice =
              selectedVariant != null ? selectedVariant.price : catalog.price;

          // Similar products: same category, exclude current
          final similarProducts = allProductsState.products
              .where((p) =>
                  p.id != catalog.id &&
                  p.category.toLowerCase() == catalog.category.toLowerCase())
              .take(12)
              .toList();

          return CustomScrollView(
            slivers: [
              // ── Hero image app bar ────────────────────────────────────────
              SliverAppBar(
                expandedHeight: 280,
                pinned: true,
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                flexibleSpace: FlexibleSpaceBar(
                  background: _buildHeroImage(catalog),
                ),
              ),

              SliverToBoxAdapter(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // ── Product header ──────────────────────────────────────
                    _buildProductHeader(catalog, displayPrice),

                    // ── Image thumbnails (gallery) ──────────────────────────
                    if (catalog.images.length > 1)
                      _buildGalleryThumbnails(catalog),

                    // ── Variant / Package Size selector ─────────────────────
                    if (hasVariants)
                      _buildVariantSelector(variants, selectedVariant),

                    const Divider(height: 1, thickness: 1),

                    // ── Description ─────────────────────────────────────────
                    if (catalog.description != null &&
                        catalog.description!.isNotEmpty)
                      _buildDescription(catalog),

                    // ── NPK section (fertilizers) ───────────────────────────
                    if (catalog.hasNpk) _buildNpkSection(catalog),

                    const SizedBox(height: 8),
                    const Divider(height: 1, thickness: 1),

                    // ── Available At Stores ─────────────────────────────────
                    _buildStoresSection(listingsAsync, catalog, displayPrice),

                    const Divider(height: 1, thickness: 1),

                    // ── Reviews ─────────────────────────────────────────────
                    _buildReviewsSection(reviewsAsync, catalog),

                    const Divider(height: 1, thickness: 1),

                    // ── Similar Products ────────────────────────────────────
                    if (similarProducts.isNotEmpty)
                      _buildSimilarProducts(similarProducts),

                    const SizedBox(height: 32),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  // ─────────────────────────── Hero image ────────────────────────────────────

  Widget _buildHeroImage(CatalogModel catalog) {
    final images = catalog.images;
    final imageUrl = images.isNotEmpty ? images[_activeImageIdx] : '';

    Widget imageWidget;
    if (imageUrl.isNotEmpty) {
      imageWidget = CachedNetworkImage(
        imageUrl: imageUrl,
        fit: BoxFit.cover,
        width: double.infinity,
        height: double.infinity,
        errorWidget: (_, _, _) => _placeholderImage(),
      );
    } else {
      imageWidget = _placeholderImage();
    }

    return Stack(
      fit: StackFit.expand,
      children: [
        imageWidget,
        // Discount ribbon
        if (catalog.maxDiscountPct > 0)
          Positioned(
            top: 60,
            left: 0,
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              decoration: const BoxDecoration(
                color: Color(0xFF16A34A),
                borderRadius: BorderRadius.only(
                  topRight: Radius.circular(8),
                  bottomRight: Radius.circular(8),
                ),
              ),
              child: Text(
                'Up to ${catalog.maxDiscountPct.toStringAsFixed(0)}% OFF',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.5,
                ),
              ),
            ),
          ),
        // Premium badge
        Positioned(
          top: 60,
          right: 12,
          child: Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: AppColors.primaryContainer.withValues(alpha: 0.95),
              borderRadius: BorderRadius.circular(20),
            ),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.verified, size: 12, color: AppColors.primary),
                SizedBox(width: 4),
                Text(
                  'Premium Grade',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    color: AppColors.onPrimaryContainer,
                    letterSpacing: 0.5,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _placeholderImage() => Container(
        color: AppColors.primaryContainer.withValues(alpha: 0.3),
        child: const Center(
          child: Icon(Icons.grass, size: 80, color: AppColors.primary),
        ),
      );

  // ─────────────────────────── Gallery ───────────────────────────────────────

  Widget _buildGalleryThumbnails(CatalogModel catalog) {
    return SizedBox(
      height: 72,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        itemCount: catalog.images.length,
        separatorBuilder: (context, index) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final isActive = _activeImageIdx == i;
          return GestureDetector(
            onTap: () => setState(() => _activeImageIdx = i),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 150),
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color:
                      isActive ? AppColors.primary : AppColors.divider,
                  width: isActive ? 2 : 1,
                ),
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(9),
                child: CachedNetworkImage(
                  imageUrl: catalog.images[i],
                  fit: BoxFit.cover,
                  errorWidget: (_, _, _) => const Icon(Icons.image,
                      color: AppColors.onSurfaceVariant),
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  // ─────────────────────────── Product header ────────────────────────────────

  Widget _buildProductHeader(CatalogModel catalog, double displayPrice) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Category chip
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: AppColors.primaryContainer.withValues(alpha: 0.5),
              borderRadius: BorderRadius.circular(4),
            ),
            child: Text(
              catalog.category,
              style: AppTextStyles.caption.copyWith(
                color: AppColors.primary,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.8,
              ),
            ),
          ),
          const SizedBox(height: 8),
          Text(catalog.name, style: AppTextStyles.heading1),
          const SizedBox(height: 8),

          // Rating + reviews
          if ((catalog.rating ?? 0) > 0) ...[
            Row(
              children: [
                const Icon(Icons.star,
                    size: 16, color: AppColors.secondary),
                const SizedBox(width: 4),
                Text(
                  catalog.rating!.toStringAsFixed(1),
                  style: AppTextStyles.bodyMedium
                      .copyWith(fontWeight: FontWeight.w700),
                ),
                if ((catalog.reviewCount ?? 0) > 0) ...[
                  const SizedBox(width: 4),
                  Text(
                    '(${catalog.reviewCount} reviews)',
                    style: AppTextStyles.bodySmall,
                  ),
                ],
              ],
            ),
            const SizedBox(height: 8),
          ],

          // Price
          Text(
            CurrencyUtils.format(displayPrice),
            style: AppTextStyles.priceLarge,
          ),
          if (catalog.sellerCount > 0) ...[
            const SizedBox(height: 4),
            Text(
              'Available at ${catalog.sellerCount} store${catalog.sellerCount != 1 ? 's' : ''}',
              style: AppTextStyles.bodySmall,
            ),
          ],
        ],
      ),
    );
  }

  // ─────────────────────────── Variant selector ──────────────────────────────

  Widget _buildVariantSelector(
      List<VariantModel> variants, VariantModel? selected) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Package Size',
            style: AppTextStyles.caption.copyWith(
              fontWeight: FontWeight.w700,
              letterSpacing: 1,
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: List.generate(variants.length, (i) {
              final v = variants[i];
              final isSelected = _selectedVariantIdx == i;
              final outOfStock = v.stock == 0;
              return GestureDetector(
                onTap: outOfStock
                    ? null
                    : () => setState(() => _selectedVariantIdx = i),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 150),
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(
                    color: isSelected
                        ? AppColors.primary
                        : outOfStock
                            ? AppColors.background
                            : Colors.white,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: isSelected
                          ? AppColors.primary
                          : outOfStock
                              ? AppColors.divider
                              : AppColors.divider,
                      width: isSelected ? 2 : 1,
                    ),
                    boxShadow: isSelected
                        ? [
                            BoxShadow(
                              color: AppColors.primary.withValues(alpha: 0.2),
                              blurRadius: 6,
                              offset: const Offset(0, 2),
                            )
                          ]
                        : null,
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        v.label,
                        style: AppTextStyles.bodySmall.copyWith(
                          color: isSelected
                              ? Colors.white
                              : outOfStock
                                  ? AppColors.onSurfaceVariant
                                      .withValues(alpha: 0.5)
                                  : AppColors.onSurface,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        CurrencyUtils.format(v.price),
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                          color: isSelected
                              ? Colors.white.withValues(alpha: 0.9)
                              : AppColors.secondary,
                        ),
                      ),
                      if (outOfStock)
                        Text(
                          'Out of stock',
                          style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.w700,
                            color: AppColors.error.withValues(alpha: 0.7),
                          ),
                        ),
                    ],
                  ),
                ),
              );
            }),
          ),
        ],
      ),
    );
  }

  // ─────────────────────────── Description ───────────────────────────────────

  Widget _buildDescription(CatalogModel catalog) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Description', style: AppTextStyles.heading3),
          const SizedBox(height: 8),
          Text(catalog.description!, style: AppTextStyles.body),
        ],
      ),
    );
  }

  // ─────────────────────────── NPK ───────────────────────────────────────────

  Widget _buildNpkSection(CatalogModel catalog) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Composition (NPK)', style: AppTextStyles.heading3),
          const SizedBox(height: 12),
          Row(
            children: [
              _NpkChip('N', catalog.nitrogen!, Colors.blue),
              const SizedBox(width: 12),
              _NpkChip('P', catalog.phosphorus!, Colors.orange),
              const SizedBox(width: 12),
              _NpkChip('K', catalog.potassium!, Colors.purple),
            ],
          ),
        ],
      ),
    );
  }

  // ─────────────────────────── Stores section ────────────────────────────────

  Widget _buildStoresSection(
    AsyncValue<List<dynamic>> listingsAsync,
    CatalogModel catalog,
    double displayPrice,
  ) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.store_outlined,
                  size: 18, color: AppColors.primary),
              const SizedBox(width: 6),
              Text('Available at these Stores',
                  style: AppTextStyles.heading3),
            ],
          ),
          const SizedBox(height: 12),
          listingsAsync.when(
            loading: () => const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: CircularProgressIndicator(),
              ),
            ),
            error: (_, _) => const ErrorView(
                message: 'Failed to load sellers.'),
            data: (listingsRaw) {
              final listings = listingsRaw.cast<ListingModel>();
              if (listings.isEmpty) {
                return const _EmptyListings();
              }
              final sellerDiscounts = catalog.sellerDiscounts;
              return Column(
                children: listings
                    .map((listing) => _SellerTile(
                          listing: listing,
                          catalogId: catalog.id,
                          catalogName: catalog.name,
                          catalogImage: catalog.imageUrl,
                          displayPrice: displayPrice,
                          // Match the store by phone first (reliable) then storeId.
                          sellerDiscountPct:
                              sellerDiscounts[listing.sellerPhone] ??
                                  sellerDiscounts[listing.id] ??
                                  0.0,
                        ))
                    .toList(),
              );
            },
          ),
        ],
      ),
    );
  }

  // ─────────────────────────── Reviews section ───────────────────────────────

  Widget _buildReviewsSection(
      AsyncValue<List<ReviewModel>> reviewsAsync, CatalogModel catalog) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  const Icon(Icons.star_outlined,
                      size: 18, color: AppColors.secondary),
                  const SizedBox(width: 6),
                  Text('Customer Reviews', style: AppTextStyles.heading3),
                ],
              ),
              ref.watch(userProductReviewProvider(widget.catalogId)).when(
                data: (userReview) {
                  return TextButton.icon(
                    onPressed: () {
                      showReviewBottomSheet(
                        context: context,
                        ref: ref,
                        catalogId: widget.catalogId,
                        existingReview: userReview,
                      );
                    },
                    icon: Icon(
                      userReview != null ? Icons.edit : Icons.rate_review,
                      size: 16,
                      color: AppColors.primary,
                    ),
                    label: Text(
                      userReview != null ? 'Edit Review' : 'Write Review',
                      style: AppTextStyles.caption.copyWith(
                        color: AppColors.primary,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  );
                },
                loading: () => const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
                error: (e, s) => const SizedBox.shrink(),
              ),
            ],
          ),
          const SizedBox(height: 12),
          reviewsAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (_, _) =>
                const ErrorView(message: 'Could not load reviews.'),
            data: (reviews) {
              if (reviews.isEmpty) {
                return Padding(
                  padding: const EdgeInsets.all(24),
                  child: Center(
                    child: Column(
                      children: [
                        const Icon(Icons.star_border_outlined,
                            size: 40, color: AppColors.primaryContainer),
                        const SizedBox(height: 8),
                        Text('No reviews yet',
                            style: AppTextStyles.body),
                      ],
                    ),
                  ),
                );
              }

              // Rating summary
              final avg = catalog.rating ?? 0;
              final count = catalog.reviewCount ?? reviews.length;

              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Rating summary card
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.divider),
                    ),
                    child: Row(
                      children: [
                        Column(
                          children: [
                            Text(
                              avg.toStringAsFixed(1),
                              style: const TextStyle(
                                fontSize: 36,
                                fontWeight: FontWeight.w800,
                                color: AppColors.onSurface,
                              ),
                            ),
                            Row(
                              mainAxisSize: MainAxisSize.min,
                              children: List.generate(
                                  5,
                                  (i) => Icon(
                                        i < avg.round()
                                            ? Icons.star
                                            : Icons.star_border,
                                        size: 16,
                                        color: AppColors.secondary,
                                      )),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              '$count Review${count != 1 ? 's' : ''}',
                              style: AppTextStyles.bodySmall,
                            ),
                          ],
                        ),
                        const SizedBox(width: 24),
                        Expanded(
                          child: Column(
                            children: [5, 4, 3, 2, 1]
                                .map((star) => _RatingBar(
                                      star: star,
                                      reviews: reviews,
                                      total: reviews.length,
                                    ))
                                .toList(),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  ...reviews.map((r) => _ReviewTile(review: r)),
                ],
              );
            },
          ),
        ],
      ),
    );
  }

  // ─────────────────────────── Similar products ──────────────────────────────

  Widget _buildSimilarProducts(List<CatalogModel> products) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 0, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Similar Products', style: AppTextStyles.heading3),
                    const SizedBox(height: 2),
                    Text('Other products in the same category',
                        style: AppTextStyles.bodySmall),
                  ],
                ),
                TextButton(
                  onPressed: () => context.go('/marketplace'),
                  child: Text(
                    'View All',
                    style: AppTextStyles.caption.copyWith(
                      color: AppColors.primary,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.8,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 200,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.only(right: 16),
              itemCount: products.length,
              separatorBuilder: (context, index) => const SizedBox(width: 12),
              itemBuilder: (_, i) {
                final p = products[i];
                return GestureDetector(
                  onTap: () => context.go('/product/${p.id}'),
                  child: Container(
                    width: 140,
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.divider),
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.cardShadow,
                          blurRadius: 4,
                          offset: const Offset(0, 2),
                        ),
                      ],
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        ClipRRect(
                          borderRadius: const BorderRadius.vertical(
                              top: Radius.circular(11)),
                          child: SizedBox(
                            height: 110,
                            width: double.infinity,
                            child: p.hasImages
                                ? CachedNetworkImage(
                                    imageUrl: p.imageUrl,
                                    fit: BoxFit.cover,
                                    errorWidget: (_, _, _) =>
                                        Container(
                                          color: AppColors.primaryContainer
                                              .withValues(alpha: 0.3),
                                          child: const Icon(Icons.grass,
                                              color: AppColors.primary,
                                              size: 40),
                                        ),
                                  )
                                : Container(
                                    color: AppColors.primaryContainer
                                        .withValues(alpha: 0.3),
                                    child: const Icon(Icons.grass,
                                        color: AppColors.primary, size: 40),
                                  ),
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.all(8),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                p.category,
                                style: TextStyle(
                                  fontSize: 9,
                                  fontWeight: FontWeight.w800,
                                  color: AppColors.primary,
                                  letterSpacing: 0.8,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                p.name,
                                style: AppTextStyles.bodySmall.copyWith(
                                  color: AppColors.onSurface,
                                  fontWeight: FontWeight.w600,
                                ),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                              const SizedBox(height: 4),
                              Text(
                                CurrencyUtils.format(p.price),
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w800,
                                  color: AppColors.secondary,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────── NPK Chip ──────────────────────────────────────

class _NpkChip extends StatelessWidget {
  final String label;
  final double value;
  final Color color;

  const _NpkChip(this.label, this.value, this.color);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Column(
        children: [
          Text(label,
              style: AppTextStyles.caption
                  .copyWith(color: color, fontWeight: FontWeight.w700)),
          Text('${value.toInt()}%',
              style: AppTextStyles.bodyMedium.copyWith(color: color)),
        ],
      ),
    );
  }
}

// ─────────────────────────── Seller Tile ───────────────────────────────────

class _SellerTile extends ConsumerStatefulWidget {
  final ListingModel listing;
  final String catalogId;
  final String catalogName;
  final String catalogImage;
  final double displayPrice;

  /// This store's effective discount % resolved from the catalog's
  /// `sellerDiscounts` map (web's source of truth). Used as a fallback when the
  /// availability[] entry hasn't been mirrored with a discount yet.
  final double sellerDiscountPct;

  const _SellerTile({
    required this.listing,
    required this.catalogId,
    required this.catalogName,
    required this.catalogImage,
    required this.displayPrice,
    this.sellerDiscountPct = 0,
  });

  @override
  ConsumerState<_SellerTile> createState() => _SellerTileState();
}

class _SellerTileState extends ConsumerState<_SellerTile> {
  bool _expanded = false;

  /// Effective price for this store, resolving both percentage and fixed_amount
  /// discounts. Uses listing's own discount first, then catalog per-seller map.
  double get _effectivePrice {
    final listing = widget.listing;
    if (listing.discount != null && listing.discount!.isCurrentlyActive) {
      return (listing.price - listing.discount!.discountAmount(listing.price))
          .clamp(0.0, double.infinity);
    }
    // Fallback to catalog-level percentage discount map
    final pct = widget.sellerDiscountPct;
    return pct > 0 ? listing.price * (1 - pct / 100) : listing.price;
  }

  /// Percentage for display badge (0 when fixed_amount — shown differently).
  double get _discountPct {
    final listing = widget.listing;
    if (listing.discount != null && listing.discount!.isCurrentlyActive) {
      if (listing.discount!.type == 'fixed_amount') return 0.0;
      return listing.discount!.percentage;
    }
    return widget.sellerDiscountPct;
  }

  bool get _hasDiscount {
    final listing = widget.listing;
    if (listing.discount != null && listing.discount!.isCurrentlyActive) return true;
    return widget.sellerDiscountPct > 0;
  }

  @override
  Widget build(BuildContext context) {
    final listing = widget.listing;
    final discountPct = _discountPct;
    final hasDiscount = _hasDiscount;
    final originalPrice = listing.price;
    final effectivePrice = hasDiscount ? _effectivePrice : originalPrice;

    return GestureDetector(
      onTap: () => setState(() => _expanded = !_expanded),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        margin: const EdgeInsets.only(bottom: 10),
        decoration: BoxDecoration(
          color: _expanded
              ? Colors.white
              : hasDiscount
                  ? const Color(0xFFF0FDF4)
                  : Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: _expanded
                ? AppColors.primary
                : hasDiscount
                    ? const Color(0xFF86EFAC)
                    : AppColors.divider,
            width: _expanded ? 1.5 : 1,
          ),
          boxShadow: _expanded
              ? [
                  BoxShadow(
                    color: AppColors.primary.withValues(alpha: 0.08),
                    blurRadius: 8,
                    offset: const Offset(0, 2),
                  ),
                ]
              : [
                  BoxShadow(
                    color: AppColors.cardShadow,
                    blurRadius: 4,
                    offset: const Offset(0, 1),
                  ),
                ],
        ),
        child: Column(
          children: [
            // ── Summary (tap anywhere on the card to expand) ──────────────
            Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Store icon
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: _expanded
                              ? AppColors.primary
                              : AppColors.surfaceVariant,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Icon(
                          Icons.store_outlined,
                          size: 20,
                          color: _expanded
                              ? Colors.white
                              : AppColors.onSurfaceVariant,
                        ),
                      ),
                      const SizedBox(width: 12),

                      // Store name + meta — takes the full remaining width so
                      // long names wrap to a second line instead of clipping.
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(
                                  child: Text(
                                    listing.sellerName.trim().isNotEmpty
                                        ? listing.sellerName.trim()
                                        : (listing.sellerPhone.trim().isNotEmpty
                                            ? listing.sellerPhone.trim()
                                            : 'Store'),
                                    style: AppTextStyles.bodyMedium.copyWith(
                                        fontWeight: FontWeight.w700),
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                                if (hasDiscount) ...[
                                  const SizedBox(width: 6),
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 6, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: const Color(0xFF16A34A),
                                      borderRadius: BorderRadius.circular(20),
                                    ),
                                    child: Text(
                                      '${discountPct.toStringAsFixed(0)}% OFF',
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 9,
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                  ),
                                ],
                              ],
                            ),
                            const SizedBox(height: 6),

                            // Distance + status + rating
                            Wrap(
                              spacing: 10,
                              runSpacing: 4,
                              crossAxisAlignment: WrapCrossAlignment.center,
                              children: [
                                if (listing.distanceKm != null)
                                  Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      const Icon(Icons.location_on,
                                          size: 11,
                                          color: AppColors.onSurfaceVariant),
                                      const SizedBox(width: 2),
                                      Text(
                                        GeoUtils.formatDistance(
                                            listing.distanceKm!),
                                        style: AppTextStyles.caption,
                                      ),
                                    ],
                                  ),
                                Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Container(
                                      width: 6,
                                      height: 6,
                                      decoration: const BoxDecoration(
                                        color: Color(0xFF16A34A),
                                        shape: BoxShape.circle,
                                      ),
                                    ),
                                    const SizedBox(width: 4),
                                    Text('Active',
                                        style: AppTextStyles.caption),
                                  ],
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),

                      // Expand/collapse chevron
                      Icon(
                        _expanded
                            ? Icons.keyboard_arrow_up
                            : Icons.keyboard_arrow_down,
                        size: 22,
                        color: AppColors.onSurfaceVariant,
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),

                  // Price + stock on their own row so they never crowd the name
                  Row(
                    children: [
                      if (hasDiscount) ...[
                        Text(
                          CurrencyUtils.format(effectivePrice),
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                            color: Color(0xFF15803D),
                          ),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          CurrencyUtils.format(originalPrice),
                          style: AppTextStyles.caption.copyWith(
                            decoration: TextDecoration.lineThrough,
                          ),
                        ),
                      ] else
                        Text(
                          CurrencyUtils.format(effectivePrice),
                          style: AppTextStyles.price,
                        ),
                      const Spacer(),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: listing.isInStock
                              ? AppColors.success.withValues(alpha: 0.1)
                              : AppColors.error.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          listing.isInStock ? 'In Stock' : 'Out of Stock',
                          style: AppTextStyles.caption.copyWith(
                            color: listing.isInStock
                                ? AppColors.success
                                : AppColors.error,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            // ── "Tap for details" hint (collapsed only) ───────────────────
            if (!_expanded)
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      'Tap for store details & order',
                      style: AppTextStyles.caption
                          .copyWith(color: AppColors.primary),
                    ),
                    const SizedBox(width: 2),
                    const Icon(Icons.keyboard_arrow_down,
                        size: 14, color: AppColors.primary),
                  ],
                ),
              ),

            // ── Expanded details + actions (revealed on tap) ──────────────
            if (_expanded) ...[
              const Divider(height: 1, thickness: 1),
              Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (listing.sellerAddress != null)
                      detailRow(
                          Icons.location_on_outlined,
                          listing.sellerAddress!),
                    if (_isDialable(listing.sellerPhone)) ...[
                      const SizedBox(height: 6),
                      detailRow(Icons.phone_outlined, listing.sellerPhone),
                    ],
                    if (hasDiscount) ...[
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF0FDF4),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                              color: const Color(0xFF86EFAC)),
                        ),
                        child: Column(
                          children: [
                            priceRow('Original price',
                                CurrencyUtils.format(originalPrice),
                                strikethrough: true),
                            const SizedBox(height: 4),
                            priceRow(
                              'Discount (${discountPct.toStringAsFixed(0)}%)',
                              '-${CurrencyUtils.format(originalPrice - effectivePrice)}',
                              valueColor: const Color(0xFF16A34A),
                            ),
                            const Divider(height: 12),
                            priceRow(
                              'You pay',
                              CurrencyUtils.format(effectivePrice),
                              bold: true,
                              valueColor: const Color(0xFF15803D),
                            ),
                          ],
                        ),
                      ),
                    ],

                    // ── Action buttons ────────────────────────────────────
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        // Map button — geo point or address search fallback
                        if (listing.hasLocation ||
                            (listing.sellerAddress?.trim().isNotEmpty ??
                                false)) ...[
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: () => _openMap(listing),
                              icon: const Icon(Icons.map_outlined, size: 16),
                              label: const Text('Map'),
                              style: OutlinedButton.styleFrom(
                                foregroundColor: AppColors.primary,
                                side: const BorderSide(
                                    color: AppColors.primary),
                                padding:
                                    const EdgeInsets.symmetric(vertical: 10),
                                textStyle: AppTextStyles.caption.copyWith(
                                    fontWeight: FontWeight.w700, fontSize: 12),
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                        ],
                        // Call button — only for dialable numbers (UIDs leak
                        // into sellerPhone on some legacy docs)
                        if (_isDialable(listing.sellerPhone)) ...[
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: () =>
                                  _callStore(listing.sellerPhone),
                              icon:
                                  const Icon(Icons.phone_outlined, size: 16),
                              label: const Text('Call'),
                              style: OutlinedButton.styleFrom(
                                foregroundColor: AppColors.primary,
                                side: const BorderSide(
                                    color: AppColors.primary),
                                padding:
                                    const EdgeInsets.symmetric(vertical: 10),
                                textStyle: AppTextStyles.caption.copyWith(
                                    fontWeight: FontWeight.w700, fontSize: 12),
                              ),
                            ),
                          ),
                          if (listing.isInStock && listing.isOnline)
                            const SizedBox(width: 8),
                        ],
                        // Order button — only if seller sells online
                        if (listing.isInStock && listing.isOnline)
                          Expanded(
                            child: FilledButton.icon(
                              onPressed: () => _addToCart(context),
                              icon: const Icon(Icons.shopping_cart_outlined,
                                  size: 16),
                              label: const Text('Order'),
                              style: FilledButton.styleFrom(
                                backgroundColor: AppColors.primary,
                                padding:
                                    const EdgeInsets.symmetric(vertical: 10),
                                textStyle: AppTextStyles.caption.copyWith(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 12,
                                    color: Colors.white),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  static bool _isDialable(String phone) {
    final stripped =
        phone.startsWith('+91') ? phone.substring(3) : phone;
    return RegExp(r'^\d{10,13}$').hasMatch(stripped);
  }

  void _callStore(String phone) async {
    final url = Uri.parse('tel:$phone');
    if (await canLaunchUrl(url)) {
      await launchUrl(url);
    }
  }

  void _openMap(ListingModel listing) async {
    // Prefer exact coordinates; fall back to searching the store address/name.
    final query = listing.hasLocation
        ? '${listing.sellerLat},${listing.sellerLng}'
        : Uri.encodeComponent(
            [listing.sellerName, listing.sellerAddress ?? '']
                .where((s) => s.trim().isNotEmpty)
                .join(' '));
    final url =
        Uri.parse('https://www.google.com/maps/search/?api=1&query=$query');
    if (await canLaunchUrl(url)) {
      await launchUrl(url, mode: LaunchMode.externalApplication);
    }
  }

  void _addToCart(BuildContext context) {
    final listing = widget.listing;
    ref.read(cartProvider.notifier).addItem(
          CartItemModel(
            catalogId: widget.catalogId,
            catalogName: widget.catalogName,
            catalogImage:
                widget.catalogImage.isNotEmpty ? widget.catalogImage : null,
            listingId: listing.id,
            sellerPhone: listing.sellerPhone,
            sellerName: listing.sellerName,
            price: _effectivePrice,
            quantity: 1,
          ),
        );
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Added ${widget.catalogName} to cart'),
        backgroundColor: AppColors.primary,
        action: SnackBarAction(
          label: 'View Cart',
          textColor: Colors.white,
          onPressed: () => context.go('/cart'),
        ),
      ),
    );
  }
}

Widget detailRow(IconData icon, String text) => Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 14, color: AppColors.onSurfaceVariant),
          const SizedBox(width: 6),
          Expanded(
              child: Text(text,
                  style: AppTextStyles.bodySmall
                      .copyWith(color: AppColors.onSurface))),
        ],
      ),
    );

Widget priceRow(
  String label,
  String value, {
  bool strikethrough = false,
  bool bold = false,
  Color? valueColor,
}) =>
    Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label,
            style: AppTextStyles.bodySmall
                .copyWith(fontWeight: bold ? FontWeight.w700 : null)),
        Text(
          value,
          style: AppTextStyles.bodySmall.copyWith(
            fontWeight: bold ? FontWeight.w700 : null,
            color: valueColor ?? AppColors.onSurface,
            decoration:
                strikethrough ? TextDecoration.lineThrough : null,
          ),
        ),
      ],
    );

// ─────────────────────────── Rating bar ────────────────────────────────────

class _RatingBar extends StatelessWidget {
  final int star;
  final List<ReviewModel> reviews;
  final int total;

  const _RatingBar({
    required this.star,
    required this.reviews,
    required this.total,
  });

  @override
  Widget build(BuildContext context) {
    final count =
        reviews.where((r) => r.rating.round() == star).length;
    final fraction = total > 0 ? count / total : 0.0;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          Text('$star',
              style: AppTextStyles.caption
                  .copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(width: 2),
          const Icon(Icons.star, size: 10, color: AppColors.secondary),
          const SizedBox(width: 6),
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: fraction,
                minHeight: 6,
                backgroundColor: AppColors.divider,
                valueColor: const AlwaysStoppedAnimation<Color>(
                    AppColors.secondary),
              ),
            ),
          ),
          const SizedBox(width: 6),
          SizedBox(
            width: 20,
            child: Text('$count',
                style: AppTextStyles.caption,
                textAlign: TextAlign.right),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────── Empty listings ────────────────────────────────

class _EmptyListings extends StatelessWidget {
  const _EmptyListings();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.store_outlined,
                size: 48, color: AppColors.primaryContainer),
            SizedBox(height: 12),
            Text('No stores carry this product yet',
                style: AppTextStyles.body, textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────── Review tile ───────────────────────────────────

class _ReviewTile extends StatelessWidget {
  final ReviewModel review;
  const _ReviewTile({required this.review});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  CircleAvatar(
                    radius: 16,
                    backgroundColor:
                        AppColors.primaryContainer.withValues(alpha: 0.5),
                    child: Text(
                      review.reviewerName.isNotEmpty
                          ? review.reviewerName[0].toUpperCase()
                          : 'A',
                      style: const TextStyle(
                        color: AppColors.primary,
                        fontWeight: FontWeight.w700,
                        fontSize: 13,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(review.reviewerName,
                          style: AppTextStyles.bodyMedium),
                      Text('Verified Buyer',
                          style: AppTextStyles.caption.copyWith(
                            color: AppColors.success,
                            fontWeight: FontWeight.w600,
                          )),
                    ],
                  ),
                ],
              ),
              Row(
                children: List.generate(
                  5,
                  (i) => Icon(
                    i < review.rating.round()
                        ? Icons.star
                        : Icons.star_border,
                    size: 14,
                    color: AppColors.secondary,
                  ),
                ),
              ),
            ],
          ),
          if (review.reviewText != null &&
              review.reviewText!.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(review.reviewText!, style: AppTextStyles.body),
          ],
          if (review.createdAt != null) ...[
            const SizedBox(height: 6),
            Text(
              DateFormat('dd MMM yyyy').format(review.createdAt!),
              style: AppTextStyles.caption.copyWith(
                  color: AppColors.onSurfaceVariant),
            ),
          ],
        ],
      ),
    );
  }
}
