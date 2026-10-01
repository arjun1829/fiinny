import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/services/location_service.dart';

enum AttendanceStatus {
  present('PRESENT', 'Present', AppColors.success, AppColors.successContainer),
  halfDay(
    'HALF_DAY',
    'Half Day',
    AppColors.warning,
    AppColors.warningContainer,
  ),
  leave('LEAVE', 'Leave', AppColors.error, AppColors.errorContainer),
  weekOff('WEEK_OFF', 'Week Off', AppColors.info, AppColors.infoContainer),
  holiday('HOLIDAY', 'Holiday', AppColors.info, AppColors.infoContainer);

  const AttendanceStatus(this.wire, this.label, this.color, this.background);

  /// Value stored in Firestore. Kept separate from [name] so the document reads
  /// the same SCREAMING_SNAKE way as `daySessions.status` does.
  final String wire;
  final String label;
  final Color color;
  final Color background;

  /// Days the rep is actually working — what the reports count as attendance.
  bool get isWorking => this == present || this == halfDay;

  static AttendanceStatus from(dynamic raw) =>
      AttendanceStatus.values.firstWhere(
        (s) => s.wire == '${raw ?? ''}',
        orElse: () => AttendanceStatus.present,
      );
}

/// One record per rep per IST calendar day.
///
/// The document id is `{uid}_{date}` rather than an auto id: a day can only be
/// marked once, and a deterministic id makes that a property of the data model
/// instead of something every writer has to remember to check.
class AttendanceRecord {
  final String id;
  final String salesExecutiveId;
  final String date;
  final AttendanceStatus status;
  final DateTime? checkInAt;
  final DateTime? checkOutAt;
  final LatLngPoint? checkInGeo;
  final LatLngPoint? checkOutGeo;
  final String? note;

  /// 'AUTO' when Start Day created it, 'MANUAL' when the rep marked it.
  final String source;
  final String? daySessionId;

  const AttendanceRecord({
    required this.id,
    required this.salesExecutiveId,
    required this.date,
    required this.status,
    this.checkInAt,
    this.checkOutAt,
    this.checkInGeo,
    this.checkOutGeo,
    this.note,
    required this.source,
    this.daySessionId,
  });

  static String idFor(String uid, String dateKey) => '${uid}_$dateKey';

  factory AttendanceRecord.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final d = doc.data() ?? const {};
    LatLngPoint? point(dynamic raw) =>
        raw is GeoPoint ? LatLngPoint(raw.latitude, raw.longitude) : null;

    return AttendanceRecord(
      id: doc.id,
      salesExecutiveId: '${d['salesExecutiveId'] ?? ''}',
      date: '${d['date'] ?? ''}',
      status: AttendanceStatus.from(d['status']),
      checkInAt: (d['checkInAt'] as Timestamp?)?.toDate(),
      checkOutAt: (d['checkOutAt'] as Timestamp?)?.toDate(),
      checkInGeo: point(d['checkInGeo']),
      checkOutGeo: point(d['checkOutGeo']),
      note: d['note'] as String?,
      source: '${d['source'] ?? 'MANUAL'}',
      daySessionId: d['daySessionId'] as String?,
    );
  }
}
