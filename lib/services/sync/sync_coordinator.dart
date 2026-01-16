// lib/services/sync/sync_coordinator.dart
import 'package:flutter/foundation.dart';
import '../gmail_service.dart'; // Gmail-only pipeline
import '../sms/sms_ingestor.dart';
import '../sms/sms_permission_helper.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:workmanager/workmanager.dart';

class SyncCoordinator {
  SyncCoordinator._();
  static final SyncCoordinator instance = SyncCoordinator._();

  bool _running = false;
  bool _smsRealtimeStarted = false;
  bool _smsInitialBackfillRan = false;
  DateTime? _lastSmsSync;

  Future<void> onAppStart(String userPhone) async {
    if (_running) return;
    _running = true;
    _trackActivity(); // Track valid session
    SmsIngestor.instance.init();
    await _ensureSmsPipelines(userPhone, coldStart: true);
    // Register daily Gmail sync check
    _scheduleDailyGmailSync(userPhone);
  }

  Future<void> onAppResume(String userPhone) async {
    _running = true;
    _trackActivity(); // Track valid session
    await _ensureSmsPipelines(userPhone, coldStart: false);
  }

  Future<void> _trackActivity() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setInt(
          'last_active_timestamp', DateTime.now().millisecondsSinceEpoch);
    } catch (_) {}
  }

  void _scheduleDailyGmailSync(String userPhone) {
    if (kIsWeb) return;
    try {
      Workmanager().registerPeriodicTask(
        "daily-gmail-sync-task",
        "dailyGmailSync",
        inputData: {"userPhone": userPhone},
        constraints: Constraints(
          networkType: NetworkType.connected,
          requiresBatteryNotLow: true,
        ),
        frequency: const Duration(hours: 24),
        existingWorkPolicy: ExistingPeriodicWorkPolicy.keep,
        backoffPolicy: BackoffPolicy.linear,
        backoffPolicyDelay: const Duration(minutes: 10),
      );
    } catch (e) {
      // debugPrint("Failed to schedule daily gmail sync: $e");
    }
  }

  void onAppStop() {
    _running = false;
  }

  Future<void> runGmailBackfill(String userPhone) async {
    try {
      await GmailService().fetchAndStoreTransactionsFromGmail(userPhone);
    } catch (e) {
      // debugPrint('[SyncCoordinator] Gmail backfill error: $e\n$st');
    }
  }

  Future<void> _ensureSmsPipelines(String userPhone,
      {required bool coldStart}) async {
    try {
      final bool granted = await SmsPermissionHelper.hasPermissions();

      if (!granted) {
        return;
      }

      if (coldStart && !_smsInitialBackfillRan) {
        await SmsIngestor.instance.initialBackfill(userPhone: userPhone);
        _smsInitialBackfillRan = true;
      } else {
        final now = DateTime.now();
        if (_lastSmsSync == null ||
            now.difference(_lastSmsSync!) > const Duration(minutes: 10)) {
          await SmsIngestor.instance.syncDelta(
            userPhone: userPhone,
            overlapHours: 12,
          );
          _lastSmsSync = now;
        }
      }

      if (!_smsRealtimeStarted) {
        await SmsIngestor.instance.startRealtime(userPhone: userPhone);
        _smsRealtimeStarted = true;
      }

      await SmsIngestor.instance.scheduleDaily48hSync(userPhone);
    } catch (e) {
      // debugPrint('[SyncCoordinator] SMS pipeline error: $e\n$st');
    }
  }
}
