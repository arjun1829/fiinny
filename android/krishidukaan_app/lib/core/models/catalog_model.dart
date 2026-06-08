import 'package:cloud_firestore/cloud_firestore.dart';

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
  });

  String get imageUrl => images.isNotEmpty ? images.first : '';
  bool get hasImages => images.isNotEmpty;
  bool get hasNpk =>
      nitrogen != null && phosphorus != null && potassium != null;

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
    final availability = d['availability'] as List?;
    final sellerCount = (d['sellerCount'] as num?)?.toInt() ??
        (availability?.length ?? 0);

    // Legacy: retailerPhone or retailerId as owner
    final createdByPhone = d['createdByPhone'] as String? ??
        d['retailerPhone'] as String?;

    // Generate nameSearch tokens if not stored
    final storedSearch = d['nameSearch'];
    final nameSearch = storedSearch is List
        ? List<String>.from(storedSearch)
        : _buildSearch(d['name'] as String? ?? '');

    return CatalogModel(
      id: doc.id,
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
