import 'package:cloud_firestore/cloud_firestore.dart';
import '../utils/image_utils.dart';
import 'listing_model.dart';

class AvailabilityEntry {
  final String storeId;
  final String? storePhone;
  final String? storeName;
  final String? stockLevel;
  final double sellingPrice;
  final bool? isOnline;
  final List<VariantModel>? variants;

  const AvailabilityEntry({
    required this.storeId,
    this.storePhone,
    this.storeName,
    this.stockLevel,
    required this.sellingPrice,
    this.isOnline,
    this.variants,
  });

  factory AvailabilityEntry.fromMap(Map<String, dynamic> m) {
    return AvailabilityEntry(
      storeId: (m['storeId'] ?? '').toString(),
      storePhone: m['storePhone']?.toString(),
      storeName: m['storeName']?.toString(),
      stockLevel: m['stockLevel']?.toString(),
      sellingPrice: (m['sellingPrice'] as num?)?.toDouble() ?? 0.0,
      isOnline: m['isOnline'] as bool?,
      variants: (m['variants'] as List?)
          ?.map((v) => VariantModel.fromMap(v as Map<String, dynamic>))
          .toList(),
    );
  }

  Map<String, dynamic> toMap() => {
    'storeId': storeId,
    'storePhone': storePhone,
    'storeName': storeName,
    'stockLevel': stockLevel,
    'sellingPrice': sellingPrice,
    'isOnline': isOnline,
    'variants': variants?.map((v) => v.toMap()).toList(),
  };
}

class CatalogModel {
  final String id;
  final String name;
  final List<String> nameSearch;
  final String category;
  final List<String> images;
  final double price;
  final String? description;
  final double? nitrogen;
  final double? phosphorus;
  final double? potassium;
  final String? createdByPhone;
  final int sellerCount;
  final double? rating;
  final int? reviewCount;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final bool isActive;

  /// Package size variants (label + price), same as web's variants[].
  final List<VariantModel>? variants;

  /// Base pack size (e.g. "800ml", "1kg") — web's `ProductDoc.unit`. Present
  /// on every product; `variants` is only for products offering MULTIPLE
  /// selectable sizes on top of this. Drives the delivery weight estimate
  /// for the common single-size product.
  final String? unit;

  /// Highest discount % offered by any seller for this product.
  final double maxDiscountPct;

  /// Per-seller effective discount %, keyed by seller UID/storeId AND phone.
  /// Mirrors web's `product.sellerDiscounts` — the source of truth for showing
  /// how much each store discounts. Populated during the marketplace merge.
  final Map<String, double> sellerDiscounts;

  // Merging / web schema fields
  final String? manufacturerId;
  final String? manufacturerPhone;
  final String? source;
  final String? retailerId;
  final String? retailerPhone;
  final String? store;
  final String? stock;
  final bool? isOnline;
  final String? sellMode;
  final bool? gstApplicable;
  final double? gstRate;
  final List<AvailabilityEntry>? availability;
  final double? lowestPrice;
  final double? nearestStoreDistanceKm;

  final String collectionPath;

  const CatalogModel({
    required this.id,
    required this.name,
    required this.nameSearch,
    required this.category,
    required this.images,
    required this.price,
    this.description,
    this.nitrogen,
    this.phosphorus,
    this.potassium,
    this.createdByPhone,
    required this.sellerCount,
    this.rating,
    this.reviewCount,
    this.createdAt,
    this.updatedAt,
    this.isActive = true,
    this.variants,
    this.unit,
    this.maxDiscountPct = 0,
    this.sellerDiscounts = const {},
    this.manufacturerId,
    this.manufacturerPhone,
    this.source,
    this.retailerId,
    this.retailerPhone,
    this.store,
    this.stock,
    this.isOnline,
    this.sellMode,
    this.gstApplicable,
    this.gstRate,
    this.availability,
    this.lowestPrice,
    this.nearestStoreDistanceKm,
    this.collectionPath = 'catalog',
  });

  // Platform-resolved image URLs (proxied on web so cross-origin hosts without
  // CORS still render — see resolveImageUrl). Use these in the UI, not the raw
  // `images` list.
  String get imageUrl => images.isNotEmpty ? resolveImageUrl(images.first) : '';
  List<String> get displayImages =>
      images.map(resolveImageUrl).toList(growable: false);
  bool get hasImages => images.isNotEmpty;
  bool get hasNpk =>
      nitrogen != null && phosphorus != null && potassium != null;

