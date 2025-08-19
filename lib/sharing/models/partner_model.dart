// lib/sharing/models/partner_model.dart

import 'package:cloud_firestore/cloud_firestore.dart';

class PartnerModel {
  final String id;                 // unique sharing relationship id (docId)
  final String userId;             // 👈 NOW: current user's PHONE (E.164)
  final String partnerId;          // 👈 NOW: partner's PHONE (E.164)
  final String partnerName;        // for UI
  final String? partnerEmail;      // optional, legacy/fallback
  final String? relation;          // partner/husband/child/friend/other
  final Map<String, bool> permissions; // what screens/data can be viewed
  final String status;             // pending/active/revoked
  final DateTime addedOn;

  // --- Batch stats (nullable, fetched live) ---
  final String? avatar;
  final double? todayCredit;
  final double? todayDebit;
  final int? todayTxCount;
  final double? todayTxAmount;

  // Convenience getters for new naming (no code changes needed elsewhere)
  String get userPhone => userId;
  String get partnerPhone => partnerId;

  PartnerModel({
    required this.id,
    required this.userId,           // store phone here
    required this.partnerId,        // store phone here
    required this.partnerName,
    this.partnerEmail,
    this.relation,
    required this.permissions,
    required this.status,
    required this.addedOn,
    this.avatar,
    this.todayCredit,
    this.todayDebit,
    this.todayTxCount,
    this.todayTxAmount,
  });

  /// Factory from Firestore relationship doc.
  /// Reads both legacy and new keys so old data still works:
  /// - userPhone/userId
  /// - partnerPhone/partnerId
  factory PartnerModel.fromFirestore(
      DocumentSnapshot doc, {
        String? avatar,
        double? todayCredit,
        double? todayDebit,
        int? todayTxCount,
        double? todayTxAmount,
      }) {
    final data = (doc.data() as Map<String, dynamic>? ?? {});

    final String resolvedUserPhone =
    (data['userPhone'] ?? data['userId'] ?? '').toString();
    final String resolvedPartnerPhone =
    (data['partnerPhone'] ?? data['partnerId'] ?? '').toString();

    return PartnerModel(
      id: doc.id,
      userId: resolvedUserPhone,
      partnerId: resolvedPartnerPhone,
      partnerName: (data['partnerName'] ?? '').toString(),
      partnerEmail: (data['partnerEmail'] as String?)?.trim(),
      relation: data['relation'] as String?,
      permissions: Map<String, bool>.from(data['permissions'] ?? {}),
      status: (data['status'] ?? 'pending').toString(),
      addedOn: (data['addedOn'] is Timestamp)
          ? (data['addedOn'] as Timestamp).toDate()
          : DateTime.now(),
      avatar: avatar,
      todayCredit: todayCredit,
      todayDebit: todayDebit,
      todayTxCount: todayTxCount,
      todayTxAmount: todayTxAmount,
    );
  }

  /// Writes BOTH the new keys (userPhone/partnerPhone) and legacy keys
  /// (userId/partnerId) so older code keeps working.
  Map<String, dynamic> toMap() {
    return {
      // phone-first (new)
      'userPhone': userId,
      'partnerPhone': partnerId,

      // legacy mirror (keep for existing queries/UI)
      'userId': userId,
      'partnerId': partnerId,

      'partnerName': partnerName,
      if (partnerEmail != null) 'partnerEmail': partnerEmail,
      if (relation != null) 'relation': relation,
      'permissions': permissions,
      'status': status,
      'addedOn': Timestamp.fromDate(addedOn),
      // NOTE: batch/derived fields not persisted by default
    };
  }

  PartnerModel copyWith({
    String? partnerName,
    String? partnerEmail,
    String? relation,
    Map<String, bool>? permissions,
    String? status,
    String? avatar,
    double? todayCredit,
    double? todayDebit,
    int? todayTxCount,
    double? todayTxAmount,
  }) {
    return PartnerModel(
      id: id,
      userId: userId,
      partnerId: partnerId,
      partnerName: partnerName ?? this.partnerName,
      partnerEmail: partnerEmail ?? this.partnerEmail,
      relation: relation ?? this.relation,
      permissions: permissions ?? this.permissions,
      status: status ?? this.status,
      addedOn: addedOn,
      avatar: avatar ?? this.avatar,
      todayCredit: todayCredit ?? this.todayCredit,
      todayDebit: todayDebit ?? this.todayDebit,
      todayTxCount: todayTxCount ?? this.todayTxCount,
      todayTxAmount: todayTxAmount ?? this.todayTxAmount,
    );
  }
}
