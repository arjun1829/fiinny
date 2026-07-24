import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/catalog_model.dart';
import '../../../core/models/brand_model.dart';
import '../../../core/models/listing_model.dart';
import '../../../core/models/reel_model.dart';
import '../../../core/models/review_model.dart';
import '../../../core/providers/cart_provider.dart';
import '../../../core/models/cart_model.dart';
import '../../../core/utils/currency_utils.dart';
import '../../../core/utils/geo_utils.dart';
import '../../../core/utils/store_focus_route.dart';
import '../../../core/utils/web_links.dart';
import '../../../core/utils/store_focus_route.dart';
import '../../../core/widgets/error_view.dart';
import '../../../core/widgets/expandable_text.dart';
import '../providers/marketplace_provider.dart';
import '../widgets/review_sheet.dart';
import '../widgets/store_selector_sheet.dart';
import '../../reels/providers/reels_provider.dart';
import '../../reels/screens/shop_profile_screen.dart';
import '../../../core/providers/user_provider.dart';

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

  // Sellers are nearest-first; only the closest few are shown until the
  // shopper taps "Show all". Keeps long seller lists from dominating the page.
  static const _kStorePreviewLimit = 5;
  bool _showAllStores = false;

  @override
  Widget build(BuildContext context) {
    final catalogAsync = ref.watch(catalogDetailProvider(widget.catalogId));
    final listingsAsync = ref.watch(
      listingsForCatalogProvider(widget.catalogId),
    );
    final reviewsAsync = ref.watch(productReviewsProvider(widget.catalogId));
    final allProductsState = ref.watch(marketplaceProvider);

    final catalogValue = catalogAsync.value;
    final hasManufacturer = catalogValue != null &&
        (catalogValue.manufacturerId != null ||
            catalogValue.manufacturerPhone != null);
    final brandAsync = hasManufacturer
        ? ref.watch(productBrandProvider((
            uid: catalogValue.manufacturerId,
            phone: catalogValue.manufacturerPhone,
          )))
        : null;

    final brandProductsAsync = (brandAsync != null && brandAsync.value != null)
        ? ref.watch(brandProductsProvider(brandAsync.value!.phone))
        : null;

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
          final selectedVariant = hasVariants
              ? variants[_selectedVariantIdx]
              : null;
          final displayPrice = selectedVariant != null
              ? selectedVariant.price
              : catalog.price;

          // Similar products: same category, exclude current
          final similarProducts = allProductsState.products
              .where(
                (p) =>
                    p.id != catalog.id &&
                    p.category.toLowerCase() == catalog.category.toLowerCase(),
              )
              .take(12)
              .toList();

          final hasDetails =
              (catalog.description != null &&
                  catalog.description!.isNotEmpty) ||
              catalog.hasNpk;

          return CustomScrollView(
            slivers: [
              // ── Hero image app bar ────────────────────────────────────────
              SliverAppBar(
                expandedHeight: 280,
                pinned: true,
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                // Explicit back button with a dark scrim so it stays visible
                // over any product image colour (white images hide a bare arrow).
                leading: Padding(
                  padding: const EdgeInsets.all(8),
                  child: Material(
                    color: Colors.black.withValues(alpha: 0.35),
                    shape: const CircleBorder(),
                    child: InkWell(
                      customBorder: const CircleBorder(),
                      onTap: () {
                        if (context.canPop()) {
                          context.pop();
                        } else {
                          context.go('/');
                        }
                      },
                      child: const Icon(
                        Icons.arrow_back,
                        color: Colors.white,
                        size: 20,
                      ),
                    ),
                  ),
                ),
                actions: [
                  Padding(
                    padding: const EdgeInsets.all(8),
                    child: Material(
                      color: Colors.black.withValues(alpha: 0.35),
                      shape: const CircleBorder(),
                      child: InkWell(
                        customBorder: const CircleBorder(),
                        onTap: () {
                          // WebLinks.product matches the web's /products/{slug}
                          // route — the old /product/{id} form was a 404.
                          final shareUrl =
                              WebLinks.product(catalog.name, catalog.id);
                          // ignore: deprecated_member_use
                          Share.share(
                            'Check out ${catalog.name} on KrishiDukan!\n$shareUrl',
                          );
                        },
                        child: const Padding(
                          padding: EdgeInsets.all(8),
                          child: Icon(
                            Icons.share,
                            color: Colors.white,
                            size: 20,
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
                flexibleSpace: FlexibleSpaceBar(
                  background: _buildHeroImage(catalog),
                ),
              ),

              SliverToBoxAdapter(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // ── Product header (name, price, max discount) ──────────
                    _buildProductHeader(catalog, displayPrice),

                    // ── Image thumbnails (gallery) ──────────────────────────
                    if (catalog.images.length > 1)
                      _buildGalleryThumbnails(catalog),

                    // ── Variant / Package Size selector ─────────────────────
                    if (hasVariants)
                      _buildVariantSelector(variants, selectedVariant),

                    const Divider(height: 1, thickness: 1),

                    // ── Buy options first: stores nearest-first. Farmers care
                    //    about price/discount/distance more than the spec
                    //    sheet, so this sits above the product details. ───────
                    _buildStoresSection(listingsAsync, catalog, displayPrice),

                    // ── Product details moved below the buy options ─────────
                    if (hasDetails) const Divider(height: 1, thickness: 1),
                    if (catalog.description != null &&
                        catalog.description!.isNotEmpty)
                      _buildDescription(catalog),
                    if (catalog.hasNpk) _buildNpkSection(catalog),

                    const Divider(height: 1, thickness: 1),

                    // ── Reviews ─────────────────────────────────────────────
                    _buildReviewsSection(reviewsAsync, catalog),

                    // ── Manufacturer Brand Section ──────────────────────────
                    if (hasManufacturer && brandAsync != null && brandProductsAsync != null) ...[
                      brandAsync.when(
                        data: (brand) {
                          if (brand == null) return const SizedBox.shrink();
                          return Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Divider(height: 1, thickness: 1),
                              _buildManufacturerBrandSection(catalog, brand, brandProductsAsync),
                            ],
                          );
                        },
                        loading: () => const Column(
                          children: [
                            Divider(height: 1, thickness: 1),
                            Padding(
                              padding: EdgeInsets.all(16),
                              child: Center(child: CircularProgressIndicator()),
                            ),
                          ],
                        ),
                        error: (_, _) => const SizedBox.shrink(),
                      ),
                    ],

                    const Divider(height: 1, thickness: 1),

                    _buildReelsSection(widget.catalogId),

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
      // ── Sticky Add to Cart / Buy Now bar (Amazon-style) ──────────────────
      bottomNavigationBar: catalogAsync.maybeWhen(
        data: (catalog) =>
            catalog == null ? null : _buildBottomBar(catalog, listingsAsync),
        orElse: () => null,
      ),
    );
  }

  // ─────────────────────── Buy options (cart / buy now) ──────────────────────

  /// Sticky bottom bar with Add to Cart + Buy Now. Disabled (with a hint) while
  /// listings load or when no store sells this product online. Orderable store
  /// resolution + pricing lives in the shared [buildStoreOptions].
  Widget _buildBottomBar(
    CatalogModel catalog,
    AsyncValue<List<ListingModel>> listingsAsync,
  ) {
    final options = listingsAsync.maybeWhen(
      data: (raw) => buildStoreOptions(catalog, raw),
      orElse: () => null,
    );
    final canOrder = options != null && options.isNotEmpty;

    return Material(
      elevation: 12,
      color: Colors.white,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
          child: !canOrder
              ? SizedBox(
                  height: 48,
                  child: Center(
                    child: Text(
                      listingsAsync.isLoading
                          ? 'Checking availability…'
                          : 'Not available for online order',
                      style: AppTextStyles.bodyMedium.copyWith(
                        color: AppColors.onSurfaceVariant,
                      ),
                    ),
                  ),
                )
              : Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () =>
                            _startOrder(catalog, options, buyNow: false),
                        icon: const Icon(Icons.add_shopping_cart, size: 18),
                        label: const Text('Add to Cart'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.primary,
                          side: const BorderSide(
                            color: AppColors.primary,
                            width: 1.5,
                          ),
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          textStyle: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: () =>
                            _startOrder(catalog, options, buyNow: true),
                        icon: const Icon(Icons.flash_on, size: 18),
                        label: const Text('Buy Now'),
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.secondary,
                          foregroundColor: AppColors.onSecondary,
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          textStyle: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
        ),
      ),
    );
  }

  /// Picks a store (auto-selects when there's only one) then adds the chosen
  /// store's listing to the cart. Buy Now continues straight to checkout.
  Future<void> _startOrder(
    CatalogModel catalog,
    List<StoreOption> options, {
    required bool buyNow,
  }) async {
    if (options.isEmpty) return;

    StoreOption chosen;
    if (options.length == 1) {
      chosen = options.first;
    } else {
      final picked = await showStoreSelector(
        context,
        options: options,
        title: buyNow ? 'Buy from which store?' : 'Add from which store?',
      );
      if (picked == null) return; // user dismissed the sheet
      chosen = picked;
    }

    if (!mounted) return;
    _addOptionToCart(catalog, chosen);

    if (buyNow) {
      context.push('/checkout');
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Added ${catalog.name} from ${chosen.listing.sellerName}',
          ),
          backgroundColor: AppColors.primary,
          action: SnackBarAction(
            label: 'View Cart',
            textColor: Colors.white,
            onPressed: () => context.push('/cart'),
          ),
        ),
      );
    }
  }

  /// The currently selected variant's label (e.g. "1kg", "500ml"). Drives the
  /// delivery-charge weight estimate, so it must travel with every cart line.
  ///
  /// Most products have a single fixed pack size stored on the flat `unit`
  /// field (web's `ProductDoc.unit`), not in `variants` — `variants` only
  /// exists for products offering multiple selectable sizes. Falling back to
  /// `catalog.unit` is required or every single-size product estimates 0kg
  /// and delivery silently shows FREE when the web would charge for it.
  String? _selectedVariantLabel(CatalogModel catalog) {
    final variants = catalog.variants;
    if (variants != null && variants.isNotEmpty) {
      return variants[_selectedVariantIdx.clamp(0, variants.length - 1)].label;
    }
    return catalog.unit;
  }

  /// GST for a cart line: the seller copy's own fields when present, otherwise
  /// the canonical product's — mirrors web, where GST lives on the product data.
  static ({bool applicable, double rate}) _gstFor(
      ListingModel listing, CatalogModel catalog) {
    if (listing.gstApplicable == true && (listing.gstRate ?? 0) > 0) {
      return (applicable: true, rate: listing.gstRate!);
    }
    if (catalog.gstApplicable == true && (catalog.gstRate ?? 0) > 0) {
      return (applicable: true, rate: catalog.gstRate!);
    }
    return (applicable: false, rate: 0);
  }

  void _addOptionToCart(CatalogModel catalog, StoreOption opt) {
    final listing = opt.listing;
    final gst = _gstFor(listing, catalog);
    ref
        .read(cartProvider.notifier)
        .addItem(
          CartItemModel(
            catalogId: catalog.id,
            catalogName: catalog.name,
            catalogImage: catalog.imageUrl.isNotEmpty ? catalog.imageUrl : null,
            listingId: listing.id,
            sellerPhone: listing.sellerPhone,
            sellerName: listing.sellerName,
            price: opt.effectivePrice,
            originalPrice: opt.originalPrice,
            discountPct: opt.discountPct,
            quantity: 1,
            variantLabel: _selectedVariantLabel(catalog),
            gstApplicable: gst.applicable,
            gstRate: gst.rate,
          ),
        );
  }

  void _showFullImage(BuildContext context, String imageUrl) {
    showDialog(
      context: context,
      builder: (context) => Dialog(
        backgroundColor: Colors.transparent,
        insetPadding: const EdgeInsets.all(8),
        child: Stack(
          alignment: Alignment.center,
          children: [
            InteractiveViewer(
              minScale: 0.5,
              maxScale: 4.0,
              child: CachedNetworkImage(
                imageUrl: imageUrl,
                fit: BoxFit.contain,
                placeholder: (context, url) => const Center(child: CircularProgressIndicator()),
                errorWidget: (context, url, error) => const Icon(Icons.error, color: Colors.white),
              ),
            ),
            Positioned(
              top: 10,
              right: 10,
              child: IconButton(
                icon: const Icon(Icons.close, color: Colors.white, size: 30),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ─────────────────────────── Hero image ────────────────────────────────────

  Widget _buildHeroImage(CatalogModel catalog) {
    final images = catalog.displayImages;
    final imageUrl = images.isNotEmpty ? images[_activeImageIdx] : '';

    Widget imageWidget;
    if (imageUrl.isNotEmpty) {
      imageWidget = GestureDetector(
        onTap: () => _showFullImage(context, imageUrl),
        child: CachedNetworkImage(
          memCacheWidth: 1000,
          imageUrl: imageUrl,
          fit: BoxFit.contain,
          width: double.infinity,
          height: double.infinity,
          errorWidget: (_, _, _) => _placeholderImage(),
        ),
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
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
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
                  color: isActive ? AppColors.primary : AppColors.divider,
                  width: isActive ? 2 : 1,
                ),
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(9),
                child: CachedNetworkImage(
                  memCacheWidth: 200,
                  imageUrl: catalog.displayImages[i],
                  fit: BoxFit.cover,
                  errorWidget: (_, _, _) => const Icon(
                    Icons.image,
                    color: AppColors.onSurfaceVariant,
                  ),
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
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
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
                const Icon(Icons.star, size: 16, color: AppColors.secondary),
                const SizedBox(width: 4),
                Text(
                  catalog.rating!.toStringAsFixed(1),
                  style: AppTextStyles.bodyMedium.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
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

          // Price + maximum discount (the headline info for farmers)
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Flexible(
                child: Text(
                  CurrencyUtils.format(displayPrice),
                  style: AppTextStyles.priceLarge,
                ),
              ),
              if (catalog.maxDiscountPct > 0) ...[
                const SizedBox(width: 10),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: const Color(0xFF16A34A),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    'Up to ${catalog.maxDiscountPct.toStringAsFixed(0)}% OFF',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.3,
                    ),
                  ),
                ),
              ],
            ],
          ),
          // GST is charged on top at checkout (same as web's cart), so the
          // label must not claim the price is inclusive.
          if (catalog.gstApplicable == true && (catalog.gstRate ?? 0) > 0)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                '+ ${catalog.gstRate!.toStringAsFixed(0)}% GST added at checkout',
                style: AppTextStyles.bodySmall.copyWith(
                  color: AppColors.onSurfaceVariant,
                ),
              ),
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
    List<VariantModel> variants,
    VariantModel? selected,
  ) {
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
                    horizontal: 14,
                    vertical: 8,
                  ),
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
                            ),
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
                              ? AppColors.onSurfaceVariant.withValues(
                                  alpha: 0.5,
                                )
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
          ExpandableText(catalog.description!, trimLines: 4),
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
              const Icon(
                Icons.storefront_outlined,
                size: 18,
                color: AppColors.primary,
              ),
              const SizedBox(width: 6),
              Text('Buy from a store near you', style: AppTextStyles.heading3),
            ],
          ),
          const Padding(
            padding: EdgeInsets.only(left: 24, top: 2),
            child: Text(
              'Nearest stores first — compare price & discount',
              style: AppTextStyles.bodySmall,
            ),
          ),
          const SizedBox(height: 12),
          listingsAsync.when(
            loading: () => const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: CircularProgressIndicator(),
              ),
            ),
            error: (_, _) =>
                const ErrorView(message: 'Failed to load sellers.'),
            data: (listingsRaw) {
              final listings = listingsRaw.cast<ListingModel>();
              if (listings.isEmpty) {
                return const _EmptyListings();
              }
              final sellerDiscounts = catalog.sellerDiscounts;
              final total = listings.length;
              final hasMore = total > _kStorePreviewLimit;
              final visible = (hasMore && !_showAllStores)
                  ? listings.take(_kStorePreviewLimit).toList()
                  : listings;
              return Column(
                children: [
                  ...visible.map(
                    (listing) => _SellerTile(
                      listing: listing,
                      catalogId: catalog.id,
                      catalogName: catalog.name,
                      catalogImage: catalog.imageUrl,
                      displayPrice: displayPrice,
                      variantLabel: _selectedVariantLabel(catalog),
                      gstApplicable: _gstFor(listing, catalog).applicable,
                      gstRate: _gstFor(listing, catalog).rate,
                      // Match the store by phone first (reliable) then storeId.
                      sellerDiscountPct:
                          sellerDiscounts[listing.sellerPhone] ??
                          sellerDiscounts[listing.id] ??
                          0.0,
                    ),
                  ),
                  if (hasMore) _buildStoresToggle(total),
                ],
              );
            },
          ),
        ],
      ),
    );
  }

  /// "Show all N stores" / "Show less" toggle shown when more sellers exist
  /// than the preview limit.
  Widget _buildStoresToggle(int total) {
    final hidden = total - _kStorePreviewLimit;
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: SizedBox(
        width: double.infinity,
        child: OutlinedButton.icon(
          onPressed: () => setState(() => _showAllStores = !_showAllStores),
          icon: Icon(
            _showAllStores ? Icons.expand_less : Icons.expand_more,
            size: 18,
          ),
          label: Text(
            _showAllStores
                ? 'Show less'
                : 'Show all $total stores (+$hidden more)',
          ),
          style: OutlinedButton.styleFrom(
            foregroundColor: AppColors.primary,
            side: const BorderSide(color: AppColors.primary),
            padding: const EdgeInsets.symmetric(vertical: 12),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            textStyle: AppTextStyles.bodyMedium.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ),
    );
  }

  // ─────────────────────────── Reviews section ───────────────────────────────

  Widget _buildReviewsSection(
    AsyncValue<List<ReviewModel>> reviewsAsync,
    CatalogModel catalog,
  ) {
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
                  const Icon(
                    Icons.star_outlined,
                    size: 18,
                    color: AppColors.secondary,
                  ),
                  const SizedBox(width: 6),
                  Text('Customer Reviews', style: AppTextStyles.heading3),
                ],
              ),
              ref
                  .watch(userProductReviewProvider(widget.catalogId))
                  .when(
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
                        const Icon(
                          Icons.star_border_outlined,
                          size: 40,
                          color: AppColors.primaryContainer,
                        ),
                        const SizedBox(height: 8),
                        Text('No reviews yet', style: AppTextStyles.body),
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
                                ),
                              ),
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
                                .map(
                                  (star) => _RatingBar(
                                    star: star,
                                    reviews: reviews,
                                    total: reviews.length,
                                  ),
                                )
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

  // ─────────────────────────── Manufacturer Brand Section ──────────────────────

  Widget _buildManufacturerBrandSection(
    CatalogModel catalog,
    BrandModel brand,
    AsyncValue<List<CatalogModel>> productsAsync,
  ) {
    final String brandName = brand.businessName.isNotEmpty ? brand.businessName : 'This Manufacturer';
    final hasBrandPage = brand.slug != null && brand.slug!.isNotEmpty;

    return Container(
      margin: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
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
          // Header Card
          Container(
            padding: const EdgeInsets.all(16),
            decoration: const BoxDecoration(
              color: Color(0xFF0D2B09), // Premium Deep Forest Green
              borderRadius: BorderRadius.vertical(top: Radius.circular(15)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'MANUFACTURED BY',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w900,
                          color: AppColors.secondary,
                          letterSpacing: 1.2,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        brandName,
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
                      if (brand.location != null || brand.establishedYear != null) ...[
                        const SizedBox(height: 4),
                        Text(
                          [
                            if (brand.location != null && brand.location!.isNotEmpty) brand.location,
                            if (brand.establishedYear != null && brand.establishedYear!.isNotEmpty) 'Est. ${brand.establishedYear}',
                          ].join(' · '),
                          style: const TextStyle(
                            fontSize: 12,
                            color: Colors.white70,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                // Visit Brand Store Button
                if (hasBrandPage)
                  ElevatedButton(
                    onPressed: () {
                      context.push('/brand/${brand.phone}');
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.secondary,
                      foregroundColor: Colors.white,
                      elevation: 0,
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: const [
                        Text(
                          'VISIT STORE',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 0.8,
                          ),
                        ),
                        SizedBox(width: 4),
                        Icon(Icons.chevron_right, size: 14),
                      ],
                    ),
                  ),
              ],
            ),
          ),
          
          // Products list
          productsAsync.when(
            data: (products) {
              final otherProducts = products.where((p) => p.id != catalog.id).toList();
              if (otherProducts.isEmpty) {
                return const SizedBox.shrink();
              }
              return Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'More from $brandName',
                      style: AppTextStyles.bodyMedium.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      height: 180,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: otherProducts.length,
                        separatorBuilder: (_, _) => const SizedBox(width: 12),
                        itemBuilder: (context, index) {
                          final p = otherProducts[index];
                          return GestureDetector(
                            onTap: () {
                              context.push('/product/${p.id}');
                            },
                            child: Container(
                              width: 130,
                              decoration: BoxDecoration(
                                color: AppColors.background,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(color: AppColors.divider),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Expanded(
                                    child: ClipRRect(
                                      borderRadius: const BorderRadius.vertical(
                                        top: Radius.circular(11),
                                      ),
                                      child: SizedBox(
                                        width: double.infinity,
                                        child: p.hasImages
                                            ? CachedNetworkImage(
                                                imageUrl: p.imageUrl,
                                                fit: BoxFit.cover,
                                              )
                                            : Container(
                                                color: AppColors.surfaceVariant,
                                                child: const Center(
                                                  child: Icon(Icons.grass,
                                                      color: AppColors.primaryLight),
                                                ),
                                              ),
                                      ),
                                    ),
                                  ),
                                  Padding(
                                    padding: const EdgeInsets.all(8.0),
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          p.category.toUpperCase(),
                                          style: AppTextStyles.caption.copyWith(
                                            color: AppColors.primary,
                                            fontWeight: FontWeight.w900,
                                            fontSize: 9,
                                            letterSpacing: 0.5,
                                          ),
                                        ),
                                        const SizedBox(height: 2),
                                        Text(
                                          p.name,
                                          style: AppTextStyles.bodyMedium.copyWith(
                                            fontSize: 12,
                                          ),
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                        const SizedBox(height: 2),
                                        Text(
                                          CurrencyUtils.format(p.price),
                                          style: AppTextStyles.price.copyWith(
                                            fontSize: 12,
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
            },
            loading: () => const Padding(
              padding: EdgeInsets.all(16),
              child: Center(child: CircularProgressIndicator()),
            ),
            error: (_, _) => const SizedBox.shrink(),
          ),
        ],
      ),
    );
  }

  // ─────────────────────────── Similar products ──────────────────────────────

  /// Reel poster: the generated video frame if present, else the linked
  /// product image, else a branded gradient. Lets old reels (no stored frame)
  /// still look like a video via the product image they were linked to.
  Widget _reelThumbnail(ReelModel reel) {
    final thumb = (reel.thumbnailUrl != null && reel.thumbnailUrl!.isNotEmpty)
        ? reel.thumbnailUrl!
        : (reel.linkedProductImageUrl ?? '');
    if (thumb.isEmpty) return _reelGradient();
    return CachedNetworkImage(
      imageUrl: thumb,
      fit: BoxFit.cover,
      memCacheWidth: 300,
      placeholder: (_, _) => _reelGradient(),
      errorWidget: (_, _, _) => _reelGradient(),
    );
  }

  Widget _reelGradient() => const DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [AppColors.primaryDark, AppColors.primary],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
      );

  Widget _buildReelsSection(String catalogId) {
    final reelsAsync = ref.watch(productReelsProvider(catalogId));
    return reelsAsync.when(
      data: (reels) {
        if (reels.isEmpty) return const SizedBox.shrink();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 24, 16, 8),
              child: Text('Product Reels', style: AppTextStyles.heading3),
            ),
            SizedBox(
              height: 180,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: reels.length,
                separatorBuilder: (_, __) => const SizedBox(width: 12),
                itemBuilder: (context, index) {
                  final reel = reels[index];
                  return GestureDetector(
                    onTap: () {
                      final user = ref.read(currentUserProvider).value;
                      Navigator.of(context, rootNavigator: true).push(
                        MaterialPageRoute(
                          fullscreenDialog: true,
                          builder: (_) => ProviderScope(
                            child: StandaloneReelsFeed(
                              reels: reels,
                              initialIndex: index,
                              currentUserId: user?.phone,
                              currentUserName: user?.businessName ?? user?.name ?? '',
                            ),
                          ),
                        ),
                      );
                    },
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: SizedBox(
                        width: 110,
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            // Poster frame (or linked product image) so the
                            // card reads as a video, not a coloured box.
                            _reelThumbnail(reel),
                            // Legibility scrim under the play button + labels.
                            const DecoratedBox(
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  begin: Alignment.topCenter,
                                  end: Alignment.bottomCenter,
                                  colors: [
                                    Colors.black26,
                                    Colors.transparent,
                                    Colors.black54,
                                  ],
                                  stops: [0.0, 0.5, 1.0],
                                ),
                              ),
                            ),
                            // Center play button — clearly a tappable video.
                            Center(
                              child: Container(
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(
                                  color: Colors.black.withValues(alpha: 0.4),
                                  shape: BoxShape.circle,
                                ),
                                child: const Icon(Icons.play_arrow_rounded,
                                    color: Colors.white, size: 26),
                              ),
                            ),
                            Positioned(
                              left: 6,
                              right: 6,
                              bottom: 6,
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Row(
                                    children: [
                                      const Icon(Icons.play_arrow_rounded,
                                          color: Colors.white70, size: 12),
                                      const SizedBox(width: 2),
                                      Text('${reel.viewsCount}',
                                          style: const TextStyle(
                                              color: Colors.white70,
                                              fontSize: 11)),
                                    ],
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    '@${reel.shopName}',
                                    style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 11,
                                        fontWeight: FontWeight.w600,
                                        shadows: [
                                          Shadow(
                                              color: Colors.black54,
                                              blurRadius: 4)
                                        ]),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: 16),
            const Divider(height: 1, thickness: 1),
          ],
        );
      },
      loading: () => const SizedBox.shrink(),
      error: (_, _) => const SizedBox.shrink(),
    );
  }

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
                    Text(
                      'Other products in the same category',
                      style: AppTextStyles.bodySmall,
                    ),
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
                  onTap: () => context.push('/product/${p.id}'),
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
                            top: Radius.circular(11),
                          ),
                          child: SizedBox(
                            height: 110,
                            width: double.infinity,
                            child: p.hasImages
                                ? CachedNetworkImage(
                                    memCacheWidth: 1000,
                                    imageUrl: p.imageUrl,
                                    fit: BoxFit.cover,
                                    errorWidget: (_, _, _) => Container(
                                      color: AppColors.primaryContainer
                                          .withValues(alpha: 0.3),
                                      child: const Icon(
                                        Icons.grass,
                                        color: AppColors.primary,
                                        size: 40,
                                      ),
                                    ),
                                  )
                                : Container(
                                    color: AppColors.primaryContainer
                                        .withValues(alpha: 0.3),
                                    child: const Icon(
                                      Icons.grass,
                                      color: AppColors.primary,
                                      size: 40,
                                    ),
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
          Text(
            label,
            style: AppTextStyles.caption.copyWith(
              color: color,
              fontWeight: FontWeight.w700,
            ),
          ),
          Text(
            '${value.toInt()}%',
            style: AppTextStyles.bodyMedium.copyWith(color: color),
          ),
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

  /// Selected package-size label ("1kg", "500ml") — needed on the cart line
  /// for the delivery weight estimate.
  final String? variantLabel;

  /// GST already resolved against listing + catalog by the parent screen.
  final bool gstApplicable;
  final double gstRate;

  const _SellerTile({
    required this.listing,
    required this.catalogId,
    required this.catalogName,
    required this.catalogImage,
    required this.displayPrice,
    this.sellerDiscountPct = 0,
    this.variantLabel,
    this.gstApplicable = false,
    this.gstRate = 0,
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
    if (listing.discount != null && listing.discount!.isCurrentlyActive) {
      return true;
    }
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
                                      fontWeight: FontWeight.w700,
                                    ),
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                                if (listing.sellerType == 'manufacturer') ...[
                                  const SizedBox(width: 6),
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 6,
                                      vertical: 2,
                                    ),
                                    decoration: BoxDecoration(
                                      color: AppColors.secondary.withValues(
                                        alpha: 0.12,
                                      ),
                                      borderRadius: BorderRadius.circular(20),
                                    ),
                                    child: Text(
                                      'BRAND',
                                      style: TextStyle(
                                        color: AppColors.secondary,
                                        fontSize: 9,
                                        fontWeight: FontWeight.w800,
                                        letterSpacing: 0.4,
                                      ),
                                    ),
                                  ),
                                ],
                                if (hasDiscount) ...[
                                  const SizedBox(width: 6),
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 6,
                                      vertical: 2,
                                    ),
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

                            // Distance + status + delivery
                            Wrap(
                              spacing: 10,
                              runSpacing: 4,
                              crossAxisAlignment: WrapCrossAlignment.center,
                              children: [
                                if (listing.distanceKm != null)
                                  Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      const Icon(
                                        Icons.location_on,
                                        size: 11,
                                        color: AppColors.onSurfaceVariant,
                                      ),
                                      const SizedBox(width: 2),
                                      Text(
                                        GeoUtils.formatDistance(
                                          listing.distanceKm!,
                                        ),
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
                                    Text(
                                      'Active',
                                      style: AppTextStyles.caption,
                                    ),
                                  ],
                                ),
                                if (listing.isOnline)
                                  Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      const Icon(
                                        Icons.local_shipping_outlined,
                                        size: 11,
                                        color: AppColors.primary,
                                      ),
                                      const SizedBox(width: 3),
                                      Text(
                                        'Delivery',
                                        style: AppTextStyles.caption.copyWith(
                                          color: AppColors.primary,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ],
                                  ),
                              ],
                            ),
                            if ((listing.sellerAddress ?? '')
                                .trim()
                                .isNotEmpty) ...[
                              const SizedBox(height: 4),
                              Text(
                                listing.sellerAddress!.trim(),
                                style: AppTextStyles.caption.copyWith(
                                  color: AppColors.onSurfaceVariant,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
                          ],
                        ),
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
                          horizontal: 8,
                          vertical: 3,
                        ),
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
                        listing.sellerAddress!,
                      ),
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
                          border: Border.all(color: const Color(0xFF86EFAC)),
                        ),
                        child: Column(
                          children: [
                            priceRow(
                              'Original price',
                              CurrencyUtils.format(originalPrice),
                              strikethrough: true,
                            ),
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

                    // Map + Call live in the always-visible quick-action
                    // strip at the bottom of the card — no duplicate here.

                    // ── Primary actions: Add to Cart + Buy Now (online) ────
                    if (listing.isInStock && listing.isOnline) ...[
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: () => _addToCart(context),
                              icon: const Icon(
                                Icons.add_shopping_cart,
                                size: 16,
                              ),
                              label: const Text('Add to Cart'),
                              style: OutlinedButton.styleFrom(
                                foregroundColor: AppColors.primary,
                                side: const BorderSide(
                                  color: AppColors.primary,
                                  width: 1.5,
                                ),
                                padding: const EdgeInsets.symmetric(
                                  vertical: 10,
                                ),
                                textStyle: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 12,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: FilledButton.icon(
                              onPressed: () => _buyNow(context),
                              icon: const Icon(Icons.flash_on, size: 16),
                              label: const Text('Buy Now'),
                              style: FilledButton.styleFrom(
                                backgroundColor: AppColors.secondary,
                                foregroundColor: AppColors.onSecondary,
                                padding: const EdgeInsets.symmetric(
                                  vertical: 10,
                                ),
                                textStyle: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                  fontSize: 12,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ],

            // ── Quick actions (always visible, even collapsed) ────────────
            // Directions and Call are one tap away without expanding; the
            // right side is the expand/collapse affordance. Buttons win the
            // gesture arena over the card's tap-to-expand.
            Container(
              decoration: BoxDecoration(
                color: _expanded
                    ? AppColors.primary.withValues(alpha: 0.05)
                    : AppColors.surfaceVariant.withValues(alpha: 0.55),
                borderRadius: const BorderRadius.vertical(
                  bottom: Radius.circular(11),
                ),
              ),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
              child: Row(
                children: [
                  if (listing.hasLocation ||
                      (listing.sellerAddress?.trim().isNotEmpty ?? false))
                    _QuickPillAction(
                      icon: Icons.directions_outlined,
                      label: 'Directions',
                      onTap: () => _openMap(listing),
                    ),
                  if ((listing.hasLocation ||
                          (listing.sellerAddress?.trim().isNotEmpty ??
                              false)) &&
                      _isDialable(listing.sellerPhone))
                    const SizedBox(width: 6),
                  if (_isDialable(listing.sellerPhone))
                    _QuickPillAction(
                      icon: Icons.phone_outlined,
                      label: 'Call',
                      onTap: () => _callStore(listing.sellerPhone),
                    ),
                  const Spacer(),
                  Text(
                    _expanded ? 'Hide details' : 'Details & order',
                    style: AppTextStyles.caption.copyWith(
                      color: AppColors.primary,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Icon(
                    _expanded
                        ? Icons.keyboard_arrow_up
                        : Icons.keyboard_arrow_down,
                    size: 16,
                    color: AppColors.primary,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  static bool _isDialable(String phone) {
    final stripped = phone.startsWith('+91') ? phone.substring(3) : phone;
    return RegExp(r'^\d{10,13}$').hasMatch(stripped);
  }

  void _callStore(String phone) async {
    final url = Uri.parse('tel:$phone');
    if (await canLaunchUrl(url)) {
      await launchUrl(url);
    }
  }

  /// Sends the buyer to the Store tab's own map, focused on this seller,
  /// instead of jumping straight to the external Google Maps app — keeps
  /// them inside KrishiDukan and reuses the single in-app map + directions
  /// flow shared by product, brand, and search-suggestion "Directions" taps.
  void _openMap(ListingModel listing) {
    context.go(
      storeFocusRoute(
        name: listing.sellerName,
        phone: listing.sellerPhone,
        address: listing.sellerAddress,
        lat: listing.sellerLat,
        lng: listing.sellerLng,
      ),
    );
  }

  void _addToCart(BuildContext context) {
    final listing = widget.listing;
    ref
        .read(cartProvider.notifier)
        .addItem(
          CartItemModel(
            catalogId: widget.catalogId,
            catalogName: widget.catalogName,
            catalogImage: widget.catalogImage.isNotEmpty
                ? widget.catalogImage
                : null,
            listingId: listing.id,
            sellerPhone: listing.sellerPhone,
            sellerName: listing.sellerName,
            price: _effectivePrice,
            originalPrice: listing.price,
            discountPct: _discountPct,
            quantity: 1,
            variantLabel: widget.variantLabel,
            gstApplicable: widget.gstApplicable,
            gstRate: widget.gstRate,
          ),
        );
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Added ${widget.catalogName} to cart'),
        backgroundColor: AppColors.primary,
        action: SnackBarAction(
          label: 'View Cart',
          textColor: Colors.white,
          onPressed: () => context.push('/cart'),
        ),
      ),
    );
  }

  /// Buy Now from this specific store: add to cart, then go straight to
  /// checkout (login is enforced by the /checkout route guard).
  void _buyNow(BuildContext context) {
    final listing = widget.listing;
    ref
        .read(cartProvider.notifier)
        .addItem(
          CartItemModel(
            catalogId: widget.catalogId,
            catalogName: widget.catalogName,
            catalogImage: widget.catalogImage.isNotEmpty
                ? widget.catalogImage
                : null,
            listingId: listing.id,
            sellerPhone: listing.sellerPhone,
            sellerName: listing.sellerName,
            price: _effectivePrice,
            originalPrice: listing.price,
            discountPct: _discountPct,
            quantity: 1,
            variantLabel: widget.variantLabel,
            gstApplicable: widget.gstApplicable,
            gstRate: widget.gstRate,
          ),
        );
    context.push('/checkout');
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
        child: Text(
          text,
          style: AppTextStyles.bodySmall.copyWith(color: AppColors.onSurface),
        ),
      ),
    ],
  ),
);

Widget priceRow(
  String label,
  String value, {
  bool strikethrough = false,
  bool bold = false,
  Color? valueColor,
}) => Row(
  mainAxisAlignment: MainAxisAlignment.spaceBetween,
  children: [
    Text(
      label,
      style: AppTextStyles.bodySmall.copyWith(
        fontWeight: bold ? FontWeight.w700 : null,
      ),
    ),
    Text(
      value,
      style: AppTextStyles.bodySmall.copyWith(
        fontWeight: bold ? FontWeight.w700 : null,
        color: valueColor ?? AppColors.onSurface,
        decoration: strikethrough ? TextDecoration.lineThrough : null,
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
    final count = reviews.where((r) => r.rating.round() == star).length;
    final fraction = total > 0 ? count / total : 0.0;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          Text(
            '$star',
            style: AppTextStyles.caption.copyWith(fontWeight: FontWeight.w600),
          ),
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
                  AppColors.secondary,
                ),
              ),
            ),
          ),
          const SizedBox(width: 6),
          SizedBox(
            width: 20,
            child: Text(
              '$count',
              style: AppTextStyles.caption,
              textAlign: TextAlign.right,
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────── Empty listings ────────────────────────────────

/// Compact pill button used in the seller card's always-visible action strip
/// (Directions / Call). GestureDetector (not InkWell) so its tap reliably
/// wins over the parent card's tap-to-expand without needing a Material.
class _QuickPillAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _QuickPillAction({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: AppColors.primary.withValues(alpha: 0.35),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: AppColors.primary),
            const SizedBox(width: 4),
            Text(
              label,
              style: AppTextStyles.caption.copyWith(
                color: AppColors.primary,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

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
            Icon(
              Icons.store_outlined,
              size: 48,
              color: AppColors.primaryContainer,
            ),
            SizedBox(height: 12),
            Text(
              'No stores carry this product yet',
              style: AppTextStyles.body,
              textAlign: TextAlign.center,
            ),
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
                    backgroundColor: AppColors.primaryContainer.withValues(
                      alpha: 0.5,
                    ),
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
                      Text(
                        review.reviewerName,
                        style: AppTextStyles.bodyMedium,
                      ),
                      Text(
                        'Verified Buyer',
                        style: AppTextStyles.caption.copyWith(
                          color: AppColors.success,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              Row(
                children: List.generate(
                  5,
                  (i) => Icon(
                    i < review.rating.round() ? Icons.star : Icons.star_border,
                    size: 14,
                    color: AppColors.secondary,
                  ),
                ),
              ),
            ],
          ),
          if (review.reviewText != null && review.reviewText!.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(review.reviewText!, style: AppTextStyles.body),
          ],
          if (review.createdAt != null) ...[
            const SizedBox(height: 6),
            Text(
              DateFormat('dd MMM yyyy').format(review.createdAt!),
              style: AppTextStyles.caption.copyWith(
                color: AppColors.onSurfaceVariant,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
