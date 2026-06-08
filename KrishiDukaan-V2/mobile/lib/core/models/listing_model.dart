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
    this.distanceKm,
  });

  bool get isInStock => stockQuantity > 0;
  bool get hasLocation => sellerLat != null && sellerLng != null;

  double get effectivePrice {
    if (discount != null && discount!.isActive) {
      return price * (1 - discount!.percentage / 100);
    }
    return price;
  }

  factory ListingModel.fromFirestore(DocumentSnapshot doc) {
    final d = doc.data() as Map<String, dynamic>;
    final geo = d['sellerGeo'] as Map<String, dynamic>?;
    final discountData = d['discount'] as Map<String, dynamic>?;
    return ListingModel(
      id: doc.id,
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
      discount: discountData != null
          ? DiscountModel.fromMap(discountData)
          : null,
      assignedByManufacturerPhone:
          d['assignedByManufacturerPhone'] as String? ??
          d['assignedByManufacturerPhone'] as String?,
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

  factory VariantModel.fromMap(Map<String, dynamic> m) => VariantModel(
        label: m['label'] as String? ?? '',
        price: (m['price'] as num?)?.toDouble() ?? 0.0,
        stock: (m['stock'] as num?)?.toInt() ?? 0,
      );

  Map<String, dynamic> toMap() => {
        'label': label,
        'price': price,
        'stock': stock,
      };
}

class DiscountModel {
  final double percentage;
  final DateTime? startDate;
  final DateTime? endDate;
  final bool isActive;

  const DiscountModel({
    required this.percentage,
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

  factory DiscountModel.fromMap(Map<String, dynamic> m) => DiscountModel(
        percentage: (m['percentage'] as num?)?.toDouble() ?? 0.0,
        startDate: (m['startDate'] as Timestamp?)?.toDate(),
        endDate: (m['endDate'] as Timestamp?)?.toDate(),
        isActive: m['isActive'] as bool? ?? false,
      );
}
