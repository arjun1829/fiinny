import 'package:cloud_firestore/cloud_firestore.dart';

class ListingModel {
  final String id;
  final String catalogId;
  final String sellerPhone;
  final String sellerName;
  final String sellerType; // 'retailer' | 'manufacturer'
  final String? sellerAddress;
  final double? sellerLat;
  final double? sellerLng;
  final double price;
  final int stockQuantity;

  /// Stock level at or below which the seller gets a `low_stock` notification.
  /// Null means the product has never been configured and the server's
  /// DEFAULT_LOW_STOCK_THRESHOLD (10) applies — see notifyLowStock in
  /// functions/src/notifications/inventory.ts.
  final int? lowStockThreshold;

  final List<VariantModel> variants;
  final DiscountModel? discount;

  /// Quantity-based discount ladder — independent of [discount]: a product
  /// can have bulk tiers with or without a base discount also active. Mirrors
  /// web's `bulkDiscountEnabled` / `bulkDiscountTiers` fields exactly.
  final bool bulkDiscountEnabled;
  final List<BulkDiscountTierModel> bulkDiscountTiers;
  final String? assignedByManufacturerPhone;
  final String? productName;
  final String? category;
  final String? imageUrl;
  final List<String> images;
  final bool isActive;
  final bool isOnline;
  final String? sellMode;
  final bool? gstApplicable;
  final double? gstRate;

  /// Whether [gstRate] is already inside the price (default true).
  final bool gstIncluded;

  /// Per-product delivery surcharge (₹) on top of the seller's slab charge.
  final double extraDeliveryCharge;

  /// This product ships free: no weight and no delivery charge.
  final bool freeDelivery;
  final DateTime? updatedAt;

  /// Product-detail-page view count, bumped by `ProductDetailScreen` (and by
  /// web's `trackProductClick`) on the SAME doc — the canonical product page
  /// a shopper actually opens. Summed across a seller's own listings for the
  /// Profile mini-dashboard's "Views" stat.
  final int clicks;

  /// Marketplace card impression count and "get directions" tap count — same
  /// fields web's `fetchRetailerAnalytics` sums into "Total Views" and
  /// "Directions" on the dashboard Overview cards. Mobile doesn't write
  /// `impressions` itself yet (only `clicks`/`directionRequests`, via
  /// ProductDetailScreen), but both fields live on the same shared `products`
  /// doc web writes to, so reading them here keeps mobile's Overview numbers
  /// identical to web's rather than silently zero.
  final int impressions;
  final int directionRequests;

  final String collectionPath;

  // Set client-side after Haversine calculation
  double? distanceKm;

  ListingModel({
    required this.id,
    required this.catalogId,
    required this.sellerPhone,
    required this.sellerName,
    required this.sellerType,
    this.sellerAddress,
    this.sellerLat,
    this.sellerLng,
    required this.price,
    required this.stockQuantity,
    this.lowStockThreshold,
    required this.variants,
    this.discount,
    this.bulkDiscountEnabled = false,
    this.bulkDiscountTiers = const [],
    this.assignedByManufacturerPhone,
    this.productName,
    this.category,
    this.imageUrl,
    this.images = const [],
    this.isActive = true,
    this.isOnline = true,
    this.sellMode,
    this.gstApplicable,
    this.gstRate,
    this.gstIncluded = true,
    this.extraDeliveryCharge = 0,
    this.freeDelivery = false,
    this.updatedAt,
    this.distanceKm,
    this.clicks = 0,
    this.impressions = 0,
    this.directionRequests = 0,
    this.collectionPath = 'products',
  });

  bool get isInStock => stockQuantity > 0;
  bool get hasLocation => sellerLat != null && sellerLng != null;

  double get effectivePrice {
    if (discount != null && discount!.isCurrentlyActive) {
      return (price - discount!.discountAmount(price)).clamp(0.0, double.infinity);
    }
    return price;
  }

