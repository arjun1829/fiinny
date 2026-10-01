import 'package:cloud_firestore/cloud_firestore.dart';
import '../../../core/models/enquiry_model.dart';

/// Reads and follow-up writes for seller enquiries.
///
/// Enquiry docs themselves are written only by the server sweep — firestore
/// rules deny client creates, so a seller cannot invent a lead or change what
/// the buyer tried to order. The one thing they may change is how far they've
/// got with following it up, which is what [setStatus] does.
class EnquiryRepository {
  final FirebaseFirestore _db;
  EnquiryRepository({FirebaseFirestore? db})
      : _db = db ?? FirebaseFirestore.instance;

  /// This seller's enquiries, newest first.
  ///
  /// Matched on `sellerPhones` (the doc stores both the +91 and bare forms,
  /// because seller keys are written in both across the schema) and sorted
  /// client-side, so no composite array-contains + orderBy index is needed —
  /// same approach as the notifications stream.
  Stream<List<EnquiryModel>> watchForSeller(String sellerPhone) {
    if (sellerPhone.isEmpty) return Stream.value(const []);
    return _db
        .collection('enquiries')
        .where('sellerPhones', arrayContains: sellerPhone)
        .snapshots()
        .map((snap) {
      final list = snap.docs.map(EnquiryModel.fromDoc).toList()
        ..sort((a, b) {
          final ad = a.createdAt ?? DateTime(2000);
          final bd = b.createdAt ?? DateTime(2000);
          return bd.compareTo(ad);
        });
      return list;
    });
  }

  /// Moves an enquiry through its follow-up states. Only the fields the
  /// matching firestore rule allows a seller to touch are written.
  Future<void> setStatus(String enquiryId, EnquiryStatus status) async {
    await _db.collection('enquiries').doc(enquiryId).update({
      'status': status.name,
      if (status == EnquiryStatus.contacted)
        'contactedAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }
}
