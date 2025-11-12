// lib/core/notifications/local_notifications.dart
import 'dart:async';
import 'dart:io' show Platform;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

import 'package:cloud_firestore/cloud_firestore.dart';

import '../../details/services/recurring_service.dart';
import '../../details/models/shared_item.dart';
import '../../main.dart' show rootNavigatorKey; // for navigation on tap

/// ─────────────────────────────────────────────────────────────────────────────
/// LocalNotifs: thin wrapper around flutter_local_notifications
/// - Exact while idle if possible, fallback to inexact
/// - No permission UI here (only logs / settings helpers)
/// - Used by ReminderLocalScheduler (legacy friends) and SystemRecurringLocalScheduler (cards/subs/sips/loans)
/// ─────────────────────────────────────────────────────────────────────────────
class LocalNotifs {
  static final FlutterLocalNotificationsPlugin _plugin =
  FlutterLocalNotificationsPlugin();

  static bool _inited = false;

  static const AndroidNotificationChannel _channel = AndroidNotificationChannel(
    'recurring_reminders',
    'Recurring Reminders',
    description: 'Reminders for bills, subscriptions, EMIs, and SIPs',
    importance: Importance.max,
    playSound: true,
    enableVibration: true,
    showBadge: true,
  );

  /// Initialize once. Safe to call repeatedly.
  /// NOTE: Do NOT open any permission/settings UI here.
  static Future<void> init() async {
    if (_inited) return;

    // Timezone DB for zoned scheduling (required for Android exact alarms).
    tzdata.initializeTimeZones();

    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosInit = DarwinInitializationSettings(
      // Permission prompts are managed centrally via PushService.ensurePermissions().
      // Avoid triggering a second dialog from this legacy scheduler bootstrap.
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );
    const init = InitializationSettings(android: androidInit, iOS: iosInit);

    await _plugin.initialize(
      init,
      onDidReceiveNotificationResponse: (resp) {
        final deeplink = resp.payload ?? '';
        debugPrint('[LocalNotifs] tap payload="$deeplink"');
        if (deeplink.isEmpty) return;
        _handleDeeplink(deeplink);
      },
    );

    final androidSpecific = _plugin
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();

    // Ensure channel exists (no-op on iOS).
    await androidSpecific?.createNotificationChannel(_channel);

    if (Platform.isAndroid) {
      try {
        final enabled = await androidSpecific?.areNotificationsEnabled();
        debugPrint('[LocalNotifs] areNotificationsEnabled? $enabled');
      } catch (e) {
        debugPrint('[LocalNotifs] areNotificationsEnabled() error: $e');
      }
    }

    // ⚠️ Do NOT call requestExactAlarmsPermission() here automatically.
    _inited = true;
    debugPrint('[LocalNotifs] init done (tz=${tz.local.name})');
  }

  /// Helper (user-initiated only): may open OEM Alarms & reminders screen.
  static Future<void> requestExactAlarmPermissionIfUserInitiated() async {
    if (!Platform.isAndroid) return;
    final androidSpecific = _plugin
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    try {
      await androidSpecific?.requestExactAlarmsPermission();
    } catch (e) {
      debugPrint('[LocalNotifs] requestExactAlarmsPermission() error: $e');
    }
  }

  /// Optional helper to check notifications enabled (no UI).
  static Future<bool?> areNotificationsEnabled() async {
    if (!Platform.isAndroid) return true;
    final androidSpecific = _plugin
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    try {
      return await androidSpecific?.areNotificationsEnabled();
    } catch (e) {
      debugPrint('[LocalNotifs] areNotificationsEnabled() error: $e');
      return null;
    }
  }

  static void _handleDeeplink(String deeplink) {
    final nav = rootNavigatorKey.currentState;
    if (nav == null) return;

    final uri = Uri.tryParse(deeplink);
    if (uri == null) return;

    final host = uri.host.toLowerCase();
    final first = (uri.pathSegments.isNotEmpty ? uri.pathSegments.first : '').trim();
    final second = (uri.pathSegments.length > 1 ? uri.pathSegments[1] : '').trim().toLowerCase();

    // Legacy route (friend recurring)
    if (host == 'friend' && first.isNotEmpty) {
      nav.pushNamed('/friend-recurring', arguments: {
        'friendId': Uri.decodeComponent(first),
        'section': second,
      });
      return;
    }

    if (host == 'friend-detail' && first.isNotEmpty) {
      nav.pushNamed('/friend-detail', arguments: {
        'friendId': Uri.decodeComponent(first),
        if (uri.queryParameters['name'] != null)
          'friendName': uri.queryParameters['name'],
      });
      return;
    }

    if (host == 'group-detail' && first.isNotEmpty) {
      nav.pushNamed('/group-detail', arguments: {
        'groupId': Uri.decodeComponent(first),
        if (uri.queryParameters['name'] != null)
          'groupName': uri.queryParameters['name'],
      });
      return;
    }

    // New simple hosts
    if (host == 'subs' || host == 'sips') {
      nav.pushNamed('/subs_bills'); // your Subscriptions & Bills screen
      return;
    }
    if (host == 'loans') {
      nav.pushNamed('/loans', arguments: {'userId': uri.queryParameters['uid']});
      return;
    }
    if (host == 'cards') {
      // If you later add a dedicated cards screen, change this route accordingly
      nav.pushNamed('/subs_bills');
      return;
    }

    nav.pushNamed('/'); // fallback
  }