  /// The best-matching bulk tier for buying [quantity] units, or null if bulk
  /// discounts are off, empty, or no tier's minimum is met. Higher tiers
  /// override lower ones — matches web's `getBulkDiscountPct`.
  BulkDiscountTierModel? bulkTierFor(int quantity) {
    if (!bulkDiscountEnabled || bulkDiscountTiers.isEmpty) return null;
    BulkDiscountTierModel? best;
    for (final t in bulkDiscountTiers) {
      if (quantity >= t.minQty && (best == null || t.minQty > best.minQty)) {
        best = t;
      }
    }
    return best;
  }

  factory ListingModel.fromFirestore(DocumentSnapshot doc) {
    final d = doc.data() as Map<String, dynamic>;
    final geo = d['sellerGeo'] as Map<String, dynamic>?;

    // Parse images — web uses images[] array; legacy uses image string
    List<String> imgs;
    final rawImages = d['images'];
    if (rawImages is List && rawImages.isNotEmpty) {
      imgs = rawImages.map((e) => e.toString()).where((s) => s.isNotEmpty).toList();
    } else {
      final single = d['image'] as String? ?? d['imageUrl'] as String?;
      imgs = (single != null && single.isNotEmpty) ? [single] : [];
    }

    final updatedAtRaw = d['updatedAt'] ?? d['createdAt'];
    final updatedAt = updatedAtRaw is Timestamp
        ? updatedAtRaw.toDate()
        : (updatedAtRaw is String ? DateTime.tryParse(updatedAtRaw) : null);

    return ListingModel(
      id: doc.id,
      collectionPath: doc.reference.parent.id,
      // Web products use doc.id as the canonical product id; no separate catalogId
      catalogId: d['catalogId'] as String? ??
          d['originalProductId'] as String? ??
          doc.id,
      // Web uses retailerPhone / ownerPhone instead of sellerPhone
      sellerPhone: d['sellerPhone'] as String? ??
          d['retailerPhone'] as String? ??
          d['ownerPhone'] as String? ?? '',
      // Web uses 'store' instead of 'sellerName'
      sellerName: d['sellerName'] as String? ??
          d['store'] as String? ?? '',
      sellerType: d['sellerType'] as String? ??
          ((d['ownerType'] as String?) == 'manufacturer' ? 'manufacturer' : 'retailer'),
      sellerAddress: d['sellerAddress'] as String? ?? d['address'] as String?,
      sellerLat: (geo?['lat'] as num?)?.toDouble() ??
          (d['lat'] as num?)?.toDouble(),
      sellerLng: (geo?['lng'] as num?)?.toDouble() ??
          (d['lng'] as num?)?.toDouble(),
      price: (d['price'] as num?)?.toDouble() ??
          (d['sellingPrice'] as num?)?.toDouble() ?? 0.0,
      stockQuantity: _parseStock(d),
      lowStockThreshold: (d['lowStockThreshold'] as num?)?.toInt(),
      variants: (d['variants'] as List? ?? [])
          .map((v) => VariantModel.fromMap(v as Map<String, dynamic>))
          .toList(),
      discount: DiscountModel.fromProductData(d),
      bulkDiscountEnabled: d['bulkDiscountEnabled'] as bool? ?? false,
      bulkDiscountTiers: (d['bulkDiscountTiers'] as List? ?? [])
          .whereType<Map>()
          .map((t) => BulkDiscountTierModel.fromMap(Map<String, dynamic>.from(t)))
          .toList(),
      assignedByManufacturerPhone:
          d['assignedByManufacturerPhone'] as String?,
      productName: d['name'] as String? ?? d['fullName'] as String?,
      category: d['category'] as String?,
      imageUrl: imgs.isNotEmpty ? imgs.first : null,
      images: imgs,
      isActive: d['isActive'] as bool? ?? true,
      isOnline: d['isOnline'] as bool? ?? (d['sellMode'] != "offline_store_only"),
      sellMode: d['sellMode'] as String?,
      gstApplicable: d['gstApplicable'] as bool?,
      gstRate: (d['gstRate'] as num?)?.toDouble(),
      gstIncluded: d['gstIncluded'] != false,
      extraDeliveryCharge: () {
        final n = (d['extraDeliveryCharge'] as num?)?.toDouble() ?? 0;
        return n > 0 ? n : 0.0;
      }(),
      freeDelivery: d['freeDelivery'] == true,
      updatedAt: updatedAt,
      clicks: (d['clicks'] as num?)?.toInt() ?? 0,
      impressions: (d['impressions'] as num?)?.toInt() ?? 0,
      directionRequests: (d['directionRequests'] as num?)?.toInt() ?? 0,
    );
  }

