import 'package:cloud_firestore/cloud_firestore.dart';

class UserModel {
  final String uid;
  final String phone;
  final String name;
  final String? email;
  final String role;
  final bool isPaid;
  final int totalSeats;
  final int productCount;
  final String? fcmToken;
  final DateTime? createdAt;
  // Profile-completion fields (mirror the web's users/{phone} schema).
  final String? businessName;
  final String? address;
  final String? city;
  final String? state;
  final String? pincode;
  final bool profileCompleted;
  final String? username;

  /// Seller's GST registration number. The canonical copy lives on
  /// `retailers/{phone}.gstin` (what the web dashboard edits and the invoice
  /// generator reads); this users-doc mirror is for quick prefill.
  final String? gstin;

  const UserModel({
    required this.uid,
    required this.phone,
    required this.name,
    this.email,
    required this.role,
    required this.isPaid,
    required this.totalSeats,
    required this.productCount,
    this.fcmToken,
    this.createdAt,
    this.businessName,
    this.address,
    this.city,
    this.state,
    this.pincode,
    this.profileCompleted = false,
    this.username,
    this.gstin,
  });

  /// True once the essential profile fields are filled. Sellers additionally
  /// need a business name; everyone needs a name. Mirrors the web's
  /// businessName + location completeness check.
  bool get isProfileComplete {
    if (profileCompleted) return true;
    final hasName = name.trim().isNotEmpty;
    final hasLocation = (city ?? '').trim().isNotEmpty ||
        (address ?? '').trim().isNotEmpty;
    if (isSeller) {
      return hasName && (businessName ?? '').trim().isNotEmpty && hasLocation;
    }
    return hasName && hasLocation;
  }

  bool get isConsumer => role == 'consumer';
  bool get isRetailer => role == 'retailer' || role == 'manufacturer';
  bool get isManufacturer => role == 'manufacturer';
  bool get isAdmin => role == 'admin';
  // A seller (retailer or manufacturer) always has a dashboard entry point.
  // Whether they can actually open it depends on isPaid — unpaid sellers are
  // routed to the subscription paywall by the router guard.
  bool get isSeller => isRetailer || isManufacturer;
  bool get canAccessDashboard => isSeller && isPaid;

  factory UserModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return UserModel(
      uid: data['uid'] as String? ?? '',
      phone: doc.id,
      name: data['name'] as String? ?? '',
      email: data['email'] as String?,
      role: data['role'] as String? ?? 'consumer',
      isPaid: data['isPaid'] as bool? ?? false,
      totalSeats: (data['totalSeats'] as num?)?.toInt() ?? 0,
      productCount: (data['productCount'] as num?)?.toInt() ?? 0,
      fcmToken: data['fcmToken'] as String?,
      createdAt: (data['createdAt'] as Timestamp?)?.toDate(),
      businessName: data['businessName'] as String?,
      address: data['address'] as String?,
      city: data['city'] as String?,
      state: data['state'] as String?,
      pincode: data['pincode'] as String?,
      profileCompleted: data['profileCompleted'] as bool? ?? false,
      username: data['username'] as String?,
      gstin: data['gstin'] as String?,
    );
  }

  Map<String, dynamic> toFirestore() => {
    'uid': uid,
    'phone': phone,
    'name': name,
    if (email != null) 'email': email,
    'role': role,
    'isPaid': isPaid,
    'totalSeats': totalSeats,
    'productCount': productCount,
    if (fcmToken != null) 'fcmToken': fcmToken,
    'createdAt': createdAt != null
        ? Timestamp.fromDate(createdAt!)
        : FieldValue.serverTimestamp(),
  };

  UserModel copyWith({
    String? uid,
    String? phone,
    String? name,
    String? email,
    String? role,
    bool? isPaid,
    int? totalSeats,
    int? productCount,
    String? fcmToken,
    DateTime? createdAt,
    String? username,
  }) {
    return UserModel(
      uid: uid ?? this.uid,
      phone: phone ?? this.phone,
      name: name ?? this.name,
      email: email ?? this.email,
      role: role ?? this.role,
      isPaid: isPaid ?? this.isPaid,
      totalSeats: totalSeats ?? this.totalSeats,
      productCount: productCount ?? this.productCount,
      fcmToken: fcmToken ?? this.fcmToken,
      createdAt: createdAt ?? this.createdAt,
      username: username ?? this.username,
    );
  }
}
