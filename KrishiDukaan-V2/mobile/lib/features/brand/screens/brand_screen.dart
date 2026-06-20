import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/brand_model.dart';
import '../../../core/models/catalog_model.dart';
import '../../../core/utils/currency_utils.dart';
import '../../../core/widgets/error_view.dart';
import '../../../core/models/store_model.dart';
import '../../marketplace/providers/marketplace_provider.dart';
import '../../marketplace/widgets/review_sheet.dart';
import '../data/brand_repository.dart';

final _brandRepo = BrandRepository();

final _brandProvider = FutureProvider.family<BrandModel?, String>((ref, phone) {
  return _brandRepo.fetchBrandByPhone(phone);
});

final _brandProductsProvider =
    FutureProvider.family<List<CatalogModel>, String>((ref, phone) {
      return _brandRepo.fetchBrandProducts(phone);
    });

final _brandRetailersProvider =
    FutureProvider.family<List<BrandRetailerModel>, String>((ref, phone) {
      return _brandRepo.fetchBrandRetailers(phone);
    });

class BrandScreen extends ConsumerWidget {
  final String manufacturerPhone;
  const BrandScreen({super.key, required this.manufacturerPhone});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brandAsync = ref.watch(_brandProvider(manufacturerPhone));
    final productsAsync = ref.watch(_brandProductsProvider(manufacturerPhone));
    final retailersAsync = ref.watch(_brandRetailersProvider(manufacturerPhone));

