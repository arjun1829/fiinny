// lib/services/notification_service.dart
import 'dart:io' show Platform;
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

const bool kDiagBuild = bool.fromEnvironment('DIAG_BUILD', defaultValue: true);

class NotificationService {
  static final NotificationService _instance = NotificationService._internal();
  factory NotificationService() => _instance;

  static final FlutterLocalNotificationsPlugin _plugin = FlutterLocalNotificationsPlugin();

  NotificationService._internal();

  static Future<void> requestPermissionLight() async {
    if (!Platform.isIOS) return;
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
    } catch (err, stack) {
      debugPrint('[NotificationService] requestPermissionLight failed: $err\n$stack');
    }
  }

  static Future<void> initFull() async {
    if (kDiagBuild && Platform.isIOS) {
      debugPrint('[NotificationService] Skipping full init on diagnostic iOS build.');
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
    const AndroidNotificationDetails androidDetails = AndroidNotificationDetails(
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
    debugPrint('🔔 Notification tapped: ${response.payload}');
    // TODO: route using your app router with response.payload (deeplink)
  }

  static FlutterLocalNotificationsPlugin get plugin => _plugin;
}
