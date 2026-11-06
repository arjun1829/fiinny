import 'package:cloud_firestore/cloud_firestore.dart';
import '../../../core/data/paged_feed.dart';
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

  /// This seller's enquiries, newest first, 30 at a time: live for the first
  /// page, [PagedFeed.loadMore] for older ones. Matched on `sellerPhones`
  /// (the doc stores both the +91 and bare forms, because seller keys are
  /// written in both across the schema).
  PagedFeed<EnquiryModel> feedForSeller(String sellerPhone) {
    return PagedFeed<EnquiryModel>(
      queries: [
        if (sellerPhone.isNotEmpty)
          _db.collection('enquiries').where('sellerPhones', arrayContains: sellerPhone),
      ],
      map: EnquiryModel.fromDoc,
    );
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
