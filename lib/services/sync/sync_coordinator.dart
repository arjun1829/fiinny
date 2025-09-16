// lib/services/sync/sync_coordinator.dart
import 'dart:io' show Platform;
import 'package:flutter/foundation.dart';
import '../sms/sms_ingestor.dart';
import '../sms/sms_permission_helper.dart';
import '../gmail_service.dart'; // your current Gmail service

class SyncCoordinator {
  SyncCoordinator._();
  static final SyncCoordinator instance = SyncCoordinator._();

  bool _running = false;

  Future<void> onAppStart(String userPhone) async {
    if (_running) return;
    _running = true;

    // SMS
    if (Platform.isAndroid) {
      final hasPerm = await SmsPermissionHelper.hasPermissions();
      if (hasPerm) {
        try {
          await SmsIngestor.instance.startRealtime(userPhone: userPhone);
        } catch (e, st) {
          debugPrint('[SyncCoordinator] startRealtime error: $e\n$st');
        }
      }
    }
  }

  Future<void> onAppResume(String userPhone) async {
    // Light delta from SMS inbox
    if (Platform.isAndroid) {
      final hasPerm = await SmsPermissionHelper.hasPermissions();
      if (hasPerm) {
        try {
          await SmsIngestor.instance.syncDelta(userPhone: userPhone, lookbackHours: 48);
        } catch (e, st) {
          debugPrint('[SyncCoordinator] syncDelta error: $e\n$st');
        }
      }
    }
  }

  void onAppStop() {
    // nothing to stop for Telephony listener; keep no-op
  }

  Future<void> runGmailBackfill(String userPhone) async {
    try {
      await GmailService().fetchAndStoreTransactionsFromGmail(userPhone);
    } catch (e, st) {
      debugPrint('[SyncCoordinator] Gmail backfill error: $e\n$st');
    }
  }
}
