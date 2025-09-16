// lib/services/push/push_bootstrap.dart
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

class PushBootstrap {
  /// Ensure base user doc exists (so later we can attach prefs/notif_feed)
  static Future<void> ensureUserRoot() async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) return;
    final ref = FirebaseFirestore.instance.collection('users').doc(uid);
    final snap = await ref.get();
    if (!snap.exists) {
      await ref.set({
        'createdAt': DateTime.now().millisecondsSinceEpoch,
        'appVersion': '1.0.0',
      }, SetOptions(merge: true));
    }
  }
}
