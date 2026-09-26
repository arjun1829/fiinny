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
    String role = 'consumer',
  }) async {
    // 1. Write uidIndex first (chicken-and-egg rule bootstrap)
    await _db.collection('uidIndex').doc(uid).set({
      'phone': phone,
      'createdAt': FieldValue.serverTimestamp(),
    });

    // 2. Write user document second (now myPhone() will resolve correctly)
    await _db.collection('users').doc(phone).set({
      'uid': uid,
      'phone': phone,
      'name': name,
      'role': role,
      'isPaid': false,
      'totalSeats': 0,
      'productCount': 0,
      'createdAt': FieldValue.serverTimestamp(),
    });

    // 3. For retailers, initialize retailer and profile docs so the store is discoverable
    if (role == 'retailer') {
      await Future.wait([
        _db.collection('retailers').doc(phone).set({
          'userId': uid,
          'retailerId': uid,
          'role': 'retailer',
          'name': name,
          'shopName': name,
          'ownerName': name,
          'phone': phone,
          'ownerPhone': phone,
          'active': true,
          'status': 'Active',
          'createdAt': FieldValue.serverTimestamp(),
          'updatedAt': FieldValue.serverTimestamp(),
        }, SetOptions(merge: true)),
        _db.collection('profiles').doc(phone).set({
          'uid': uid,
          'phone': phone,
          'role': 'retailer',
          'name': name,
          'shopName': name,
          'ownerName': name,
          'createdAt': FieldValue.serverTimestamp(),
          'updatedAt': FieldValue.serverTimestamp(),
        }, SetOptions(merge: true)),
      ]);
    }
  }

  /// Saves profile-completion fields. Mirrors the web: writes the completion
  /// fields to users/{phone} and, for sellers, the business profile to the
  /// role-specific collection (retailers/manufacturers) so it shows on their
  /// store/brand page.
  Future<void> saveProfile({
    required String phone,
    required String role,
    required String name,
    String? email,
    String? businessName,
    String? address,
    String? city,
    String? state,
    String? pincode,
    String? gstin,
    String? googleMapsUrl,
    String? logoUrl,
    String? secondaryPhone,
    String? website,
    String? bannerUrl,
    /// {instagram, facebook, whatsapp, youtube} — same shape web writes as
    /// `socialLinks`. Pass null to leave the existing map untouched.
    Map<String, String>? socialLinks,
    /// Shop coordinates from "Use my current location". Written as `geo` —
    /// the GeoPoint the web profile writes and the store locator reads
    /// first. Null leaves any existing pin untouched.
    GeoPoint? geo,
  }) async {
    final isSeller = role == 'retailer' || role == 'manufacturer';

    // 1. users/{phone} — completion fields the dashboard checks.
    await _db.collection('users').doc(phone).set({
      'name': name,
      'ownerName': name,
      if (email != null && email.isNotEmpty) 'email': email,
      if (isSeller) 'businessName': businessName ?? '',
      'address': ?address,
      'city': ?city,
      'state': ?state,
      'pincode': ?pincode,
      if (isSeller && gstin != null) 'gstin': gstin,
      if (isSeller && googleMapsUrl != null) 'googleMapsUrl': googleMapsUrl,
      'profileCompleted': true,
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));

    // 2. Sellers: mirror the business profile to their role collection so the
    //    store/brand page and availability storeName resolve correctly.
    //    `gstin` here is the canonical copy — the web dashboard profile and
    //    invoice generator both read retailers/{phone}.gstin.
    if (isSeller) {
      final col = role == 'manufacturer' ? 'manufacturers' : 'retailers';
      await _db.collection(col).doc(phone).set({
        // Write aliased name keys so every reader resolves the shop name.
        'name': businessName ?? name,
        'businessName': businessName ?? '',
        'storeName': businessName ?? '',
        'ownerName': name,
        'phone': phone,
        'ownerPhone': phone,
        'address': ?address,
        'city': ?city,
        'state': ?state,
        'pincode': ?pincode,
        'gstin': ?gstin,
        // Buyer-facing "open in Google Maps" prefers this over coordinates.
        'googleMapsUrl': ?googleMapsUrl,
        if (logoUrl != null && logoUrl.isNotEmpty) 'logo': logoUrl,
        // Same keys the web dashboard writes (profile-persistence.ts):
        // `banner`/`website`/`secondaryPhone` flat, socials under `socialLinks`.
        'secondaryPhone': ?secondaryPhone,
        'website': ?website,
        if (bannerUrl != null && bannerUrl.isNotEmpty) 'banner': bannerUrl,
        'socialLinks': ?socialLinks,
        'geo': ?geo,
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));

      // 3. Mirror to profiles/{phone} — the unified public snapshot web's
      //    saveManufacturerProfile/saveRetailerProfile also write to, and the
      //    FIRST place ListingRepository._fetchProfile/retailerProfileProvider
      //    look (before falling back to the role collection above). Without
      //    this, a name/logo change made here wouldn't show on the seller's
      //    own storefront or product pages until something else happened to
      //    write profiles/{phone} first.
      await _db.collection('profiles').doc(phone).set({
        'phone': phone,
        'role': role,
        'businessName': businessName ?? '',
        'shopName': businessName ?? '',
        'ownerName': name,
        'address': ?address,
        'city': ?city,
        'state': ?state,
        'gstin': ?gstin,
        if (logoUrl != null && logoUrl.isNotEmpty) 'logo': logoUrl,
        'secondaryPhone': ?secondaryPhone,
        'website': ?website,
        if (bannerUrl != null && bannerUrl.isNotEmpty) 'banner': bannerUrl,
        'socialLinks': ?socialLinks,
        'geo': ?geo,
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
    }
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
