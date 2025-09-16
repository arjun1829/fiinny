import 'package:cloud_firestore/cloud_firestore.dart';

class CardMetaService {
  final String userId;
  CardMetaService(this.userId);

  CollectionReference<Map<String, dynamic>> get _col =>
      FirebaseFirestore.instance.collection('users').doc(userId).collection('cards_meta');

  Future<void> upsert({
    required String last4,
    double? creditLimitInr,
    double? availableLimitInr,
  }) async {
    await _col.doc(last4).set({
      if (creditLimitInr != null) 'creditLimitInr': creditLimitInr,
      if (availableLimitInr != null) 'availableLimitInr': availableLimitInr,
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  }

  Stream<Map<String, dynamic>?> watch(String last4) =>
      _col.doc(last4).snapshots().map((d)=> d.data());
}
