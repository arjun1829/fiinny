import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Records that a logged-in user was active today — the DAU/MAU/retention
/// signal, mirroring the web's `trackUserActivity` in app/firebase.ts.
///
/// This is the ONLY client write in the activity pipeline. It is throttled to
/// at most one write per user per calendar day via SharedPreferences, so a user
/// navigating around the app all day still writes zero extra times. The
/// presence doc ID is the user's stable phone, so a same-day re-write is an
/// idempotent overwrite; the aggregation Cloud Function keys off create-only,
/// so a user is never double-counted.
class ActivityTracker {
  static String _dayKey(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  static Future<void> record({
    required String userId,
    String? role,
    DateTime? registeredAt,
  }) async {
    final id = userId.trim();
    if (id.isEmpty) return;

    final dayKey = _dayKey(DateTime.now());
    final prefs = await SharedPreferences.getInstance();
    final throttleKey = 'kd_active_$id';
    // Cheap client-side throttle — no Firestore read needed to decide.
    if (prefs.getString(throttleKey) == dayKey) return;

    final db = FirebaseFirestore.instance;
    try {
      await db
          .collection('activeUsers')
          .doc(dayKey)
          .collection('presence')
          .doc(id)
          .set({
        'role': role,
        // Registration day drives the retention cohort; carry it on the
        // presence doc so the Cloud Function needs no extra read.
        'registeredDayKey':
            registeredAt != null ? _dayKey(registeredAt) : null,
        'platform': 'mobile',
        'at': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));

      await db.collection('users').doc(id).set(
        {'lastActiveAt': FieldValue.serverTimestamp()},
        SetOptions(merge: true),
      );

      // Only mark done AFTER a successful write, so a transient failure retries
      // on the next app open rather than silently skipping the day.
      await prefs.setString(throttleKey, dayKey);
    } catch (_) {
      // silent — analytics must never break the app
    }
  }
}
