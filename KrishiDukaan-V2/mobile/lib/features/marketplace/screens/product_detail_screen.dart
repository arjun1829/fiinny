import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/listing_model.dart';
import '../../../core/models/review_model.dart';
import '../../../core/providers/cart_provider.dart';
import '../../../core/models/cart_model.dart';
import '../../../core/utils/currency_utils.dart';
import '../../../core/utils/geo_utils.dart';
import '../../../core/widgets/error_view.dart';
import '../providers/marketplace_provider.dart';

class ProductDetailScreen extends ConsumerStatefulWidget {
  final String catalogId;
  const ProductDetailScreen({super.key, required this.catalogId});

  @override
  ConsumerState<ProductDetailScreen> createState() =>
      _ProductDetailScreenState();
}

class _ProductDetailScreenState extends ConsumerState<ProductDetailScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabs;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final catalogAsync = ref.watch(catalogDetailProvider(widget.catalogId));
    final listingsAsync =
        ref.watch(listingsForCatalogProvider(widget.catalogId));

    return Scaffold(
      backgroundColor: AppColors.background,
      body: catalogAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorView(message: 'Failed to load product.'),
        data: (catalog) {
          if (catalog == null) {
            return const ErrorView(message: 'Product not found.');
          }
          return CustomScrollView(
            slivers: [
              // Image app bar
              SliverAppBar(
                expandedHeight: 260,
                pinned: true,
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                flexibleSpace: FlexibleSpaceBar(
                  background: catalog.hasImages
                      ? CachedNetworkImage(
                          imageUrl: catalog.imageUrl,
                          fit: BoxFit.cover,
                          errorWidget: (_, _, _) => Container(
                            color: AppColors.primaryContainer,
                            child: const Icon(Icons.grass,
                                size: 80, color: AppColors.primary),
                          ),
                        )
                      : Container(
                          color: AppColors.primaryContainer,
                          child: const Icon(Icons.grass,
                              size: 80, color: AppColors.primary),
                        ),
                ),
              ),

              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Category + name
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color:
                              AppColors.primaryContainer.withValues(alpha: 0.5),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(catalog.category,
                            style: AppTextStyles.caption.copyWith(
                                color: AppColors.primary,
                                fontWeight: FontWeight.w600)),
                      ),
                      const SizedBox(height: 8),
                      Text(catalog.name, style: AppTextStyles.heading1),
                      const SizedBox(height: 4),
                      Text(
                        CurrencyUtils.format(catalog.price),
                        style: AppTextStyles.priceLarge,
                      ),
                      if (catalog.sellerCount > 0) ...[
                        const SizedBox(height: 4),
                        Text(
                          'Available at ${catalog.sellerCount} store${catalog.sellerCount != 1 ? 's' : ''}',
                          style: AppTextStyles.bodySmall,
                        ),
                      ],

                      // NPK section
                      if (catalog.hasNpk) ...[
                        const SizedBox(height: 20),
                        Text('Composition (NPK)',
                            style: AppTextStyles.heading3),
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

                      // Description
                      if (catalog.description != null &&
                          catalog.description!.isNotEmpty) ...[
                        const SizedBox(height: 20),
                        Text('Description', style: AppTextStyles.heading3),
                        const SizedBox(height: 8),
                        Text(catalog.description!, style: AppTextStyles.body),
                      ],

                      // Tabs: Available At | Details
                      const SizedBox(height: 24),
                      TabBar(
                        controller: _tabs,
                        labelColor: AppColors.primary,
                        unselectedLabelColor: AppColors.onSurfaceVariant,
                        indicatorColor: AppColors.primary,
                        tabs: const [
                          Tab(text: 'Available At'),
                          Tab(text: 'Reviews'),
                          Tab(text: 'Details'),
                        ],
                      ),
                    ],
                  ),
                ),
              ),

              // Tab content
              SliverFillRemaining(
                hasScrollBody: false,
                child: SizedBox(
                  height: 400,
                  child: TabBarView(
                    controller: _tabs,
                    children: [
                      // Available At tab
                      listingsAsync.when(
                        loading: () => const Center(
                            child: CircularProgressIndicator()),
                        error: (_, _) => const ErrorView(
                            message: 'Failed to load sellers.'),
                        data: (listingsRaw) {
                          final listings =
                              listingsRaw.cast<ListingModel>();
                          if (listings.isEmpty) {
                            return const EmptyListings();
                          }
                          return ListView.builder(
                            padding: const EdgeInsets.all(16),
                            shrinkWrap: true,
                            itemCount: listings.length,
                            itemBuilder: (_, i) => _SellerTile(
                              listing: listings[i],
                              catalogId: catalog.id,
                              catalogName: catalog.name,
                              catalogImage: catalog.imageUrl,
                            ),
                          );
                        },
                      ),
                      // Reviews tab
                      _ReviewsTab(catalogId: catalog.id),
                      // Details tab
                      Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _DetailRow('Category', catalog.category),
                            if (catalog.rating != null)
                              _DetailRow('Rating',
                                  '${catalog.rating!.toStringAsFixed(1)} ⭐ (${catalog.reviewCount ?? 0} reviews)'),
                            _DetailRow('Sellers',
                                '${catalog.sellerCount} stores carrying this product'),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

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

class _DetailRow extends StatelessWidget {
  final String label;
  final String value;

  const _DetailRow(this.label, this.value);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 100,
            child: Text(label,
                style: AppTextStyles.bodySmall
                    .copyWith(fontWeight: FontWeight.w600)),
          ),
          Expanded(child: Text(value, style: AppTextStyles.body)),
        ],
      ),
    );
  }
}

