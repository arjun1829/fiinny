import '../utils/kyc_rules.dart';

/// The bank account a seller's order money is sent to.
///
/// Stored at `payoutAccounts/{phone}` — deliberately NOT on `profiles/{phone}`
/// (public read) or `users/{phone}` (readable by every retailer and
/// manufacturer). Bank details in either of those would be visible
/// platform-wide. See the payoutAccounts block in firestore.rules.
///
/// Mirrors the web form at app/dashboard/payouts/page.tsx field for field, so
/// a seller can set this up on either platform and see the same thing on both.
class PayoutAccountModel {
  final String accountHolderName;

  /// Last 4 digits only. The full number is written but never read back into
  /// the UI — see [PayoutRepository.fetch].
  final String accountLast4;
  final String ifsc;
  final String? bankName;
  final String? branchName;
  final String accountType; // 'savings' | 'current'
  final String? upiId;
  final String? pan;

  /// GST number, when the seller has one. The PAN is taken from it.
  final String? gstin;

  /// 'pending_verification' | 'verified' | 'rejected'.
  /// Only an admin can move this off 'pending_verification' (firestore.rules).
  final String status;
  final String? rejectionReason;

  /// Uploaded KYC document metadata, keyed by doc type. Never a download URL —
  /// only the storage path and upload time.
  final Map<String, Map<String, dynamic>> documents;

  const PayoutAccountModel({
    required this.accountHolderName,
    required this.accountLast4,
    required this.ifsc,
    this.bankName,
    this.branchName,
    required this.accountType,
    this.upiId,
    this.pan,
    this.gstin,
    required this.status,
    this.rejectionReason,
    this.documents = const {},
  });

  bool get isVerified => status == 'verified';

  /// Whether bank details have been entered (a document can be uploaded
  /// before them, which creates the record without an account).
  bool get hasBank => accountLast4.isNotEmpty;

  List<KycItem> get missing => kycMissing(
    accountHolderName: accountHolderName,
    hasAccountNumber: hasBank,
    ifsc: ifsc,
    pan: pan,
    gstin: gstin,
    documents: documents.keys,
  );
  bool get isRejected => status == 'rejected';

  factory PayoutAccountModel.fromMap(Map<String, dynamic> d) {
    final rawDocs = d['documents'];
    final docs = <String, Map<String, dynamic>>{};
    if (rawDocs is Map) {
      rawDocs.forEach((k, v) {
        if (v is Map) docs[k.toString()] = Map<String, dynamic>.from(v);
      });
    }
    // Older records may predate accountLast4; derive it from the full number
    // rather than showing an empty masked account.
    var last4 = d['accountLast4'] as String? ?? '';
    if (last4.isEmpty) {
      final full = d['accountNumber'] as String? ?? '';
      if (full.length >= 4) last4 = full.substring(full.length - 4);
    }

    return PayoutAccountModel(
      accountHolderName: d['accountHolderName'] as String? ?? '',
      accountLast4: last4,
      ifsc: d['ifsc'] as String? ?? '',
      bankName: _nonEmpty(d['bankName']),
      branchName: _nonEmpty(d['branchName']),
      accountType: d['accountType'] as String? ?? 'savings',
      upiId: d['upiId'] as String?,
      pan: _nonEmpty(d['pan']),
      gstin: _nonEmpty(d['gstin']),
      status: d['status'] as String? ?? 'pending_verification',
      rejectionReason: d['rejectionReason'] as String?,
      documents: docs,
    );
  }

  static String? _nonEmpty(Object? v) {
    final t = (v as String? ?? '').trim();
    return t.isEmpty ? null : t;
  }
}
