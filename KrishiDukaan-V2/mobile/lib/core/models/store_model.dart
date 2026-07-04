class StoreModel {
  final String id;
  final String name;
  final String? ownerName;
  final String? phone;
  // Firebase Auth UID stored on the profile doc. Legacy availability entries
  // key sellers by this UID (storeId == uid), so we match against it too.
  final String? userId;
  final String? address;
  final String? logo;
  final double? lat;
  final double? lng;
  final double? averageRating;
  final int? totalReviews;
  final String? city;
  final String? state;
  final String? pincode;
  // 'retailer' | 'manufacturer' | '' — drives the "Visit Brand Page" action.
  final String role;

  /// The seller's own Google Maps / Google Business listing URL (set in their
  /// profile). When present it beats raw coordinates for the "open in maps"
  /// action — the listing shows photos, reviews and live timings.
  final String? googleMapsUrl;

  // Distance from the user in km. Set client-side after a Haversine calc;
  // null when either the store or the user has no usable location.
  double? distanceKm;

  StoreModel({
    required this.id,
    required this.name,
    this.ownerName,
    this.phone,
    this.userId,
    this.address,
    this.logo,
    this.lat,
    this.lng,
    this.averageRating,
    this.totalReviews,
    this.city,
    this.state,
    this.pincode,
    this.role = '',
    this.googleMapsUrl,
    this.distanceKm,
  });

  bool get hasLocation => lat != null && lng != null && lat != 0.0 && lng != 0.0;

  bool get hasGoogleListing =>
      googleMapsUrl != null && googleMapsUrl!.trim().startsWith('http');

  bool get isManufacturer => role == 'manufacturer';

  /// Full address line built from the parts we have, deduped of empties.
  String get fullAddress => [
        address,
        city,
        state,
        pincode,
      ].where((s) => s != null && s.trim().isNotEmpty).join(', ');
}
