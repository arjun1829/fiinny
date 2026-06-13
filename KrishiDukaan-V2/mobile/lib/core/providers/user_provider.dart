import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/user_model.dart';
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
  return ref.watch(currentUserProvider).value?.canAccessDashboard ?? false;
});

/// Derived: whether the current user is a manufacturer.
final isManufacturerProvider = Provider<bool>((ref) {
  return ref.watch(currentUserProvider).value?.isManufacturer ?? false;
});
