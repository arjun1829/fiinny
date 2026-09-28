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
///
/// This is the only place notification routing is decided — the FCM handlers
/// below and `NotificationsScreen._open` both call it, so a tap behaves the
/// same whether the app was open, backgrounded, or closed.
String? routeForNotification(String? type, Map<String, dynamic> data) {
  String? str(String key) {
    final v = data[key];
    if (v == null) return null;
    final s = v.toString().trim();
    return s.isEmpty ? null : s;
  }

  switch (type) {
    case 'order':
      return '/dashboard/orders';
    // Another seller rejected an order this seller could fulfil. Lands on the
    // Requests tab, same as the web's /dashboard/orders?tab=requests that the
    // WhatsApp alert links to.
    case 'order_offer':
      return '/dashboard/orders?tab=requests';
    case 'order_update':
      final id = str('orderId');
      return id != null ? '/orders/$id' : '/orders';
    case 'assignment':
      final productId = str('productId');
      return productId != null
          ? '/dashboard/inventory?product=${Uri.encodeComponent(productId)}'
          : '/dashboard/inventory';
    case 'network':
      return '/dashboard';

    // A buyer abandoned a checkout for one of this seller's products. The
    // list is the useful landing place — it carries the buyer's number and
    // the follow-up actions. Mirrors web's /dashboard/enquiry, which the
    // WhatsApp alert for the same event links to.
    // Carries the enquiry id so the screen opens with that buyer on top.
    case 'enquiry':
      final id = str('enquiryId');
      return id != null
          ? '/dashboard/enquiry?id=${Uri.encodeComponent(id)}'
          : '/dashboard/enquiry';

    // Seller added or was assigned a product, and low-stock alerts, both open
    // the inventory list scrolled to (and editing) that product.
    case 'inventory_added':
    case 'low_stock':
      final productId = str('productId');
      return productId != null
          ? '/dashboard/inventory?product=${Uri.encodeComponent(productId)}'
          : '/dashboard/inventory';

    // Weekly / monthly / yearly store report.
    case 'analytics_digest':
      final period = str('period') ?? 'week';
      return '/dashboard/analytics?period=${Uri.encodeComponent(period)}';

    // Anything that happened on a specific reel opens that reel.
    case 'reel_like':
    case 'reel_comment':
    case 'reel_comment_tag':
    case 'reel_repost':
      final reelId = str('reelId');
      return reelId != null ? '/reel/$reelId' : '/reels';

    // A new follower is easiest to make sense of in the followers list.
    case 'reel_follow':
      return '/followers';

    // Grouped engagement — the group doc holds the full actor list.
    case 'engagement_group':
      final groupId = str('groupId');
      return groupId != null ? '/activity/$groupId' : '/notifications';

    case 'profile_incomplete':
      final missing = str('missing');
      return missing != null
          ? '/profile/edit?highlight=${Uri.encodeComponent(missing)}'
          : '/profile/edit?highlight=1';

    // Bank details and/or KYC docs still missing — both live on the same
    // screen, so there's nothing to branch on, just open it directly.
    case 'payout_incomplete':
      return '/dashboard/payouts';

    // Open the renewal screen with the existing plan already selected, so the
    // user only has to pay.
    case 'subscription_expiry':
      final params = <String, String>{'reason': 'renewal'};
      final seats = str('seats');
      final months = str('months');
      if (seats != null) params['seats'] = seats;
      if (months != null) params['months'] = months;
      return Uri(path: '/subscription', queryParameters: params).toString();

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

  // A tap that LAUNCHED the app (getInitialMessage) arrives while the splash
  // screen is still up — and splash then calls `context.go('/')`, which
  // replaces the whole stack and silently threw the pushed screen away. That
  // is why tapping a notification with the app closed only ever opened Home.
  // Such a route is parked here until splash has navigated, then pushed.
  static String? _pendingLaunchRoute;
  static bool _launchSettled = false;

  /// Called by the splash screen right after it navigates to the first real
  /// screen. Opens the notification that launched the app, if any.
  static void onLaunchSettled(GoRouter router) {
    _launchSettled = true;
    final route = _pendingLaunchRoute;
    _pendingLaunchRoute = null;
    if (route != null) router.push(route);
  }

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
      if (route != null) {
        if (_launchSettled) {
          router.push(route);
        } else {
          _pendingLaunchRoute = route;
        }
      }
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
