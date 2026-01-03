import 'package:flutter_test/flutter_test.dart';
import 'package:lifemap/fiinny_brain/time_engine.dart';
import 'package:lifemap/fiinny_brain/trend_engine.dart';
import 'package:lifemap/fiinny_brain/inference_engine.dart';
import 'package:lifemap/models/expense_item.dart';

void main() {
  group('Advanced Deterministic Engines', () {
    final now = DateTime.now();
    final todayMorning = DateTime(now.year, now.month, now.day, 10, 0); // 10 AM
    final saturday = DateTime(2025, 1, 4, 14, 0); // Jan 4 2025 is Saturday
    final lastMonth = DateTime(now.year, now.month - 1, now.day);
    
    final expenses = [
      ExpenseItem(
        id: '1',
        amount: 500,
        date: todayMorning,
        category: 'Travel',
        title: 'Morning Flight',
        labels: [],
        type: 'EXPENSE',
        note: '',
        payerId: 'self',
      ),
      ExpenseItem(
        id: '2',
        amount: 1500,
        date: saturday,
        category: 'Entertainment',
        title: 'Weekend Movie',
        labels: ['weekend'],
        type: 'EXPENSE',
        note: '',
        payerId: 'self',
      ),
      ExpenseItem(
        id: '3',
        amount: 300,
        date: lastMonth,
        category: 'Food',
        title: 'Old Lunch',
        labels: [],
        type: 'EXPENSE',
        note: '',
        payerId: 'self',
      ),
      ExpenseItem(
        id: '4',
        amount: 5000,
        date: now,
        category: 'Health',
        title: 'Apollo Hospital visit',
        note: 'Travel to clinic',
        labels: [],
        type: 'EXPENSE',
        payerId: 'self',
      ),
      ExpenseItem(
        id: '5',
        amount: 150,
        date: now,
        category: 'Transport',
        title: 'Uber ride',
        labels: [],
        type: 'EXPENSE',
        note: '',
        payerId: 'self',
      ),
    ];

    test('TimeEngine filters weekends correctly', () {
      final weekendExpenses = TimeEngine.filterByDayType(expenses, isWeekend: true);
      expect(weekendExpenses.length, 1);
      expect(weekendExpenses.first.title, 'Weekend Movie');
    });

    test('TimeEngine filters morning correctly', () {
      final morningExpenses = TimeEngine.filterByTimeOfDay(expenses, 'morning');
      // Should catch 'Morning Flight' (10 AM)
      expect(morningExpenses.any((e) => e.title == 'Morning Flight'), isTrue);
    });

    test('TrendEngine calculates growth', () {
      final current = [expenses[0]]; // 500
      final past = [expenses[2]]; // 300
      final growth = TrendEngine.calculateGrowthRate(current, past);
      // (500 - 300) / 300 = 66.6%
      expect(growth, closeTo(66.6, 0.1));
    });

    test('TrendEngine detects trend direction', () {
      expect(TrendEngine.analyzeTrendDirection(66.6), contains('increasing rapidly'));
      expect(TrendEngine.analyzeTrendDirection(-15.0), contains('decreasing significantly'));
    });

    test('InferenceEngine finds hospital travel', () {
      // "Apollo Hospital visit" has "Hospital" (Medical) and "Travel" in note
      // Modify expense 4 to be clearer for test if needed, but 'Travel to clinic' matches 'Travel' keyword map?
      // Wait, 'Travel' map has 'flight', 'uber', etc. "travel" checks category too.
      // And 'clinic' is in medical map.
      
      final results = InferenceEngine.inferComplexIntent(expenses, 'hospital_travel');
      expect(results.length, 1);
      expect(results.first.title, 'Apollo Hospital visit');
    });

    test('InferenceEngine finds implied commute', () {
      // 'Uber ride' should match 'office' context because 'uber' is now in office context list
      final results = InferenceEngine.inferContext(expenses, 'office');
      // Should find 'Uber ride' (Expense 5)
      expect(results.length, 1);
      expect(results.first.title, 'Uber ride');
    });
  });
}
