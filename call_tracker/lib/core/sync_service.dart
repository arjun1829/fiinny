import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:call_log_reader/call_log_reader.dart';
import 'package:intl/intl.dart';
import 'package:permission_handler/permission_handler.dart';

import 'app_config.dart';
import 'cloud_sync.dart';
import 'local_db.dart';
import 'models.dart';
import 'notifier.dart';
import 'phone_contacts.dart';
import 'prefs.dart';
import 'status_engine.dart';

class SyncReport {
  SyncReport({this.imported = 0, this.pulled = 0, this.savedToPhone = 0, this.error});
  final int imported;
  final int pulled;
  final int savedToPhone;
  final String? error;
}

/// One full sync, run on app open, from the refresh button, after a call
/// back, and every 15 minutes in the background:
/// phone call log -> local db -> contact names -> cloud -> phone contacts
/// -> pending notification.
class SyncService {
  static Future<SyncReport>? _running;

  /// Android writes a call-log row when the call ends but dates it from the
  /// start, so a long call can land behind rows already imported. Re-reading
  /// the last 6 hours catches it; duplicate ids are ignored.
  static const _reimportWindowMs = 6 * 60 * 60 * 1000;

  static Future<SyncReport> run() => _running ??= _run().whenComplete(() => _running = null);

  static Future<SyncReport> _run() async {
    final prefs = await Prefs.load();
    final db = await LocalDb.open();
    var imported = 0, pulled = 0, saved = 0;
    String? error;

    try {
      imported = await importDeviceLog(db, prefs);
    } catch (e) {
      error = 'Reading call log: $e';
    }

    Map<String, String> phoneNames = {};
    try {
      phoneNames = await PhoneContacts.namesByNumber();
      await _sharePhoneNames(db, prefs, phoneNames);
    } catch (e) {
      error ??= 'Reading contacts: $e';
    }

    if (AppConfig.cloudEnabled) {
      try {
        pulled = await CloudSync.sync(db, prefs);
        await prefs.setLastCloudSyncAt(DateTime.now().millisecondsSinceEpoch);
      } catch (e) {
        error ??= 'Cloud sync: $e';
      }
    }

    try {
      if (prefs.saveTeamContactsToPhone) saved = await _saveTeamContactsToPhone(db, phoneNames);
    } catch (e) {
      error ??= 'Saving contacts: $e';
    }

    try {
      await _notify(db, prefs);
    } catch (_) {}

    await prefs.setLastSyncAt(DateTime.now().millisecondsSinceEpoch);
    await prefs.setLastError(error);
    return SyncReport(imported: imported, pulled: pulled, savedToPhone: saved, error: error);
  }

  /// Copies new rows from this phone's call log. The first run imports
  /// everything the phone still keeps (the backfill).
  static Future<int> importDeviceLog(LocalDb db, Prefs prefs, {bool full = false}) async {
    if (kIsWeb) return 0; // no call log in a browser (sample calls instead)
    if (!await CallLogReader.hasPermission()) return 0;
    final deviceId = prefs.deviceId;
    final latest = full ? 0 : await db.latestOwnCallTs(deviceId);
    final since = latest == 0 ? 0 : latest - _reimportWindowMs;
    final rows = await CallLogReader.query(sinceMillis: since);
    final records = [
      for (final r in rows)
        CallRecord(
          id: '$deviceId-${r.id}',
          numberKey: numberKey(r.number),
          rawNumber: r.number,
          kind: CallKind.fromAndroid(r.type, r.duration),
          timestamp: r.date,
          duration: r.duration,
          deviceId: deviceId,
          deviceName: prefs.deviceName,
          sim: r.sim,
          cachedName: r.name,
        ),
    ];
    return db.insertCalls(records);
  }

  /// Reads this phone's entire call log again; rows already stored are skipped.
  static Future<int> rescanDeviceLog() async =>
      importDeviceLog(await LocalDb.open(), await Prefs.load(), full: true);

  /// Names already saved in this phone's address book become team contacts,
  /// for numbers that have called or been called. Never overwrites a name
  /// someone typed in the app.
  static Future<void> _sharePhoneNames(
      LocalDb db, Prefs prefs, Map<String, String> phoneNames) async {
    if (phoneNames.isEmpty) return;
    final contacts = await db.allContacts();
    final calls = await db.allCalls();
    final seen = <String, String>{};
    for (final c in calls) {
      if (c.numberKey.isNotEmpty) seen.putIfAbsent(c.numberKey, () => c.rawNumber);
    }
    final now = DateTime.now().millisecondsSinceEpoch;
    for (final entry in seen.entries) {
      final name = phoneNames[entry.key];
      if (name == null) continue;
      final existing = contacts[entry.key];
      if (existing?.name?.trim().isNotEmpty ?? false) continue;
      await db.upsertContact((existing ??
              ContactInfo(numberKey: entry.key, displayNumber: entry.value, updatedAt: now))
          .copyWith(
              name: name,
              updatedAt: now,
              updatedBy: prefs.deviceName,
              synced: false,
              savedToPhone: true));
    }
  }

  /// Team contacts this phone does not have yet go into its address book,
  /// once each (a contact deleted on the phone is not re-added).
  static Future<int> _saveTeamContactsToPhone(
      LocalDb db, Map<String, String> phoneNames) async {
    if (!await Permission.contacts.isGranted) return 0;
    var saved = 0;
    final contacts = await db.allContacts();
    for (final c in contacts.values) {
      if (c.savedToPhone || (c.name?.trim().isEmpty ?? true)) continue;
      if (!phoneNames.containsKey(c.numberKey)) {
        if (saved >= 200) break; // the rest go next run
        await PhoneContacts.save(c.name!, c.displayNumber);
        saved++;
      }
      await db.markSavedToPhone(c.numberKey);
    }
    return saved;
  }

  static Future<void> _notify(LocalDb db, Prefs prefs) async {
    if (!prefs.notifyPending) return;
    final result = computeStatuses(await db.allCalls(), await db.allContacts());
    final open = result.summaries.where((s) => s.status.needsCallback).toList();
    if (open.length == prefs.lastNotifiedPending) return;
    final oldest = open.isEmpty
        ? ''
        : DateFormat('d MMM, h:mm a')
            .format(DateTime.fromMillisecondsSinceEpoch(open.first.openSince!));
    await PendingNotifier.show(open.length, oldest);
    await prefs.setLastNotifiedPending(open.length);
  }
}
