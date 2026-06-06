import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

// Must be top-level — called by FCM when app is in background/terminated
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // Firebase is pre-initialized in background isolates by FlutterFire
}

class NotificationService {
  static final NotificationService _instance = NotificationService._();
  factory NotificationService() => _instance;
  NotificationService._();

  final _fcm = FirebaseMessaging.instance;
  final _localNotifications = FlutterLocalNotificationsPlugin();

  static const _channelId = 'krishidukaan_main';
  static const _channelName = 'KrishiDukaan Updates';

  bool _initialized = false;

  Future<void> initialize(String userPhone) async {
    if (_initialized) return;
    _initialized = true;

    // Permission request (Android 13+, iOS)
    await _fcm.requestPermission(alert: true, badge: true, sound: true);

    // Local notifications setup (for showing heads-up in foreground)
    const androidSettings =
        AndroidInitializationSettings('@mipmap/ic_launcher');
    await _localNotifications.initialize(
      const InitializationSettings(android: androidSettings),
    );

    // Create notification channel (Android 8+)
    const channel = AndroidNotificationChannel(
      _channelId,
      _channelName,
      description: 'Order updates, assignments, and alerts',
      importance: Importance.high,
    );
    await _localNotifications
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(channel);

    // Show heads-up notification when app is in foreground
    FirebaseMessaging.onMessage.listen(_showForegroundNotification);

    // Save (and refresh) FCM token in Firestore
    final token = await _fcm.getToken();
    if (token != null) await _saveToken(userPhone, token);
    _fcm.onTokenRefresh.listen((t) => _saveToken(userPhone, t));
  }

  void _showForegroundNotification(RemoteMessage message) {
    final n = message.notification;
    if (n == null) return;

    _localNotifications.show(
      n.hashCode,
      n.title,
      n.body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          _channelId,
          _channelName,
          importance: Importance.high,
          priority: Priority.high,
          icon: '@mipmap/ic_launcher',
        ),
      ),
    );
  }

  Future<void> _saveToken(String userPhone, String token) async {
    if (userPhone.isEmpty) return;
    try {
      await FirebaseFirestore.instance
          .collection('users')
          .doc(userPhone)
          .update({
        'fcmToken': token,
        'fcmUpdatedAt': FieldValue.serverTimestamp(),
      });
    } catch (_) {
      // Ignore — user doc may not exist yet during signup flow
    }
  }
}
