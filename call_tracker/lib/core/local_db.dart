import 'db_factory.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

import 'models.dart';

/// On-phone store and source of truth. Holds this phone's calls plus the
/// calls pulled from the team's other phones.
class LocalDb {
  LocalDb._(this._db);
  final Database _db;

  static LocalDb? _instance;

  static Future<LocalDb> open() async {
    if (_instance != null) return _instance!;
    useBrowserDatabaseIfNeeded();
    final path = kIsWeb ? 'call_tracker.db' : p.join(await getDatabasesPath(), 'call_tracker.db');
    final db = await openDatabase(
      path,
      version: 1,
      onConfigure: (db) => db.rawQuery('PRAGMA busy_timeout = 5000'),
      onCreate: (db, _) async {
        await db.execute('''
          CREATE TABLE calls (
            id TEXT PRIMARY KEY,
            number_key TEXT NOT NULL,
            raw_number TEXT NOT NULL,
            kind TEXT NOT NULL,
            ts INTEGER NOT NULL,
            duration INTEGER NOT NULL,
            device_id TEXT NOT NULL,
            device_name TEXT NOT NULL,
            sim TEXT,
            cached_name TEXT,
            synced INTEGER NOT NULL DEFAULT 0
          )''');
        await db.execute('CREATE INDEX calls_ts ON calls(ts)');
        await db.execute('CREATE INDEX calls_number ON calls(number_key)');
        await db.execute('CREATE INDEX calls_synced ON calls(synced)');
        await db.execute('''
          CREATE TABLE contacts (
            number_key TEXT PRIMARY KEY,
            display_number TEXT NOT NULL,
            name TEXT,
            notes TEXT,
            dismissed_at INTEGER,
            updated_at INTEGER NOT NULL,
            updated_by TEXT,
            synced INTEGER NOT NULL DEFAULT 0,
            saved_to_phone INTEGER NOT NULL DEFAULT 0
          )''');
      },
    );
    return _instance = LocalDb._(db);
  }

  /// Inserts new calls; existing ids are left alone (re-imports are no-ops).
  Future<int> insertCalls(List<CallRecord> calls, {bool replace = false}) async {
    if (calls.isEmpty) return 0;
    var added = 0;
    await _db.transaction((txn) async {
      final batch = txn.batch();
      for (final c in calls) {
        batch.insert('calls', c.toDb(),
            conflictAlgorithm: replace ? ConflictAlgorithm.replace : ConflictAlgorithm.ignore);
      }
      final results = await batch.commit();
      added = results.where((r) => r is int && r > 0).length;
    });
    return added;
  }

  Future<List<CallRecord>> allCalls() async =>
      (await _db.query('calls', orderBy: 'ts DESC')).map(CallRecord.fromDb).toList();

  Future<List<CallRecord>> callsFor(String numberKey) async =>
      (await _db.query('calls', where: 'number_key = ?', whereArgs: [numberKey], orderBy: 'ts DESC'))
          .map(CallRecord.fromDb)
          .toList();

  Future<List<CallRecord>> unsyncedCalls({int limit = 400}) async =>
      (await _db.query('calls', where: 'synced = 0', orderBy: 'ts ASC', limit: limit))
          .map(CallRecord.fromDb)
          .toList();

  Future<void> markCallsSynced(List<String> ids) async {
    if (ids.isEmpty) return;
    await _db.transaction((txn) async {
      final batch = txn.batch();
      for (final id in ids) {
        batch.update('calls', {'synced': 1}, where: 'id = ?', whereArgs: [id]);
      }
      await batch.commit(noResult: true);
    });
  }

  Future<int> unsyncedCount() async {
    final a = Sqflite.firstIntValue(await _db.rawQuery('SELECT COUNT(*) FROM calls WHERE synced = 0')) ?? 0;
    final b = Sqflite.firstIntValue(await _db.rawQuery('SELECT COUNT(*) FROM contacts WHERE synced = 0')) ?? 0;
    return a + b;
  }

  Future<int> callCount() async =>
      Sqflite.firstIntValue(await _db.rawQuery('SELECT COUNT(*) FROM calls')) ?? 0;

  /// Latest call already imported from this phone's own call log.
  Future<int> latestOwnCallTs(String deviceId) async =>
      Sqflite.firstIntValue(
          await _db.rawQuery('SELECT MAX(ts) FROM calls WHERE device_id = ?', [deviceId])) ??
      0;

  Future<Map<String, ContactInfo>> allContacts() async {
    final rows = await _db.query('contacts');
    return {for (final r in rows) r['number_key'] as String: ContactInfo.fromDb(r)};
  }

  Future<ContactInfo?> contact(String key) async {
    final rows = await _db.query('contacts', where: 'number_key = ?', whereArgs: [key]);
    return rows.isEmpty ? null : ContactInfo.fromDb(rows.first);
  }

  Future<void> upsertContact(ContactInfo c) =>
      _db.insert('contacts', c.toDb(), conflictAlgorithm: ConflictAlgorithm.replace);

  Future<List<ContactInfo>> unsyncedContacts() async =>
      (await _db.query('contacts', where: 'synced = 0')).map(ContactInfo.fromDb).toList();

  /// Marks synced only if nobody edited it again while the upload ran.
  Future<void> markContactSynced(String key, int updatedAt) => _db.update(
      'contacts', {'synced': 1},
      where: 'number_key = ? AND updated_at = ?', whereArgs: [key, updatedAt]);

  Future<void> markSavedToPhone(String key) =>
      _db.update('contacts', {'saved_to_phone': 1}, where: 'number_key = ?', whereArgs: [key]);
}