  static int _parseStock(Map<String, dynamic> d) {
    final qty = d['stockQuantity'];
    if (qty is num && qty.toInt() > 0) return qty.toInt();
    final stock = d['stock'];
    if (stock is num) return stock > 0 ? stock.toInt() : 0;
    // Web writes stock: "In Stock" string — treat as 1 so isInStock returns true
    if (stock is String && stock.isNotEmpty) {
      return stock.toLowerCase().startsWith('out') ? 0 : 1;
    }
    // No stock field: active products are assumed available
    return d['isActive'] != false ? 1 : 0;
  }
}

class VariantModel {
  final String label;
  final double price;

  /// Per-size stock. NULLABLE on purpose: `null` means "this size carries no
  /// stock figure", which is NOT the same as `0` ("explicitly out of stock").
  ///
  /// Canonical/web-created variants routinely omit `stock` — per-store stock
  /// lives on that store's availability entry, not on the shared size list.
  /// While this defaulted to 0, every such size rendered as Out of Stock and
  /// the chip was unselectable, so the buyer could never pick it. Mirrors
  /// web's resolveStoreVariant, which only treats a size as out of stock when
  /// `stock !== undefined && stock === 0`.
  final int? stock;

  const VariantModel({
    required this.label,
    required this.price,
    required this.stock,
  });

  /// True only when this size is *known* to be out of stock. A missing figure
  /// is treated as available, matching web.
  bool get isOutOfStock => stock == 0;

  /// Web stores variants as `{unit, price, stock}` (see inventory.ts
  /// ProductVariant); `label` is the mobile-legacy key. Read both — otherwise
  /// web-created products show blank size chips and, worse, the cart's
  /// variantLabel is empty so the delivery weight estimate is always 0 kg.
  factory VariantModel.fromMap(Map<String, dynamic> m) => VariantModel(
        label: m['label'] as String? ?? m['unit'] as String? ?? '',
        price: (m['price'] as num?)?.toDouble() ?? 0.0,
        stock: (m['stock'] as num?)?.toInt(),
      );

  // Write both keys so web (reads `unit`) and older mobile builds (read
  // `label`) both resolve mobile-created variants.
  Map<String, dynamic> toMap() => {
        'label': label,
        'unit': label,
        'price': price,
        'stock': stock,
      };
}

/// One rung of a bulk/quantity-discount ladder — matches web's
/// `BulkDiscountTier` (`app/dashboard/_types/inventory.ts`) field for field.
class BulkDiscountTierModel {
  /// Minimum quantity to trigger this tier.
  final int minQty;

  /// Percentage off at this tier, 1-99.
  final double discountPct;

  const BulkDiscountTierModel({required this.minQty, required this.discountPct});

  factory BulkDiscountTierModel.fromMap(Map<String, dynamic> m) =>
      BulkDiscountTierModel(
        minQty: (m['minQty'] as num?)?.toInt() ?? 1,
        discountPct: (m['discountPct'] as num?)?.toDouble() ?? 0.0,
      );

  Map<String, dynamic> toMap() => {'minQty': minQty, 'discountPct': discountPct};
}

class DiscountModel {
  final double percentage;
  final double fixedAmount;
  final String type; // 'percentage' | 'fixed_amount'
  final DateTime? startDate;
  final DateTime? endDate;
  final bool isActive;

  const DiscountModel({
    required this.percentage,
    this.fixedAmount = 0.0,
    this.type = 'percentage',
    this.startDate,
    this.endDate,
    required this.isActive,
  });

  bool get isCurrentlyActive {
    if (!isActive) return false;
    final now = DateTime.now();
    if (startDate != null && now.isBefore(startDate!)) return false;
    if (endDate != null && now.isAfter(endDate!)) return false;
    return true;
  }

  /// The effective discount amount given [basePrice]. Works for both types.
  double discountAmount(double basePrice) {
    if (!isCurrentlyActive) return 0.0;
    if (type == 'fixed_amount') return fixedAmount.clamp(0.0, basePrice);
    return basePrice * percentage / 100;
  }