  static int idFrom(String s) => s.hashCode & 0x7fffffff;

  static Future<void> cancelForItem(String itemId) async {
    final id = idFrom(itemId);
    debugPrint('[LocalNotifs] cancel id=$id itemId=$itemId');
    await _plugin.cancel(id);
  }

  static Future<void> cancelAll() => _plugin.cancelAll();

  /// One-shot schedule (zoned). If `fireAt` is near/past, bump 1 minute ahead.
  /// Tries EXACT first (Doze-friendly), falls back to INEXACT.
  static Future<void> scheduleOnce({
    required String itemId,
    required String title,
    required DateTime fireAt, // local device time
    String? body,
    String? payload, // e.g., app://subs or app://friend/{friendId}/recurring
  }) async {
    try {
      await init(); // ensure inited

      DateTime when = fireAt;
      final now = DateTime.now();

      if (when.isBefore(now.add(const Duration(seconds: 5)))) {
        when = now.add(const Duration(minutes: 1));
        debugPrint('[LocalNotifs] fireAt in past; bumping to $when');
      }

      final tzWhen = tz.TZDateTime.from(when, tz.local);
      final notifId = idFrom(itemId);

      final details = NotificationDetails(
        android: AndroidNotificationDetails(
          _channel.id,
          _channel.name,
          channelDescription: _channel.description,
          importance: Importance.max,
          priority: Priority.high,
          visibility: NotificationVisibility.public,
          category: AndroidNotificationCategory.reminder,
          styleInformation: const BigTextStyleInformation(''),
        ),
        iOS: const DarwinNotificationDetails(),
      );

      try {
        await _plugin.zonedSchedule(
          notifId,
          title.isNotEmpty ? title : 'Reminder',
          body,
          tzWhen,
          details,
          androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
          payload: payload ?? itemId,
        );
        debugPrint('[LocalNotifs] scheduled(EXACT) id=$notifId at $tzWhen payload="$payload"');
      } catch (e) {
        debugPrint('[LocalNotifs] exact schedule failed: $e → INEXACT');
        await _plugin.zonedSchedule(
          notifId,
          title.isNotEmpty ? title : 'Reminder',
          body,
          tzWhen,
          details,
          androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
          payload: payload ?? itemId,
        );
        debugPrint('[LocalNotifs] scheduled(INEXACT) id=$notifId at $tzWhen payload="$payload"');
      }
    } catch (e, st) {
      debugPrint('[LocalNotifs] scheduleOnce failed: $e\n$st');
    }
  }

  /// Debug helper
  static Future<void> debugDumpPending() async {
    try {
      final list = await _plugin.pendingNotificationRequests();
      debugPrint('[LocalNotifs] pending=${list.length}');
      for (final n in list) {
        debugPrint('  • id=${n.id} title="${n.title}" body="${n.body}"');
      }
    } catch (e) {
      debugPrint('[LocalNotifs] debugDumpPending error: $e');
    }
  }
}

/// ─────────────────────────────────────────────────────────────────────────────
/// Legacy per-friend scheduler (kept for compatibility)
/// ─────────────────────────────────────────────────────────────────────────────
class ReminderLocalScheduler {
  final RecurringService _svc;
  final String userPhone;
  final String friendId;

  StreamSubscription<List<SharedItem>>? _sub;
  Set<String> _lastIds = <String>{};

  ReminderLocalScheduler({
    required this.userPhone,
    required this.friendId,
  }) : _svc = RecurringService();