  CatalogModel copyWith({
    String? id,
    String? name,
    List<String>? nameSearch,
    String? category,
    List<String>? images,
    double? price,
    String? description,
    double? nitrogen,
    double? phosphorus,
    double? potassium,
    String? createdByPhone,
    int? sellerCount,
    double? rating,
    int? reviewCount,
    DateTime? createdAt,
    DateTime? updatedAt,
    bool? isActive,
    List<VariantModel>? variants,
    String? unit,
    double? maxDiscountPct,
    Map<String, double>? sellerDiscounts,
    String? manufacturerId,
    String? manufacturerPhone,
    String? source,
    String? retailerId,
    String? retailerPhone,
    String? store,
    String? stock,
    bool? isOnline,
    String? sellMode,
    bool? gstApplicable,
    double? gstRate,
    List<AvailabilityEntry>? availability,
    double? lowestPrice,
    double? nearestStoreDistanceKm,
    String? collectionPath,
  }) {
    return CatalogModel(
      id: id ?? this.id,
      name: name ?? this.name,
      nameSearch: nameSearch ?? this.nameSearch,
      category: category ?? this.category,
      images: images ?? this.images,
      price: price ?? this.price,
      description: description ?? this.description,
      nitrogen: nitrogen ?? this.nitrogen,
      phosphorus: phosphorus ?? this.phosphorus,
      potassium: potassium ?? this.potassium,
      createdByPhone: createdByPhone ?? this.createdByPhone,
      sellerCount: sellerCount ?? this.sellerCount,
      rating: rating ?? this.rating,
      reviewCount: reviewCount ?? this.reviewCount,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      isActive: isActive ?? this.isActive,
      variants: variants ?? this.variants,
      unit: unit ?? this.unit,
      maxDiscountPct: maxDiscountPct ?? this.maxDiscountPct,
      sellerDiscounts: sellerDiscounts ?? this.sellerDiscounts,
      manufacturerId: manufacturerId ?? this.manufacturerId,
      manufacturerPhone: manufacturerPhone ?? this.manufacturerPhone,
      source: source ?? this.source,
      retailerId: retailerId ?? this.retailerId,
      retailerPhone: retailerPhone ?? this.retailerPhone,
      store: store ?? this.store,
      stock: stock ?? this.stock,
      isOnline: isOnline ?? this.isOnline,
      sellMode: sellMode ?? this.sellMode,
      gstApplicable: gstApplicable ?? this.gstApplicable,
      gstRate: gstRate ?? this.gstRate,
      availability: availability ?? this.availability,
      lowestPrice: lowestPrice ?? this.lowestPrice,
      nearestStoreDistanceKm:
          nearestStoreDistanceKm ?? this.nearestStoreDistanceKm,
      collectionPath: collectionPath ?? this.collectionPath,
    );
  }

