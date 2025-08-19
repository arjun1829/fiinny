import 'package:cloud_firestore/cloud_firestore.dart';

class TxQuery {
  static CollectionReference<Map<String, dynamic>> base(FirebaseFirestore fs, String userId) =>
      fs.collection('users').doc(userId).collection('transactions');

  static Query<Map<String, dynamic>> byBank(Query<Map<String, dynamic>> q, String bankCode) =>
      q.where('meta.bankCode', isEqualTo: bankCode);

  static Query<Map<String, dynamic>> byCardLast4(Query<Map<String, dynamic>> q, String last4) =>
      q.where('meta.cardLast4', isEqualTo: last4);

  static Query<Map<String, dynamic>> byChannel(Query<Map<String, dynamic>> q, String channel) =>
      q.where('meta.channel', isEqualTo: channel);

  static Query<Map<String, dynamic>> byCategory(Query<Map<String, dynamic>> q, String cat) =>
      q.where('category', isEqualTo: cat);

  static Query<Map<String, dynamic>> byDateRange(Query<Map<String, dynamic>> q, DateTime start, DateTime end) =>
      q.where('date', isGreaterThanOrEqualTo: start).where('date', isLessThan: end);
}
