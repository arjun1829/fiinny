// lib/services/push/push_service.dart
import 'dart:async';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:lifemap/main.dart' show rootNavigatorKey;
import 'package:lifemap/services/push/first_surface_gate.dart';

final FlutterLocalNotificationsPlugin _fln = FlutterLocalNotificationsPlugin();

@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // Keep super light; if needed, init Firebase here first.
  // await Firebase.initializeApp();
  if (kDebugMode) {
    // ignore: avoid_print
    print('[PushService] BG message: ${message.messageId} ${message.data}');
  }
}

class PushService {
  static final _messaging = FirebaseMessaging.instance;
  static Future<void>? _initInFlight;
  static bool _initialized = false;
  static Completer<void>? _permissionRequest;

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
  static Future<void> init() {
    if (_initialized) return Future.value();
    if (_initInFlight != null) return _initInFlight!;

    _initInFlight = _performInit();
    return _initInFlight!;
  }

  static Future<void> _performInit() async {
    var success = false;
    try {
      // 1) Local notifications init
      const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
      const iosInit = DarwinInitializationSettings(
        // Permission prompts are orchestrated in ensurePermissions(). Requesting
        // them again here during plugin bootstrap caused iOS to present the
        // system alert while the Flutter surface was still mounting, which is
        // what left users staring at a blank screen after dismissing it.
        requestAlertPermission: false,
        requestBadgePermission: false,
        requestSoundPermission: false,
      );
      await _fln.initialize(
        const InitializationSettings(android: androidInit, iOS: iosInit),
        onDidReceiveNotificationResponse: (resp) {
          final deeplink = resp.payload;
          if (kDebugMode) {
            // ignore: avoid_print
            print('[PushService] onDidReceiveNotificationResponse payload=$deeplink');
          }
          if (deeplink != null && deeplink.isNotEmpty) _handleDeeplink(deeplink);
        },
      );

      // 2) Ensure Android channels
      await _ensureAndroidChannels();

      // 3) Permissions (iOS prompts; Android 13+ uses app manifest permission)
      await ensurePermissions();

      // 4) Background handler
      FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

      // 5) Token save + refresh
      try {
        final token = await _messaging.getToken();
        if (kDebugMode) {
          // ignore: avoid_print
          print('[PushService] FCM token: $token');
        }
        await _saveToken(token);
        _messaging.onTokenRefresh.listen(_saveToken);
      } catch (e) {
        if (kDebugMode) {
          // ignore: avoid_print
          print('[PushService] getToken failed: $e');
        }
      }

      // 6) Foreground messages → local banner (+ in-app feed)
      FirebaseMessaging.onMessage.listen((msg) async {
        final title = msg.notification?.title ?? msg.data['title'] ?? 'Fiinny';
        final body = msg.notification?.body ?? msg.data['body'] ?? '';
        final String? deeplink = msg.data['deeplink']; // do NOT fabricate one
        final channelId = _channelFromType(msg.data['type'], msg.data['severity']);

        if (kDebugMode) {
          // ignore: avoid_print
          print('[PushService] onMessage type=${msg.data['type']} deeplink=$deeplink');
        }

        await _showLocalNow(title, body, deeplink ?? '', channelId: channelId);

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

      // 7) Tap from background (user explicitly tapped the push)
      FirebaseMessaging.onMessageOpenedApp.listen((msg) {
        final String? deeplink = msg.data['deeplink'];
        if (kDebugMode) {
          // ignore: avoid_print
          print('[PushService] onMessageOpenedApp deeplink=$deeplink');
        }
        if (deeplink != null && deeplink.isNotEmpty) {
          _handleDeeplink(deeplink);
        }
      });

      // ✅ Intentionally NO cold-start deeplink handling here.
      // We DO NOT call getInitialMessage() to avoid auto-navigation when opening from the app icon.
      success = true;
    } finally {
      _initialized = success;
      _initInFlight = null;
    }
  }

  /// Ask for notification permission where relevant.
  /// - iOS: prompts user
  /// - Android: runtime permission handled by OS (manifest) on 13+, nothing to do here
  static Future<void> ensurePermissions() async {
    if (!Platform.isIOS) return;

    await FirstSurfaceGate.waitUntilReady(timeout: Duration.zero);

    if (_permissionRequest != null) {
      await _permissionRequest!.future;
      return;
    }

    final completer = Completer<void>();
    _permissionRequest = completer;

    try {
      final currentSettings = await _messaging.getNotificationSettings();
      if (currentSettings.authorizationStatus == AuthorizationStatus.notDetermined) {
        final settings = await _messaging.requestPermission(
          alert: true,
          badge: true,
          sound: true,
          announcement: false,
          carPlay: false,
          criticalAlert: false,
          provisional: false,
        );
        if (kDebugMode) {
          // ignore: avoid_print
          print('[PushService] iOS permission: ${settings.authorizationStatus}');
        }
      } else if (kDebugMode) {
        // ignore: avoid_print
        print('[PushService] iOS permission already ${currentSettings.authorizationStatus}');
      }
    } catch (e) {
      if (kDebugMode) {
        // ignore: avoid_print
        print('[PushService] iOS requestPermission error: $e');
      }
    } finally {
      if (!completer.isCompleted) {
        completer.complete();
      }
      _permissionRequest = null;
    }

    await completer.future;
  }

  // ---- public helpers ----

  /// Generic public local notification (wrapper around the private _showLocalNow).
  static Future<void> showLocal({
    required String title,
    required String body,
    String deeplink = '', // default: no navigation on tap
    String? channelId,
  }) async {
    await _showLocalNow(
      title,
      body,
      deeplink,
      channelId: channelId ?? _chDefault.id,
    );
  }

  /// Prebuilt local nudge that deep-links to a specific friend's recurring screen.
  /// app://friend/{friendId}/recurring
  static Future<void> nudgeFriendRecurringLocal({
    required String friendId,
    required String itemTitle,
    DateTime? dueOn,
    String? frequency, // e.g., daily/weekly/monthly/yearly/custom
    String? amount,    // optional "₹1,200"
  }) async {
    final title = 'Reminder: $itemTitle';
    final String when = (dueOn != null) ? _fmtDate(dueOn) : 'soon';
    final freqPart = (frequency != null && frequency.isNotEmpty) ? ' • $frequency' : '';
    final amtPart = (amount != null && amount.isNotEmpty) ? ' • $amount' : '';
    final body = '$itemTitle is due on $when$freqPart$amtPart';

    final deeplink = 'app://friend/$friendId/recurring';
    await _showLocalNow(title, body, deeplink, channelId: _chNudges.id);
  }

  // ---- helpers ----

  static Future<void> _ensureAndroidChannels() async {
    if (!Platform.isAndroid) return;
    final android =
    _fln.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    if (android == null) return;
    try {
      await android.createNotificationChannel(_chDefault);
      await android.createNotificationChannel(_chNudges);
      await android.createNotificationChannel(_chDigests);
      await android.createNotificationChannel(_chCritical);
      if (kDebugMode) {
        // ignore: avoid_print
        print('[PushService] Android channels ensured.');
      }
    } catch (e) {
      if (kDebugMode) {
        // ignore: avoid_print
        print('[PushService] createNotificationChannel error: $e');
      }
    }
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

    if (kDebugMode) {
      // ignore: avoid_print
      print('[PushService] showLocalNow channel=$channelId title="$title" deeplink=$deeplink');
    }

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

    if (kDebugMode) {
      // ignore: avoid_print
      print('[PushService] Saved FCM token for $uid');
    }
  }

  /// Centralized deeplink navigation.
  static void _handleDeeplink(String deeplink) {
    final nav = rootNavigatorKey.currentState;
    if (nav == null) return;

    // Harden: ignore empty/home deeplinks
    if (deeplink.isEmpty) return;
    final uri = Uri.tryParse(deeplink);
    if (uri == null) return;
    final host = uri.host.toLowerCase();
    if (host == 'home' || host.isEmpty) return;

    final firstSeg = uri.pathSegments.isNotEmpty ? uri.pathSegments.first : '';

    if (kDebugMode) {
      // ignore: avoid_print
      print('[PushService] handleDeeplink host=$host seg=$firstSeg full=$deeplink');
    }

    switch (host) {
      case 'tx': // app://tx/today
        nav.pushNamed(
          '/tx-day-details',
          arguments: FirebaseAuth.instance.currentUser?.phoneNumber ??
              FirebaseAuth.instance.currentUser?.uid ??
              '',
        );
        break;

      case 'analytics': // app://analytics/weekly or /monthly
        final sub = firstSeg;
        if (sub == 'weekly') {
          nav.pushNamed('/analytics-weekly');
        } else if (sub == 'monthly') {
          nav.pushNamed('/analytics-monthly');
        } else {
          nav.pushNamed('/analytics');
        }
        break;

      case 'expense': // app://expense/{expenseId}
        if (firstSeg.isNotEmpty) {
          nav.pushNamed('/expense-details', arguments: firstSeg);
        }
        break;

      case 'chat': // app://chat/{threadId}
        if (firstSeg.isNotEmpty) {
          nav.pushNamed('/chat', arguments: firstSeg);
        }
        break;

      case 'friend': // app://friend/{friendId}/recurring
        if (firstSeg.isNotEmpty) {
          nav.pushNamed(
            '/friend-recurring',
            arguments: {
              'friendId': firstSeg,
              if (uri.queryParameters['name'] != null)
                'friendName': uri.queryParameters['name'],
            },
          );
        } else {
          nav.pushNamed('/friends'); // fallback to friends list
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
      // Do nothing on unknown hosts to avoid accidental navigation loops.
        if (kDebugMode) {
          // ignore: avoid_print
          print('[PushService] Unknown deeplink host="$host" – ignoring');
        }
    }
  }

  // ---- small utils ----

  static String _fmtDate(DateTime d) {
    final dd = d.day.toString().padLeft(2, '0');
    final mm = d.month.toString().padLeft(2, '0');
    final yyyy = d.year.toString();
    return '$dd-$mm-$yyyy';
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
