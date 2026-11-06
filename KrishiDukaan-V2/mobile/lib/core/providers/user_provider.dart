import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/staff_session.dart';
import '../models/user_model.dart';
import '../session/shop_session.dart';
import '../../features/team/data/team_service.dart';
import 'auth_provider.dart';

/// Streams the current user's Firestore document.
/// Tries users/{phone} first (new schema), falls back to users/{uid} (legacy
/// accounts that were created before the phone-keyed migration).
final currentUserProvider = StreamProvider<UserModel?>((ref) {
  final firebaseUser = ref.watch(firebaseUserProvider);
  if (firebaseUser == null) return Stream.value(null);

  final phone = firebaseUser.phoneNumber ?? '';
  final uid = firebaseUser.uid;
  if (phone.isEmpty) return Stream.value(null);

  return FirebaseFirestore.instance
      .collection('users')
      .doc(phone)
      .snapshots()
      .asyncExpand((snap) async* {
    if (snap.exists) {
      yield UserModel.fromFirestore(snap);
    } else {
      // Legacy path: user doc stored at users/{uid} before phone-keyed migration
      try {
        final legacy = await FirebaseFirestore.instance
            .collection('users')
            .doc(uid)
            .get();
        yield legacy.exists ? UserModel.fromFirestore(legacy) : null;
      } catch (_) {
        yield null;
      }
    }
  });
});

/// Derived: current user's role string.
final userRoleProvider = Provider<String>((ref) {
  return ref.watch(currentUserProvider).value?.role ?? 'consumer';
});

/// Derived: whether the current user can access the seller dashboard.
final canAccessDashboardProvider = Provider<bool>((ref) {
  return ref.watch(sellerUserProvider).value?.canAccessDashboard ?? false;
});

/// Derived: whether the current user is a manufacturer.
final isManufacturerProvider = Provider<bool>((ref) {
  return ref.watch(sellerUserProvider).value?.isManufacturer ?? false;
});

/// A shop helper's access (app/lib/shop-team.ts on the website): null for
/// everyone else, at no cost — the check-in call only happens when the
/// user's own profile carries the shopStaff hint. Re-runs only when that
/// hint or the account changes, not on every profile write.
final staffSessionProvider = FutureProvider<StaffSession?>((ref) async {
  final key = ref.watch(currentUserProvider.select((u) {
    final m = u.value;
    return (m?.phone, m?.isSeller ?? false, m?.shopStaffOwnerPhone);
  }));
  final (phone, isSeller, staffOf) = key;
  if (phone == null || isSeller || staffOf == null) {
    ShopSession.staff = null;
    return null;
  }
  final session = await TeamService.instance.checkIn().catchError((Object _) => null);
  ShopSession.staff = (session != null && session.isActive) ? session : null;
  return session;
});

/// The shop owner's profile while an active helper acts for it.
final _actingShopUserProvider = StreamProvider<UserModel?>((ref) {
  final staff = ref.watch(staffSessionProvider).value;
  if (staff == null || !staff.isActive) return Stream.value(null);
  return FirebaseFirestore.instance
      .collection('users')
      .doc(staff.ownerPhone)
      .snapshots()
      .map((snap) => snap.exists ? UserModel.fromFirestore(snap).actingAs(staff) : null);
});

/// The account the seller screens act for: the signed-in seller themself,
/// or — for an active shop helper — the shop owner's profile with the
/// helper's permissions attached (UserModel.staff). Seller dashboards watch
/// this; buyer-side screens keep using currentUserProvider. For everyone who
/// isn't a helper it is exactly currentUserProvider's value, with no delay.
final sellerUserProvider = Provider<AsyncValue<UserModel?>>((ref) {
  final me = ref.watch(currentUserProvider);
  final user = me.value;
  if (user == null || user.isSeller || user.shopStaffOwnerPhone == null) return me;
  final staff = ref.watch(staffSessionProvider);
  if (staff.isLoading) return const AsyncLoading();
  final session = staff.value;
  if (session == null || !session.isActive) return me;
  return ref.watch(_actingShopUserProvider);
});
