import 'package:cloud_firestore/cloud_firestore.dart';

class NetworkRetailerModel {
  final String phone;
  final String manufacturerPhone;
  final String shopName;
  final String ownerName;
  final String? email;
  final String inviteCode;
  final String status; // invited | active | revoked
  final String? city;
  final String? state;
  final DateTime? createdAt;

  const NetworkRetailerModel({
    required this.phone,
    required this.manufacturerPhone,
    required this.shopName,
    required this.ownerName,
    this.email,
    required this.inviteCode,
    required this.status,
    this.city,
    this.state,
    this.createdAt,
  });

  bool get isActive => status == 'active';
  bool get isInvited => status == 'invited';

  factory NetworkRetailerModel.fromFirestore(DocumentSnapshot doc) {
    final d = doc.data() as Map<String, dynamic>;
    final addr = d['address'] as Map<String, dynamic>?;
    return NetworkRetailerModel(
      phone: doc.id,
      manufacturerPhone: d['manufacturerPhone'] as String? ?? '',
      shopName: d['shopName'] as String? ?? d['ownerName'] as String? ?? '',
      ownerName: d['ownerName'] as String? ?? '',
      email: d['email'] as String?,
      inviteCode: d['inviteCode'] as String? ?? '',
      status: d['status'] as String? ?? 'invited',
      city: addr?['city'] as String?,
      state: addr?['state'] as String?,
      createdAt: (d['createdAt'] as Timestamp?)?.toDate(),
    );
  }
}
