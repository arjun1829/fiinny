import 'package:flutter/foundation.dart' show kIsWeb;

import 'local_db.dart';
import 'models.dart';

/// Browser testing only. A browser can't read a phone's call log, so on the
/// web the app starts with a set of sample calls (numbers 98765 4xxxx, names
/// marked "Sample") to make every screen testable. Never runs on a phone.
class WebDemo {
  static const deviceId = 'browser-demo';

  static Future<void> seedIfEmpty(LocalDb db) async {
    if (!kIsWeb || await db.callCount() > 0) return;
    final now = DateTime.now().millisecondsSinceEpoch;
    const minute = 60 * 1000;
    const people = [
      ('Sample · Ramesh Patil', '+919876540001'),
      ('Sample · Sunita Pawar', '+919876540002'),
      ('Sample · Ganesh Shinde', '+919876540003'),
      ('Sample · Kavita Jadhav', '+919876540004'),
      (null, '+919876540005'),
      (null, '+919876540006'),
      ('Sample · Prakash More', '+919876540007'),
      (null, '+919876540008'),
    ];
    // (person index, kind, minutes ago, duration seconds, phone)
    const rows = [
      (0, CallKind.missed, 12, 0, 'Office phone'),
      (1, CallKind.incoming, 35, 142, 'Office phone'),
      (2, CallKind.missed, 58, 0, 'Shop phone'),
      (2, CallKind.outgoing, 50, 0, 'Shop phone'),
      (3, CallKind.missed, 95, 0, 'Office phone'),
      (3, CallKind.outgoing, 80, 64, 'Office phone'),
      (4, CallKind.missed, 130, 0, 'Shop phone'),
      (5, CallKind.rejected, 200, 0, 'Office phone'),
      (6, CallKind.incoming, 260, 305, 'Shop phone'),
      (7, CallKind.missed, 400, 0, 'Office phone'),
      (0, CallKind.missed, 1500, 0, 'Office phone'),
      (1, CallKind.outgoing, 1600, 90, 'Shop phone'),
      (6, CallKind.missed, 2900, 0, 'Office phone'),
      (6, CallKind.outgoing, 2880, 120, 'Office phone'),
      (5, CallKind.incoming, 4300, 47, 'Shop phone'),
    ];
    var i = 0;
    final records = [
      for (final (p, kind, ago, dur, phone) in rows)
        CallRecord(
          id: '$deviceId-${i++}',
          numberKey: numberKey(people[p].$2),
          rawNumber: people[p].$2,
          kind: kind,
          timestamp: now - ago * minute,
          duration: dur,
          deviceId: deviceId,
          deviceName: phone,
          cachedName: people[p].$1,
          synced: true,
        ),
    ];
    await db.insertCalls(records);
  }
}
