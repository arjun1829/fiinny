import 'models.dart';

enum CallStatus {
  /// Red: missed and nobody has called back.
  pending,

  /// Orange: someone called back but the call did not connect.
  attempted,

  /// Green: called back and connected, or they called again and got through.
  calledBack,

  /// Grey: someone marked the missed calls "not needed".
  dismissed,

  /// Never missed: a normal contact.
  normal;

  bool get needsCallback => this == pending || this == attempted;
}

class NumberSummary {
  NumberSummary({
    required this.numberKey,
    required this.displayNumber,
    required this.name,
    required this.status,
    required this.totalCalls,
    required this.incoming,
    required this.outgoing,
    required this.missedTotal,
    required this.openMissed,
    required this.attempts,
    required this.firstSeenAt,
    required this.lastCallAt,
    this.lastMissedAt,
    this.openSince,
    this.resolvedAt,
    this.resolvedBy,
    this.notes,
  });

  final String numberKey;
  final String displayNumber;
  final String? name;
  final CallStatus status;
  final int totalCalls;
  final int incoming;
  final int outgoing;
  final int missedTotal;

  /// Missed calls since the last time this number was handled.
  final int openMissed;

  /// Unanswered call-back attempts since the open missed calls.
  final int attempts;
  final int firstSeenAt;
  final int lastCallAt;
  final int? lastMissedAt;

  /// First unhandled missed call, when the number needs a call back.
  final int? openSince;
  final int? resolvedAt;
  final String? resolvedBy;
  final String? notes;

  String get title => (name != null && name!.trim().isNotEmpty) ? name! : displayNumber;
}

class CallbackStat {
  CallbackStat(this.missedAt, this.resolvedAt);
  final int missedAt;
  final int resolvedAt;
  Duration get delay => Duration(milliseconds: resolvedAt - missedAt);
}

class StatusResult {
  StatusResult(this.summaries, this.callbacks);

  /// Most urgent first: pending/attempted by oldest open missed call, then
  /// everything else by latest activity.
  final List<NumberSummary> summaries;

  /// Every missed-then-handled episode, for the average call-back time.
  final List<CallbackStat> callbacks;
}

/// Works out each number's colour from the merged call history of all the
/// team's phones, so a call back from either phone turns it green.
StatusResult computeStatuses(
  Iterable<CallRecord> calls,
  Map<String, ContactInfo> contacts, {
  Map<String, String> phoneNames = const {},
}) {
  final byNumber = <String, List<CallRecord>>{};
  for (final c in calls) {
    if (c.numberKey.isEmpty || c.kind == CallKind.blocked) continue;
    byNumber.putIfAbsent(c.numberKey, () => []).add(c);
  }

  final summaries = <NumberSummary>[];
  final callbacks = <CallbackStat>[];

  byNumber.forEach((key, list) {
    list.sort((a, b) => a.timestamp.compareTo(b.timestamp));
    final contact = contacts[key];

    int? openSince;
    var openMissed = 0;
    var attempts = 0;
    int? lastMissedAt;
    int? resolvedAt;
    String? resolvedBy;
    var incoming = 0, outgoing = 0, missedTotal = 0;
    String? cachedName;

    void resolve(CallRecord c) {
      callbacks.add(CallbackStat(openSince!, c.timestamp));
      resolvedAt = c.timestamp;
      resolvedBy = c.deviceName;
      openSince = null;
      openMissed = 0;
      attempts = 0;
    }

    for (final c in list) {
      cachedName ??= (c.cachedName?.isNotEmpty ?? false) ? c.cachedName : null;
      switch (c.kind) {
        case CallKind.missed:
        case CallKind.rejected:
          missedTotal++;
          lastMissedAt = c.timestamp;
          openSince ??= c.timestamp;
          openMissed++;
        case CallKind.outgoing:
          outgoing++;
          if (openSince != null) {
            if (c.duration > 0) {
              resolve(c);
            } else {
              attempts++;
            }
          }
        case CallKind.incoming:
          incoming++;
          if (openSince != null) resolve(c);
        case CallKind.blocked:
          break;
      }
    }

    CallStatus status;
    if (openSince != null) {
      final dismissed = contact?.dismissedAt;
      if (dismissed != null && dismissed >= lastMissedAt!) {
        status = CallStatus.dismissed;
        resolvedAt = dismissed;
        resolvedBy = contact?.updatedBy;
      } else {
        status = attempts > 0 ? CallStatus.attempted : CallStatus.pending;
      }
    } else {
      status = missedTotal > 0 ? CallStatus.calledBack : CallStatus.normal;
    }

    final name = _firstNonEmpty([contact?.name, phoneNames[key], cachedName]);
    summaries.add(NumberSummary(
      numberKey: key,
      displayNumber: contact?.displayNumber ?? list.last.rawNumber,
      name: name,
      status: status,
      totalCalls: list.length,
      incoming: incoming,
      outgoing: outgoing,
      missedTotal: missedTotal,
      openMissed: status.needsCallback ? openMissed : 0,
      attempts: status.needsCallback ? attempts : 0,
      firstSeenAt: list.first.timestamp,
      lastCallAt: list.last.timestamp,
      lastMissedAt: lastMissedAt,
      openSince: status.needsCallback ? openSince : null,
      resolvedAt: resolvedAt,
      resolvedBy: resolvedBy,
      notes: contact?.notes,
    ));
  });

  summaries.sort((a, b) {
    if (a.status.needsCallback != b.status.needsCallback) {
      return a.status.needsCallback ? -1 : 1;
    }
    if (a.status.needsCallback) return a.openSince!.compareTo(b.openSince!);
    return b.lastCallAt.compareTo(a.lastCallAt);
  });
  return StatusResult(summaries, callbacks);
}

String? _firstNonEmpty(List<String?> values) {
  for (final v in values) {
    if (v != null && v.trim().isNotEmpty) return v.trim();
  }
  return null;
}
