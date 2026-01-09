

import 'dart:math' as math;

enum LoanHealthStatus {
  good,     // Below or at market average
  fair,     // Slightly above, but acceptable
  warning,  // Significantly above market
  critical, // Predatory / Emergency levels
}

class PayoffProjection {
  final int monthsRemaining;
  final DateTime? completionDate;
  final double totalInterestRemaining;
  final bool isDebtTrap; // EMI < Interest

  const PayoffProjection({
    required this.monthsRemaining,
    this.completionDate,
    required this.totalInterestRemaining,
    this.isDebtTrap = false,
  });
}

class LoanInsight {
  final LoanHealthStatus status;
  final String title;
  final String message;
  final String? comparisonText;

  const LoanInsight({
    required this.status,
    required this.title,
    required this.message,
    this.comparisonText,
  });
}

class LoanInsightService {
  static final LoanInsightService _instance = LoanInsightService._internal();
  static LoanInsightService get instance => _instance;
  LoanInsightService._internal();

  // Benchmarks for Indian Market (Approx. 2025-26 estimates based on BRD/Conservative)
  static const double _benchHomeLower = 8.3;
  static const double _benchHomeUpper = 9.5;
  
  static const double _benchCarLower = 8.5; 
  static const double _benchCarUpper = 10.5;

  static const double _benchPersonalLower = 10.5;
  static const double _benchPersonalUpper = 16.0;
  
  // Gold loans vary, but usually lower than personal
  static const double _benchGoldLower = 9.0;
  static const double _benchGoldUpper = 12.0;

  /// Analyze a loan based on its type and Annual Interest Rate (%).
  /// [loanType] is expected to be a string like "Home Loan", "Personal Loan", etc.
  LoanInsight assessRate({required double rate, required String loanType}) {
    if (rate <= 0) {
      return const LoanInsight(
        status: LoanHealthStatus.good,
        title: 'Zero Interest',
        message: 'You are not paying any interest on this loan.',
      );
    }

    final type = loanType.trim().toLowerCase();
    
    // 1. Home Loans
    if (type.contains('home') || type.contains('housing') || type.contains('mortgage')) {
      return _judge(
        rate: rate,
        goodUnder: _benchHomeLower,
        fairUnder: _benchHomeUpper,
        marketAvg: '8.5 - 9.0%',
        category: 'Home Loan',
      );
    }

    // 2. Car / Vehicle / Auto
    else if (type.contains('car') || type.contains('vehicle') || type.contains('auto') || type.contains('bike')) {
      return _judge(
        rate: rate,
        goodUnder: _benchCarLower,
        fairUnder: _benchCarUpper,
        marketAvg: '9.0 - 10.5%',
        category: 'Vehicle Loan',
      );
    }
    
    // 3. Gold Loan
    else if (type.contains('gold')) {
      return _judge(
        rate: rate,
        goodUnder: _benchGoldLower,
        fairUnder: _benchGoldUpper,
        marketAvg: '9.0 - 12.0%',
        category: 'Gold Loan',
      );
    }

    // 4. Education (Usually heavily subsidized or near personal)
    else if (type.contains('education') || type.contains('student')) {
       return _judge(
        rate: rate,
        goodUnder: 9.0,
        fairUnder: 11.5,
        marketAvg: '9.0 - 11.0%',
        category: 'Education Loan',
      );
    }

    // 5. Credit Cards (Revolving)
    else if (type.contains('credit card') || type.contains('card')) {
       // Credit cards are almost always 36-42%
       if (rate < 18) {
         return const LoanInsight(
           status: LoanHealthStatus.good,
           title: 'Great Card Rate',
           message: 'This is unusually low for a credit card.',
         );
       }
       if (rate > 35) {
         return const LoanInsight(
           status: LoanHealthStatus.critical,
           title: 'High Revolving Debt',
           message: 'Credit card interest is extremely high. Pay full due immediately.',
           comparisonText: 'Typical cards charge 36-42% APR.',
         );
       }
       return const LoanInsight(
           status: LoanHealthStatus.warning,
           title: 'Expensive Debt',
           message: 'Credit cards are high-interest instruments.',
           comparisonText: 'Typical cards charge 36-42% APR.',
       );
    }

    // 6. Default / Personal Loan
    // Fallback for "Personal", "Consumer", "Unsecured", or unknown types
    return _judge(
      rate: rate,
      goodUnder: _benchPersonalLower,
      fairUnder: _benchPersonalUpper,
      marketAvg: '11.0 - 15.0%',
      category: 'Personal Loan',
    );
  }

