// lib/core/flags/premium_gate.dart
import 'package:cloud_firestore/cloud_firestore.dart';

import 'remote_flags.dart';

class PremiumGate {
  PremiumGate._();
  static final instance = PremiumGate._();

  Future<bool> isPremium(String userId) async {
    final enabled = await RemoteFlags.instance.get<bool>('premiumEnabled', fallback: false, userId: userId);
    if (!enabled) return false;

    final doc = await FirebaseFirestore.instance.collection('users').doc(userId).collection('meta').doc('flags').get();
    final data = doc.data() ?? {};
    if (data['premium'] == true) return true;
    final until = data['premiumUntil'];
    if (until is Timestamp) {
      return until.toDate().isAfter(DateTime.now());
    }
    return false;
  }

  Stream<bool> onPremium(String userId) async* {
    final enabled = await RemoteFlags.instance.get<bool>('premiumEnabled', fallback: false, userId: userId);
    if (!enabled) {
      yield false;
      return;
    }
    yield* FirebaseFirestore.instance
        .collection('users')
        .doc(userId)
        .collection('meta')
        .doc('flags')
        .snapshots()
        .map((snap) {
      final data = snap.data() ?? {};
      final isFlagged = data['premium'] == true;
      final until = data['premiumUntil'];
      final activeUntil = until is Timestamp ? until.toDate().isAfter(DateTime.now()) : false;
      return isFlagged || activeUntil;
    });
  }
}
