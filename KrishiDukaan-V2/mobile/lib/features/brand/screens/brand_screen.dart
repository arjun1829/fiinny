import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/brand_model.dart';
import '../../../core/models/catalog_model.dart';
import '../../../core/utils/currency_utils.dart';
import '../../../core/widgets/error_view.dart';
import '../data/brand_repository.dart';

final _brandRepo = BrandRepository();

final _brandProvider =
    FutureProvider.family<BrandModel?, String>((ref, phone) {
  return _brandRepo.fetchBrandByPhone(phone);
});

final _brandProductsProvider =
    FutureProvider.family<List<CatalogModel>, String>((ref, phone) {
  return _brandRepo.fetchBrandProducts(phone);
});

class BrandScreen extends ConsumerWidget {
  final String manufacturerPhone;
  const BrandScreen({super.key, required this.manufacturerPhone});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brandAsync = ref.watch(_brandProvider(manufacturerPhone));
    final productsAsync = ref.watch(_brandProductsProvider(manufacturerPhone));

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
                          imageUrl: brand.coverImage!,
                          fit: BoxFit.cover,
                          errorWidget: (_, _, _) =>
                              Container(color: AppColors.primary),
                        )
                      else
                        Container(
                          decoration: const BoxDecoration(
                            gradient: LinearGradient(
                              colors: [AppColors.primary, AppColors.primaryLight],
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
                        Text(brand.tagline!,
                            style: AppTextStyles.body.copyWith(
                                color: AppColors.onSurfaceVariant,
                                fontStyle: FontStyle.italic)),
                      ],
                      if (brand.description != null) ...[
                        const SizedBox(height: 12),
                        Text(brand.description!,
                            style: AppTextStyles.body),
                      ],
                      const SizedBox(height: 24),

                      // Products section
                      Text('Products', style: AppTextStyles.heading3),
                      const SizedBox(height: 12),

                      productsAsync.when(
                        loading: () => const Center(
                            child: CircularProgressIndicator()),
                        error: (_, _) =>
                            const Text('Could not load products.'),
                        data: (products) {
                          if (products.isEmpty) {
                            return const Text(
                              'No products available.',
                              style: TextStyle(
                                  color: AppColors.onSurfaceVariant),
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
            ClipRRect(
              borderRadius:
                  const BorderRadius.vertical(top: Radius.circular(12)),
              child: SizedBox(
                height: 110,
                width: double.infinity,
                child: product.hasImages
                    ? CachedNetworkImage(
                        imageUrl: product.imageUrl,
                        fit: BoxFit.cover,
                        errorWidget: (_, _, _) => _placeholder(),
                      )
                    : _placeholder(),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(product.name,
                      style: AppTextStyles.bodyMedium,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 4),
                  Text(CurrencyUtils.format(product.price),
                      style: AppTextStyles.price),
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
