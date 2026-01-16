import 'package:flutter_test/flutter_test.dart';
import 'package:lifemap/fiinny_brain/behavior_engine.dart';

void main() {
  group('BehaviorEngine', () {
    test('Calculates healthy savings', () {
      final r = BehaviorEngine.analyze(10000, 5000); // 50%
      expect(r.savingsRate, 50.0);
      expect(r.riskFlags, isEmpty);
    });

    test('Flags low savings', () {
      final r = BehaviorEngine.analyze(10000, 9600); // 4% savings
      expect(r.savingsRate, closeTo(4.0, 0.1));
      expect(r.riskFlags, contains(BehaviorEngine.lowSavings));
      expect(r.riskFlags, contains(BehaviorEngine.highSpending));
    });

    test('Flags no income high expense', () {
      final r = BehaviorEngine.analyze(0, 5000);
      expect(r.riskFlags, contains(BehaviorEngine.lowSavings));
      expect(r.riskFlags, contains(BehaviorEngine.highSpending));
      expect(r.savingsRate, -100.0);
    });
  });
}
