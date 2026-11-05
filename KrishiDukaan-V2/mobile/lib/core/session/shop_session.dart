import 'package:firebase_auth/firebase_auth.dart';

import '../models/staff_session.dart';

/// Which shop the seller screens act for. Normally the signed-in seller; for
/// a shop helper it is the owner's shop (set by staffSessionProvider).
///
/// Repositories aren't Riverpod-aware, so the seller data layer reads the
/// shop's uid/phone from here instead of FirebaseAuth.currentUser — that is
/// what lets a helper's dashboard load the owner's products and orders.
class ShopSession {
  ShopSession._();

  /// Non-null only while an ACTIVE helper session is in effect.
  static StaffSession? staff;

  /// The shop owner's auth uid (legacy uid-keyed fields), or the signed-in
  /// user's uid when not acting as a helper.
  static String sellerUid() {
    final s = staff;
    if (s != null) return s.ownerUid;
    return FirebaseAuth.instance.currentUser?.uid ?? '';
  }

  /// [sellerUid] or null when there is none (a helper whose owner never signed in).
  static String? sellerUidOrNull() {
    final uid = sellerUid();
    return uid.isEmpty ? null : uid;
  }

  /// The shop's phone (+91…), or the signed-in user's phone.
  static String sellerPhone() {
    final s = staff;
    if (s != null) return s.ownerPhone;
    return FirebaseAuth.instance.currentUser?.phoneNumber ?? '';
  }
}
