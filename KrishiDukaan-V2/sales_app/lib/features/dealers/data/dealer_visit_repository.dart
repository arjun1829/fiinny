import 'package:cloud_firestore/cloud_firestore.dart';

import '../../../core/constants/firestore_keys.dart';
import '../../../core/services/location_service.dart';
import '../../../core/utils/ist_date.dart';
import 'dealer_visit.dart';

class MarkVisitInput {
  final String dealerId;
  final String dealerName;
  final String purpose;
  final String? purposeOther;
  final String? notes;
  final LatLngPoint geo;
  final String? daySessionId;
  final int? visitSequence;

  const MarkVisitInput({
    required this.dealerId,
    required this.dealerName,
    required this.purpose,
    this.purposeOther,
    this.notes,
    required this.geo,
    this.daySessionId,
    this.visitSequence,
  });
}

class DealerVisitRepository {
  DealerVisitRepository({FirebaseFirestore? db})
    : _db = db ?? FirebaseFirestore.instance;

  final FirebaseFirestore _db;

  CollectionReference<Map<String, dynamic>> get _col =>
      _db.collection(Collections.dealerVisits);

  Future<String> markVisited(String uid, MarkVisitInput input) async {
    final now = FieldValue.serverTimestamp();
    final ref = await _col.add({
      'dealerId': input.dealerId,
      'dealerName': input.dealerName,
      'salesExecutiveId': uid,
      if (input.daySessionId != null) 'daySessionId': input.daySessionId,
      if (input.visitSequence != null) 'visitSequence': input.visitSequence,
      'purpose': input.purpose,
      if (input.purpose == 'Other' &&
          (input.purposeOther?.trim().isNotEmpty ?? false))
        'purposeOther': input.purposeOther!.trim(),
      if (input.notes?.trim().isNotEmpty ?? false) 'notes': input.notes!.trim(),
      'geo': GeoPoint(input.geo.lat, input.geo.lng),
      'visitedAt': now,
      'createdAt': now,
      'updatedAt': now,
    });
    return ref.id;
  }

  /// Visits on one IST calendar day, oldest first (timeline order).
  Future<List<DealerVisit>> forDate(String uid, String dateKey) async {
    final snap = await _col
        .where('salesExecutiveId', isEqualTo: uid)
        .where(
          'visitedAt',
          isGreaterThanOrEqualTo: Timestamp.fromDate(
            IstDate.startOfDayUtc(dateKey),
          ),
        )
        .where(
          'visitedAt',
          isLessThan: Timestamp.fromDate(IstDate.endOfDayUtc(dateKey)),
        )
        .orderBy('visitedAt')
        .get();
    return snap.docs.map(DealerVisit.fromDoc).toList();
  }

  Future<List<DealerVisit>> today(String uid) => forDate(uid, IstDate.today());

  /// Visits from [fromDate] 00:00 IST onwards, newest first. One query backs
  /// both the reports range and the "last visit per dealer" lookup below.
  Future<List<DealerVisit>> since(String uid, String fromDate) async {
    final snap = await _col
        .where('salesExecutiveId', isEqualTo: uid)
        .where(
          'visitedAt',
          isGreaterThanOrEqualTo: Timestamp.fromDate(
            IstDate.startOfDayUtc(fromDate),
          ),
        )
        .orderBy('visitedAt', descending: true)
        .get();
    return snap.docs.map(DealerVisit.fromDoc).toList();
  }

  /// Latest visit per dealer for this rep, as `dealerId -> visit`.
  ///
  /// One ordered query walked in memory rather than a query per dealer — with
  /// a few hundred dealers the N+1 version would be hundreds of reads every
  /// time the list opens.
  Future<Map<String, DealerVisit>> lastVisitByDealer(String uid) async {
    final snap = await _col
        .where('salesExecutiveId', isEqualTo: uid)
        .orderBy('visitedAt', descending: true)
        .get();

    final out = <String, DealerVisit>{};
    for (final doc in snap.docs) {
      final visit = DealerVisit.fromDoc(doc);
      if (visit.dealerId.isEmpty) continue;
      out.putIfAbsent(visit.dealerId, () => visit);
    }
    return out;
  }
}
