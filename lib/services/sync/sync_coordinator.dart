// lib/services/sync/sync_coordinator.dart
import 'package:flutter/foundation.dart';
import '../gmail_service.dart'; // Gmail-only pipeline
import '../sms/sms_ingestor.dart';
import '../sms/sms_permission_helper.dart';

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
    SmsIngestor.instance.init();
    await _ensureSmsPipelines(userPhone, coldStart: true);
  }

  Future<void> onAppResume(String userPhone) async {
    _running = true;
    await _ensureSmsPipelines(userPhone, coldStart: false);
  }

  void onAppStop() {
    _running = false;
  }

  Future<void> runGmailBackfill(String userPhone) async {
    try {
      await GmailService().fetchAndStoreTransactionsFromGmail(userPhone);
    } catch (e, st) {
      debugPrint('[SyncCoordinator] Gmail backfill error: $e\n$st');
    }
  }

  Future<void> _ensureSmsPipelines(String userPhone, {required bool coldStart}) async {
    try {
      final bool granted = coldStart
          ? await SmsPermissionHelper.ensurePermissions()
          : await SmsPermissionHelper.hasPermissions();

      if (!granted) {
        return;
      }

      if (coldStart && !_smsInitialBackfillRan) {
        await SmsIngestor.instance.initialBackfill(userPhone: userPhone);
        _smsInitialBackfillRan = true;
      } else {
        final now = DateTime.now();
        if (_lastSmsSync == null || now.difference(_lastSmsSync!) > const Duration(minutes: 10)) {
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
    } catch (e, st) {
      debugPrint('[SyncCoordinator] SMS pipeline error: $e\n$st');
    }
  }
}