  factory CatalogModel.fromFirestore(DocumentSnapshot doc) {
    final d = doc.data() as Map<String, dynamic>;

    // Handle both new schema (images: []) and legacy schema (image: "url")
    List<String> imgs;
    final rawImages = d['images'];
    if (rawImages is List && rawImages.isNotEmpty) {
      imgs = List<String>.from(rawImages);
    } else {
      final single = d['image'] as String?;
      imgs = (single != null && single.isNotEmpty) ? [single] : [];
    }

    // Legacy products use availability array length as seller count
    final availabilityList = d['availability'] as List?;
    final sellerCount =
        (d['sellerCount'] as num?)?.toInt() ?? (availabilityList?.length ?? 0);

    // Legacy: retailerPhone or retailerId as owner
    final createdByPhone =
        d['createdByPhone'] as String? ?? d['retailerPhone'] as String?;

    // Generate nameSearch tokens if not stored
    final storedSearch = d['nameSearch'];
    final nameSearch = storedSearch is List
        ? List<String>.from(storedSearch)
        : _buildSearch(d['name'] as String? ?? '');

    // Parse variants (package sizes)
    final rawVariants = d['variants'] as List?;
    final parsedVariants = rawVariants != null && rawVariants.isNotEmpty
        ? rawVariants
              .map((v) => VariantModel.fromMap(v as Map<String, dynamic>))
              .toList()
              .cast<VariantModel>()
        : null;

    // Max discount % for the card badge/price.
    //
    // `maxDiscountPct`/`effectiveDiscountPct` are snapshots written once at
    // discount-save time (see DashboardRepository.setDiscount /
    // web's updateDiscountRecord) — they are NEVER re-evaluated afterward.
    // Once a discount's end date passes (or it's disabled), that stored
    // number stays frozen at the old active %, so the marketplace card kept
    // showing "X% OFF" / a discounted price forever while the product-detail
    // seller tile (DiscountModel.fromProductData, which re-checks dates on
    // every read) correctly showed no offer — exactly the mismatch reported.
    //
    // Fix: when the raw discount fields are present on this doc, recompute
    // liveness the same way DiscountModel does, instead of trusting the
    // stale snapshot. Only fall back to the stored field when the raw fields
    // are absent (e.g. an older doc shape).
    double maxDiscountPct;
    final hasRawDiscountFields = d.containsKey('discountPct') ||
        d.containsKey('discountEnabled') ||
        d.containsKey('discountFixedAmt');
    if (hasRawDiscountFields) {
      final enabled = d['discountEnabled'] as bool? ?? false;
      final discType = d['discountType'] as String? ?? 'percentage';
      final now = DateTime.now();
      final start = (d['discountStartDate'] as Timestamp?)?.toDate();
      final end = (d['discountEndDate'] as Timestamp?)?.toDate();
      final withinWindow =
          !(start != null && now.isBefore(start)) &&
          !(end != null && now.isAfter(end));
      final isLiveNow = enabled && withinWindow;
      maxDiscountPct = (isLiveNow && discType != 'fixed_amount')
          ? ((d['discountPct'] as num?)?.toDouble() ?? 0.0)
          : 0.0;
    } else {
      final rawMaxDiscount = d['maxDiscountPct'] ?? d['effectiveDiscountPct'];
      maxDiscountPct = (rawMaxDiscount as num?)?.toDouble() ?? 0.0;
    }
    if (maxDiscountPct == 0) {
      final sellerDiscounts = d['sellerDiscounts'] as Map?;
      if (sellerDiscounts != null && sellerDiscounts.isNotEmpty) {
        maxDiscountPct = sellerDiscounts.values
            .map((v) => (v as num?)?.toDouble() ?? 0.0)
            .fold<double>(0, (a, b) => a > b ? a : b);
      }
    }

    final manufacturerId = d['manufacturerId'] as String?;
    final manufacturerPhone = d['manufacturerPhone'] as String?;
    final source = d['source'] as String?;
    final retailerId = d['retailerId'] as String?;
    final retailerPhone = d['retailerPhone'] as String?;
    final store = d['store'] as String?;
    final stock = d['stock']?.toString();
    final isOnline =
        d['isOnline'] as bool? ?? (d['sellMode'] != "offline_store_only");
    final sellMode = d['sellMode'] as String? ?? "online_delivery";
    final gstApplicable = d['gstApplicable'] as bool?;
    final gstRate = (d['gstRate'] as num?)?.toDouble();

    final availability = availabilityList
        ?.map(
          (v) => AvailabilityEntry.fromMap(Map<String, dynamic>.from(v as Map)),
        )
        .toList();

    final rawUpdatedAt = d['updatedAt'] ?? d['createdAt'];
    final updatedAt = rawUpdatedAt is Timestamp
        ? rawUpdatedAt.toDate()
        : (rawUpdatedAt is String ? DateTime.tryParse(rawUpdatedAt) : null);

    return CatalogModel(
      id: doc.id,
      collectionPath: doc.reference.parent.id,
      name: d['name'] as String? ?? d['fullName'] as String? ?? '',
      nameSearch: nameSearch,
      category: d['category'] as String? ?? 'general',
      images: imgs,
      price: (d['price'] as num?)?.toDouble() ?? 0.0,
      description: d['description'] as String?,
      nitrogen: _parseNum(d['nitrogen']),
      phosphorus: _parseNum(d['phosphorus']),
      potassium: _parseNum(d['potassium']),
      createdByPhone: createdByPhone,
      sellerCount: sellerCount,
      rating: (d['averageRating'] as num?)?.toDouble(),
      reviewCount: (d['reviewCount'] as num?)?.toInt(),
      createdAt: (d['createdAt'] as Timestamp?)?.toDate(),
      updatedAt: updatedAt,
      isActive: d['isActive'] as bool? ?? true,
      variants: parsedVariants,
      unit: d['unit'] as String?,
      maxDiscountPct: maxDiscountPct,
      manufacturerId: manufacturerId,
      manufacturerPhone: manufacturerPhone,
      source: source,
      retailerId: retailerId,
      retailerPhone: retailerPhone,
      store: store,
      stock: stock,
      isOnline: isOnline,
      sellMode: sellMode,
      gstApplicable: gstApplicable,
      gstRate: gstRate,
      availability: availability,
      nearestStoreDistanceKm: (d['nearestStoreDistanceKm'] as num?)?.toDouble(),
    );
  }

  static double? _parseNum(dynamic v) {
    if (v == null) return null;
    if (v is num) return v.toDouble();
    if (v is String) return double.tryParse(v);
    return null;
  }

  static List<String> _buildSearch(String name) {
    final lower = name.toLowerCase();
    final tokens = <String>{};
    for (int i = 1; i <= lower.length; i++) {
      tokens.add(lower.substring(0, i));
    }
    for (final word in lower.split(' ')) {
      for (int i = 1; i <= word.length; i++) {
        tokens.add(word.substring(0, i));
      }
    }
    return tokens.toList();
  }
}
