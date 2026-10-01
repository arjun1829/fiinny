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
  final String accountType; // 'savings' | 'current'
  final String? upiId;
  final String? pan;

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
    required this.accountType,
    this.upiId,
    this.pan,
    required this.status,
    this.rejectionReason,
    this.documents = const {},
  });

  bool get isVerified => status == 'verified';
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
      bankName: d['bankName'] as String?,
      accountType: d['accountType'] as String? ?? 'savings',
      upiId: d['upiId'] as String?,
      pan: d['pan'] as String?,
      status: d['status'] as String? ?? 'pending_verification',
      rejectionReason: d['rejectionReason'] as String?,
      documents: docs,
    );
  }
}