  Future<void> bind() async {
    await LocalNotifs.init();

    _sub = _svc.streamByFriend(userPhone, friendId).listen((items) async {
      final now = DateTime.now();
      final currentIds = <String>{};
      for (final it in items) {
        currentIds.add(it.id);
        try {
          if (it.rule.status != 'active') {
            await LocalNotifs.cancelForItem(it.id);
            continue;
          }

          final nextDue = it.nextDueAt;
          if (nextDue == null) {
            await LocalNotifs.cancelForItem(it.id);
            continue;
          }

          final notify = await _svc.getNotifyPrefs(
            userPhone: userPhone,
            friendId: friendId,
            itemId: it.id,
          );

          final enabled = notify?['enabled'] == true;
          if (!enabled) {
            await LocalNotifs.cancelForItem(it.id);
            continue;
          }

          final daysBefore = (notify?['daysBefore'] is num)
              ? (notify?['daysBefore'] as num).toInt()
              : 0;

          final timeStr = (notify?['time'] as String?) ?? '09:00';
          DateTime fireAt = _fireAtFrom(nextDue, daysBefore, timeStr);

          if (fireAt.isBefore(now)) {
            final nextCycle = _svc.computeNextDue(
              it.rule,
              from: nextDue.add(const Duration(days: 1)),
            );
            fireAt = _fireAtFrom(nextCycle, daysBefore, timeStr);
          }

          final title = it.title?.trim().isNotEmpty == true ? it.title!.trim() : 'Reminder';
          final body = 'Due on ${_fmt(nextDue)}';
          final deeplink = 'app://friend/${Uri.encodeComponent(friendId)}/recurring';

          await LocalNotifs.scheduleOnce(
            itemId: it.id,
            title: title,
            fireAt: fireAt,
            body: body,
            payload: deeplink,
          );
        } catch (e, st) {
          debugPrint('[ReminderLocalScheduler] failed for ${it.id}: $e\n$st');
        }
      }

      for (final staleId in _lastIds.difference(currentIds)) {
        try {
          await LocalNotifs.cancelForItem(staleId);
        } catch (_) {}
      }
      _lastIds = currentIds;

      await LocalNotifs.debugDumpPending();
    });
  }

  DateTime _fireAtFrom(DateTime nextDueAt, int daysBefore, String hhmm) {
    final parts = hhmm.split(':');
    final h = int.tryParse(parts.elementAt(0)) ?? 9;
    final m = int.tryParse(parts.elementAt(1)) ?? 0;
    final base = DateTime(nextDueAt.year, nextDueAt.month, nextDueAt.day, h, m);
    return base.subtract(Duration(days: daysBefore));
  }

  String _fmt(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}-${d.month.toString().padLeft(2, '0')}-${d.year}';

  Future<void> unbind() async {
    await _sub?.cancel();
    _sub = null;
  }
}

/// ─────────────────────────────────────────────────────────────────────────────
/// NEW: SystemRecurringLocalScheduler
/// Listens to users/{uid}/subscriptions, sips, loans, cards and
/// schedules local reminders with sensible defaults.
/// ─────────────────────────────────────────────────────────────────────────────
class SystemRecurringLocalScheduler {
  final String userId;

  // Firestore subscriptions
  StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? _subsSub;
  StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? _sipsSub;
  StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? _loansSub;
  StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? _cardsSub;

  // Default reminder times (24h)
  final String defaultTime = '09:00';
  // Default days-before per category
  final int subsDaysBefore;   // e.g. 1 day before
  final int sipsDaysBefore;   // e.g. 0 (same day morning)
  final int loansDaysBefore;  // e.g. 2 days before
  final int cardsDaysBefore;  // e.g. 3 days before

  SystemRecurringLocalScheduler({
    required this.userId,
    this.subsDaysBefore = 1,
    this.sipsDaysBefore = 0,
    this.loansDaysBefore = 2,
    this.cardsDaysBefore = 3,
  });

  Future<void> bind() async {
    await LocalNotifs.init();

    final base = FirebaseFirestore.instance.collection('users').doc(userId);

    // Subscriptions
    _subsSub = base
        .collection('subscriptions')
        .where('active', isEqualTo: true)
        .snapshots()
        .listen((snap) async {
      for (final d in snap.docs) {
        await _scheduleSubscription(d);
      }
    });

    // SIPs
    _sipsSub = base
        .collection('sips')
        .where('active', isEqualTo: true)
        .snapshots()
        .listen((snap) async {
      for (final d in snap.docs) {
        await _scheduleSip(d);
      }
    });

    // Loans/EMIs
    _loansSub = base
        .collection('loans')
        .where('active', isEqualTo: true)
        .snapshots()
        .listen((snap) async {
      for (final d in snap.docs) {
        await _scheduleLoan(d);
      }
    });

    // Credit Cards (card bills)
    _cardsSub = base
        .collection('cards')
        .snapshots()
        .listen((snap) async {
      for (final d in snap.docs) {
        await _scheduleCardBill(d);
      }
    });
  }