    return Scaffold(
      backgroundColor: AppColors.background,
      body: brandAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => const ErrorView(message: 'Brand not found.'),
        data: (brand) {
          if (brand == null) {
            return const ErrorView(message: 'Brand not found.');
          }

          return CustomScrollView(
            slivers: [
              // Brand header
              SliverAppBar(
                expandedHeight: 200,
                pinned: true,
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                flexibleSpace: FlexibleSpaceBar(
                  background: Stack(
                    fit: StackFit.expand,
                    children: [
                      if (brand.coverImage != null)
                        CachedNetworkImage(
                          memCacheWidth: 1000,
                          imageUrl: brand.coverImage!,
                          fit: BoxFit.cover,
                          errorWidget: (_, _, _) =>
                              Container(color: AppColors.primary),
                        )
                      else
                        Container(
                          decoration: const BoxDecoration(
                            gradient: LinearGradient(
                              colors: [
                                AppColors.primary,
                                AppColors.primaryLight,
                              ],
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                            ),
                          ),
                        ),
                      // Logo overlay
                      if (brand.logo != null)
                        Positioned(
                          bottom: 16,
                          left: 16,
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(12),
                            child: CachedNetworkImage(
                              memCacheWidth: 1000,
                              imageUrl: brand.logo!,
                              width: 64,
                              height: 64,
                              fit: BoxFit.cover,
                              errorWidget: (_, _, _) => const SizedBox.shrink(),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),

              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(brand.businessName, style: AppTextStyles.heading1),
                      if (brand.tagline != null) ...[
                        const SizedBox(height: 4),
                        Text(
                          brand.tagline!,
                          style: AppTextStyles.body.copyWith(
                            color: AppColors.onSurfaceVariant,
                            fontStyle: FontStyle.italic,
                          ),
                        ),
                      ],
                      if (brand.description != null) ...[
                        const SizedBox(height: 12),
                        Text(brand.description!, style: AppTextStyles.body),
                      ],
                      const SizedBox(height: 12),
                      ref
                          .watch(storeReviewsProvider(brand.phone))
                          .when(
                            data: (reviews) {
                              final avg = reviews.isEmpty
                                  ? 0.0
                                  : reviews.fold<double>(
                                          0,
                                          (sum, r) => sum + r.rating,
                                        ) /
                                        reviews.length;
                              final count = reviews.length;

                              return Row(
                                children: [
                                  if (count > 0) ...[
                                    Row(
                                      children: List.generate(
                                        5,
                                        (i) => Icon(
                                          i < avg.round()
                                              ? Icons.star
                                              : Icons.star_border,
                                          size: 16,
                                          color: AppColors.secondary,
                                        ),
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    Text(
                                      avg.toStringAsFixed(1),
                                      style: AppTextStyles.bodyMedium.copyWith(
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                    const SizedBox(width: 4),
                                    Text(
                                      '($count)',
                                      style: AppTextStyles.bodyMedium.copyWith(
                                        color: AppColors.onSurfaceVariant,
                                      ),
                                    ),
                                    const SizedBox(width: 16),
                                  ],
                                  TextButton.icon(
                                    onPressed: () {
                                      final store = StoreModel(
                                        id: brand.phone,
                                        name: brand.businessName,
                                        phone: brand.phone,
                                        logo: brand.logo,
                                        averageRating: avg,
                                        totalReviews: count,
                                      );
                                      showStoreReviewsBottomSheet(
                                        context: context,
                                        ref: ref,
                                        store: store,
                                      );
                                    },
                                    icon: const Icon(
                                      Icons.rate_review,
                                      size: 16,
                                    ),
                                    label: Text(
                                      count > 0
                                          ? 'View Reviews'
                                          : 'Write a Review',
                                      style: const TextStyle(
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                    style: TextButton.styleFrom(
                                      foregroundColor: AppColors.primary,
                                      padding: EdgeInsets.zero,
                                      minimumSize: const Size(50, 30),
                                      tapTargetSize:
                                          MaterialTapTargetSize.shrinkWrap,
                                    ),
                                  ),
                                ],
                              );
                            },
                            loading: () => const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            ),
                            error: (e, s) => const SizedBox.shrink(),
                          ),
                      const SizedBox(height: 24),

                      // Products section
                      Text('Products', style: AppTextStyles.heading3),
                      const SizedBox(height: 12),

                      productsAsync.when(
                        loading: () =>
                            const Center(child: CircularProgressIndicator()),
                        error: (_, _) => const Text('Could not load products.'),
                        data: (products) {
                          if (products.isEmpty) {
                            return const Text(
                              'No products available.',
                              style: TextStyle(
                                color: AppColors.onSurfaceVariant,
                              ),
                            );
                          }
                          return GridView.builder(
                            shrinkWrap: true,
                            physics: const NeverScrollableScrollPhysics(),
                            gridDelegate:
                                const SliverGridDelegateWithFixedCrossAxisCount(
                                  crossAxisCount: 2,
                                  childAspectRatio: 0.75,
                                  crossAxisSpacing: 12,
                                  mainAxisSpacing: 12,
                                ),
                            itemCount: products.length,
                            itemBuilder: (_, i) => _BrandProductCard(
                              product: products[i],
                              onTap: () =>
                                  context.push('/product/${products[i].id}'),
                            ),
                          );
                        },
                      ),

                      // Where to Buy — retailer network
                      retailersAsync.when(
                        loading: () => const SizedBox(
                          height: 48,
                          child: Center(
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                        ),
                        error: (_, _) => const SizedBox.shrink(),
                        data: (retailers) {
                          if (retailers.isEmpty) return const SizedBox.shrink();
                          return Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const SizedBox(height: 32),
                              Text(
                                'Where to Buy',
                                style: AppTextStyles.heading3,
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'Authorised retailers near you',
                                style: AppTextStyles.body.copyWith(
                                  color: AppColors.onSurfaceVariant,
                                ),
                              ),
                              const SizedBox(height: 12),
                              ListView.separated(
                                shrinkWrap: true,
                                physics: const NeverScrollableScrollPhysics(),
                                itemCount: retailers.length,
                                separatorBuilder: (_, _) =>
                                    const SizedBox(height: 10),
                                itemBuilder: (_, i) =>
                                    _RetailerCard(retailer: retailers[i]),
                              ),
                            ],
                          );
                        },
                      ),
                      const SizedBox(height: 80),
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

class _BrandProductCard extends StatelessWidget {
  final CatalogModel product;
  final VoidCallback onTap;
  const _BrandProductCard({required this.product, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
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
            Expanded(
              child: ClipRRect(
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(12),
                ),
                child: SizedBox(
                  width: double.infinity,
                  height: double.infinity,
                  child: product.hasImages
                      ? CachedNetworkImage(
                          memCacheWidth: 1000,
                          imageUrl: product.imageUrl,
                          fit: BoxFit.cover,
                          errorWidget: (_, _, _) => _placeholder(),
                        )
                      : _placeholder(),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    product.name,
                    style: AppTextStyles.bodyMedium,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    CurrencyUtils.format(product.price),
                    style: AppTextStyles.price,
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
    color: AppColors.surfaceVariant,
    child: const Center(
      child: Icon(Icons.grass, size: 36, color: AppColors.primaryLight),
    ),
  );
}

class _RetailerCard extends StatelessWidget {
  final BrandRetailerModel retailer;
  const _RetailerCard({required this.retailer});

  Future<void> _call() async {
    final uri = Uri(scheme: 'tel', path: retailer.phone);
    if (await canLaunchUrl(uri)) launchUrl(uri);
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: AppColors.cardShadow,
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            // Logo / avatar
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: retailer.logo != null
                  ? CachedNetworkImage(
                      imageUrl: retailer.logo!,
                      width: 48,
                      height: 48,
                      fit: BoxFit.cover,
                      errorWidget: (_, _, _) => _avatar(),
                    )
                  : _avatar(),
            ),
            const SizedBox(width: 12),
            // Name + location
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    retailer.displayName,
                    style: AppTextStyles.bodyMedium.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (retailer.locationLabel.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        const Icon(
                          Icons.location_on_outlined,
                          size: 13,
                          color: AppColors.onSurfaceVariant,
                        ),
                        const SizedBox(width: 2),
                        Expanded(
                          child: Text(
                            retailer.locationLabel,
                            style: AppTextStyles.bodySmall.copyWith(
                              color: AppColors.onSurfaceVariant,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
            // Call button
            IconButton(
              onPressed: _call,
              icon: const Icon(Icons.phone_outlined),
              color: AppColors.primary,
              tooltip: 'Call store',
            ),
          ],
        ),
      ),
    );
  }

  Widget _avatar() => Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          color: AppColors.surfaceVariant,
          borderRadius: BorderRadius.circular(8),
        ),
        child: const Center(
          child: Icon(Icons.store, size: 24, color: AppColors.primaryLight),
        ),
      );
}
