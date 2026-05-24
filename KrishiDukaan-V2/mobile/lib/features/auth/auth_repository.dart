import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class PhoneAuthHandle {
  PhoneAuthHandle({
    required this.verificationId,
    required this.resendToken,
  });
  final String verificationId;
  final int? resendToken;
}

class AuthRepository {
  AuthRepository(this._auth);
  final FirebaseAuth _auth;

  User? get currentUser => _auth.currentUser;
  Stream<User?> authStateChanges() => _auth.authStateChanges();

  /// Returns a [PhoneAuthHandle] once Firebase sends an SMS.
  /// On Android with instant verification the future resolves to `null`
  /// after auto-signing the user in — callers should also listen to
  /// [authStateChanges] to react to that.
  Future<PhoneAuthHandle?> sendOtp({
    required String phoneE164,
    required void Function(FirebaseAuthException) onError,
    Duration timeout = const Duration(seconds: 60),
  }) async {
    final completer = Completer<PhoneAuthHandle?>();
    await _auth.verifyPhoneNumber(
      phoneNumber: phoneE164,
      timeout: timeout,
      verificationCompleted: (cred) async {
        try {
          await _auth.signInWithCredential(cred);
        } catch (e) {
          if (kDebugMode) debugPrint('instant verify sign-in failed: $e');
        }
        if (!completer.isCompleted) completer.complete(null);
      },
      verificationFailed: (e) {
        onError(e);
        if (!completer.isCompleted) completer.complete(null);
      },
      codeSent: (verificationId, resendToken) {
        if (!completer.isCompleted) {
          completer.complete(PhoneAuthHandle(
            verificationId: verificationId,
            resendToken: resendToken,
          ));
        }
      },
      codeAutoRetrievalTimeout: (_) {},
    );
    return completer.future;
  }

  Future<UserCredential> verifyOtp({
    required String verificationId,
    required String smsCode,
  }) {
    final credential = PhoneAuthProvider.credential(
      verificationId: verificationId,
      smsCode: smsCode,
    );
    return _auth.signInWithCredential(credential);
  }

  Future<void> signOut() => _auth.signOut();
}

final authRepositoryProvider = Provider<AuthRepository>(
  (_) => AuthRepository(FirebaseAuth.instance),
);