  Future<void> unbind() async {
    await _subsSub?.cancel();
    await _sipsSub?.cancel();
    await _loansSub?.cancel();
    await _cardsSub?.cancel();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  DateTime _fireAtFrom(DateTime due, int daysBefore, String hhmm) {
    final parts = hhmm.split(':');
    final h = int.tryParse(parts.elementAt(0)) ?? 9;
    final m = int.tryParse(parts.elementAt(1)) ?? 0;
    var fireAt = DateTime(due.year, due.month, due.day, h, m)
        .subtract(Duration(days: daysBefore));

    // Quiet hours shift: if before 07:00 => 09:00 same day; if after 22:00 => 09:00 next day
    final hour = fireAt.hour;
    if (hour < 7) {
      fireAt = DateTime(fireAt.year, fireAt.month, fireAt.day, 9, 0);
    } else if (hour >= 22) {
      final next = fireAt.add(const Duration(days: 1));
      fireAt = DateTime(next.year, next.month, next.day, 9, 0);
    }
    return fireAt;
  }

  String _fmt(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}-${d.month.toString().padLeft(2, '0')}-${d.year}';

  // Build safe DateTime from Firestore field
  DateTime? _asDate(dynamic v) {
    if (v is Timestamp) return v.toDate();
    if (v is DateTime) return v;
    if (v is int) return DateTime.fromMillisecondsSinceEpoch(v);
    if (v is String) return DateTime.tryParse(v);
    return null;
  }

  // ── Individual schedulers ──────────────────────────────────────────────────

  Future<void> _scheduleSubscription(QueryDocumentSnapshot<Map<String, dynamic>> d) async {
    final data = d.data();
    final brand = (data['brand'] ?? 'SUBSCRIPTION').toString().toUpperCase();
    final nextDue = _asDate(data['nextDue']);
    if (nextDue == null) {
      await LocalNotifs.cancelForItem('sub:${d.id}');
      return;
    }

    final fireAt = _fireAtFrom(nextDue, subsDaysBefore, defaultTime);
    final title = 'Subscription due: $brand';
    final body = 'Due on ${_fmt(nextDue)}';
    final payload = 'app://subs?uid=$userId';

    await LocalNotifs.scheduleOnce(
      itemId: 'sub:${d.id}',
      title: title,
      fireAt: fireAt,
      body: body,
      payload: payload,
    );
  }

  Future<void> _scheduleSip(QueryDocumentSnapshot<Map<String, dynamic>> d) async {
    final data = d.data();
    final brand = (data['brand'] ?? 'SIP').toString().toUpperCase();
    final nextDue = _asDate(data['nextDue']);
    if (nextDue == null) {
      await LocalNotifs.cancelForItem('sip:${d.id}');
      return;
    }

    final fireAt = _fireAtFrom(nextDue, sipsDaysBefore, defaultTime);
    final title = 'SIP due: $brand';
    final body = 'Invest on ${_fmt(nextDue)}';
    final payload = 'app://sips?uid=$userId';

    await LocalNotifs.scheduleOnce(
      itemId: 'sip:${d.id}',
      title: title,
      fireAt: fireAt,
      body: body,
      payload: payload,
    );
  }

  Future<void> _scheduleLoan(QueryDocumentSnapshot<Map<String, dynamic>> d) async {
    final data = d.data();
    final lender = (data['lender'] ?? 'LOAN').toString().toUpperCase();
    final nextDue = _asDate(data['nextDue']);
    if (nextDue == null) {
      await LocalNotifs.cancelForItem('loan:${d.id}');
      return;
    }

    final fireAt = _fireAtFrom(nextDue, loansDaysBefore, defaultTime);
    final title = 'EMI due: $lender';
    final body = 'Due on ${_fmt(nextDue)}';
    final payload = 'app://loans?uid=$userId';

    await LocalNotifs.scheduleOnce(
      itemId: 'loan:${d.id}',
      title: title,
      fireAt: fireAt,
      body: body,
      payload: payload,
    );
  }

  Future<void> _scheduleCardBill(QueryDocumentSnapshot<Map<String, dynamic>> d) async {
    final data = d.data();
    final issuer = (data['issuer'] ?? data['issuerBank'] ?? 'CARD').toString().toUpperCase();
    final last4 = (data['last4'] ?? '').toString();
    final lastBill = (data['lastBill'] is Map) ? Map<String, dynamic>.from(data['lastBill']) : null;
    final dueDate = _asDate(lastBill?['dueDate']);

    if (dueDate == null) {
      await LocalNotifs.cancelForItem('card:${d.id}');
      return;
    }

    final fireAt = _fireAtFrom(dueDate, cardsDaysBefore, defaultTime);
    final cardLabel = last4.isNotEmpty ? '$issuer ••••$last4' : issuer;
    final title = 'Card bill due: $cardLabel';
    final body = 'Due on ${_fmt(dueDate)}';
    final payload = 'app://cards?uid=$userId';

    await LocalNotifs.scheduleOnce(
      itemId: 'card:${d.id}',
      title: title,
      fireAt: fireAt,
      body: body,
      payload: payload,
    );
  }
}
