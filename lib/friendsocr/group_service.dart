import 'package:cloud_firestore/cloud_firestore.dart';

class GroupService {
  static Future<void> createGroup(
      String userId,
      String groupName,
      List<String> memberIds,
      Map<String, double> initialBalances,
      ) async {
    await FirebaseFirestore.instance
        .collection('users').doc(userId)
        .collection('groups')
        .add({
      'name': groupName,
      'members': memberIds,
      'balances': initialBalances,
      'created_at': FieldValue.serverTimestamp(),
    });
  }
}
