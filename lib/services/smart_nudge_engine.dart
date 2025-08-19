import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import '../models/insight_model.dart';

class SmartNudgeEngine {
  final FlutterLocalNotificationsPlugin notificationsPlugin;

  SmartNudgeEngine(this.notificationsPlugin);

  Future<void> sendNudge(InsightModel insight) async {
    const AndroidNotificationDetails androidDetails = AndroidNotificationDetails(
      'fiinny_nudges', // Channel ID
      'Fiinny Smart Nudges', // Channel name
      channelDescription: 'Reminders, insights, and smart tips from Fiinny Brain',
      importance: Importance.high,
      priority: Priority.high,
    );

    const NotificationDetails platformDetails = NotificationDetails(
      android: androidDetails,
    );

    await notificationsPlugin.show(
      DateTime.now().millisecondsSinceEpoch ~/ 1000,
      insight.title,
      insight.description,
      platformDetails,
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
    );
  }
}