  factory DiscountModel.fromMap(Map<String, dynamic> m) => DiscountModel(
        percentage: (m['percentage'] as num?)?.toDouble() ?? 0.0,
        startDate: (m['startDate'] as Timestamp?)?.toDate(),
        endDate: (m['endDate'] as Timestamp?)?.toDate(),
        isActive: m['isActive'] as bool? ?? false,
      );

  /// Parses a discount from a product/inventory doc using the canonical FLAT
  /// schema shared with the web (`discountEnabled`, `discountPct`,
  /// `discountStartDate`, `discountEndDate`, `discountFixedAmt`).
  /// Falls back to the legacy nested `discount: {isActive, percentage, ...}` map.
  static DiscountModel? fromProductData(Map<String, dynamic> d) {
    final hasFlat = d.containsKey('discountPct') ||
        d.containsKey('discountEnabled') ||
        d.containsKey('effectiveDiscountPct') ||
        d.containsKey('discountFixedAmt');
    if (hasFlat) {
      final enabled = d['discountEnabled'] as bool? ??
          ((d['effectiveDiscountPct'] as num?)?.toDouble() ?? 0) > 0;
      if (!enabled) return null;
      final discType = d['discountType'] as String? ?? 'percentage';
      if (discType == 'fixed_amount') {
        final amt = (d['discountFixedAmt'] as num?)?.toDouble() ?? 0.0;
        if (amt <= 0) return null;
        return DiscountModel(
          percentage: 0.0,
          fixedAmount: amt,
          type: 'fixed_amount',
          isActive: true,
          startDate: (d['discountStartDate'] as Timestamp?)?.toDate(),
          endDate: (d['discountEndDate'] as Timestamp?)?.toDate(),
        );
      }
      final pct = (d['discountPct'] as num?)?.toDouble() ??
          (d['effectiveDiscountPct'] as num?)?.toDouble() ??
          0.0;
      if (pct <= 0) return null;
      return DiscountModel(
        percentage: pct,
        type: 'percentage',
        isActive: true,
        startDate: (d['discountStartDate'] as Timestamp?)?.toDate(),
        endDate: (d['discountEndDate'] as Timestamp?)?.toDate(),
      );
    }
    final m = d['discount'];
    if (m is Map) return DiscountModel.fromMap(Map<String, dynamic>.from(m));
    return null;
  }

  /// Builds a discount from a single `availability[]` entry.
  ///
  /// Newer entries (written by DashboardRepository.syncMarketMirror /
  /// web's syncAvailabilityDiscount) carry `discountEnabled` + the raw
  /// start/end dates alongside `discountPct`, so isCurrentlyActive re-checks
  /// validity live on every read — exactly like fromProductData. Older
  /// entries only ever had a bare `discountPct` number with no dates; those
  /// are treated as active whenever positive (unchanged legacy behavior —
  /// there's no date info to invalidate them with).
  static DiscountModel? fromAvailabilityEntry(Map<String, dynamic> entry) {
    final discType = entry['discountType'] as String? ?? 'percentage';
    final hasEnabledFlag = entry.containsKey('discountEnabled');
    if (hasEnabledFlag && entry['discountEnabled'] != true) return null;
    if (discType == 'fixed_amount') {
      final amt = (entry['discountFixedAmt'] as num?)?.toDouble() ?? 0.0;
      if (amt <= 0) return null;
      return DiscountModel(
        percentage: 0.0,
        fixedAmount: amt,
        type: 'fixed_amount',
        isActive: true,
        startDate: (entry['discountStartDate'] as Timestamp?)?.toDate(),
        endDate: (entry['discountEndDate'] as Timestamp?)?.toDate(),
      );
    }
    final pct = (entry['discountPct'] as num?)?.toDouble() ?? 0.0;
    if (pct <= 0) return null;
    return DiscountModel(
      percentage: pct,
      isActive: true,
      startDate: (entry['discountStartDate'] as Timestamp?)?.toDate(),
      endDate: (entry['discountEndDate'] as Timestamp?)?.toDate(),
    );
  }
}
