import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:go_router/go_router.dart';

// Must be top-level — called by FCM when app is in background/terminated
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // Firebase is pre-initialized in background isolates by FlutterFire
}

/// Converts a notification's `type` + `data` map to a go_router path.
/// Returns null when there is no meaningful deep-link for the type.
String? routeForNotification(String? type, Map<String, dynamic> data) {
  switch (type) {
    case 'order':
      return '/dashboard/orders';
    case 'order_update':
      final id = data['orderId'] as String?;
      return id != null ? '/orders/$id' : '/orders';
    case 'assignment':
      return '/dashboard/inventory';
    case 'network':
      return '/dashboard';
    default:
      return null;
  }
}

class NotificationService {
  static final NotificationService _instance = NotificationService._();
  factory NotificationService() => _instance;
  NotificationService._();

  final _fcm = FirebaseMessaging.instance;
  final _localNotifications = FlutterLocalNotificationsPlugin();

  static const _channelId = 'krishidukaan_main';
  static const _channelName = 'KrishiDukan Updates';

  bool _initialized = false;

  Future<void> initialize(String userPhone, {GoRouter? router}) async {
    if (_initialized) return;
    _initialized = true;

    // Permission request (Android 13+, iOS) — user may deny or block; non-fatal
    try {
      await _fcm.requestPermission(alert: true, badge: true, sound: true);
    } catch (_) {
      return; // Notifications blocked — skip rest of FCM setup
    }

    // Local notifications setup (for showing heads-up in foreground)
    const androidSettings =
        AndroidInitializationSettings('@mipmap/ic_launcher');
    await _localNotifications.initialize(
      settings: const InitializationSettings(android: androidSettings),
      // Foreground local notification tapped while app is open
      onDidReceiveNotificationResponse: (details) {
        if (router == null) return;
        final payload = details.payload;
        if (payload != null && payload.isNotEmpty) router.push(payload);
      },
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

    // Background tap: app was in background, user tapped the system notification
    FirebaseMessaging.onMessageOpenedApp.listen((message) {
      if (router == null) return;
      final route = routeForNotification(
        message.data['type'] as String?,
        message.data,
      );
      if (route != null) router.push(route);
    });

    // Terminated tap: app was closed, tapping the notification launched it
    final initial = await _fcm.getInitialMessage();
    if (initial != null && router != null) {
      final route = routeForNotification(
        initial.data['type'] as String?,
        initial.data,
      );
      if (route != null) router.push(route);
    }

    // Save (and refresh) FCM token in Firestore
    final token = await _fcm.getToken();
    if (token != null) await _saveToken(userPhone, token);
    _fcm.onTokenRefresh.listen((t) => _saveToken(userPhone, t));
  }

  void _showForegroundNotification(RemoteMessage message) {
    final n = message.notification;
    if (n == null) return;

    final route = routeForNotification(
      message.data['type'] as String?,
      message.data,
    );

    _localNotifications.show(
      id: n.hashCode,
      title: n.title,
      body: n.body,
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          _channelId,
          _channelName,
          importance: Importance.high,
          priority: Priority.high,
          icon: '@mipmap/ic_launcher',
        ),
      ),
      // Payload is the route to push when user taps the notification
      payload: route,
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
