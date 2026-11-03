import 'dart:ui';

import 'package:flutter/widgets.dart';
import 'package:workmanager/workmanager.dart';

import 'sync_service.dart';

const _periodicTask = 'call-tracker-sync';

@pragma('vm:entry-point')
void backgroundDispatcher() {
  Workmanager().executeTask((task, input) async {
    WidgetsFlutterBinding.ensureInitialized();
    DartPluginRegistrant.ensureInitialized();
    try {
      await SyncService.run();
    } catch (_) {
      // Next run retries; a failed run must not get the job backed off.
    }
    return true;
  });
}

/// Every 15 minutes (Android's minimum), even with the app closed.
Future<void> scheduleBackgroundSync() async {
  await Workmanager().initialize(backgroundDispatcher);
  await Workmanager().registerPeriodicTask(
    _periodicTask,
    _periodicTask,
    frequency: const Duration(minutes: 15),
    existingWorkPolicy: ExistingPeriodicWorkPolicy.keep,
  );
}
