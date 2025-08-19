import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/loan_model.dart';

class LoanService {
  final _collection = FirebaseFirestore.instance.collection('loans');

  Future<List<LoanModel>> getLoans(String userId) async {
    final snap = await _collection.where('userId', isEqualTo: userId).get();
    return snap.docs
        .map((doc) => LoanModel.fromJson(doc.data(), doc.id))
        .toList();
  }

  Future<void> addLoan(LoanModel loan) async {
    final data = loan.toJson();
    data['createdAt'] = DateTime.now().toIso8601String();
    await _collection.add(data);
  }

  Future<double> getTotalLoan(String userId) async {
    final loans = await getLoans(userId);
    double sum = 0.0;
    for (final loan in loans) {
      sum += loan.amount;
    }
    return sum;
  }

  Future<int> getLoanCount(String userId) async {
    final loans = await getLoans(userId);
    return loans.length;
  }

  Future<void> deleteLoan(String loanId) async {
    await _collection.doc(loanId).delete();
  }

  Future<void> saveLoan(LoanModel loan) async {
    await _collection.doc(loan.id).set(loan.toJson());
  }
}
