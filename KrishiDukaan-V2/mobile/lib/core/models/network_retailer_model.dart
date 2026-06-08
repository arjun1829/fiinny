import 'package:cloud_firestore/cloud_firestore.dart';

class NetworkRetailerModel {
  final String id;
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
  final String onboardingStatus;
  final String retailerDocId;
  final String retailerId;

  const NetworkRetailerModel({
    required this.id,
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
    required this.onboardingStatus,
    required this.retailerDocId,
    required this.retailerId,
  });

  bool get isActive => status == 'active';
  bool get isInvited => status == 'invited';

  factory NetworkRetailerModel.fromFirestore(DocumentSnapshot doc) {
    final d = doc.data() as Map<String, dynamic>;
    final addr = d['address'] as Map<String, dynamic>?;
    return NetworkRetailerModel(
      id: doc.id,
      phone: d['retailerPhone'] as String? ?? d['phone'] as String? ?? doc.id,
      manufacturerPhone: d['manufacturerPhone'] as String? ?? '',
      shopName: d['shopName'] as String? ?? d['ownerName'] as String? ?? '',
      ownerName: d['ownerName'] as String? ?? '',
      email: d['retailerEmail'] as String? ?? d['email'] as String?,
      inviteCode: d['inviteCode'] as String? ?? '',
      status: d['status'] as String? ?? 'invited',
      city: addr?['city'] as String?,
      state: addr?['state'] as String?,
      createdAt: (d['addedAt'] as Timestamp?)?.toDate() ?? (d['createdAt'] as Timestamp?)?.toDate(),
      onboardingStatus: d['onboardingStatus'] as String? ?? 'pending',
      retailerDocId: d['retailerDocId'] as String? ?? '',
      retailerId: d['retailerId'] as String? ?? '',
    );
  }
}
