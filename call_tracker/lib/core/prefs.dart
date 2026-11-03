import 'dart:math';

import 'package:shared_preferences/shared_preferences.dart';

/// Per-phone settings. Read fresh each time: the background isolate writes
/// some of these too.
class Prefs {
  Prefs._(this._p);
  final SharedPreferences _p;

  static Future<Prefs> load() async {
    final p = await SharedPreferences.getInstance();
    await p.reload();
    return Prefs._(p);
  }

  String get deviceId {
    var id = _p.getString('deviceId');
    if (id == null) {
      final r = Random.secure();
      id = List.generate(12, (_) => r.nextInt(36).toRadixString(36)).join();
      _p.setString('deviceId', id);
    }
    return id;
  }

  String get deviceName => _p.getString('deviceName') ?? 'Phone';
  Future<void> setDeviceName(String v) => _p.setString('deviceName', v.trim());

  bool get setupDone => _p.getBool('setupDone') ?? false;
  Future<void> setSetupDone() => _p.setBool('setupDone', true);

  bool get saveTeamContactsToPhone => _p.getBool('saveTeamContactsToPhone') ?? true;
  Future<void> setSaveTeamContactsToPhone(bool v) => _p.setBool('saveTeamContactsToPhone', v);

  bool get notifyPending => _p.getBool('notifyPending') ?? true;
  Future<void> setNotifyPending(bool v) => _p.setBool('notifyPending', v);

  int get lastCallsPull => _p.getInt('lastCallsPull') ?? 0;
  Future<void> setLastCallsPull(int v) => _p.setInt('lastCallsPull', v);

  int get lastContactsPull => _p.getInt('lastContactsPull') ?? 0;
  Future<void> setLastContactsPull(int v) => _p.setInt('lastContactsPull', v);

  int get lastSyncAt => _p.getInt('lastSyncAt') ?? 0;
  Future<void> setLastSyncAt(int v) => _p.setInt('lastSyncAt', v);

  int get lastCloudSyncAt => _p.getInt('lastCloudSyncAt') ?? 0;
  Future<void> setLastCloudSyncAt(int v) => _p.setInt('lastCloudSyncAt', v);

  String? get lastError => _p.getString('lastError');
  Future<void> setLastError(String? v) =>
      v == null ? _p.remove('lastError') : _p.setString('lastError', v);

  int get lastNotifiedPending => _p.getInt('lastNotifiedPending') ?? -1;
  Future<void> setLastNotifiedPending(int v) => _p.setInt('lastNotifiedPending', v);
}
