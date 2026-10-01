import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

import '../../../core/constants/firestore_keys.dart';
import 'sales_user.dart';

/// Raised for a sign-in problem we want to show verbatim to the rep.
class AuthFailure implements Exception {
  final String message;
  const AuthFailure(this.message);
  @override
  String toString() => message;
}

class SalesAuthRepository {
  SalesAuthRepository({FirebaseAuth? auth, FirebaseFirestore? db})
    : _auth = auth ?? FirebaseAuth.instance,
      _db = db ?? FirebaseFirestore.instance;

  final FirebaseAuth _auth;
  final FirebaseFirestore _db;

  Stream<User?> authStateChanges() => _auth.authStateChanges();

  User? get currentUser => _auth.currentUser;

  Future<void> signIn(String email, String password) async {
    try {
      await _auth.signInWithEmailAndPassword(
        email: email.trim(),
        password: password,
      );
    } on FirebaseAuthException catch (e) {
      throw AuthFailure(_messageFor(e.code));
    }
  }

  Future<void> signOut() => _auth.signOut();

  Future<void> sendPasswordReset(String email) async {
    try {
      await _auth.sendPasswordResetEmail(email: email.trim());
    } on FirebaseAuthException catch (e) {
      throw AuthFailure(_messageFor(e.code));
    }
  }

  /// Resolves the rep's profile and checks they are actually field team.
  ///
  /// Mirrors the Firestore `isSalesExec() || isAdmin()` rule (firestore.rules)
  /// and the web guard in app/sales/layout.tsx: the account doc lives either at
  /// users/{uid} (email accounts created from the admin panel) or at
  /// users/{phone}, reached through uidIndex/{uid}. Returns null when the
  /// account exists but is not authorised — the caller shows "access
  /// restricted" rather than a broken dashboard, since every read the app makes
  /// would be denied by the rules anyway.
  Future<SalesUser?> resolveSalesUser(User user) async {
    Map<String, dynamic>? data;

    final direct = await _db.collection(Collections.users).doc(user.uid).get();
    if (direct.exists) {
      data = direct.data();
    } else {
      final idx = await _db
          .collection(Collections.uidIndex)
          .doc(user.uid)
          .get();
      final phone = idx.data()?['phone'];
      if (phone != null) {
        final byPhone = await _db
            .collection(Collections.users)
            .doc('$phone')
            .get();
        if (byPhone.exists) data = byPhone.data();
      }
    }

    if (data == null) return null;
    final role = '${data['role'] ?? ''}';
    if (role != 'salesExecutive' && role != 'admin') return null;

    return SalesUser(
      uid: user.uid,
      email: '${data['email'] ?? user.email ?? ''}',
      name: '${data['name'] ?? data['displayName'] ?? user.displayName ?? ''}',
      phone: '${data['phone'] ?? user.phoneNumber ?? ''}',
      role: role,
    );
  }

  static String _messageFor(String code) {
    switch (code) {
      case 'invalid-email':
        return 'That email address is not valid.';
      case 'user-disabled':
        return 'This account has been disabled. Contact your administrator.';
      case 'user-not-found':
      case 'wrong-password':
      case 'invalid-credential':
        return 'Invalid email or password.';
      case 'too-many-requests':
        return 'Too many attempts. Please wait a few minutes and try again.';
      case 'network-request-failed':
        return 'No internet connection. Check your network and try again.';
      default:
        return 'Sign in failed. Please try again.';
    }
  }
}
