import 'package:cloud_firestore/cloud_firestore.dart';

import '../../../core/services/location_service.dart';

enum SessionStatusValue { active, completed }

/// A rep's working day. Mirrors the document written by the web /sales
/// dashboard (app/sales/day-session-service.ts) field for field — the same
/// documents are read and written by both, so nothing here may be renamed.
class DaySession {
  final String id;
  final String salesExecutiveId;

  /// IST calendar day, `YYYY-MM-DD`.
  final String date;
  final SessionStatusValue status;
  final LatLngPoint startGeo;
  final LatLngPoint? endGeo;
  final DateTime? startedAt;
  final DateTime? endedAt;
  final int? totalWorkingMinutes;
  final double? totalDistanceKm;
  final String? encodedPolyline;

  const DaySession({
    required this.id,
    required this.salesExecutiveId,
    required this.date,
    required this.status,
    required this.startGeo,
    this.endGeo,
    this.startedAt,
    this.endedAt,
    this.totalWorkingMinutes,
    this.totalDistanceKm,
    this.encodedPolyline,
  });

  bool get isActive => status == SessionStatusValue.active;
  bool get isCompleted => status == SessionStatusValue.completed;

  /// Minutes worked so far — the stored total once the day is closed, otherwise
  /// counted live from startedAt so the dashboard timer ticks up during the day.
  int get workedMinutes {
    if (totalWorkingMinutes != null) return totalWorkingMinutes!;
    if (startedAt == null) return 0;
    return DateTime.now().difference(startedAt!).inMinutes.clamp(0, 60 * 24);
  }

  factory DaySession.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final d = doc.data() ?? const {};
    return DaySession(
      id: doc.id,
      salesExecutiveId: '${d['salesExecutiveId'] ?? ''}',
      date: '${d['date'] ?? ''}',
      status: '${d['status']}' == 'COMPLETED'
          ? SessionStatusValue.completed
          : SessionStatusValue.active,
      startGeo: _point(d['startGeo']) ?? const LatLngPoint(0, 0),
      endGeo: _point(d['endGeo']),
      startedAt: (d['startedAt'] as Timestamp?)?.toDate(),
      endedAt: (d['endedAt'] as Timestamp?)?.toDate(),
      totalWorkingMinutes: (d['totalWorkingMinutes'] as num?)?.toInt(),
      totalDistanceKm: (d['totalDistanceKm'] as num?)?.toDouble(),
      encodedPolyline: d['encodedPolyline'] as String?,
    );
  }

  static LatLngPoint? _point(dynamic raw) {
    if (raw is GeoPoint) return LatLngPoint(raw.latitude, raw.longitude);
    if (raw is Map) {
      final lat = raw['latitude'] ?? raw['lat'];
      final lng = raw['longitude'] ?? raw['lng'];
      if (lat is num && lng is num) {
        return LatLngPoint(lat.toDouble(), lng.toDouble());
      }
    }
    return null;
  }
}
