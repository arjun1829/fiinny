import 'package:flutter_test/flutter_test.dart';
import 'package:lifemap/fiinny_brain/transaction_engine.dart';
import 'package:lifemap/models/transaction_model.dart';

void main() {
  group('TransactionEngine', () {
    test('Correctly identifies Salary', () {
      final t = TransactionModel(
        amount: 55000,
        type: 'income',
        category: 'Others',
        date: DateTime.now(),
        note: 'SALARY Credits for Dec',
      );
      final result = TransactionEngine.analyze(t);
      expect(result.isSalary, true);
      expect(result.isIncome, true);
      expect(result.isTransfer, false);
      expect(result.tags, contains('salary'));
    });

    test('Categorizes Zomato as Food', () {
      final t = TransactionModel(
        amount: 500,
        type: 'expense',
        category: 'Others', // Incorrect initial to prove engine works
        date: DateTime.now(),
        note: 'Payment to Zomato',
      );
      final result = TransactionEngine.analyze(t);
      expect(result.category, 'Food');
      expect(result.subcategory, 'food delivery');
      expect(result.isIncome, false);
      expect(result.isTransfer, false);
    });

    test('Correctly identifies Income', () {
      final t = TransactionModel(
        amount: 1000,
        type: 'income',
        category: 'Others',
        date: DateTime.now(),
        note: 'Refund',
      );
      final result = TransactionEngine.analyze(t);
      expect(result.isIncome, true);
      expect(result.isTransfer, false);
      expect(result.tags, contains('income'));
    });

    test('Detects UPI transfer', () {
      final t = TransactionModel(
        amount: 5000,
        type: 'expense',
        category: 'Others',
        date: DateTime.now(),
        note: 'UPI transfer to friend@okaxis',
      );
      final result = TransactionEngine.analyze(t);
      expect(result.isTransfer, true);
      expect(result.isIncome, false);
      expect(result.tags, contains('transfer'));
    });

    test('Detects IMPS transfer', () {
      final t = TransactionModel(
        amount: 10000,
        type: 'expense',
        category: 'Others',
        date: DateTime.now(),
        note: 'IMPS to HDFC account',
      );
      final result = TransactionEngine.analyze(t);
      expect(result.isTransfer, true);
      expect(result.isIncome, false);
    });

    // Edge cases
    test('Handles empty note gracefully', () {
       final t = TransactionModel(
        amount: 100,
        type: 'expense',
        category: 'Others',
        date: DateTime.now(),
        note: '',
      );
      final result = TransactionEngine.analyze(t);
      expect(result.category, 'Others'); // Fallback in CategoryRules
      expect(result.isIncome, false);
      expect(result.isTransfer, false);
    });
  });
}
