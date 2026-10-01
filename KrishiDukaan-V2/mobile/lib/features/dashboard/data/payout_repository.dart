import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';

import '../../../core/models/payout_account_model.dart';

/// Reads and writes the seller's own payout account.
///
/// Every method is scoped to `payoutAccounts/{ownPhone}` — firestore.rules
/// only permits a seller to touch their own document, and never the fields
/// that decide whether they get paid ([_protectedFields]).
class PayoutRepository {
  final _db = FirebaseFirestore.instance;

  /// Fields only an admin may write. Listed here as documentation and as a
  /// guard: sending any of them would be rejected by the security rules
  /// outright, so the save path must never include them.
  static const _protectedFields = {
    'razorpayLinkedAccountId',
    'verifiedAt',
    'verifiedBy',
    'rejectionReason',
  };

  String? get _phone => FirebaseAuth.instance.currentUser?.phoneNumber;

  /// The seller's saved payout account, or null if they haven't set one up.
  ///
  /// The full account number is deliberately not surfaced — the model exposes
  /// only the last 4 digits, so a shared or shoulder-surfed screen can never
  /// show a complete account number.
  Future<PayoutAccountModel?> fetch() async {
    final phone = _phone;
    if (phone == null || phone.isEmpty) return null;
    final doc = await _db.collection('payoutAccounts').doc(phone).get();
    if (!doc.exists) return null;
    return PayoutAccountModel.fromMap(doc.data()!);
  }

  /// Saves the seller's bank details.
  ///
  /// Always resets status to 'pending_verification': a re-submitted account
  /// has to be re-checked before money is sent to it. Writing any other status
  /// would be rejected by the rules anyway (`payoutStatusOk()`).
  Future<void> save({
    required String accountHolderName,
    required String accountNumber,
    required String ifsc,
    required String accountType,
    String? bankName,
    String? upiId,
    String? pan,
  }) async {
    final phone = _phone;
    if (phone == null || phone.isEmpty) {
      throw Exception(
        'No phone number on your account — complete your profile first.',
      );
    }

    final number = accountNumber.trim();
    final data = <String, dynamic>{
      'accountHolderName': accountHolderName.trim(),
      'accountNumber': number,
      'accountLast4': number.substring(number.length - 4),
      'ifsc': ifsc.trim().toUpperCase(),
      'accountType': accountType,
      'status': 'pending_verification',
      'phone': phone,
      'updatedAt': FieldValue.serverTimestamp(),
    };
    if (bankName != null && bankName.trim().isNotEmpty) {
      data['bankName'] = bankName.trim();
    }
    if (upiId != null && upiId.trim().isNotEmpty) {
      data['upiId'] = upiId.trim();
    }
    if (pan != null && pan.trim().isNotEmpty) {
      data['pan'] = pan.trim().toUpperCase();
    }

    assert(
      !data.keys.any(_protectedFields.contains),
      'Attempted to write an admin-only payout field from the client.',
    );

    await _db
        .collection('payoutAccounts')
        .doc(phone)
        .set(data, SetOptions(merge: true));
  }

  /// Largest KYC file accepted, matching the web uploader and the limit
  /// enforced in storage.rules — a bigger file would be rejected server-side
  /// anyway, so it is caught here with a message the seller can act on.
  static const maxDocumentBytes = 5 * 1024 * 1024;

  /// Uploads one KYC document and records its metadata.
  ///
  /// Files go to `kyc/{phone}/` — a deliberately PRIVATE Storage prefix. Every
  /// other prefix in storage.rules is `read: if true` because those assets are
  /// meant to be public (product photos, invoices); a PAN card is not. Only
  /// the owning seller can read or write their own folder.
  Future<Map<String, dynamic>> uploadDocument({
    required String docType,
    required File file,
  }) async {
    final phone = _phone;
    if (phone == null || phone.isEmpty) {
      throw Exception(
        'No phone number on your account — complete your profile first.',
      );
    }

    final size = await file.length();
    if (size > maxDocumentBytes) {
      throw Exception('That file is larger than 5 MB. Try a smaller photo.');
    }

    final isPdf = file.path.toLowerCase().endsWith('.pdf');
    final contentType = isPdf ? 'application/pdf' : 'image/jpeg';

    // Fixed filename per type: re-uploading REPLACES rather than piling up
    // copies, and storage.rules allows no delete, so stale files would
    // otherwise be unremovable.
    final storagePath = 'kyc/$phone/$docType.${isPdf ? 'pdf' : 'jpg'}';

    await FirebaseStorage.instance
        .ref(storagePath)
        .putFile(file, SettableMetadata(contentType: contentType));

    final meta = <String, dynamic>{
      'type': docType,
      'fileName': file.uri.pathSegments.last,
      'contentType': contentType,
      'size': size,
      'storagePath': storagePath,
      'uploadedAt': FieldValue.serverTimestamp(),
    };

    // Only metadata is mirrored to Firestore — never a download URL, which
    // would be a long-lived link to a private document.
    await _db.collection('payoutAccounts').doc(phone).set({
      'phone': phone,
      'documents': {docType: meta},
      // Any new evidence puts the account back in the review queue.
      'status': 'pending_verification',
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));

    return meta;
  }
}
