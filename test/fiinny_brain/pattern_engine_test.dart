import 'package:flutter_test/flutter_test.dart';
import 'package:lifemap/fiinny_brain/pattern_engine.dart';
import 'package:lifemap/models/transaction_model.dart';

void main() {
  group('PatternEngine', () {
    test('Detects recurring transactions (>=3)', () {
      final t = TransactionModel(
        amount: 200, type: 'expense', category: 'Ent', date: DateTime.now(), note: 'Netflix',
      );
      final list = [t, t, t]; // 3 times
      final result = PatternEngine.analyze(list, 50000);
      expect(result.subscriptions, contains('NETFLIX')); 
    });

    test('Detects known subscriptions even if < 3', () {
      final t = TransactionModel(
        amount: 200, type: 'expense', category: 'Ent', date: DateTime.now(), note: 'Netflix Subscription',
      );
      final list = [t]; // Only 1
      final result = PatternEngine.analyze(list, 50000);
      expect(result.subscriptions, contains('NETFLIX')); 
    });

    test('Calculates High Spend Category', () {
       final t1 = TransactionModel(
        amount: 16000, type: 'expense', category: 'Travel', date: DateTime.now(), note: 'Uber Rides',
      ); // 16k is 32% of 50k
      final list = [t1];
      final result = PatternEngine.analyze(list, 50000);
      expect(result.highSpendCategories, contains('Travel'));
      expect(result.categorySpendPercentage['Travel'], 32.0);
    });
    
    test('Handles zero income', () {
       final t1 = TransactionModel(
        amount: 100, type: 'expense', category: 'Food', date: DateTime.now(), note: 'Zomato',
      );
      final result = PatternEngine.analyze([t1], 0);
      expect(result.categorySpendPercentage['Food'], 0.0);
      // Shouldn't crash
    });
  });
}
