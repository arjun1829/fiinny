import 'package:flutter_test/flutter_test.dart';
import 'package:lifemap/fiinny_brain/enhanced_split_engine.dart';
import 'package:lifemap/models/expense_item.dart';

void main() {
  group('EnhancedSplitEngine', () {
    const userPhone = '+919876543210';
    const friend1Phone = '+919876543211';
    const friend2Phone = '+919876543212';

    // Helper to create expense
    ExpenseItem createExpense({
      required String id,
      required double amount,
      required String payerId,
      required List<String> friendIds,
      String? groupId,
      List<String> settledFriendIds = const [],
      String? category,
      String? instrument,
      DateTime? date,
    }) {
      return ExpenseItem(
        id: id,
        type: 'expense',
        amount: amount,
        note: 'Test expense',
        date: date ?? DateTime.now(),
        payerId: payerId,
        friendIds: friendIds,
        groupId: groupId,
        settledFriendIds: settledFriendIds,
        category: category,
        instrument: instrument,
      );
    }

    test('Returns empty report when no expenses', () {
      final report = EnhancedSplitEngine.analyze([], userPhone);
      
      expect(report.friendDetails, isEmpty);
      expect(report.groupDetails, isEmpty);
      expect(report.totalPendingReceivable, 0);
      expect(report.totalPendingPayable, 0);
    });

    test('Returns empty report when no split expenses', () {
      final expenses = [
        createExpense(
          id: '1',
          amount: 1000,
          payerId: userPhone,
          friendIds: [], // No friends
        ),
      ];
      
      final report = EnhancedSplitEngine.analyze(expenses, userPhone);
      
      expect(report.friendDetails, isEmpty);
    });

    test('Calculates friend balance correctly (user paid)', () {
      final expenses = [
        createExpense(
          id: '1',
          amount: 1000,
          payerId: userPhone,
          friendIds: [friend1Phone],
        ),
      ];
      
      final report = EnhancedSplitEngine.analyze(expenses, userPhone);
      
      expect(report.friendDetails.length, 1);
      final detail = report.friendDetails[friend1Phone]!;
      expect(detail.netBalance, 500); // Friend owes 500
      expect(detail.totalPaidByYou, 500);
      expect(detail.totalPaidByThem, 0);
      expect(detail.unsettledExpenses, 1);
    });

    test('Calculates friend balance correctly (friend paid)', () {
      final expenses = [
        createExpense(
          id: '1',
          amount: 1000,
          payerId: friend1Phone,
          friendIds: [userPhone],
        ),
      ];
      
      final report = EnhancedSplitEngine.analyze(expenses, userPhone);
      
      expect(report.friendDetails.length, 1);
      final detail = report.friendDetails[friend1Phone]!;
      expect(detail.netBalance, -500); // You owe friend 500
      expect(detail.totalPaidByYou, 0);
      expect(detail.totalPaidByThem, 500);
    });

    test('Handles settled expenses correctly', () {
      final expenses = [
        createExpense(
          id: '1',
          amount: 1000,
          payerId: userPhone,
          friendIds: [friend1Phone],
          settledFriendIds: [friend1Phone],
        ),
      ];
      
      final report = EnhancedSplitEngine.analyze(expenses, userPhone);
      
      final detail = report.friendDetails[friend1Phone]!;
      expect(detail.netBalance, 0); // Settled, no balance
      expect(detail.unsettledExpenses, 0);
      expect(detail.totalExpenses, 1);
    });

    test('Tracks multiple friends correctly', () {
      final expenses = [
        createExpense(
          id: '1',
          amount: 1000,
          payerId: userPhone,
          friendIds: [friend1Phone],
        ),
        createExpense(
          id: '2',
          amount: 2000,
          payerId: friend2Phone,
          friendIds: [userPhone],
        ),
      ];
      
      final report = EnhancedSplitEngine.analyze(expenses, userPhone);
      
      expect(report.friendDetails.length, 2);
      expect(report.friendDetails[friend1Phone]!.netBalance, 500); // They owe
      expect(report.friendDetails[friend2Phone]!.netBalance, -1000); // You owe
    });

    test('Calculates total receivable and payable', () {
      final expenses = [
        createExpense(
          id: '1',
          amount: 1000,
          payerId: userPhone,
          friendIds: [friend1Phone],
        ),
        createExpense(
          id: '2',
          amount: 2000,
          payerId: friend2Phone,
          friendIds: [userPhone],
        ),
      ];
      
      final report = EnhancedSplitEngine.analyze(expenses, userPhone);
      
      expect(report.totalPendingReceivable, 500);
      expect(report.totalPendingPayable, 1000);
      expect(report.netPosition, -500); // Net you owe 500
    });

    test('Tracks payment methods', () {
      final expenses = [
        createExpense(
          id: '1',
          amount: 1000,
          payerId: userPhone,
          friendIds: [friend1Phone],
          instrument: 'UPI',
        ),
        createExpense(
          id: '2',
          amount: 500,
          payerId: userPhone,
          friendIds: [friend1Phone],
          instrument: 'Cash',
        ),
      ];
      
      final report = EnhancedSplitEngine.analyze(expenses, userPhone);
      
      final detail = report.friendDetails[friend1Phone]!;
      expect(detail.paymentMethods, containsAll(['UPI', 'Cash']));
    });

    test('Tracks category breakdown', () {
      final expenses = [
        createExpense(
          id: '1',
          amount: 1000,
          payerId: userPhone,
          friendIds: [friend1Phone],
          category: 'Food',
        ),
        createExpense(
          id: '2',
          amount: 500,
          payerId: userPhone,
          friendIds: [friend1Phone],
          category: 'Travel',
        ),
      ];
      
      final report = EnhancedSplitEngine.analyze(expenses, userPhone);
      
      final detail = report.friendDetails[friend1Phone]!;
      expect(detail.categoryBreakdown['Food'], 500);
      expect(detail.categoryBreakdown['Travel'], 250);
    });

    test('Detects "always pays first" behavior', () {
      final expenses = List.generate(10, (i) => createExpense(
        id: '$i',
        amount: 1000,
        payerId: userPhone, // User pays 100% of time
        friendIds: [friend1Phone],
      ));
      
      final report = EnhancedSplitEngine.analyze(expenses, userPhone);
      
      expect(report.behavior.alwaysPaysFirst, true);
      expect(report.behavior.lendsEasily, true);
    });

    test('Identifies delayed payment risk', () {
      final oldDate = DateTime.now().subtract(const Duration(days: 45));
      final expenses = [
        createExpense(
          id: '1',
          amount: 1000,
          payerId: userPhone,
          friendIds: [friend1Phone],
          date: oldDate,
        ),
      ];
      
      final report = EnhancedSplitEngine.analyze(expenses, userPhone);
      
      expect(report.risks.any((r) => r.type == 'DELAYED_PAYMENT'), true);
      final risk = report.risks.firstWhere((r) => r.type == 'DELAYED_PAYMENT');
      expect(risk.friendPhone, friend1Phone);
      expect(risk.days, greaterThan(30));
    });

    test('Identifies high pending amount risk', () {
      final expenses = [
        createExpense(
          id: '1',
          amount: 12000, // 6000 per person
          payerId: userPhone,
          friendIds: [friend1Phone],
        ),
      ];
      
      final report = EnhancedSplitEngine.analyze(expenses, userPhone);
      
      expect(report.risks.any((r) => r.type == 'HIGH_PENDING'), true);
    });

    test('Identifies imbalanced friend risk', () {
      final expenses = List.generate(5, (i) => createExpense(
        id: '$i',
        amount: 1000,
        payerId: userPhone, // User always pays
        friendIds: [friend1Phone],
      ));
      
      final report = EnhancedSplitEngine.analyze(expenses, userPhone);
      
      expect(report.risks.any((r) => r.type == 'IMBALANCED_FRIEND'), true);
    });

    test('Analyzes group expenses', () {
      final expenses = [
        createExpense(
          id: '1',
          amount: 3000,
          payerId: userPhone,
          friendIds: [friend1Phone, friend2Phone],
          groupId: 'group1',
        ),
        createExpense(
          id: '2',
          amount: 1500,
          payerId: friend1Phone,
          friendIds: [userPhone, friend2Phone],
          groupId: 'group1',
        ),
      ];
      
      final report = EnhancedSplitEngine.analyze(
        expenses,
        userPhone,
        groupNames: {'group1': 'Goa Trip'},
      );
      
      expect(report.groupDetails.length, 1);
      final groupDetail = report.groupDetails['group1']!;
      expect(groupDetail.groupName, 'Goa Trip');
      expect(groupDetail.totalExpenses, 2);
      expect(groupDetail.isFullySettled, false);
      expect(groupDetail.totalPending, 4500);
    });

    test('Uses friend names from mapping', () {
      final expenses = [
        createExpense(
          id: '1',
          amount: 1000,
          payerId: userPhone,
          friendIds: [friend1Phone],
        ),
      ];
      
      final report = EnhancedSplitEngine.analyze(
        expenses,
        userPhone,
        friendNames: {friend1Phone: 'Shubham'},
      );
      
      expect(report.friendDetails[friend1Phone]!.friendName, 'Shubham');
    });
  });
}
