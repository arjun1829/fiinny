// lib/details/models/recurring_rule.dart
import 'package:flutter/foundation.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

@immutable
class ParticipantShare {
  final String userId;     // phone for now
  final double? sharePct;  // for proportional/fixed %
  final int? seats;        // for seats split

  const ParticipantShare({
    required this.userId,
    this.sharePct,
    this.seats,
  });

  Map<String, dynamic> toJson() => {
    'userId': userId,
    if (sharePct != null) 'sharePct': sharePct,
    if (seats != null) 'seats': seats,
  };

  factory ParticipantShare.fromJson(Map<String, dynamic> j) => ParticipantShare(
    userId: j['userId'] as String? ?? '',
    sharePct: (j['sharePct'] as num?)?.toDouble(),
    seats: (j['seats'] as num?)?.toInt(),
  );

  ParticipantShare copyWith({
    String? userId,
    double? sharePct,
    int? seats,
  }) =>
      ParticipantShare(
        userId: userId ?? this.userId,
        sharePct: sharePct ?? this.sharePct,
        seats: seats ?? this.seats,
      );

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
          other is ParticipantShare &&
              runtimeType == other.runtimeType &&
              userId == other.userId &&
              sharePct == other.sharePct &&
              seats == other.seats;

  @override
  int get hashCode => Object.hash(userId, sharePct, seats);
}

@immutable
class Rotation {
  final List<String> order; // user ids
  final int startIndex;

  const Rotation({required this.order, this.startIndex = 0});

  Map<String, dynamic> toJson() => {
    'order': order,
    'startIndex': startIndex,
  };

  factory Rotation.fromJson(Map<String, dynamic> j) => Rotation(
    order: (j['order'] as List? ?? const []).cast<String>(),
    startIndex: (j['startIndex'] as num?)?.toInt() ?? 0,
  );

  Rotation copyWith({
    List<String>? order,
    int? startIndex,
  }) =>
      Rotation(
        order: order ?? this.order,
        startIndex: startIndex ?? this.startIndex,
      );

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
          other is Rotation &&
              runtimeType == other.runtimeType &&
              listEquals(order, other.order) &&
              startIndex == other.startIndex;

  @override
  int get hashCode => Object.hash(Object.hashAll(order), startIndex);
}

@immutable
class RecurringRule {
  /// "monthly" | "weekly" | "yearly" | "custom" | "daily"
  final String frequency;

  /// Anchor/first-due date (date-only semantics)
  final DateTime anchorDate;

  /// 1..28 safe for monthly
  final int? dueDay;

  /// 1..7 (Mon..Sun)
  final int? weekday;

  /// For custom cadence: every N days (>=1)
  final int? intervalDays;

  final double amount;
  final String currency;    // "INR"
  final String splitMode;   // "equal" | "proportional" | "fixed" | "seats" | "rotation"
  final List<ParticipantShare> participants;
  final Rotation? rotation;
  final int graceDays;
  final List<String> remindAt; // e.g. ["-72h","-24h","0h"]
  final bool autoSettle;
  final String source;      // "manual" | "detected_sms" | "detected_gmail"
  final String status;      // "active" | "paused" | "ended"

  const RecurringRule({
    required this.frequency,
    required this.anchorDate,
    this.dueDay,
    this.weekday,
    this.intervalDays,
    required this.amount,
    this.currency = 'INR',
    this.splitMode = 'equal',
    required this.participants,
    this.rotation,
    this.graceDays = 3,
    this.remindAt = const ['-24h', '0h'],
    this.autoSettle = false,
    this.source = 'manual',
    this.status = 'active',
  });

  // ---- helpers ----
  static DateTime _fallbackNow() => DateTime.now();

  static DateTime? _parseDate(dynamic v) {
    if (v == null) return null;
    if (v is Timestamp) return v.toDate();
    if (v is DateTime) return v;
    if (v is int) {
      // treat as ms since epoch if large; otherwise seconds
      final ms = v > 2000000000 ? v : v * 1000;
      return DateTime.fromMillisecondsSinceEpoch(ms);
    }
    if (v is String) {
      try {
        return DateTime.parse(v);
      } catch (_) {
        return DateTime.tryParse(v);
      }
    }
    return null;
  }

