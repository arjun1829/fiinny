// lib/services/smart_nudge_engine.dart
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import '../models/insight_model.dart';

class SmartNudgeEngine {
  final FlutterLocalNotificationsPlugin notificationsPlugin;

  SmartNudgeEngine(this.notificationsPlugin);

  Future<void> sendNudge(InsightModel insight, {String? deeplink}) async {
    const AndroidNotificationDetails androidDetails = AndroidNotificationDetails(
      'fiinny_nudges',
      'Fiinny Smart Nudges',
      channelDescription: 'Reminders, insights, and smart tips from Fiinny Brain',
      importance: Importance.high,
      priority: Priority.high,
    );

    const NotificationDetails platformDetails = NotificationDetails(
      android: androidDetails,
      iOS: DarwinNotificationDetails(),
    );

    final payload = deeplink ?? _inferDeeplinkFromInsight(insight);

    await notificationsPlugin.show(
      DateTime.now().millisecondsSinceEpoch ~/ 1000,
      insight.title,
      insight.description,
      platformDetails,
      payload: payload,
    );
  }

  Future<void> sendDailyReminder() async {
    final now = DateTime.now();
    await sendNudge(
      InsightModel(
        title: "🌞 Daily Check-In",
        description: "Open Fiinny to review your goals, limits & tips.",
        type: InsightType.info,
        timestamp: now,
      ),
      deeplink: "app://tx/today",
    );
  }

  String _inferDeeplinkFromInsight(InsightModel i) {
    switch (i.category) {
      case 'loan': return 'app://loans';
      case 'asset': return 'app://assets';
      case 'goal': return 'app://goals';
      case 'expense': return 'app://tx/today';
      default:
        return 'app://home';
    }
  }
}
