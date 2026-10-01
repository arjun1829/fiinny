import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_repository.dart';

/// Mirrors SubscriptionStatus in src/utils/subscriptionPlans.ts.
enum SubStatus { active, trial, pastDue, suspended, cancelled, none }

SubStatus _parseStatus(String? s) => switch (s) {
      'active' => SubStatus.active,
      'trial' => SubStatus.trial,
      'past_due' => SubStatus.pastDue,
      'suspended' => SubStatus.suspended,
      'cancelled' => SubStatus.cancelled,
      _ => SubStatus.none,
    };

class TenantSubscription {
  const TenantSubscription({
    required this.status,
    required this.planId,
    required this.planName,
    this.expiresAt,
  });

  final SubStatus status;
  final String? planId;
  final String planName;
  final DateTime? expiresAt;

  bool get isExpiringSoon =>
      expiresAt != null &&
      expiresAt!.difference(DateTime.now()).inDays <= 7 &&
      expiresAt!.isAfter(DateTime.now());

  bool get isExpired =>
      expiresAt != null && expiresAt!.isBefore(DateTime.now());
}

/// Live read of tenantSubscriptions/{tenantId} + plans/{planId} — the same two
/// documents the web ERP's AuthContext and PricingPage resolve entitlements
/// from, so status here always agrees with the web.
final subscriptionProvider = StreamProvider<TenantSubscription?>((ref) {
  final user = ref.watch(appUserProvider).valueOrNull;
  if (user == null || user.tenantId.isEmpty || user.tenantId == 'master') {
    return Stream.value(null);
  }
  final db = FirebaseFirestore.instance;

  return db
      .collection('tenantSubscriptions')
      .doc(user.tenantId)
      .snapshots()
      .asyncMap((snap) async {
    final data = snap.data();
    if (data == null) {
      return const TenantSubscription(
          status: SubStatus.none, planId: null, planName: 'No plan');
    }
    final planId = data['planId'] as String?;
    var planName = planId ?? 'Unknown plan';
    if (planId != null) {
      final planDoc = await db.collection('plans').doc(planId).get();
      planName = (planDoc.data()?['name'] as String?) ?? planName;
    }
    final expiresRaw = data['expiresAt'];
    return TenantSubscription(
      status: _parseStatus(data['status'] as String?),
      planId: planId,
      planName: planName,
      expiresAt: expiresRaw is Timestamp ? expiresRaw.toDate() : null,
    );
  });
});
