import 'package:cloud_firestore/cloud_firestore.dart';

/// Writes support / contact requests to the same `contactMessages` collection
/// the web admin panel reads from (admin → Contact Messages). The web schema is
/// { name, email, message, phone?, subject?, createdAt }. We add a few extra
/// fields (source, role, uid) purely for traceability — the admin UI ignores
/// unknown keys.
class SupportRepository {
  final _db = FirebaseFirestore.instance;

  Future<void> submitTicket({
    required String name,
    required String email,
    required String message,
    String? phone,
    String? subject,
    String? role,
    String? uid,
  }) async {
    await _db.collection('contactMessages').add({
      'name': name.trim(),
      'email': email.trim(),
      'message': message.trim(),
      if (phone != null && phone.trim().isNotEmpty) 'phone': phone.trim(),
      if (subject != null && subject.trim().isNotEmpty) 'subject': subject.trim(),
      'source': 'mobile_app',
      if (role != null && role.isNotEmpty) 'role': role,
      if (uid != null && uid.isNotEmpty) 'uid': uid,
      'createdAt': FieldValue.serverTimestamp(),
    });
  }
}
