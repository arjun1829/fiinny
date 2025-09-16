// lib/services/push/notif_prefs_service.dart
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

class NotifPrefsService {
  static Future<void> ensureDefaultPrefs() async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) return;

    final ref = FirebaseFirestore.instance
        .doc('users/$uid/prefs/notifications');

    final snap = await ref.get();
    if (!snap.exists) {
      await ref.set({
        'push_enabled': true,
        'frequency': 'smart',
        'channels': {
          'daily_reminder': true,
          'weekly_digest': true,
          'monthly_reflection': true,
          'overspend_alerts': true,
          'partner_checkins': true,
          'settleup_nudges': true,
        },
        'quiet_hours': {
          'start': '22:00',
          'end': '08:00',
          'tz': 'Asia/Kolkata',
        },
        'createdAt': DateTime.now().millisecondsSinceEpoch,
      });
    }
  }
}
