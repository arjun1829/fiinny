// lib/services/sync/sync_coordinator.dart
import 'package:flutter/foundation.dart';
import '../gmail_service.dart'; // Gmail-only pipeline

class SyncCoordinator {
  SyncCoordinator._();
  static final SyncCoordinator instance = SyncCoordinator._();

  bool _running = false;

  Future<void> onAppStart(String userPhone) async {
    if (_running) return;
    _running = true;
  }

  Future<void> onAppResume(String userPhone) async {
    // No-op for now; Gmail ingestion is user-triggered.
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
}