class _SellerTile extends ConsumerWidget {
  final ListingModel listing;
  final String catalogId;
  final String catalogName;
  final String catalogImage;

  const _SellerTile({
    required this.listing,
    required this.catalogId,
    required this.catalogName,
    required this.catalogImage,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(listing.sellerName, style: AppTextStyles.bodyMedium),
                  if (listing.sellerAddress != null)
                    Text(listing.sellerAddress!,
                        style: AppTextStyles.bodySmall,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Text(
                        CurrencyUtils.format(listing.effectivePrice),
                        style: AppTextStyles.price,
                      ),
                      if (listing.distanceKm != null) ...[
                        const SizedBox(width: 8),
                        const Icon(Icons.location_on,
                            size: 12, color: AppColors.onSurfaceVariant),
                        Text(GeoUtils.formatDistance(listing.distanceKm!),
                            style: AppTextStyles.caption),
                      ],
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 2),
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
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            if (listing.isInStock)
              FilledButton(
                onPressed: () {
                  ref.read(cartProvider.notifier).addItem(
                        CartItemModel(
                          catalogId: catalogId,
                          catalogName: catalogName,
                          catalogImage:
                              catalogImage.isNotEmpty ? catalogImage : null,
                          listingId: listing.id,
                          sellerPhone: listing.sellerPhone,
                          sellerName: listing.sellerName,
                          price: listing.effectivePrice,
                          quantity: 1,
                        ),
                      );
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: const Text('Added to cart'),
                      backgroundColor: AppColors.primary,
                      action: SnackBarAction(
                        label: 'View Cart',
                        textColor: Colors.white,
                        onPressed: () => context.go('/cart'),
                      ),
                    ),
                  );
                },
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                ),
                child: const Text('Add'),
              ),
          ],
        ),
      ),
    );
  }
}

class EmptyListings extends StatelessWidget {
  const EmptyListings({super.key});

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.store_outlined, size: 48, color: AppColors.primaryContainer),
            SizedBox(height: 12),
            Text('No stores carry this product yet',
                style: AppTextStyles.body, textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}

class _ReviewsTab extends ConsumerWidget {
  final String catalogId;
  const _ReviewsTab({required this.catalogId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reviewsAsync = ref.watch(productReviewsProvider(catalogId));
    return reviewsAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (_, _) =>
          const ErrorView(message: 'Could not load reviews.'),
      data: (reviews) {
        if (reviews.isEmpty) {
          return const Center(
            child: Padding(
              padding: EdgeInsets.all(32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.star_border_outlined,
                      size: 48, color: AppColors.primaryContainer),
                  SizedBox(height: 12),
                  Text('No reviews yet',
                      style: AppTextStyles.body,
                      textAlign: TextAlign.center),
                ],
              ),
            ),
          );
        }
        return ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: reviews.length,
          itemBuilder: (_, i) => _ReviewTile(review: reviews[i]),
        );
      },
    );
  }
}

class _ReviewTile extends StatelessWidget {
  final ReviewModel review;
  const _ReviewTile({required this.review});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(review.reviewerName,
                    style: AppTextStyles.bodyMedium),
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
              const SizedBox(height: 6),
              Text(review.reviewText!, style: AppTextStyles.body),
            ],
            if (review.createdAt != null) ...[
              const SizedBox(height: 4),
              Text(
                DateFormat('dd MMM yyyy').format(review.createdAt!),
                style: AppTextStyles.caption.copyWith(
                    color: AppColors.onSurfaceVariant),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
