import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/bank_account_model.dart';

class BankAccountService {
  final FirebaseFirestore _db = FirebaseFirestore.instance;

  CollectionReference<Map<String, dynamic>> _accountsCol(String userId) =>
      _db.collection('users').doc(userId).collection('bank_accounts');

  Future<void> saveAccount(String userId, BankAccountModel account) async {
    await _accountsCol(userId)
        .doc(account.id)
        .set(account.toJson(), SetOptions(merge: true));
  }

  Future<List<BankAccountModel>> getAccounts(String userId) async {
    final snap = await _accountsCol(userId).get();
    return snap.docs.map((d) => BankAccountModel.fromJson(d.data())).toList();
  }

  Future<BankAccountModel?> findAccount(
      String userId, String bankName, String last4) async {
    final snap = await _accountsCol(userId).get();
    // Client-side filtering as last4/bank might be fuzzy or we want exact match logic
    // For now, implementing simple exact match
    try {
      final doc = snap.docs.firstWhere((d) {
        final data = d.data();
        return (data['bankName'] as String).toLowerCase() ==
                bankName.toLowerCase() &&
            (data['last4Digits'] as String) == last4;
      });
      return BankAccountModel.fromJson(doc.data());
    } catch (e) {
      return null;
    }
  }

  Future<void> updateBalance(
      String userId, String accountId, double balance) async {
    await _accountsCol(userId).doc(accountId).update({
      'currentBalance': balance,
      'balanceUpdatedAt': DateTime.now().toIso8601String(),
    });
  }
}
