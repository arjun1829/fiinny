import 'package:cloud_firestore/cloud_firestore.dart';

import '../../../core/services/location_service.dart';

enum SessionStatusValue { active, completed }

/// A rep's working day. Mirrors the document written by the web /sales
/// dashboard (app/sales/day-session-service.ts) field for field — the same
/// documents are read and written by both, so nothing here may be renamed.
/// One breadcrumb recorded while the day was open.
class TrackPoint {
  final LatLngPoint point;
  final DateTime at;

  /// Horizontal accuracy in metres, when the device reported it.
  final double? accuracyM;
  const TrackPoint({required this.point, required this.at, this.accuracyM});

  Map<String, dynamic> toMap() => {
    'lat': point.lat,
    'lng': point.lng,
    'at': Timestamp.fromDate(at),
    if (accuracyM != null) 'acc': accuracyM,
  };

  static TrackPoint? fromMap(dynamic raw) {
    if (raw is! Map) return null;
    final lat = raw['lat'], lng = raw['lng'], at = raw['at'];
    if (lat is! num || lng is! num || at is! Timestamp) return null;
    return TrackPoint(
      point: LatLngPoint(lat.toDouble(), lng.toDouble()),
      at: at.toDate(),
      accuracyM: (raw['acc'] as num?)?.toDouble(),
    );
  }
}

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

  /// 15-minute breadcrumbs, oldest first. Empty for sessions from before
  /// tracking existed (and for any written by the web dashboard).
  final List<TrackPoint> trackPoints;

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
    this.trackPoints = const [],
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
      trackPoints: _trackPoints(d['trackPoints']),
    );
  }

  static List<TrackPoint> _trackPoints(dynamic raw) {
    if (raw is! List) return const [];
    final out = <TrackPoint>[];
    for (final item in raw) {
      final tp = TrackPoint.fromMap(item);
      if (tp != null) out.add(tp);
    }
    out.sort((a, b) => a.at.compareTo(b.at));
    return out;
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
