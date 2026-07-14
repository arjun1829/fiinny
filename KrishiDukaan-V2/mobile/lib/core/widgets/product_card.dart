import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../constants/app_colors.dart';
import '../constants/app_text_styles.dart';
import '../models/catalog_model.dart';
import '../utils/currency_utils.dart';
import '../utils/geo_utils.dart';

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
      child: LayoutBuilder(
        builder: (context, constraints) {
          final compact = constraints.maxWidth < 150;
          final radius = compact ? 10.0 : 12.0;
          final infoPadding = compact ? 8.0 : 10.0;

          return Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(radius),
              border: hasOffer
                  ? Border.all(color: const Color(0xFF86EFAC), width: 1.3)
                  : Border.all(color: AppColors.divider.withValues(alpha: 0.6)),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.10),
                  blurRadius: 10,
                  spreadRadius: 1.5,
                  offset: const Offset(0, 4),
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
                          borderRadius: BorderRadius.vertical(
                            top: Radius.circular(radius),
                          ),
                          child: product.hasImages
                              ? CachedNetworkImage(
                                  memCacheWidth: compact ? 260 : 400,
                                  maxWidthDiskCache: compact ? 360 : 600,
                                  imageUrl: product.imageUrl,
                                  fit: BoxFit.contain,
                                  fadeInDuration: const Duration(
                                    milliseconds: 250,
                                  ),
                                  placeholder: (_, _) => Container(
                                    color: AppColors.surfaceVariant,
                                    child: Center(
                                      child: Icon(
                                        Icons.grass,
                                        size: compact ? 28 : 40,
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
                          top: compact ? 6 : 8,
                          left: 0,
                          child: Container(
                            padding: EdgeInsets.symmetric(
                              horizontal: compact ? 6 : 8,
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
                                Icon(
                                  Icons.local_offer,
                                  size: compact ? 9 : 10,
                                  color: Colors.white,
                                ),
                                const SizedBox(width: 3),
                                Text(
                                  '${maxPct.toStringAsFixed(0)}% OFF',
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontSize: compact ? 9 : 10,
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
                  padding: EdgeInsets.all(infoPadding),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Category badge
                      Container(
                        padding: EdgeInsets.symmetric(
                          horizontal: compact ? 5 : 6,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: AppColors.primaryContainer.withValues(
                            alpha: 0.5,
                          ),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          product.category,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppTextStyles.caption.copyWith(
                            color: AppColors.primary,
                            fontWeight: FontWeight.w600,
                            fontSize: compact ? 9 : 11,
                          ),
                        ),
                      ),
                      SizedBox(height: compact ? 4 : 6),
                      // Name
                      Text(
                        product.name,
                        style: AppTextStyles.bodyMedium.copyWith(
                          fontSize: compact ? 12 : 14,
                        ),
                        maxLines: compact ? 1 : 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      SizedBox(height: compact ? 4 : 6),
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
                                  fontSize: compact ? 13 : 16,
                                ),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            SizedBox(width: compact ? 4 : 6),
                            if (!compact)
                              Text(
                                CurrencyUtils.format(product.price),
                                style: AppTextStyles.caption.copyWith(
                                  decoration: TextDecoration.lineThrough,
                                ),
                              ),
                          ],
                        ),
                        if (savings > 0 && !compact)
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
                          style: AppTextStyles.price.copyWith(
                            fontSize: compact ? 13 : 16,
                          ),
                        ),
                      SizedBox(height: compact ? 2 : 4),
                      // Nearest store distance
                      Row(
                        children: [
                          Icon(
                            Icons.near_me_outlined,
                            size: compact ? 10 : 12,
                            color: AppColors.onSurfaceVariant,
                          ),
                          const SizedBox(width: 4),
                          Expanded(
                            child: Text(
                              product.nearestStoreDistanceKm != null
                                  ? '${GeoUtils.formatDistance(product.nearestStoreDistanceKm!)} away'
                                  : 'Nearby store',
                              style: AppTextStyles.caption.copyWith(
                                fontSize: compact ? 9 : 11,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          if (product.rating != null && !compact) ...[
                            const SizedBox(width: 6),
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
          );
        },
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