  Map<String, dynamic> toJson() => {
    'frequency': frequency,
    // Store as Firestore Timestamp (more robust than ISO strings in Firestore)
    'anchorDate': Timestamp.fromDate(anchorDate),
    if (dueDay != null) 'dueDay': dueDay,
    if (weekday != null) 'weekday': weekday,
    if (intervalDays != null) 'intervalDays': intervalDays,
    'amount': amount,
    'currency': currency,
    'splitMode': splitMode,
    'participants': participants.map((e) => e.toJson()).toList(),
    if (rotation != null) 'rotation': rotation!.toJson(),
    'graceDays': graceDays,
    'remindAt': remindAt,
    'autoSettle': autoSettle,
    'source': source,
    'status': status,
  };

  factory RecurringRule.fromJson(Map<String, dynamic> j) {
    final rawParts = (j['participants'] as List?) ?? const [];
    final parts = <ParticipantShare>[
      for (final p in rawParts)
        if (p is Map) ParticipantShare.fromJson(p.cast<String, dynamic>())
    ];

    return RecurringRule(
      frequency: (j['frequency'] as String?) ?? 'monthly',
      anchorDate: _parseDate(j['anchorDate']) ?? _fallbackNow(),
      dueDay: (j['dueDay'] as num?)?.toInt(),
      weekday: (j['weekday'] as num?)?.toInt(),
      // ✅ safer cast to handle num/double in old docs
      intervalDays: (j['intervalDays'] as num?)?.toInt(),
      amount: (j['amount'] as num?)?.toDouble() ?? 0.0,
      currency: (j['currency'] as String?) ?? 'INR',
      splitMode: (j['splitMode'] as String?) ?? 'equal',
      participants: parts,
      rotation: j['rotation'] is Map
          ? Rotation.fromJson((j['rotation'] as Map).cast<String, dynamic>())
          : null,
      graceDays: (j['graceDays'] as num?)?.toInt() ?? 3,
      remindAt:
      (j['remindAt'] as List?)?.cast<String>() ?? const ['-24h', '0h'],
      autoSettle: (j['autoSettle'] as bool?) ?? false,
      source: (j['source'] as String?) ?? 'manual',
      status: (j['status'] as String?) ?? 'active',
    );
  }

  /// Convenience: create a copy with selective overrides (non-breaking).
  RecurringRule copyWith({
    String? frequency,
    DateTime? anchorDate,
    int? dueDay,
    int? weekday,
    int? intervalDays,
    double? amount,
    String? currency,
    String? splitMode,
    List<ParticipantShare>? participants,
    Rotation? rotation,
    int? graceDays,
    List<String>? remindAt,
    bool? autoSettle,
    String? source,
    String? status,
  }) {
    return RecurringRule(
      frequency: frequency ?? this.frequency,
      anchorDate: anchorDate ?? this.anchorDate,
      dueDay: dueDay ?? this.dueDay,
      weekday: weekday ?? this.weekday,
      intervalDays: intervalDays ?? this.intervalDays,
      amount: amount ?? this.amount,
      currency: currency ?? this.currency,
      splitMode: splitMode ?? this.splitMode,
      participants: participants ?? this.participants,
      rotation: rotation ?? this.rotation,
      graceDays: graceDays ?? this.graceDays,
      remindAt: remindAt ?? this.remindAt,
      autoSettle: autoSettle ?? this.autoSettle,
      source: source ?? this.source,
      status: status ?? this.status,
    );
  }

  /// Helpful, non-breaking utility: is this a pure reminder (no money movement)?
  bool get isZeroAmount => amount == 0.0;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
          other is RecurringRule &&
              runtimeType == other.runtimeType &&
              frequency == other.frequency &&
              anchorDate == other.anchorDate &&
              dueDay == other.dueDay &&
              weekday == other.weekday &&
              intervalDays == other.intervalDays &&
              amount == other.amount &&
              currency == other.currency &&
              splitMode == other.splitMode &&
              listEquals(participants, other.participants) &&
              rotation == other.rotation &&
              graceDays == other.graceDays &&
              listEquals(remindAt, other.remindAt) &&
              autoSettle == other.autoSettle &&
              source == other.source &&
              status == other.status;

  @override
  int get hashCode => Object.hash(
    frequency,
    anchorDate,
    dueDay,
    weekday,
    intervalDays,
    amount,
    currency,
    splitMode,
    Object.hashAll(participants),
    rotation,
    graceDays,
    Object.hashAll(remindAt),
    autoSettle,
    source,
    status,
  );
}
