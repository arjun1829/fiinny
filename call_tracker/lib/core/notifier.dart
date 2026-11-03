import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// The single "N calls still pending" notification, replaced on each sync.
class PendingNotifier {
  static final _plugin = FlutterLocalNotificationsPlugin();
  static bool _ready = false;

  static Future<void> _init() async {
    if (_ready) return;
    await _plugin.initialize(
      settings: const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      ),
    );
    _ready = true;
  }

  static Future<void> requestPermission() async {
    if (kIsWeb) return;
    await _init();
    await _plugin
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.requestNotificationsPermission();
  }

  static Future<void> show(int pending, String oldest) async {
    if (kIsWeb) return;
    await _init();
    if (pending == 0) {
      await _plugin.cancel(id: 1);
      return;
    }
    await _plugin.show(
      id: 1,
      title: '$pending ${pending == 1 ? 'call' : 'calls'} still pending call back',
      body: 'Oldest waiting since $oldest',
      notificationDetails: const NotificationDetails(
        android: AndroidNotificationDetails(
          'pending_callbacks',
          'Pending call backs',
          channelDescription: 'How many missed calls still need a call back',
          importance: Importance.defaultImportance,
          onlyAlertOnce: true,
        ),
      ),
    );
  }
}
