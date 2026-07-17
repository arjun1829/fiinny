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
    // Highest discount any seller offers for this product — drives the offer
    // ribbon + discounted price (web parity with MarketView/HomeView cards).
    final maxPct = product.maxDiscountPct;
    final hasOffer = maxPct > 0;
    final discountedPrice = hasOffer
        ? product.price * (1 - maxPct / 100)
        : product.price;
    final savings = (product.price - discountedPrice).round();

    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: hasOffer 
              ? Border.all(color: const Color(0xFF86EFAC), width: 1.5)
              : Border.all(color: AppColors.divider.withValues(alpha: 0.6)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.15),
              blurRadius: 16,
              spreadRadius: 4,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Image (with corner offer ribbon)
            Expanded(
              child: Stack(
                children: [
                  Positioned.fill(
                    child: ClipRRect(
                      borderRadius: const BorderRadius.vertical(
                        top: Radius.circular(12),
                      ),
                      child: product.hasImages
                          ? CachedNetworkImage(
                              // Resizing the image in memory significantly speeds up decoding and
                              // makes scrolling the grid buttery smooth. 400px is plenty for a grid card.
                              memCacheWidth: 400,
                              maxWidthDiskCache: 600,
                              imageUrl: product.imageUrl,
                              fit: BoxFit.contain,
                              fadeInDuration: const Duration(milliseconds: 250),
                              placeholder: (_, _) => Container(
                                color: AppColors.surfaceVariant,
                                child: const Center(
                                  child: Icon(
                                    Icons.grass,
                                    size: 40,
                                    color: AppColors.primaryLight,
                                  ),
                                ),
                              ),
                              errorWidget: (_, _, _) => _placeholder(),
                            )
                          : _placeholder(),
                    ),
                  ),
                  if (hasOffer)
                    Positioned(
                      top: 8,
                      left: 0,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 3,
                        ),
                        decoration: const BoxDecoration(
                          color: Color(0xFF16A34A),
                          borderRadius: BorderRadius.only(
                            topRight: Radius.circular(6),
                            bottomRight: Radius.circular(6),
                          ),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(
                              Icons.local_offer,
                              size: 10,
                              color: Colors.white,
                            ),
                            const SizedBox(width: 3),
                            Text(
                              '${maxPct.toStringAsFixed(0)}% OFF',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 10,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
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
                    padding: const EdgeInsets.symmetric(
                      horizontal: 6,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.primaryContainer.withValues(alpha: 0.5),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      product.category,
                      style: AppTextStyles.caption.copyWith(
                        color: AppColors.primary,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
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
                  // Price — discounted block when an offer exists
                  if (hasOffer) ...[
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Flexible(
                          child: Text(
                            CurrencyUtils.format(discountedPrice),
                            style: AppTextStyles.price.copyWith(
                              color: const Color(0xFF15803D),
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          CurrencyUtils.format(product.price),
                          style: AppTextStyles.caption.copyWith(
                            decoration: TextDecoration.lineThrough,
                          ),
                        ),
                      ],
                    ),
                    if (savings > 0)
                      Text(
                        'Save ${CurrencyUtils.format(savings.toDouble())}',
                        style: AppTextStyles.caption.copyWith(
                          color: const Color(0xFF16A34A),
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                  ] else
                    Text(
                      CurrencyUtils.format(product.price),
                      style: AppTextStyles.price,
                    ),
                  const SizedBox(height: 4),
                  // Seller count
                  Row(
                    children: [
                      const Icon(
                        Icons.store_outlined,
                        size: 12,
                        color: AppColors.onSurfaceVariant,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        '${product.sellerCount} seller${product.sellerCount != 1 ? 's' : ''}',
                        style: AppTextStyles.caption,
                      ),
                      if (product.rating != null) ...[
                        const SizedBox(width: 8),
                        const Icon(
                          Icons.star,
                          size: 12,
                          color: AppColors.secondary,
                        ),
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
