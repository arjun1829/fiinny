import 'package:cloud_firestore/cloud_firestore.dart';
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
  /// Highest discount % offered by any seller for this product.
  final double maxDiscountPct;

  // Merging / web schema fields
  final String? source;
  final String? retailerId;
  final String? retailerPhone;
  final String? store;
  final String? stock;
  final bool? isOnline;
  final String? sellMode;
  final List<AvailabilityEntry>? availability;
  final double? lowestPrice;

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
    this.maxDiscountPct = 0,
    this.source,
    this.retailerId,
    this.retailerPhone,
    this.store,
    this.stock,
    this.isOnline,
    this.sellMode,
    this.availability,
    this.lowestPrice,
    this.collectionPath = 'catalog',
  });

  String get imageUrl => images.isNotEmpty ? images.first : '';
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
    double? maxDiscountPct,
    String? source,
    String? retailerId,
    String? retailerPhone,
    String? store,
    String? stock,
    bool? isOnline,
    String? sellMode,
    List<AvailabilityEntry>? availability,
    double? lowestPrice,
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
      maxDiscountPct: maxDiscountPct ?? this.maxDiscountPct,
      source: source ?? this.source,
      retailerId: retailerId ?? this.retailerId,
      retailerPhone: retailerPhone ?? this.retailerPhone,
      store: store ?? this.store,
      stock: stock ?? this.stock,
      isOnline: isOnline ?? this.isOnline,
      sellMode: sellMode ?? this.sellMode,
      availability: availability ?? this.availability,
      lowestPrice: lowestPrice ?? this.lowestPrice,
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
    final sellerCount = (d['sellerCount'] as num?)?.toInt() ??
        (availabilityList?.length ?? 0);

    // Legacy: retailerPhone or retailerId as owner
    final createdByPhone = d['createdByPhone'] as String? ??
        d['retailerPhone'] as String?;

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

    // Max discount % — stored directly or derived from sellerDiscounts map
    final rawMaxDiscount = d['maxDiscountPct'] ?? d['effectiveDiscountPct'];
    double maxDiscountPct = (rawMaxDiscount as num?)?.toDouble() ?? 0.0;
    if (maxDiscountPct == 0) {
      final sellerDiscounts = d['sellerDiscounts'] as Map?;
      if (sellerDiscounts != null && sellerDiscounts.isNotEmpty) {
        maxDiscountPct = sellerDiscounts.values
            .map((v) => (v as num?)?.toDouble() ?? 0.0)
            .fold<double>(0, (a, b) => a > b ? a : b);
      }
    }

    final source = d['source'] as String?;
    final retailerId = d['retailerId'] as String?;
    final retailerPhone = d['retailerPhone'] as String?;
    final store = d['store'] as String?;
    final stock = d['stock']?.toString();
    final isOnline = d['isOnline'] as bool? ?? (d['sellMode'] != "offline_store_only");
    final sellMode = d['sellMode'] as String? ?? "online_delivery";

    final availability = availabilityList
        ?.map((v) => AvailabilityEntry.fromMap(Map<String, dynamic>.from(v as Map)))
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
      maxDiscountPct: maxDiscountPct,
      source: source,
      retailerId: retailerId,
      retailerPhone: retailerPhone,
      store: store,
      stock: stock,
      isOnline: isOnline,
      sellMode: sellMode,
      availability: availability,
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
