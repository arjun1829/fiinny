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
  final List<VariantModel> variants;
  final DiscountModel? discount;
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
  final DateTime? updatedAt;

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
    required this.variants,
    this.discount,
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
    this.updatedAt,
    this.distanceKm,
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
      variants: (d['variants'] as List? ?? [])
          .map((v) => VariantModel.fromMap(v as Map<String, dynamic>))
          .toList(),
      discount: DiscountModel.fromProductData(d),
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
      updatedAt: updatedAt,
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
  final int stock;

  const VariantModel({
    required this.label,
    required this.price,
    required this.stock,
  });

  /// Web stores variants as `{unit, price, stock}` (see inventory.ts
  /// ProductVariant); `label` is the mobile-legacy key. Read both — otherwise
  /// web-created products show blank size chips and, worse, the cart's
  /// variantLabel is empty so the delivery weight estimate is always 0 kg.
  factory VariantModel.fromMap(Map<String, dynamic> m) => VariantModel(
        label: m['label'] as String? ?? m['unit'] as String? ?? '',
        price: (m['price'] as num?)?.toDouble() ?? 0.0,
        stock: (m['stock'] as num?)?.toInt() ?? 0,
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
  static DiscountModel? fromAvailabilityEntry(Map<String, dynamic> entry) {
    final discType = entry['discountType'] as String? ?? 'percentage';
    if (discType == 'fixed_amount') {
      final amt = (entry['discountFixedAmt'] as num?)?.toDouble() ?? 0.0;
      if (amt <= 0) return null;
      return DiscountModel(percentage: 0.0, fixedAmount: amt, type: 'fixed_amount', isActive: true);
    }
    final pct = (entry['discountPct'] as num?)?.toDouble() ?? 0.0;
    if (pct <= 0) return null;
    return DiscountModel(percentage: pct, isActive: true);
  }
}
