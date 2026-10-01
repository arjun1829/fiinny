import 'package:cloud_firestore/cloud_firestore.dart';

import '../../../core/constants/firestore_keys.dart';
import '../../../core/services/location_service.dart';
import '../../../core/utils/ist_date.dart';
import 'attendance.dart';

class AttendanceRepository {
  AttendanceRepository({FirebaseFirestore? db})
    : _db = db ?? FirebaseFirestore.instance;

  final FirebaseFirestore _db;

  CollectionReference<Map<String, dynamic>> get _col =>
      _db.collection(Collections.salesAttendance);

  Future<AttendanceRecord?> forDate(String uid, String dateKey) async {
    final doc = await _col.doc(AttendanceRecord.idFor(uid, dateKey)).get();
    return doc.exists ? AttendanceRecord.fromDoc(doc) : null;
  }

  Future<AttendanceRecord?> today(String uid) => forDate(uid, IstDate.today());

  /// Records in an inclusive IST date range, newest first.
  Future<List<AttendanceRecord>> inRange(
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
    return snap.docs.map(AttendanceRecord.fromDoc).toList();
  }

  /// Marks a day. Writing to the deterministic `{uid}_{date}` id means calling
  /// this twice for the same day updates the record instead of creating a
  /// duplicate, so Start Day and a manual mark can't disagree.
  ///
  /// [preserveCheckIn] keeps an existing check-in stamp when a rep later
  /// corrects the status of a day they already checked into — losing the
  /// original check-in time would destroy the evidence the record exists for.
  Future<void> mark({
    required String uid,
    required String dateKey,
    required AttendanceStatus status,
    LatLngPoint? geo,
    String? note,
    String source = 'MANUAL',
    String? daySessionId,
    bool preserveCheckIn = true,
  }) async {
    final ref = _col.doc(AttendanceRecord.idFor(uid, dateKey));
    final existing = await ref.get();
    final hasCheckIn = existing.exists && existing.data()?['checkInAt'] != null;

    await ref.set({
      'salesExecutiveId': uid,
      'date': dateKey,
      'status': status.wire,
      if (!(preserveCheckIn && hasCheckIn)) ...{
        'checkInAt': status.isWorking ? FieldValue.serverTimestamp() : null,
        'checkInGeo': geo == null ? null : GeoPoint(geo.lat, geo.lng),
      },
      // The note is only touched when the caller supplied one. An empty string
      // means "clear it", so null is written rather than the key omitted —
      // which is why this is not a null-aware entry.
      ...(note == null
          ? const <String, Object?>{}
          : {'note': note.trim().isEmpty ? null : note.trim()}),
      'source': source,
      'daySessionId': ?daySessionId,
      if (!existing.exists) 'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  }

  /// Stamps the end of the working day onto today's record. Called when the rep
  /// ends their day session, so attendance and the session agree on the hours.
  Future<void> checkOut({
    required String uid,
    required String dateKey,
    LatLngPoint? geo,
  }) async {
    await _col.doc(AttendanceRecord.idFor(uid, dateKey)).set({
      'salesExecutiveId': uid,
      'date': dateKey,
      'checkOutAt': FieldValue.serverTimestamp(),
      if (geo != null) 'checkOutGeo': GeoPoint(geo.lat, geo.lng),
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  }
}
