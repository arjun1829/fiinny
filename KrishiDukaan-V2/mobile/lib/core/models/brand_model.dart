import 'package:cloud_firestore/cloud_firestore.dart';

class BrandModel {
  final String phone;
  final String businessName;
  final String? ownerName;
  final String? logo;
  final String? tagline;
  final String? description;
  final String? slug;
  final String? primaryColor;
  final String? coverImage;
  final String? website;
  final String? location;
  final String? establishedYear;

  const BrandModel({
    required this.phone,
    required this.businessName,
    this.ownerName,
    this.logo,
    this.tagline,
    this.description,
    this.slug,
    this.primaryColor,
    this.coverImage,
    this.website,
    this.location,
    this.establishedYear,
  });

  factory BrandModel.fromFirestore(
    DocumentSnapshot mfrDoc,
    DocumentSnapshot? brandDoc,
  ) {
    final m = mfrDoc.data() as Map<String, dynamic>;
    final b = brandDoc?.data() as Map<String, dynamic>?;

    final addr = m['address'] as Map<String, dynamic>?;
    String? location;
    if (addr != null) {
      final city = addr['city'] as String?;
      final state = addr['state'] as String?;
      location = [city, state].where((s) => s != null && s.isNotEmpty).join(', ');
    }
    final establishedYear = m['establishedYear']?.toString();

    return BrandModel(
      phone: mfrDoc.id,
      businessName: m['businessName'] as String? ?? m['ownerName'] as String? ?? '',
      ownerName: m['ownerName'] as String?,
      logo: b?['logo'] as String? ?? m['logo'] as String?,
      tagline: b?['tagline'] as String?,
      description: b?['description'] as String?,
      slug: m['slug'] as String?,
      primaryColor: b?['primaryColor'] as String?,
      coverImage: b?['coverImage'] as String?,
      website: m['website'] as String?,
      location: location,
      establishedYear: establishedYear,
    );
  }
}

/// One retailer in a manufacturer's network, read from the public mirror docs at
/// `manufacturers/{phone}/retailers/{retailerPhone}`. Powers the brand page's
/// "Where to Buy" list (web parity with BrandView's retailer cards).
class BrandRetailerModel {
  final String phone;
  final String shopName;
  final String ownerName;
  final String city;
  final String state;
  final String line1;
  final double? lat;
  final double? lng;
  final String? logo;

  const BrandRetailerModel({
    required this.phone,
    required this.shopName,
    required this.ownerName,
    required this.city,
    required this.state,
    required this.line1,
    this.lat,
    this.lng,
    this.logo,
  });

  String get displayName => shopName.isNotEmpty
      ? shopName
      : (ownerName.isNotEmpty ? ownerName : 'Store');

  String get locationLabel =>
      [city, state].where((s) => s.isNotEmpty).join(', ');

  bool get hasLocation => lat != null && lng != null;

  factory BrandRetailerModel.fromMirror(String id, Map<String, dynamic> r) {
    final addr =
        (r['address'] as Map?)?.cast<String, dynamic>() ?? const <String, dynamic>{};

    double? lat;
    double? lng;
    final geo = r['geo'];
    if (geo is GeoPoint) {
      lat = geo.latitude;
      lng = geo.longitude;
    } else if (geo is Map) {
      lat = (geo['latitude'] as num?)?.toDouble();
      lng = (geo['longitude'] as num?)?.toDouble();
    }

    final logo = (r['logo'] as String?) ?? '';

    return BrandRetailerModel(
      phone: id,
      shopName: (r['shopName'] ?? '').toString(),
      ownerName: (r['ownerName'] ?? '').toString(),
      city: (addr['city'] ?? '').toString(),
      state: (addr['state'] ?? '').toString(),
      line1: (addr['line1'] ?? '').toString(),
      lat: lat,
      lng: lng,
      logo: logo.isNotEmpty ? logo : null,
    );
  }
}
