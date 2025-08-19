import 'package:cloud_firestore/cloud_firestore.dart';

class UserService {
  Future<bool> isProfileComplete(String uid) async {
    final doc = await FirebaseFirestore.instance.collection('users').doc(uid).get();
    if (!doc.exists) return false;
    final data = doc.data()!;
    // Customize fields as per your Firestore user doc schema:
    return (data['phone'] != null && data['phone'].toString().isNotEmpty &&
        data['name'] != null && data['name'].toString().isNotEmpty);
  }
}
