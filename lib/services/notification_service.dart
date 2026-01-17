// lib/services/notification_service.dart
import 'dart:io' show Platform;
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:permission_handler/permission_handler.dart';

import '../core/notifications/local_notifications.dart';

const bool kDiagBuild = bool.fromEnvironment('DIAG_BUILD', defaultValue: true);

class NotificationService {
  static final NotificationService _instance = NotificationService._internal();
  factory NotificationService() => _instance;

  static final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();

  NotificationService._internal();

  /// External handler for navigation (avoids dependency cycle with main.dart)
  static Function(String payload)? onPayload;

  static Future<void> requestPermissionLight() async {
    if (!kIsWeb && Platform.isAndroid) {
      try {
        final status = await Permission.notification.status;
        if (!status.isGranted && !status.isLimited) {
          final result = await Permission.notification.request();
          if (!result.isGranted && !result.isLimited) {
            return;
          }
        }
      } catch (err) {
        // debugPrint(
        //     '[NotificationService] Android notification permission check failed: $err\n$stack');
      }
      return;
    }

    if (kIsWeb || !Platform.isIOS) {
      return;
    }
    try {
      await FirebaseMessaging.instance.requestPermission(
        alert: true,
        badge: true,
        sound: true,
        announcement: false,
        carPlay: false,
        criticalAlert: false,
        provisional: true,
      );
    } catch (err) {
      // debugPrint(
      //     '[NotificationService] requestPermissionLight failed: $err\n$stack');
    }
  }

  static Future<void> initFull() async {
    if (!kIsWeb && kDiagBuild && Platform.isIOS) {
      // debugPrint(
      //     '[NotificationService] Skipping full init on diagnostic iOS build.');
      return;
    }

    const AndroidInitializationSettings androidInit =
        AndroidInitializationSettings('@mipmap/ic_launcher');

    const DarwinInitializationSettings iosInit = DarwinInitializationSettings(
      // iOS permission prompts are centralized in PushService.ensurePermissions().
      // Requesting here would show a duplicate dialog during app launch.
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );

    final InitializationSettings settings = InitializationSettings(
      android: androidInit,
      iOS: iosInit,
    );

    await _plugin.initialize(
      settings,
      onDidReceiveNotificationResponse: onDidReceiveNotificationResponse,
    );
  }

  static Future<void> initialize() => initFull();

  Future<void> showNotification({
    required String title,
    required String body,
    String? payload, // NEW: deeplink for tap
  }) async {
    const AndroidNotificationDetails androidDetails =
        AndroidNotificationDetails(
      'default_channel',
      'General Notifications',
      channelDescription: 'Default channel for app notifications',
      importance: Importance.max,
      priority: Priority.high,
    );

    const DarwinNotificationDetails iosDetails = DarwinNotificationDetails();

    final NotificationDetails details = NotificationDetails(
      android: androidDetails,
      iOS: iosDetails,
    );

    final int id = DateTime.now().millisecondsSinceEpoch.remainder(100000);
    await _plugin.show(id, title, body, details, payload: payload);
  }

  static void onDidReceiveNotificationResponse(NotificationResponse response) {
    final p = response.payload;
    if (p != null && p.isNotEmpty) {
      onPayload?.call(p);
    }
  }

  static FlutterLocalNotificationsPlugin get plugin => _plugin;

  Future<void> scheduleAt({
    required int id,
    required String title,
    required String body,
    required DateTime when,
    String? payload,
  }) async {
    await LocalNotifs.scheduleOnce(
      itemId: id.toString(),
      title: title,
      fireAt: when,
      body: body,
      payload: payload,
    );
  }

  Future<void> cancel(int id) async {
    await LocalNotifs.cancelForItem(id.toString());
  }

  /// Schedule a monthly wrap notification for the next month on the 1st at 9 AM.
  Future<void> scheduleMonthlyWrapIfNeeded() async {
    final now = DateTime.now();
    var month = now.month + 1;
    var year = now.year;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    final fireAt = DateTime(year, month, 1, 9, 0);

    await LocalNotifs.scheduleOnce(
      itemId: 'monthly_wrap_${fireAt.year}_${fireAt.month}',
      title: '📊 Your Monthly Wrap is ready',
      body: 'Spends, savings, best & worst days — dive into insights.',
      fireAt: fireAt,
      payload: 'app://analytics/monthly',
    );
  }
}
