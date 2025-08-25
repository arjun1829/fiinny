import 'package:cloud_firestore/cloud_firestore.dart';

class UserService {
  Future<bool> isProfileComplete(String uid) async {
    final doc =
    await FirebaseFirestore.instance.collection('users').doc(uid).get();
    if (!doc.exists) return false;
    final data = doc.data()!;
    return (data['phone'] != null && data['phone'].toString().isNotEmpty &&
        data['name'] != null && data['name'].toString().isNotEmpty);
  }

  /// Resolve a UID to the user's phone number.
  /// Returns null if not found or empty.
  Future<String?> getPhoneForUid(String uid) async {
    try {
      final doc =
      await FirebaseFirestore.instance.collection('users').doc(uid).get();
      if (!doc.exists) return null;
      final data = doc.data();
      final phone = data?['phone']?.toString();
      if (phone == null || phone.isEmpty) return null;
      return phone;
    } catch (_) {
      return null;
    }
  }
}
