import 'package:flutter_test/flutter_test.dart';
import 'package:lifemap/fiinny_brain/fiinny_user_snapshot.dart';
import 'package:lifemap/models/asset_model.dart';
import 'package:lifemap/models/bank_account_model.dart';
import 'package:lifemap/models/credit_card_model.dart';
import 'package:lifemap/models/goal_model.dart';
import 'package:lifemap/models/loan_model.dart';

void main() {
  group('Unified Financial Truth (Phase 6)', () {
    test('Net Worth Calculation - Basic', () {
      final snapshot = FiinnyUserSnapshot.generate(
        transactions: [],
        expenses: [],
        goals: [],
        bankAccounts: [
          const BankAccountModel(
              id: 'b1',
              bankName: 'HDFC',
              currentBalance: 50000,
              last4Digits: '1234'),
        ],
        assets: [
          AssetModel(
              id: 'a1',
              userId: 'me',
              title: 'Gold',
              value: 100000,
              assetType: 'Gold'),
        ],
        loans: [
          LoanModel(
            id: 'l1',
            userId: 'me',
            title: 'Car Loan',
            amount: 30000, // Original amount
            outstandingPrincipal: 30000,
            lenderName: 'SBI',
            lenderType: 'Bank',
            startDate: DateTime.now(),
          ),
        ],
        creditCards: [
          const CreditCardModel(
            id: 'c1',
            bankName: 'Amex',
            last4Digits: '8888',
            currentBalance: 20000,
            cardType: 'Credit', // Added
            cardholderName: 'Test User',
            dueDate: DateTime.now(),
            totalDue: 20000,
            minDue: 1000,
          ),
        ],
      );

      // Worth = (50k + 1L) - (30k + 20k) = 150k - 50k = 100k
      expect(snapshot.entityState.netWorth, 100000);
      expect(snapshot.entityState.liquidCash, 50000); // Only bank account
      expect(snapshot.entityState.totalDebt, 50000);
    });

    test('Scenario: Loan funded Cash (Should be 0 Net Worth impact)', () {
      // User takes 50k loan, receives 50k in bank.
      final snapshot = FiinnyUserSnapshot.generate(
        transactions: [],
        expenses: [],
        goals: [],
        bankAccounts: [
          const BankAccountModel(
              id: 'b1',
              bankName: 'HDFC',
              currentBalance: 50000,
              last4Digits: '1234'),
        ],
        loans: [
          LoanModel(
              id: 'l1',
              userId: 'me',
              title: 'Personal Loan',
              amount: 50000,
              outstandingPrincipal: 50000,
              lenderName: 'Bank',
              lenderType: 'Bank',
              startDate: DateTime.now()),
        ],
      );

      // Worth = (50k) - (50k) = 0
      expect(snapshot.entityState.netWorth, 0);
    });

    test('Scenario: Asset financed by Loan (Should be equity only)', () {
      // Buy 50L Home, 40L Loan, 10L Downpayment (paid from prev cash, so cash is gone)
      // Current State: Asset 50L, Loan 40L.
      final snapshot = FiinnyUserSnapshot.generate(
        transactions: [],
        expenses: [],
        goals: [],
        assets: [
          AssetModel(
              id: 'a1',
              userId: 'me',
              title: 'House',
              value: 5000000,
              assetType: 'Real Estate'),
        ],
        loans: [
          LoanModel(
              id: 'l1',
              userId: 'me',
              title: 'Home Loan',
              amount: 4000000,
              outstandingPrincipal: 4000000,
              lenderName: 'HDFC',
              lenderType: 'Bank',
              startDate: DateTime.now()),
        ],
      );

      // Worth = 50L - 40L = 10L (User's Equity)
      expect(snapshot.entityState.netWorth, 1000000);
    });

    test('Safe-to-Spend Calculation', () {
      // 1L in Bank.
      // Goal 1: Save 20k (Saved 10k)
      // Goal 2: Save 50k (Saved 50k - Completed)
      // Total Saved for Goals = 60k.
      // Safe to Spend = 1L - 60k = 40k.

      final snapshot = FiinnyUserSnapshot.generate(
        transactions: [],
        expenses: [],
        bankAccounts: [
          const BankAccountModel(
              id: 'b1',
              bankName: 'HDFC',
              currentBalance: 100000,
              last4Digits: '1234'),
        ],
        goals: [
          GoalModel(
              id: 'g1',
              title: 'Trip',
              targetAmount: 20000,
              savedAmount: 10000,
              targetDate: DateTime.now()),
          GoalModel(
              id: 'g2',
              title: 'Bike',
              targetAmount: 50000,
              savedAmount: 50000,
              targetDate: DateTime.now()),
        ],
      );

      expect(snapshot.entityState.liquidCash, 100000);
      expect(snapshot.entityState.safeToSpend, 40000);
    });
  });
}
