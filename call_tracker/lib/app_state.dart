import 'core/web_demo.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:call_log_reader/call_log_reader.dart';
import 'package:flutter/widgets.dart';

import 'core/app_config.dart';
import 'core/local_db.dart';
import 'core/models.dart';
import 'core/phone_contacts.dart';
import 'core/prefs.dart';
import 'core/status_engine.dart';
import 'core/sync_service.dart';

/// Everything the screens show, recomputed from the local db after each sync.
class AppState extends ChangeNotifier with WidgetsBindingObserver {
  AppState._(this.db, this.prefs);

  final LocalDb db;
  Prefs prefs;

  List<CallRecord> calls = [];
  Map<String, ContactInfo> contacts = {};
  Map<String, String> phoneNames = {};
  StatusResult status = StatusResult([], []);
  Map<String, NumberSummary> byNumber = {};
  int unsynced = 0;
  bool syncing = false;
  SyncReport? lastReport;

  static Future<AppState> create() async {
    final db = await LocalDb.open();
    await WebDemo.seedIfEmpty(db); // browser testing only
    final s = AppState._(db, await Prefs.load());
    WidgetsBinding.instance.addObserver(s);
    await s.reload();
    return s;
  }

  bool get cloudEnabled => AppConfig.cloudEnabled;

  List<NumberSummary> get pending =>
      status.summaries.where((s) => s.status.needsCallback).toList();

  String nameFor(String key, {String? fallback}) =>
      byNumber[key]?.name ?? phoneNames[key] ?? fallback ?? key;

  Future<void> reload() async {
    prefs = await Prefs.load();
    calls = await db.allCalls();
    contacts = await db.allContacts();
    try {
      phoneNames = await PhoneContacts.namesByNumber();
    } catch (_) {}
    status = computeStatuses(calls, contacts, phoneNames: phoneNames);
    byNumber = {for (final s in status.summaries) s.numberKey: s};
    unsynced = await db.unsyncedCount();
    notifyListeners();
  }

  Future<SyncReport> sync() async {
    syncing = true;
    notifyListeners();
    try {
      lastReport = await SyncService.run();
    } finally {
      syncing = false;
      await reload();
    }
    return lastReport!;
  }

  /// Back from the dialler after a call back: pick up the new call at once.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && prefs.setupDone) sync();
  }

  Future<void> callBack(String number) async {
    if (kIsWeb) return; // a browser can't place calls
    await CallLogReader.call(number);
  }

  Future<void> whatsApp(String number) {
    var digits = number.replaceAll(RegExp(r'\D'), '');
    if (digits.length == 10) digits = '91$digits';
    if (kIsWeb) return Future.value(); // browser: no WhatsApp hand-off
    return CallLogReader.openUrl('https://wa.me/$digits');
  }

  Future<ContactInfo> _contactOrNew(String key, String displayNumber) async =>
      await db.contact(key) ??
      ContactInfo(
          numberKey: key,
          displayNumber: displayNumber,
          updatedAt: DateTime.now().millisecondsSinceEpoch);

  /// Saves for the whole team and, when the phone does not have this number
  /// yet, into the phone's own contacts too.
  Future<bool> saveContact(String key, String displayNumber,
      {required String name, String? notes}) async {
    final existing = await _contactOrNew(key, displayNumber);
    var savedToPhone = existing.savedToPhone;
    var phoneSaveFailed = false;
    if (name.trim().isNotEmpty && !phoneNames.containsKey(key)) {
      try {
        savedToPhone = await PhoneContacts.save(name, displayNumber) || savedToPhone;
        phoneSaveFailed = !savedToPhone;
      } catch (_) {
        phoneSaveFailed = true;
      }
    }
    await db.upsertContact(existing.copyWith(
      name: name.trim(),
      notes: notes?.trim(),
      displayNumber: displayNumber,
      updatedAt: DateTime.now().millisecondsSinceEpoch,
      updatedBy: prefs.deviceName,
      synced: false,
      savedToPhone: savedToPhone,
    ));
    await reload();
    sync();
    return !phoneSaveFailed;
  }

  Future<void> markNotNeeded(String key, String displayNumber) async {
    final existing = await _contactOrNew(key, displayNumber);
    final now = DateTime.now().millisecondsSinceEpoch;
    await db.upsertContact(existing.copyWith(
        dismissedAt: now, updatedAt: now, updatedBy: prefs.deviceName, synced: false));
    await reload();
    sync();
  }

  Future<void> undoNotNeeded(String key) async {
    final existing = await db.contact(key);
    if (existing == null) return;
    await db.upsertContact(existing.copyWith(
        clearDismissed: true,
        updatedAt: DateTime.now().millisecondsSinceEpoch,
        updatedBy: prefs.deviceName,
        synced: false));
    await reload();
    sync();
  }

  Future<void> setDeviceName(String name) async {
    await prefs.setDeviceName(name);
    await reload();
  }
}
