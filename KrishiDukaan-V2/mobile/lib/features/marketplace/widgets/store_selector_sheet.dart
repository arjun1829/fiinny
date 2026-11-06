import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/catalog_model.dart';
import '../../../core/models/cart_model.dart';
import '../../../core/models/listing_model.dart';
import '../../../core/utils/currency_utils.dart';
import '../../../core/utils/geo_utils.dart';
import '../../../core/utils/weight_utils.dart';
import '../providers/marketplace_provider.dart';

/// A single orderable seller resolved with its effective price + discount.
/// Drives the product-detail Add to Cart / Buy Now bar AND the cart's
/// change-store sheet, so the pricing logic lives in exactly one place.
class StoreOption {
  final ListingModel listing;
  final double originalPrice;
  final double effectivePrice;
  final double discountPct; // 0 for fixed-amount / no discount
  final bool hasDiscount;

  const StoreOption({
    required this.listing,
    required this.originalPrice,
    required this.effectivePrice,
    required this.discountPct,
    required this.hasDiscount,
  });
}

/// This store's own list price for [selectedVariant], or null when the store
/// does not stock that size at all.
///
/// Port of web's `resolveStoreVariant` (app/views/ProductDetailView.tsx). It is
/// the single source of truth for per-size, per-store pricing: without it every
/// store was quoted `listing.price` — the BASE size's price — so picking 5L on
/// a 1L/5L product added the 5L can at the 1L price. Sizes are compared through
/// normalizeUnit so "5L" and "5 Ltr" resolve to the same size.
double? storePriceForVariant(
  ListingModel listing,
  CatalogModel catalog,
  VariantModel? selectedVariant,
) {
  // Single-size product (no size chips) — nothing to resolve against.
  if (selectedVariant == null) return listing.price;

  final selectedKey = normalizeUnit(selectedVariant.label);

  // Store configured explicit per-size prices — authoritative.
  final storeVariants = listing.variants;
  if (storeVariants.isNotEmpty) {
    for (final v in storeVariants) {
      if (normalizeUnit(v.label) != selectedKey) continue;
      if (v.isOutOfStock) return null; // known out of stock for this size
      return v.price > 0 ? v.price : selectedVariant.price;
    }
    return null; // store simply doesn't carry this size
  }

  // Legacy store with no per-size prices: it only provides the BASE size,
  // i.e. the one whose price equals the product's own price.
  final catalogVariants = catalog.variants;
  final baseIdx = (catalogVariants == null || catalogVariants.isEmpty)
      ? -1
      : () {
          final i = catalogVariants.indexWhere((v) => v.price == catalog.price);
          return i >= 0 ? i : 0;
        }();
  final isBase = baseIdx >= 0 &&
      normalizeUnit(catalogVariants![baseIdx].label) == selectedKey;
  if (isBase) return listing.price;

  // Non-base size requested but this store has no configured price for it.
  return null;
}

/// Resolves the online + in-stock sellers for [catalog] into [StoreOption]s,
/// preserving the nearest-first order of [listings]. A seller's own active
/// discount wins; otherwise the catalog's per-seller discount map is used as a
/// fallback (mirrors the seller-tile logic on the product page).
///
/// [selectedVariant] is the package size the buyer picked. Stores that cannot
/// supply that exact size are omitted entirely, and those that can are priced
/// at THEIR price for it — so the sheet, the price shown on each row, and the
/// line that reaches the cart can never disagree about what is being bought.
///
/// [onlineOnly] false keeps walk-in (offline) stores too — for showing the
/// best price on the product page, not for ordering.
List<StoreOption> buildStoreOptions(
    CatalogModel catalog, List<ListingModel> listings,
    {VariantModel? selectedVariant, bool onlineOnly = true}) {
  final discounts = catalog.sellerDiscounts;
  final options = <StoreOption>[];
  if (onlineOnly &&
      (catalog.sellMode == 'offline_store_only' || catalog.isOnline == false)) {
    return options; // No online delivery available
  }

  for (final l in listings) {
    if (!l.isInStock || (onlineOnly && !l.isOnline)) continue;

    final base = storePriceForVariant(l, catalog, selectedVariant);
    if (base == null) continue; // this store cannot supply the selected size

    double effective;
    double pct;
    bool hasDiscount;
    final d = l.discount;
    if (d != null && d.isCurrentlyActive) {
      effective =
          (base - d.discountAmount(base)).clamp(0.0, double.infinity);
      hasDiscount = true;
      pct = d.type == 'fixed_amount' ? 0.0 : d.percentage;
    } else {
      final mapPct = discounts[l.sellerPhone] ?? discounts[l.id] ?? 0.0;
      if (mapPct > 0) {
        effective = base * (1 - mapPct / 100);
        hasDiscount = true;
        pct = mapPct;
      } else {
        effective = base;
        hasDiscount = false;
        pct = 0.0;
      }
    }
    options.add(StoreOption(
      listing: l,
      originalPrice: base,
      effectivePrice: effective,
      discountPct: pct,
      hasDiscount: hasDiscount,
    ));
  }
  return options;
}

