import 'package:cloud_firestore/cloud_firestore.dart';

import '../../../core/services/location_service.dart';

/// Kept identical to VISIT_PURPOSES in
/// app/sales/dealers/dealer-visit-service.ts — the two clients write into the
/// same collection and the admin side groups on the exact string.
const visitPurposes = <String>[
  'Pitching',
  'Order Collection',
  'Payment Collection',
  'Product Delivery',
  'Follow Up',
  'Complaint Resolution',
  'Stock Verification',
  'Other',
];

class DealerVisit {
  final String id;
  final String dealerId;
  final String dealerName;
  final String salesExecutiveId;
  final String? daySessionId;
  final int? visitSequence;
  final String purpose;
  final String? purposeOther;
  final String? notes;
  final LatLngPoint? geo;
  final DateTime? visitedAt;

  const DealerVisit({
    required this.id,
    required this.dealerId,
    required this.dealerName,
    required this.salesExecutiveId,
    this.daySessionId,
    this.visitSequence,
    required this.purpose,
    this.purposeOther,
    this.notes,
    this.geo,
    this.visitedAt,
  });

  /// What to show on a card: the free-text description when the rep chose
  /// "Other", otherwise the picked purpose.
  String get purposeLabel =>
      (purpose == 'Other' && (purposeOther?.trim().isNotEmpty ?? false))
      ? purposeOther!.trim()
      : purpose;

  factory DealerVisit.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final d = doc.data() ?? const {};
    final raw = d['geo'];
    return DealerVisit(
      id: doc.id,
      dealerId: '${d['dealerId'] ?? ''}',
      dealerName: '${d['dealerName'] ?? ''}',
      salesExecutiveId: '${d['salesExecutiveId'] ?? ''}',
      daySessionId: d['daySessionId'] as String?,
      visitSequence: (d['visitSequence'] as num?)?.toInt(),
      purpose: '${d['purpose'] ?? ''}',
      purposeOther: d['purposeOther'] as String?,
      notes: d['notes'] as String?,
      geo: raw is GeoPoint ? LatLngPoint(raw.latitude, raw.longitude) : null,
      visitedAt: (d['visitedAt'] as Timestamp?)?.toDate(),
    );
  }
}

/// Canonical route order, shared by the map, the timeline and the distance
/// calculation so all three agree on what "stop 3" means.
///
/// Primary key is visitSequence (written at the time of the visit); visits
/// recorded before that field existed fall back to visitedAt, and sequenced
/// visits sort ahead of unsequenced ones. Same rule as sortVisits() on the web.
List<DealerVisit> sortVisits(List<DealerVisit> visits) {
  final out = [...visits];
  out.sort((a, b) {
    final sa = a.visitSequence, sb = b.visitSequence;
    if (sa != null && sb != null) return sa.compareTo(sb);
    if (sa != null) return -1;
    if (sb != null) return 1;
    final ta = a.visitedAt?.millisecondsSinceEpoch ?? 0;
    final tb = b.visitedAt?.millisecondsSinceEpoch ?? 0;
    return ta.compareTo(tb);
  });
  return out;
}
