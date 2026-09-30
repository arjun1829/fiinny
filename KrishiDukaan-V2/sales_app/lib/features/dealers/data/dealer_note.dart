import 'package:cloud_firestore/cloud_firestore.dart';

/// A free-text note a rep leaves against a dealer — a conversation log, not a
/// structured field. One doc per note, flat collection keyed by [dealerId],
/// same shape as [DealerVisit]: this app has no subcollection anywhere, and
/// dealerVisits is the existing precedent for "one event scoped to a dealer".
class DealerNote {
  final String id;
  final String dealerId;
  final String salesExecutiveId;
  final String note;
  final DateTime? createdAt;

  const DealerNote({
    required this.id,
    required this.dealerId,
    required this.salesExecutiveId,
    required this.note,
    this.createdAt,
  });

  factory DealerNote.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final d = doc.data() ?? const {};
    return DealerNote(
      id: doc.id,
      dealerId: '${d['dealerId'] ?? ''}',
      salesExecutiveId: '${d['salesExecutiveId'] ?? ''}',
      note: '${d['note'] ?? ''}',
      createdAt: (d['createdAt'] as Timestamp?)?.toDate(),
    );
  }
}
