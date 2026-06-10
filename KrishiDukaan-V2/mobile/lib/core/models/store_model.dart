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

  const StoreModel({
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
  });

  bool get hasLocation => lat != null && lng != null && lat != 0.0 && lng != 0.0;
}