  LoanInsight _judge({
    required double rate,
    required double goodUnder,
    required double fairUnder,
    required String marketAvg,
    required String category,
  }) {
    if (rate <= goodUnder) {
      return LoanInsight(
        status: LoanHealthStatus.good,
        title: 'Great Rate',
        message: 'Your rate of $rate% is very competitive for a $category.',
        comparisonText: 'Market Average: $marketAvg',
      );
    } else if (rate <= fairUnder) {
      return LoanInsight(
        status: LoanHealthStatus.fair,
        title: 'Fair Market Rate',
        message: 'Your rate is standard for a $category.',
        comparisonText: 'Market Average: $marketAvg',
      );
    } else if (rate <= fairUnder + 4.0) { // e.g., 20% for personal
      return LoanInsight(
        status: LoanHealthStatus.warning,
        title: 'High Interest',
        message: 'You are paying above the typical range for a $category.',
        comparisonText: 'Market Average: $marketAvg',
      );
    } else {
      return LoanInsight(
        status: LoanHealthStatus.critical,
        title: 'Predatory Rate?',
        message: 'This rate is significantly higher than market standards.',
        comparisonText: 'Market Average: $marketAvg',
      );
    }
  }

  /// Calculates the Debt-Free Date and remaining interest.
  /// Standard Reducing Balance Amortization.
  PayoffProjection calculateDebtFreeDate({
    required double principal,
    required double rateAnnual,
    required double emi,
  }) {
    if (principal <= 0) {
      return PayoffProjection(
        monthsRemaining: 0,
        completionDate: DateTime.now(),
        totalInterestRemaining: 0,
      );
    }

    // Zero interest or Zero EMI edge cases
    if (rateAnnual <= 0) {
       if (emi <= 0) {
          // Never paid off
          return const PayoffProjection(
             monthsRemaining: 999, 
             totalInterestRemaining: 0, 
             isDebtTrap: true
          );
       }
       final months = (principal / emi).ceil();
       final end = DateTime.now().add(Duration(days: months * 30));
       return PayoffProjection(
         monthsRemaining: months,
         completionDate: end,
         totalInterestRemaining: 0,
       );
    }

    if (emi <= 0) {
       return const PayoffProjection(
         monthsRemaining: 999,
         totalInterestRemaining: double.infinity,
         isDebtTrap: true,
       );
    }

    final r = rateAnnual / 12 / 100; // Monthly rate decimal

    // 1. Check for Debt Trap (Interest > EMI)
    final monthlyInterest = principal * r;
    if (monthlyInterest >= emi) {
      return const PayoffProjection(
        monthsRemaining: 999, // Infinite
        totalInterestRemaining: double.infinity,
        isDebtTrap: true,
      );
    }

    // 2. NPER Formula
    // n = -log(1 - (r * P) / E) / log(1 + r)
    final numer = -1 * math.log(1 - (r * principal) / emi);
    final denom = math.log(1 + r);
    final n = numer / denom;
    
    final months = n.ceil();
    final endDate = DateTime.now().add(Duration(days: (months * 30.5).toInt()));

    // 3. Total Interest = (EMI * months) - Principal
    final totalPaid = emi * months;
    final totalInterest = totalPaid - principal;

    return PayoffProjection(
      monthsRemaining: months,
      completionDate: endDate,
      totalInterestRemaining: totalInterest > 0 ? totalInterest : 0,
    );
  }
}
