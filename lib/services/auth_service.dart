import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:google_sign_in/google_sign_in.dart';

class AuthService {
  final _auth = FirebaseAuth.instance;
  final _firestore = FirebaseFirestore.instance;
  final _googleSignIn = GoogleSignIn();

  String? currentUserPhone; // New: store E.164 phone for global use

  /// Google Sign-In (Phone is primary ID in Firestore)
  Future<User?> signInWithGoogle({
    required String phone,
    String? countryCode,
  }) async {
    final googleUser = await _googleSignIn.signIn();
    if (googleUser == null) return null; // User cancelled

    final googleAuth = await googleUser.authentication;
    final credential = GoogleAuthProvider.credential(
      accessToken: googleAuth.accessToken,
      idToken: googleAuth.idToken,
    );
    final userCredential = await _auth.signInWithCredential(credential);

    final user = userCredential.user;
    if (user != null) {
      final e164Phone =
      phone.startsWith('+') ? phone : '${countryCode ?? "+91"}$phone';
      currentUserPhone = e164Phone;

      final docRef = _firestore.collection('users').doc(e164Phone);
      final doc = await docRef.get();

      if (!doc.exists) {
        await docRef.set({
          'phone': e164Phone,
          'name': user.displayName ?? '',
          'email': user.email ?? '',
          'avatar': user.photoURL ?? '',
          'country': '',
          'currency': '',
          'onboarded': false,
          'createdAt': FieldValue.serverTimestamp(),
        });
      } else {
        // Optional: sync display name / avatar if changed
        await docRef.update({
          'name': user.displayName ?? '',
          'email': user.email ?? '',
          'avatar': user.photoURL ?? '',
        });
      }
    }
    return user;
  }

  /// Phone Auth (OTP-based) — Creates/Updates Firestore doc
  Future<void> signInWithPhone(
      String phone,
      Function(String, int?) codeSent,
      Function(AuthCredential) verificationCompleted,
      String? countryCode,
      ) async {
    final e164Phone =
    phone.startsWith('+') ? phone : '${countryCode ?? "+91"}$phone';
    currentUserPhone = e164Phone;

    await _auth.verifyPhoneNumber(
      phoneNumber: e164Phone,
      verificationCompleted: (credential) async {
        await _auth.signInWithCredential(credential);

        final user = _auth.currentUser;
        if (user != null) {
          final docRef = _firestore.collection('users').doc(e164Phone);
          final doc = await docRef.get();
          if (!doc.exists) {
            await docRef.set({
              'phone': e164Phone,
              'name': '',
              'email': '',
              'avatar': '',
              'country': '',
              'currency': '',
              'onboarded': false,
              'createdAt': FieldValue.serverTimestamp(),
            });
          }
        }
        verificationCompleted(credential);
      },
      verificationFailed: (e) => throw Exception(e.message),
      codeSent: (verificationId, resendToken) =>
          codeSent(verificationId, resendToken),
      codeAutoRetrievalTimeout: (verificationId) {},
    );
  }

  Future<void> signOut() async {
    await _googleSignIn.signOut();
    await _auth.signOut();
    currentUserPhone = null;
  }

  User? get currentUser => _auth.currentUser;
}