/// Opens the store picker and resolves to the chosen [StoreOption] (or null if
/// dismissed). Pass [options] when they're already known (product page) or a
/// [catalogId] to load them lazily (cart change-store).
Future<StoreOption?> showStoreSelector(
  BuildContext context, {
  List<StoreOption>? options,
  String? catalogId,
  String title = 'Select a store',
  String? subtitle = 'Nearest stores shown first',
  String? currentListingId,
  String? variantLabel,
}) {
  return showModalBottomSheet<StoreOption>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => StoreSelectorSheet(
      options: options,
      catalogId: catalogId,
      title: title,
      subtitle: subtitle,
      currentListingId: currentListingId,
      variantLabel: variantLabel,
    ),
  );
}

/// Bottom sheet listing the stores that carry a product, each with price,
/// discount and distance. Tapping a card pops the sheet with that [StoreOption].
class StoreSelectorSheet extends ConsumerWidget {
  /// Preloaded options (product page). When null, options are loaded from
  /// [catalogId].
  final List<StoreOption>? options;
  final String? catalogId;
  final String title;
  final String? subtitle;

  /// When set, that store is badged "Current" (used by the cart's change flow).
  final String? currentListingId;

  /// The package size already chosen for this line (cart change-store flow).
  /// Options are priced for THIS size, and stores that don't carry it are
  /// hidden — otherwise switching store silently re-prices a 5L line at the
  /// 1L price.
  final String? variantLabel;

  const StoreSelectorSheet({
    super.key,
    this.options,
    this.catalogId,
    this.title = 'Select a store',
    this.subtitle = 'Nearest stores shown first',
    this.currentListingId,
    this.variantLabel,
  }) : assert(options != null || catalogId != null,
            'Provide either options or a catalogId');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final maxH = MediaQuery.sizeOf(context).height * 0.7;
    return SafeArea(
      top: false,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: maxH),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 10),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.divider,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 14, 20, 2),
              child: Row(
                children: [
                  const Icon(Icons.storefront_outlined,
                      size: 18, color: AppColors.primary),
                  const SizedBox(width: 8),
                  Expanded(child: Text(title, style: AppTextStyles.heading3)),
                ],
              ),
            ),
            if (subtitle != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(subtitle!, style: AppTextStyles.bodySmall),
                ),
              ),
            const Divider(height: 1),
            Flexible(child: _body(context, ref)),
          ],
        ),
      ),
    );
  }

  Widget _body(BuildContext context, WidgetRef ref) {
    final preloaded = options;
    if (preloaded != null) return _list(context, preloaded);

    final catalogAsync = ref.watch(catalogDetailProvider(catalogId!));
    final listingsAsync = ref.watch(listingsForCatalogProvider(catalogId!));

    if (catalogAsync.hasError || listingsAsync.hasError) {
      return _message('Could not load stores. Please try again.');
    }
    if (catalogAsync.isLoading || listingsAsync.isLoading) {
      return _message(null, loading: true);
    }
    final catalog = catalogAsync.value;
    if (catalog == null) return _message('This product is no longer available.');

    // Resolve the line's size label back to a catalog variant so options are
    // priced for the size actually being bought.
    VariantModel? selected;
    final wanted = normalizeUnit(variantLabel);
    final catalogVariants = catalog.variants;
    if (wanted.isNotEmpty && catalogVariants != null && catalogVariants.length > 1) {
      for (final v in catalogVariants) {
        if (normalizeUnit(v.label) == wanted) {
          selected = v;
          break;
        }
      }
    }

    final built = buildStoreOptions(catalog, listingsAsync.value ?? [],
        selectedVariant: selected);
    if (built.isEmpty) {
      return _message(selected != null
          ? 'No store sells the ${selected.label} size online right now.'
          : 'No store sells this online right now.');
    }
    return _list(context, built);
  }

  Widget _message(String? text, {bool loading = false}) => Padding(
        padding: const EdgeInsets.all(32),
        child: Center(
          child: loading
              ? const CircularProgressIndicator()
              : Text(text ?? '',
                  textAlign: TextAlign.center, style: AppTextStyles.body),
        ),
      );

  Widget _list(BuildContext context, List<StoreOption> opts) {
    return ListView.separated(
      shrinkWrap: true,
      padding: const EdgeInsets.all(16),
      itemCount: opts.length,
      separatorBuilder: (_, _) => const SizedBox(height: 10),
      itemBuilder: (_, i) {
        final o = opts[i];
        return StoreOptionCard(
          option: o,
          isCurrent:
              currentListingId != null && o.listing.id == currentListingId,
          onTap: () => Navigator.pop(context, o),
        );
      },
    );
  }
}

