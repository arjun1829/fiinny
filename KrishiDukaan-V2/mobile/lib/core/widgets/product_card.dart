import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../constants/app_colors.dart';
import '../constants/app_text_styles.dart';
import '../models/catalog_model.dart';
import '../utils/geo_utils.dart';
import 'buy_now_pill.dart';
import 'price_tag.dart';

class ProductCard extends StatefulWidget {
  final CatalogModel product;
  final VoidCallback onTap;

  /// One-tap Buy Now shown on the photo. Null hides the button (the default,
  /// so surfaces that don't support ordering from a card are unchanged).
  final Future<void> Function()? onBuyNow;

  /// Button text: "Buy Now", or "Choose size" for a product with several
  /// sizes, where tapping opens the product page.
  final String buyNowLabel;

  const ProductCard({
    super.key,
    required this.product,
    required this.onTap,
    this.onBuyNow,
    this.buyNowLabel = 'Buy Now',
  });

  @override
  State<ProductCard> createState() => _ProductCardState();
}

class _ProductCardState extends State<ProductCard> {
  // Press-down scale gives every card tactile feedback — the single cheapest
  // "the app feels alive" win since ProductCard appears on every surface.
  bool _pressed = false;
  bool _buying = false;

  Future<void> _buyNow() async {
    final run = widget.onBuyNow;
    if (run == null || _buying) return;
    setState(() => _buying = true);
    try {
      await run();
    } finally {
      if (mounted) setState(() => _buying = false);
    }
  }

  CatalogModel get product => widget.product;

  @override
  Widget build(BuildContext context) {
    // The cheapest offer, struck against that same seller's own price —
    // never "lowest price × best discount", a price nobody actually sells at.
    final dp = product.displayPrice;
    final hasOffer = dp.hasOffer;

    return GestureDetector(
      onTap: widget.onTap,
      onTapDown: (_) => setState(() => _pressed = true),
      onTapUp: (_) => setState(() => _pressed = false),
      onTapCancel: () => setState(() => _pressed = false),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final compact = constraints.maxWidth < 150;
          final radius = compact ? 12.0 : 14.0;
          final infoPadding = compact ? 8.0 : 10.0;

          return AnimatedScale(
            scale: _pressed ? 0.96 : 1.0,
            duration: const Duration(milliseconds: 110),
            curve: Curves.easeOut,
            child: Container(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(radius),
                border: hasOffer
                    ? Border.all(color: const Color(0xFF86EFAC), width: 1.3)
                    : Border.all(
                        color: AppColors.divider.withValues(alpha: 0.6),
                      ),
                // Soft ambient shadow — no spread. The previous spreadRadius
                // bled grey between grid cards and made the page look muddy.
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.07),
                    blurRadius: 12,
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
                        if (widget.onBuyNow != null)
                          Positioned(
                            left: compact ? 5 : 8,
                            right: compact ? 5 : 8,
                            bottom: compact ? 4 : 6,
                            child: BuyNowPill(
                              label: widget.buyNowLabel,
                              compact: compact,
                              busy: _buying,
                              onTap: _buyNow,
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
                                    '${dp.pct}% OFF',
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
                        // Price — "₹final ₹mrp X% off", same as web cards
                        PriceTag(value: dp, fontSize: compact ? 13 : 16),
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
