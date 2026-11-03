/// Phone numbers arrive as "+91 98765 43210", "098765 43210", "9876543210".
/// They are matched on the last 10 digits so all of those are one person.
String numberKey(String raw) {
  final digits = raw.replaceAll(RegExp(r'\D'), '');
  if (digits.isEmpty) return '';
  return digits.length > 10 ? digits.substring(digits.length - 10) : digits;
}

enum CallKind {
  incoming,
  outgoing,
  missed,
  rejected,
  blocked;

  static CallKind fromAndroid(int type, int duration) {
    switch (type) {
      case 2:
        return CallKind.outgoing;
      case 3:
      case 4: // voicemail: nobody spoke to them
        return CallKind.missed;
      case 5:
        return CallKind.rejected;
      case 6:
        return CallKind.blocked;
      default: // 1 incoming, 7 answered externally
        return duration > 0 ? CallKind.incoming : CallKind.missed;
    }
  }

  bool get isMissed => this == CallKind.missed || this == CallKind.rejected;

  String get label => switch (this) {
        CallKind.incoming => 'Incoming',
        CallKind.outgoing => 'Outgoing',
        CallKind.missed => 'Missed',
        CallKind.rejected => 'Rejected',
        CallKind.blocked => 'Blocked',
      };
}

class CallRecord {
  CallRecord({
    required this.id,
    required this.numberKey,
    required this.rawNumber,
    required this.kind,
    required this.timestamp,
    required this.duration,
    required this.deviceId,
    required this.deviceName,
    this.sim,
    this.cachedName,
    this.synced = false,
  });

  /// `deviceId-callLogId`: unique across the team's phones.
  final String id;
  final String numberKey;
  final String rawNumber;
  final CallKind kind;

  /// Milliseconds since epoch.
  final int timestamp;

  /// Seconds.
  final int duration;
  final String deviceId;
  final String deviceName;
  final String? sim;
  final String? cachedName;
  final bool synced;

  DateTime get time => DateTime.fromMillisecondsSinceEpoch(timestamp);

  Map<String, Object?> toDb() => {
        'id': id,
        'number_key': numberKey,
        'raw_number': rawNumber,
        'kind': kind.name,
        'ts': timestamp,
        'duration': duration,
        'device_id': deviceId,
        'device_name': deviceName,
        'sim': sim,
        'cached_name': cachedName,
        'synced': synced ? 1 : 0,
      };

  factory CallRecord.fromDb(Map<String, Object?> m) => CallRecord(
        id: m['id'] as String,
        numberKey: m['number_key'] as String,
        rawNumber: m['raw_number'] as String,
        kind: CallKind.values.byName(m['kind'] as String),
        timestamp: m['ts'] as int,
        duration: m['duration'] as int,
        deviceId: m['device_id'] as String,
        deviceName: m['device_name'] as String,
        sim: m['sim'] as String?,
        cachedName: m['cached_name'] as String?,
        synced: (m['synced'] as int) == 1,
      );

  Map<String, Object?> toCloud() => {
        'numberKey': numberKey,
        'rawNumber': rawNumber,
        'kind': kind.name,
        'ts': timestamp,
        'duration': duration,
        'deviceId': deviceId,
        'deviceName': deviceName,
        'sim': sim,
        'cachedName': cachedName,
      };

  factory CallRecord.fromCloud(String id, Map<String, dynamic> m) => CallRecord(
        id: id,
        numberKey: m['numberKey'] as String,
        rawNumber: m['rawNumber'] as String,
        kind: CallKind.values.byName(m['kind'] as String),
        timestamp: (m['ts'] as num).toInt(),
        duration: (m['duration'] as num).toInt(),
        deviceId: m['deviceId'] as String,
        deviceName: m['deviceName'] as String,
        sim: m['sim'] as String?,
        cachedName: m['cachedName'] as String?,
        synced: true,
      );
}

/// Team-shared details for one number: name, notes, "not needed" flag.
class ContactInfo {
  ContactInfo({
    required this.numberKey,
    required this.displayNumber,
    this.name,
    this.notes,
    this.dismissedAt,
    required this.updatedAt,
    this.updatedBy,
    this.synced = false,
    this.savedToPhone = false,
  });

  final String numberKey;
  final String displayNumber;
  final String? name;
  final String? notes;

  /// Set when someone marks the pending missed calls as "not needed".
  /// A missed call after this time makes the number pending again.
  final int? dismissedAt;
  final int updatedAt;
  final String? updatedBy;
  final bool synced;

  /// Local only: this app already wrote the contact into this phone's
  /// address book, so it is never re-added if someone deletes it there.
  final bool savedToPhone;

  ContactInfo copyWith({
    String? name,
    String? notes,
    int? dismissedAt,
    bool clearDismissed = false,
    int? updatedAt,
    String? updatedBy,
    bool? synced,
    bool? savedToPhone,
    String? displayNumber,
  }) =>
      ContactInfo(
        numberKey: numberKey,
        displayNumber: displayNumber ?? this.displayNumber,
        name: name ?? this.name,
        notes: notes ?? this.notes,
        dismissedAt: clearDismissed ? null : (dismissedAt ?? this.dismissedAt),
        updatedAt: updatedAt ?? this.updatedAt,
        updatedBy: updatedBy ?? this.updatedBy,
        synced: synced ?? this.synced,
        savedToPhone: savedToPhone ?? this.savedToPhone,
      );

  Map<String, Object?> toDb() => {
        'number_key': numberKey,
        'display_number': displayNumber,
        'name': name,
        'notes': notes,
        'dismissed_at': dismissedAt,
        'updated_at': updatedAt,
        'updated_by': updatedBy,
        'synced': synced ? 1 : 0,
        'saved_to_phone': savedToPhone ? 1 : 0,
      };

  factory ContactInfo.fromDb(Map<String, Object?> m) => ContactInfo(
        numberKey: m['number_key'] as String,
        displayNumber: m['display_number'] as String,
        name: m['name'] as String?,
        notes: m['notes'] as String?,
        dismissedAt: m['dismissed_at'] as int?,
        updatedAt: m['updated_at'] as int,
        updatedBy: m['updated_by'] as String?,
        synced: (m['synced'] as int) == 1,
        savedToPhone: (m['saved_to_phone'] as int) == 1,
      );

  Map<String, Object?> toCloud() => {
        'displayNumber': displayNumber,
        'name': name,
        'notes': notes,
        'dismissedAt': dismissedAt,
        'updatedAt': updatedAt,
        'updatedBy': updatedBy,
      };

  factory ContactInfo.fromCloud(String key, Map<String, dynamic> m) => ContactInfo(
        numberKey: key,
        displayNumber: (m['displayNumber'] as String?) ?? key,
        name: m['name'] as String?,
        notes: m['notes'] as String?,
        dismissedAt: (m['dismissedAt'] as num?)?.toInt(),
        updatedAt: (m['updatedAt'] as num).toInt(),
        updatedBy: m['updatedBy'] as String?,
        synced: true,
      );
}
