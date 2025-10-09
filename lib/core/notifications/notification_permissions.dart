// lib/core/notifications/notification_permissions.dart
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

class NotificationPermissions {
  static Future<bool> ensureEnabled(FlutterLocalNotificationsPlugin plugin) async {
    if (!Platform.isAndroid) return true;

    final android =
    plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();

    // Older Androids may return null here; treat as enabled to avoid blocking.
    final enabled = await android?.areNotificationsEnabled() ?? true;
    if (enabled) return true;

    // ✅ Correct API name for your version (19.4.2)
    final granted = await android?.requestNotificationsPermission() ?? false;

    if (kDebugMode) {
      // ignore: avoid_print
      print('[NotifPerm] enabled=$enabled, granted=$granted');
    }
    return granted;
  }
}
