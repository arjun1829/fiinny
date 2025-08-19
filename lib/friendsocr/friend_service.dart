import 'package:cloud_firestore/cloud_firestore.dart';

class FriendService {
  static Future<String> findOrCreateByName(String userId, String friendName) async {
    final lowerName = friendName.toLowerCase().trim();
    final query = await FirebaseFirestore.instance
        .collection('users').doc(userId)
        .collection('friends')
        .where('name_lowercase', isEqualTo: lowerName)
        .limit(1)
        .get();

    if (query.docs.isNotEmpty) {
      return query.docs.first.id;
    } else {
      final doc = await FirebaseFirestore.instance
          .collection('users').doc(userId)
          .collection('friends')
          .add({
        'name': friendName,
        'name_lowercase': lowerName,
        'created_at': FieldValue.serverTimestamp(),
      });
      return doc.id;
    }
  }
}
