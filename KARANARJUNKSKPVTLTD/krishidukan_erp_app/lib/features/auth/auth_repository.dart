import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart';

final firebaseAuthProvider = Provider((_) => FirebaseAuth.instance);
final firestoreProvider = Provider((_) => FirebaseFirestore.instance);

final authStateProvider = StreamProvider<User?>(
  (ref) => ref.watch(firebaseAuthProvider).authStateChanges(),
);

/// The signed-in user's tenant + role, resolved from /users/{uid} exactly as
/// AuthContext.tsx does on the web.
class AppUser {
  const AppUser({
    required this.uid,
    required this.email,
    required this.name,
    required this.role,
    required this.tenantId,
    required this.businessName,
  });

  final String uid;
  final String email;
  final String name;
  final String role;
  final String tenantId;
  final String businessName;

  /// Only owners/analysts get meaningful figures out of the analytics
  /// collections; other roles are blocked by firestore.rules anyway.
  bool get canViewAnalytics =>
      role == 'admin' || role == 'analyst' || role == 'master';
}

class TenantAccessException implements Exception {
  TenantAccessException(this.message);
  final String message;
}

final appUserProvider = FutureProvider<AppUser?>((ref) async {
  final user = ref.watch(authStateProvider).valueOrNull;
  if (user == null) return null;

  final db = ref.watch(firestoreProvider);
  final snap = await db.collection('users').doc(user.uid).get();
  final data = snap.data();
  if (data == null) {
    throw TenantAccessException(
      'This account has no ERP profile yet. Ask your admin to add you in the web ERP.',
    );
  }

  final tenantId = (data['tenantId'] as String?) ?? '';
  if (tenantId.isEmpty) {
    throw TenantAccessException(
      'Your account is not linked to a business yet. Ask your admin to assign you a tenant.',
    );
  }

  var businessName = tenantId == 'master' ? 'KaranArjun' : '';
  if (tenantId != 'master') {
    final tenant = await db.collection('tenants').doc(tenantId).get();
    businessName = (tenant.data()?['businessName'] as String?) ?? 'My Business';
  }

  return AppUser(
    uid: user.uid,
    email: user.email ?? '',
    name: (data['name'] as String?) ??
        user.displayName ??
        (user.email?.split('@').first ?? 'Member'),
    role: (data['role'] as String?) ?? 'analyst',
    tenantId: tenantId,
    businessName: businessName,
  );
});

/// The web ERP accepts a bare username: anything without an "@" becomes
/// `<username>@karanarjun.com` before it reaches Firebase, and a few admin
/// nicknames alias to one account. There is no separate username auth — this
/// mirrors LoginPage.tsx so the same credentials work in the app.
const _loginDomain = 'karanarjun.com';
const _adminAliases = {
  'arjutanpure',
  'arjuntanpure',
  'arjun1829',
  'karanarjun',
};

String resolveLoginEmail(String input) {
  final trimmed = input.trim().toLowerCase();
  if (trimmed.contains('@')) return trimmed;
  if (_adminAliases.contains(trimmed)) return 'arjutanpure@$_loginDomain';
  return '$trimmed@$_loginDomain';
}

class AuthRepository {
  AuthRepository(this._auth);
  final FirebaseAuth _auth;

  Future<void> signInWithEmail(String emailOrUsername, String password) =>
      _auth.signInWithEmailAndPassword(
        email: resolveLoginEmail(emailOrUsername),
        password: password,
      );

  Future<void> sendPasswordReset(String emailOrUsername) =>
      _auth.sendPasswordResetEmail(email: resolveLoginEmail(emailOrUsername));

  Future<void> signInWithGoogle() async {
    final account = await GoogleSignIn().signIn();
    if (account == null) return; // user dismissed the picker
    final tokens = await account.authentication;
    await _auth.signInWithCredential(
      GoogleAuthProvider.credential(
        idToken: tokens.idToken,
        accessToken: tokens.accessToken,
      ),
    );
  }

  /// Firebase sign-out runs first and unconditionally. Clearing the Google
  /// session is best-effort: it throws where the plugin isn't configured (web
  /// without a client ID), which would otherwise strand the user signed in.
  Future<void> signOut() async {
    await _auth.signOut();
    try {
      await GoogleSignIn().signOut();
    } catch (_) {
      // No Google session, or the plugin isn't available on this platform.
    }
  }
}

final authRepositoryProvider =
    Provider((ref) => AuthRepository(ref.watch(firebaseAuthProvider)));
