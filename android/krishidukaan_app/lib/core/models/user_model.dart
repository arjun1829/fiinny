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
  });

  bool get isConsumer => role == 'consumer';
  bool get isRetailer => role == 'retailer' || role == 'manufacturer';
  bool get isManufacturer => role == 'manufacturer';
  bool get isAdmin => role == 'admin';
  bool get canAccessDashboard => (isRetailer || isManufacturer) && isPaid;

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
    );
  }
}
