import 'package:cloud_firestore/cloud_firestore.dart';

import '../../../core/constants/firestore_keys.dart';
import '../../../core/services/directions_service.dart';
import '../../../core/services/location_service.dart';
import '../../../core/utils/ist_date.dart';
import '../../dealers/data/dealer_visit.dart';
import 'day_session.dart';

class DaySessionRepository {
  DaySessionRepository({FirebaseFirestore? db})
    : _db = db ?? FirebaseFirestore.instance;

  final FirebaseFirestore _db;

  CollectionReference<Map<String, dynamic>> get _col =>
      _db.collection(Collections.daySessions);

  /// The session the rep should be acting on right now.
  ///
  /// Deliberately looks for the ACTIVE session first REGARDLESS of its date: if
  /// a rep forgot to end yesterday, that session has to surface today so it can
  /// be closed, instead of being orphaned while a second one is opened on top
  /// of it. Only when nothing is active does today's (completed) session apply.
  /// Same precedence the web dashboard uses.
  Future<DaySession?> currentSession(String uid) async {
    final active = await _col
        .where('salesExecutiveId', isEqualTo: uid)
        .where('status', isEqualTo: 'ACTIVE')
        .limit(1)
        .get();
    if (active.docs.isNotEmpty) return DaySession.fromDoc(active.docs.first);

    final today = await _col
        .where('salesExecutiveId', isEqualTo: uid)
        .where('date', isEqualTo: IstDate.today())
        .limit(1)
        .get();
    if (today.docs.isNotEmpty) return DaySession.fromDoc(today.docs.first);

    return null;
  }

  Future<DaySession?> byId(String sessionId) async {
    final doc = await _col.doc(sessionId).get();
    return doc.exists ? DaySession.fromDoc(doc) : null;
  }

  /// All of the rep's sessions, newest day first.
  Future<List<DaySession>> history(String uid, {int? limit}) async {
    var q = _col
        .where('salesExecutiveId', isEqualTo: uid)
        .orderBy('date', descending: true);
    if (limit != null) q = q.limit(limit);
    final snap = await q.get();
    return snap.docs.map(DaySession.fromDoc).toList();
  }

  /// Sessions within an inclusive IST date range — used by Reports.
  Future<List<DaySession>> inRange(
    String uid,
    String fromDate,
    String toDate,
  ) async {
    final snap = await _col
        .where('salesExecutiveId', isEqualTo: uid)
        .where('date', isGreaterThanOrEqualTo: fromDate)
        .where('date', isLessThanOrEqualTo: toDate)
        .orderBy('date', descending: true)
        .get();
    return snap.docs.map(DaySession.fromDoc).toList();
  }

  Future<String> startDay(String uid, LatLngPoint geo) async {
    final now = FieldValue.serverTimestamp();
    final ref = await _col.add({
      'salesExecutiveId': uid,
      'date': IstDate.today(),
      'status': 'ACTIVE',
      'startGeo': GeoPoint(geo.lat, geo.lng),
      'startedAt': now,
      'createdAt': now,
      'updatedAt': now,
    });
    return ref.id;
  }

  /// Appends a breadcrumb. arrayUnion keeps it atomic and offline-queued; a
  /// day is ~50 points at most, far from the document size limit.
  Future<void> addTrackPoint(String sessionId, TrackPoint p) {
    return _col.doc(sessionId).update({
      'trackPoints': FieldValue.arrayUnion([p.toMap()]),
    });
  }

  /// Closes the day: stamps the end point, computes worked minutes, and stores
  /// the road route over start → each visit in order → end.
  ///
  /// [route] is resolved by the caller (see [buildRoute]) and may be null — a
  /// failed distance lookup must never stop a rep from ending their day, so the
  /// distance fields are simply omitted in that case.
  Future<void> endDay({
    required DaySession session,
    required LatLngPoint endGeo,
    required RouteResult? route,
  }) async {
    final startedAt = session.startedAt ?? DateTime.now();
    final minutes = DateTime.now()
        .difference(startedAt)
        .inMinutes
        .clamp(0, 60 * 24);

    await _col.doc(session.id).update({
      'endGeo': GeoPoint(endGeo.lat, endGeo.lng),
      'endedAt': FieldValue.serverTimestamp(),
      'status': 'COMPLETED',
      'totalWorkingMinutes': minutes,
      if (route != null) 'totalDistanceKm': route.totalDistanceKm,
      if (route?.encodedPolyline != null)
        'encodedPolyline': route!.encodedPolyline,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  /// Waypoints for the day in the order the rep travelled: start, then visits
  /// and breadcrumbs merged by time, then end.
  ///
  /// Breadcrumbs with poor accuracy are dropped, as are points within
  /// [minSeparationM] of the previous one — a rep standing at a shop produces
  /// a cluster of jittery fixes that would otherwise add phantom detours.
  /// Visits are always kept (they are the verified stops). With no breadcrumbs
  /// this degrades to the old start → visits → end route.
  static List<LatLngPoint> waypointsFor(
    DaySession session,
    List<DealerVisit> orderedVisits,
    LatLngPoint endGeo, {
    double maxAccuracyM = 200,
    double minSeparationM = 150,
  }) {
    final items = <({DateTime at, LatLngPoint p, bool keep})>[
      for (final t in session.trackPoints)
        if ((t.accuracyM ?? 0) <= maxAccuracyM)
          (at: t.at, p: t.point, keep: false),
    ];
    // Visits without a timestamp yet (pending server write) sort by sequence
    // after their predecessor, so default them to the previous visit's time.
    var prev = session.startedAt ?? DateTime.fromMillisecondsSinceEpoch(0);
    for (final v in orderedVisits) {
      if (v.geo == null) continue;
      final at = v.visitedAt ?? prev;
      prev = at;
      items.add((at: at, p: v.geo!, keep: true));
    }
    items.sort((a, b) => a.at.compareTo(b.at));

    final out = <LatLngPoint>[session.startGeo];
    for (final it in items) {
      final far =
          DirectionsService.haversineKm(out.last, it.p) * 1000 >= minSeparationM;
      if (it.keep || far) out.add(it.p);
    }
    out.add(endGeo);
    return out;
  }
}
