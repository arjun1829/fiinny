import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Streams Firebase Auth state changes (null = not logged in).
final authStateProvider = StreamProvider<User?>((ref) {
  return FirebaseAuth.instance.authStateChanges();
});

/// Derived: is the user currently logged in.
final isLoggedInProvider = Provider<bool>((ref) {
  return ref.watch(authStateProvider).value != null;
});

/// Derived: the raw Firebase user (null if not logged in).
final firebaseUserProvider = Provider<User?>((ref) {
  return ref.watch(authStateProvider).value;
});

