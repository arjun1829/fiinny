// lib/services/push/push_service.dart
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:lifemap/main.dart' show rootNavigatorKey;

final FlutterLocalNotificationsPlugin _fln = FlutterLocalNotificationsPlugin();

@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // Keep super light; if needed, init Firebase here first.
  // await Firebase.initializeApp();
}

class PushService {
  static final _messaging = FirebaseMessaging.instance;

  // --- Android notification channels ---
  static const _chDefault = AndroidNotificationChannel(
    'fiinny_default',
    'Fiinny',
    description: 'General notifications',
    importance: Importance.high,
  );
  static const _chNudges = AndroidNotificationChannel(
    'fiinny_nudges',
    'Fiinny Nudges',
    description: 'Smart nudges & reminders',
    importance: Importance.high,
  );
  static const _chDigests = AndroidNotificationChannel(
    'fiinny_digests',
    'Fiinny Digests',
    description: 'Daily/weekly/monthly digests',
    importance: Importance.defaultImportance,
  );
  static const _chCritical = AndroidNotificationChannel(
    'fiinny_critical',
    'Fiinny Critical',
    description: 'Important alerts',
    importance: Importance.max,
  );

  /// Call once after Firebase.initializeApp(). Recalling is safe (idempotent).
  static Future<void> init() async {
    // 1) Local notifications init
    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosInit = DarwinInitializationSettings();
    await _fln.initialize(
      const InitializationSettings(android: androidInit, iOS: iosInit),
      onDidReceiveNotificationResponse: (resp) {
        final deeplink = resp.payload;
        if (deeplink != null && deeplink.isNotEmpty) _handleDeeplink(deeplink);
      },
    );

    // 2) Ensure Android channels (no Android runtime permission call here;
    //    flutter_local_notifications 19.x doesn't expose it)
    await _ensureAndroidChannels();

    // 3) iOS permission
    if (Platform.isIOS) {
      await _messaging.requestPermission(alert: true, badge: true, sound: true);
    }

    // 4) Background handler
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

    // 5) Token save + refresh
    final token = await _messaging.getToken();
    await _saveToken(token);
    _messaging.onTokenRefresh.listen(_saveToken);

    // 6) Foreground messages → local banner (+ in-app feed)
    FirebaseMessaging.onMessage.listen((msg) async {
      final title = msg.notification?.title ?? msg.data['title'] ?? 'Fiinny';
      final body = msg.notification?.body ?? msg.data['body'] ?? '';
      final deeplink = msg.data['deeplink'] ?? 'app://home';
      final channelId = _channelFromType(msg.data['type'], msg.data['severity']);

      await _showLocalNow(title, body, deeplink, channelId: channelId);

      final uid = FirebaseAuth.instance.currentUser?.uid;
      if (uid != null) {
        await FirebaseFirestore.instance
            .collection('users')
            .doc(uid)
            .collection('notif_feed')
            .doc()
            .set({
          'type': msg.data['type'] ?? 'info',
          'title': title,
          'body': body,
          'deeplink': deeplink,
          'createdAt': DateTime.now().millisecondsSinceEpoch,
          'read': false,
        }, SetOptions(merge: false));
      }
    });

    // 7) Tap from background
    FirebaseMessaging.onMessageOpenedApp.listen((msg) {
      final deeplink = msg.data['deeplink'] ?? 'app://home';
      _handleDeeplink(deeplink);
    });

    // 8) Cold start from push
    final initialMsg = await _messaging.getInitialMessage();
    if (initialMsg != null) {
      final deeplink = initialMsg.data['deeplink'] ?? 'app://home';
      _handleDeeplink(deeplink);
    }
  }

  // ---- helpers ----

  static Future<void> _ensureAndroidChannels() async {
    if (!Platform.isAndroid) return;
    final android = _fln
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    if (android == null) return;
    try {
      await android.createNotificationChannel(_chDefault);
      await android.createNotificationChannel(_chNudges);
      await android.createNotificationChannel(_chDigests);
      await android.createNotificationChannel(_chCritical);
    } catch (_) {}
  }

  static String _channelFromType(dynamic type, dynamic severity) {
    final t = (type ?? '').toString().toLowerCase();
    if (t.contains('critical') ||
        t.contains('overdue') ||
        (severity != null && '$severity' == '3')) {
      return _chCritical.id;
    }
    if (t.contains('weekly') ||
        t.contains('monthly') ||
        t.contains('digest') ||
        t.contains('summary')) {
      return _chDigests.id;
    }
    if (t.contains('nudge') || t.contains('reminder')) {
      return _chNudges.id;
    }
    return _chDefault.id;
  }

  static Future<void> _showLocalNow(
      String title,
      String body,
      String deeplink, {
        String channelId = 'fiinny_default',
      }) async {
    // NOTE: AndroidNotificationDetails requires BOTH channelId AND channelName
    final android = AndroidNotificationDetails(
      channelId,
      'Fiinny', // name is ignored if channel already exists, but required here
      channelDescription: 'Fiinny notifications',
      importance: Importance.high,
      priority: Priority.high,
      styleInformation: const BigTextStyleInformation(''),
    );
    const ios = DarwinNotificationDetails();
    final details = NotificationDetails(android: android, iOS: ios);

    await _fln.show(
      DateTime.now().millisecondsSinceEpoch ~/ 1000,
      title,
      body,
      details,
      payload: deeplink,
    );
  }

  static Future<void> _saveToken(String? token) async {
    if (token == null) return;
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) return;
    await FirebaseFirestore.instance.collection('users').doc(uid).set({
      'fcmToken': token,
      'fcmTokenUpdatedAt': DateTime.now().millisecondsSinceEpoch,
    }, SetOptions(merge: true));
  }

  /// Centralized deeplink navigation.
  static void _handleDeeplink(String deeplink) {
    final nav = rootNavigatorKey.currentState;
    if (nav == null) return;

    final uri = Uri.tryParse(deeplink) ?? Uri.parse('app://home');
    // e.g. app://expense/ABC -> host=expense, path=/ABC
    final host = uri.host.toLowerCase();
    final firstSeg = uri.pathSegments.isNotEmpty ? uri.pathSegments.first : '';

    switch (host) {
      case 'tx': // app://tx/today
        nav.pushNamed('/tx-day-details',
            arguments: FirebaseAuth.instance.currentUser?.phoneNumber ??
                FirebaseAuth.instance.currentUser?.uid ??
                '');
        break;

      case 'analytics': // app://analytics/weekly or /monthly
        final sub = firstSeg;
        if (sub == 'weekly')  nav.pushNamed('/analytics-weekly');
        else if (sub == 'monthly') nav.pushNamed('/analytics-monthly');
        else nav.pushNamed('/analytics');
        break;

      case 'expense': // ✅ app://expense/{expenseId}
        if (firstSeg.isNotEmpty) {
          nav.pushNamed('/expense-details', arguments: firstSeg);
        }
        break;

      case 'chat': // ✅ app://chat/{threadId}
        if (firstSeg.isNotEmpty) {
          nav.pushNamed('/chat', arguments: firstSeg);
        }
        break;

      case 'partner':
        nav.pushNamed('/partner-dashboard');
        break;

      case 'friends':
        nav.pushNamed('/friends');
        break;

      case 'budget':
        nav.pushNamed('/budget');
        break;

      default:
        nav.pushNamed('/'); // fallback
    }
  }


  /// Quick local test (call from a debug button)
  static Future<void> debugLocalTest() async {
    await _showLocalNow(
      '🔔 Test nudge',
      'If you see this, local banners work.',
      'app://tx/today',
      channelId: _chNudges.id,
    );
  }
}
