import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

class SettingsService {
  static final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  static Future<void> setString(String key, String value) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    await _firestore.collection('users').doc(user.uid).set({
      'settings': {key: value},
    }, SetOptions(merge: true));
  }

  static Future<String?> getString(String key) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return null;

    final snap = await _firestore.collection('users').doc(user.uid).get();
    final settings = snap.data()?['settings'];
    if (settings is Map<String, dynamic>) {
      final value = settings[key];
      if (value is String) return value;
    }
    return null;
  }
}
