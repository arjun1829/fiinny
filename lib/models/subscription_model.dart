import 'package:cloud_firestore/cloud_firestore.dart';

class SubscriptionModel {
  final String userId;
  final String plan; // 'free', 'premium', 'pro'
  final String billingCycle; // 'monthly', 'yearly'
  final String status; // 'active', 'created', 'expired', 'cancelled'
  final DateTime? purchaseDate;
  final DateTime? activationDate;
  final DateTime? expiryDate;
  final String? razorpayPaymentId;
  final String? razorpayOrderId;
  final bool autoRenew;
  final DateTime? lastVerifiedAt;

  SubscriptionModel({
    required this.userId,
    this.plan = 'free',
    this.billingCycle = '',
    this.status = 'inactive',
    this.purchaseDate,
    this.activationDate,
    this.expiryDate,
    this.razorpayPaymentId,
    this.razorpayOrderId,
    this.autoRenew = false,
    this.lastVerifiedAt,
  });

  factory SubscriptionModel.fromMap(Map<String, dynamic> map, String id) {
    return SubscriptionModel(
      userId: id,
      plan: map['plan'] ?? 'free',
      billingCycle: map['billing_cycle'] ?? '',
      status: map['status'] ?? 'inactive',
      purchaseDate: (map['purchase_date'] as Timestamp?)?.toDate(),
      activationDate: (map['activation_date'] as Timestamp?)?.toDate(),
      expiryDate: (map['expiry_date'] as Timestamp?)?.toDate(),
      razorpayPaymentId: map['razorpay_payment_id'],
      razorpayOrderId: map['razorpay_order_id'],
      autoRenew: map['auto_renew'] ?? false,
      lastVerifiedAt: (map['last_verified_at'] as Timestamp?)?.toDate(),
    );
  }

  bool get isActive {
    if (status != 'active') return false;
    if (expiryDate == null) return false;
    return DateTime.now().isBefore(expiryDate!);
  }

  bool get isPremium => isActive && (plan == 'premium' || plan == 'pro');
  bool get isPro => isActive && plan == 'pro';
}
