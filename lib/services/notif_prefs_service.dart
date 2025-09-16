import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

class NotifPrefsService {
  static DocumentReference<Map<String, dynamic>> _doc(String uid) =>
      FirebaseFirestore.instance
          .collection('users')
          .doc(uid)
          .collection('prefs')
          .doc('notifications');

  static Map<String, dynamic> defaults() => {
    'push_enabled': true,
    'frequency': 'smart', // reserved; not used yet
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
  };

  /// Call once post-login to ensure the doc exists.
  static Future<void> ensureDefaultPrefs() async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) return;
    final ref = _doc(uid);
    final snap = await ref.get();
    if (!snap.exists) {
      await ref.set(defaults());
    } else {
      // backfill any missing fields without overwriting user choices
      await ref.set(defaults(), SetOptions(merge: true));
    }
  }

  static Stream<DocumentSnapshot<Map<String, dynamic>>> stream() {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) {
      // return a stream that never emits; caller should handle null user
      return const Stream.empty();
    }
    return _doc(uid).snapshots();
  }

  static Future<void> update(Map<String, dynamic> patch) async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) return;
    await _doc(uid).set(patch, SetOptions(merge: true));
  }

  static Future<void> toggleChannel(String key, bool value) =>
      update({'channels.$key': value});

  static Future<void> setPushEnabled(bool value) =>
      update({'push_enabled': value});

  static Future<void> setQuietHours({required String start, required String end}) =>
      update({'quiet_hours.start': start, 'quiet_hours.end': end});
}