/// A tappable store row showing name, distance, effective price, discount and
/// an optional "Current" badge. Shared by the selector sheet.
class StoreOptionCard extends StatelessWidget {
  final StoreOption option;
  final bool isCurrent;
  final VoidCallback onTap;

  const StoreOptionCard({
    super.key,
    required this.option,
    this.isCurrent = false,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final o = option;
    final l = o.listing;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: o.hasDiscount ? const Color(0xFFF0FDF4) : Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isCurrent
                ? AppColors.primary
                : (o.hasDiscount ? const Color(0xFF86EFAC) : AppColors.divider),
            width: isCurrent ? 1.5 : 1,
          ),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          l.sellerName.trim().isNotEmpty
                              ? l.sellerName.trim()
                              : 'Store',
                          style: AppTextStyles.bodyMedium
                              .copyWith(fontWeight: FontWeight.w700),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (isCurrent)
                        _chip('Current', AppColors.primary)
                      else if (o.hasDiscount && o.discountPct > 0)
                        _chip('${o.discountPct.toStringAsFixed(0)}% OFF',
                            const Color(0xFF16A34A)),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      if (l.distanceKm != null) ...[
                        const Icon(Icons.location_on,
                            size: 12, color: AppColors.onSurfaceVariant),
                        const SizedBox(width: 2),
                        Text(GeoUtils.formatDistance(l.distanceKm!),
                            style: AppTextStyles.caption),
                        const SizedBox(width: 10),
                      ],
                      Text(
                        CurrencyUtils.format(o.effectivePrice),
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                          color: o.hasDiscount
                              ? const Color(0xFF15803D)
                              : AppColors.onSurface,
                        ),
                      ),
                      if (o.hasDiscount) ...[
                        const SizedBox(width: 6),
                        Text(
                          CurrencyUtils.format(o.originalPrice),
                          style: AppTextStyles.caption.copyWith(
                            decoration: TextDecoration.lineThrough,
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Icon(
              isCurrent ? Icons.check_circle : Icons.arrow_forward_ios,
              size: isCurrent ? 20 : 14,
              color: AppColors.primary,
            ),
          ],
        ),
      ),
    );
  }

  Widget _chip(String text, Color color) => Container(
        margin: const EdgeInsets.only(left: 6),
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          text,
          style: const TextStyle(
              color: Colors.white, fontSize: 9, fontWeight: FontWeight.w800),
        ),
      );
}


/// The store to buy from when the buyer doesn't pick one: the lowest price
/// they'd actually pay for the selected size, ties broken by proximity.
///
/// Compares effectivePrice (post-discount) rather than the list price: that is
/// the number that reaches the cart, so a shop with a worse list price but a
/// live offer can still legitimately win. Shared by the product page's sticky
/// bar and the product cards' Buy Now, so both pick the same store.
StoreOption bestStoreOption(List<StoreOption> options) {
  var best = options.first;
  for (final o in options.skip(1)) {
    if (o.effectivePrice < best.effectivePrice) {
      best = o;
    } else if (o.effectivePrice == best.effectivePrice) {
      final od = o.listing.distanceKm;
      final bd = best.listing.distanceKm;
      // Unknown distance never displaces a shop with a known one.
      if (od != null && (bd == null || od < bd)) best = o;
    }
  }
  return best;
}

/// GST for a cart line: the seller copy's own fields when present, otherwise
/// the canonical product's, mirroring web where GST lives on the product data.
({bool applicable, double rate}) gstForListing(
    ListingModel listing, CatalogModel catalog) {
  if (listing.gstApplicable == true && (listing.gstRate ?? 0) > 0) {
    return (applicable: true, rate: listing.gstRate!);
  }
  if (catalog.gstApplicable == true && (catalog.gstRate ?? 0) > 0) {
    return (applicable: true, rate: catalog.gstRate!);
  }
  return (applicable: false, rate: 0);
}

/// The cart line for buying one unit from [opt]'s store. [variantLabel] drives
/// the delivery-weight estimate, so it must be the size actually being bought.
CartItemModel cartItemForOption(
    CatalogModel catalog, StoreOption opt, String? variantLabel) {
  final listing = opt.listing;
  final gst = gstForListing(listing, catalog);
  return CartItemModel(
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
    variantLabel: variantLabel,
    gstApplicable: gst.applicable,
    gstRate: gst.rate,
  );
}
