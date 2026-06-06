import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../constants/app_colors.dart';
import '../constants/app_text_styles.dart';
import '../models/catalog_model.dart';
import '../utils/currency_utils.dart';

class ProductCard extends StatelessWidget {
  final CatalogModel product;
  final VoidCallback onTap;

  const ProductCard({super.key, required this.product, required this.onTap});

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
              blurRadius: 6,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Image
            ClipRRect(
              borderRadius:
                  const BorderRadius.vertical(top: Radius.circular(12)),
              child: SizedBox(
                height: 120,
                width: double.infinity,
                child: product.hasImages
                    ? CachedNetworkImage(
                        imageUrl: product.imageUrl,
                        fit: BoxFit.cover,
                        placeholder: (_, _) => Container(
                          color: AppColors.surfaceVariant,
                          child: const Center(
                            child: Icon(Icons.grass,
                                size: 40, color: AppColors.primaryLight),
                          ),
                        ),
                        errorWidget: (_, _, _) => _placeholder(),
                      )
                    : _placeholder(),
              ),
            ),
            // Info
            Padding(
              padding: const EdgeInsets.all(10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Category badge
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: AppColors.primaryContainer.withValues(alpha: 0.5),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(product.category,
                        style: AppTextStyles.caption.copyWith(
                          color: AppColors.primary,
                          fontWeight: FontWeight.w600,
                        )),
                  ),
                  const SizedBox(height: 6),
                  // Name
                  Text(
                    product.name,
                    style: AppTextStyles.bodyMedium,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 6),
                  // Price
                  Text(
                    CurrencyUtils.format(product.price),
                    style: AppTextStyles.price,
                  ),
                  const SizedBox(height: 4),
                  // Seller count
                  Row(
                    children: [
                      const Icon(Icons.store_outlined,
                          size: 12, color: AppColors.onSurfaceVariant),
                      const SizedBox(width: 4),
                      Text(
                        '${product.sellerCount} seller${product.sellerCount != 1 ? 's' : ''}',
                        style: AppTextStyles.caption,
                      ),
                      if (product.rating != null) ...[
                        const SizedBox(width: 8),
                        const Icon(Icons.star,
                            size: 12, color: AppColors.secondary),
                        const SizedBox(width: 2),
                        Text(
                          product.rating!.toStringAsFixed(1),
                          style: AppTextStyles.caption,
                        ),
                      ],
                    ],
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
          child: Icon(Icons.grass, size: 40, color: AppColors.primaryLight),
        ),
      );
}
