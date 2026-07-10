import 'package:cloud_firestore/cloud_firestore.dart';

/// A manufacturer's public brand page, assembled from two docs exactly like the
/// web (app/dashboard/_lib/brand-page-types.ts assembleBrandData):
///   - manufacturers/{phone}  — profile: name, address, geo, logo, banner…
///   - brandPages/{phone}     — optional customization: tagline, about, banner,
///                              certifications, videos, socialProof…
///
/// Field-name gotchas (the old model read the wrong names and showed nothing):
///   - description → the canonical field is `about` (legacy `description` kept
///     as fallback for docs saved by very old app builds)
///   - coverImage  → canonical is `banner`, also present on the manufacturer doc
///   - achievements → canonical is `certifications`
///   - videoLink   → canonical is `videos` (a LIST of YouTube video ids)
/// Customization strings default to "" when saved, so fallbacks must treat
/// empty string as absent (web uses `||`, not `??`).
class BrandModel {
  final String phone;
  final String secondaryPhone;
  final String businessName;
  final String? ownerName;
  final String? email;
  final String? logo;
  final String? tagline;
  final String? about;
  final String? slug;
  final String? primaryColor;
  final String? banner;
  final String? website;
  final String? location;
  final String? fullAddress;
  final String? establishedYear;
  final String? socialProof;
  final List<String> certifications;
  final List<String> videos;
  final double? lat;
  final double? lng;
  final Map<String, String>? socialLinks;

  const BrandModel({
    required this.phone,
    this.secondaryPhone = '',
    required this.businessName,
    this.ownerName,
    this.email,
    this.logo,
    this.tagline,
    this.about,
    this.slug,
    this.primaryColor,
    this.banner,
    this.website,
    this.location,
    this.fullAddress,
    this.establishedYear,
    this.socialProof,
    this.certifications = const [],
    this.videos = const [],
    this.lat,
    this.lng,
    this.socialLinks,
  });

  bool get hasGeo => lat != null && lng != null;

  /// Years in business, like the web hero's "N+ Years" stat.
  int? get yearsActive {
    final y = int.tryParse(establishedYear ?? '');
    if (y == null || y < 1900) return null;
    final diff = DateTime.now().year - y;
    return diff >= 0 ? diff : null;
  }

  factory BrandModel.fromFirestore(
    DocumentSnapshot mfrDoc,
    DocumentSnapshot? brandDoc,
  ) {
    final m = mfrDoc.data() as Map<String, dynamic>;
    final b = brandDoc?.data() as Map<String, dynamic>? ?? const {};

    // Customization overrides profile, but "" never wins over a real value.
    String? pick(List<dynamic> candidates) {
      for (final c in candidates) {
        if (c is String && c.trim().isNotEmpty) return c.trim();
      }
      return null;
    }

    final addr = m['address'] as Map<String, dynamic>?;
    String? location;
    String? fullAddress;
    if (addr != null) {
      final city = addr['city'] as String?;
      final state = addr['state'] as String?;
      final line1 = addr['line1'] as String?;
      location =
          [city, state].where((s) => s != null && s.isNotEmpty).join(', ');
      fullAddress = [line1, city, state]
          .where((s) => s != null && s.isNotEmpty)
          .join(', ');
    }

    double? lat;
    double? lng;
    final geo = m['geo'];
    if (geo is GeoPoint) {
      lat = geo.latitude;
      lng = geo.longitude;
    } else if (geo is Map) {
      lat = (geo['latitude'] as num?)?.toDouble();
      lng = (geo['longitude'] as num?)?.toDouble();
    }

    Map<String, String>? socialLinks;
    if (b['socialLinks'] is Map) {
      socialLinks = (b['socialLinks'] as Map)
          .map((k, v) => MapEntry(k.toString(), v.toString()))
        ..removeWhere((_, v) => v.trim().isEmpty);
      if (socialLinks.isEmpty) socialLinks = null;
    }

    List<String> strList(dynamic v) => v is List
        ? v.map((e) => e.toString()).where((s) => s.trim().isNotEmpty).toList()
        : const [];

    // videos is the canonical list; a legacy single videoLink still counts.
    final videos = strList(b['videos']);
    final legacyVideo = pick([b['videoLink']]);
    if (videos.isEmpty && legacyVideo != null) videos.add(legacyVideo);

    final certifications = strList(b['certifications']).isNotEmpty
        ? strList(b['certifications'])
        : strList(b['achievements']);

    return BrandModel(
      phone: mfrDoc.id,
      secondaryPhone: pick([m['secondaryPhone']]) ?? '',
      businessName:
          m['businessName'] as String? ?? m['ownerName'] as String? ?? '',
      ownerName: m['ownerName'] as String?,
      email: pick([m['email']]),
      logo: pick([b['logo'], m['logo']]),
      tagline: pick([b['tagline']]),
      about: pick([b['about'], b['description']]),
      slug: m['slug'] as String?,
      primaryColor: pick([b['primaryColor']]),
      banner: pick([b['banner'], b['coverImage'], m['banner']]),
      website: pick([b['website'], m['website']]),
      location: location,
      fullAddress: fullAddress,
      establishedYear:
          pick([b['establishedYear'], m['establishedYear']?.toString()]),
      socialProof: pick([b['socialProof']]),
      certifications: certifications,
      videos: videos,
      lat: lat,
      lng: lng,
      socialLinks: socialLinks,
    );
  }
}

/// One retailer in a manufacturer's network, read from the global
/// `manufacturerRetailers` mirror docs. Powers the brand page's Dealers list
/// (web parity with BrandView's retailer cards).
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
