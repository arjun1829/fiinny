import 'package:cloud_firestore/cloud_firestore.dart';

import 'package:lifemap/models/subscription_item.dart';
import 'package:lifemap/services/notification_service.dart';

class SubscriptionNotifier {
  static final SubscriptionNotifier instance = SubscriptionNotifier._();
  SubscriptionNotifier._();

  static const int _alertDaysBefore = 2; // Notify 2 days before

  /// Main entry point: Check all subscriptions for a user and schedule reminders.
  /// Call this on app start.
  Future<void> syncReminders(String userId) async {
    try {
      final snap = await FirebaseFirestore.instance
          .collection('users')
          .doc(userId)
          .collection('subscriptions')
          .where('status', isEqualTo: 'active')
          .get();

      final now = DateTime.now();

      for (var doc in snap.docs) {
        final sub = SubscriptionItem.fromJson(doc.id, doc.data());
        await _scheduleForSubscription(sub, now);
      }
    } catch (e) {
      // debugPrint('[SubscriptionNotifier] Error syncing reminders: $e');
    }
  }

  Future<void> _scheduleForSubscription(
      SubscriptionItem sub, DateTime now) async {
    if (sub.nextDueAt == null) return;

    final due = sub.nextDueAt!;
    if (due.isBefore(now)) return; // Already passed

    final alertTime = due.subtract(const Duration(days: _alertDaysBefore));

    // If alert time is in the past (e.g. due tomorrow, but alert was for yesterday),
    // maybe show immediately if it's NOT paid yet?
    // For now, let's only schedule future alerts to avoid spamming on open.
    if (alertTime.isBefore(now)) {
      // Optional: could check if due < 24h and today < due, maybe alert "Tomorrow"?
      return;
    }

    // Set a generic 9 AM trigger
    final trigger =
        DateTime(alertTime.year, alertTime.month, alertTime.day, 9, 0);

    // Unique ID for this specific due date
    final notifId = '${sub.id}_${due.year}${due.month}${due.day}';

    // Calculate integer ID for LocalNotificationsPlugin (requires int)
    final intId = notifId.hashCode.abs() % 1000000;

    await NotificationService().scheduleAt(
      id: intId,
      title: 'Upcoming: ${sub.title}',
      body:
          'Your subscription of ₹${sub.amount.toInt()} is due on ${_formatDate(due)}. Tap to view.',
      when: trigger,
      payload: '/subscriptions',
    );

    // Also schedule for the CYCLE AFTER this one?
    // Ideally, we'd do that only after this one is paid/renewed.
    // The `SubscriptionScanner` handles updating `nextDueAt` on payment,
    // so subsequent calls to `syncReminders` will pick up the new date.
  }

  String _formatDate(DateTime d) {
    return '${d.day}/${d.month}';
  }
}
