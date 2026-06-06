import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

class AuthRepository {
  final FirebaseAuth _auth = FirebaseAuth.instance;
  final FirebaseFirestore _db = FirebaseFirestore.instance;

  /// Sends OTP to the given E164 phone number.
  Future<void> sendOtp({
    required String phone,
    required void Function(String verificationId, int? resendToken) onCodeSent,
    required void Function(String error) onError,
    void Function(PhoneAuthCredential)? onAutoVerified,
  }) async {
    await _auth.verifyPhoneNumber(
      phoneNumber: phone,
      verificationCompleted: (cred) => onAutoVerified?.call(cred),
      verificationFailed: (e) {
        final msg = switch (e.code) {
          'invalid-phone-number' => 'Invalid phone number. Please check and try again.',
          'too-many-requests' => 'Too many attempts. Please wait a few minutes.',
          'quota-exceeded' => 'SMS quota exceeded. Please try again later.',
          _ => e.message ?? 'Failed to send OTP. Please try again.',
        };
        onError(msg);
      },
      codeSent: onCodeSent,
      codeAutoRetrievalTimeout: (_) {},
    );
  }

  /// Verifies the OTP and signs in the user.
  Future<UserCredential> verifyOtp({
    required String verificationId,
    required String smsCode,
  }) async {
    final credential = PhoneAuthProvider.credential(
      verificationId: verificationId,
      smsCode: smsCode,
    );
    return _auth.signInWithCredential(credential);
  }

  /// Signs in with a credential (used for auto-verification).
  Future<UserCredential> signInWithCredential(AuthCredential credential) {
    return _auth.signInWithCredential(credential);
  }

  /// Returns true if the user already has a Firestore profile.
  Future<bool> userExists(String phone) async {
    final doc = await _db.collection('users').doc(phone).get();
    return doc.exists;
  }

  /// Creates initial user profile in Firestore.
  Future<void> createUser({
    required String uid,
    required String phone,
    required String name,
  }) async {
    final batch = _db.batch();

    batch.set(_db.collection('users').doc(phone), {
      'uid': uid,
      'phone': phone,
      'name': name,
      'role': 'consumer',
      'isPaid': false,
      'totalSeats': 0,
      'productCount': 0,
      'createdAt': FieldValue.serverTimestamp(),
    });

    batch.set(_db.collection('uidIndex').doc(uid), {
      'phone': phone,
      'createdAt': FieldValue.serverTimestamp(),
    });

    await batch.commit();
  }

  /// Ensures uidIndex/{uid} exists — called on every login (not just signup).
  /// Existing web-registered users may have users/{phone} but no uidIndex entry,
  /// which breaks all myPhone()-based security rules.
  Future<void> ensureUidIndex(String uid, String phone) async {
    final ref = _db.collection('uidIndex').doc(uid);
    final snap = await ref.get();
    if (!snap.exists) {
      await ref.set({
        'phone': phone,
        'createdAt': FieldValue.serverTimestamp(),
      });
    }
  }

  /// Signs out the current user.
  Future<void> signOut() => _auth.signOut();

  User? get currentUser => _auth.currentUser;
}
