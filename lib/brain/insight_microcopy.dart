// lib/brain/insight_microcopy.dart
import 'package:intl/intl.dart';

class _INR {
  static final _f = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);
  static String f(num v) => _f.format(v);
}

class InsightMicrocopy {
  static String netWorth({required double assets, required double loans}) {
    final net = assets - loans;
    if (loans > 0 && assets == 0) return "You have ${_INR.f(loans)} in loans. Reduce debt and start building assets.";
    if (assets > 0 && loans == 0) return "Your assets total ${_INR.f(assets)}. Great—keep compounding!";
    if (net < 0) return "Net worth is negative (${_INR.f(net)}). Prioritise EMIs and grow assets.";
    if (net == 0) return "Assets and loans balance out. Aim for a positive net worth.";
    if (net < 50000) return "Net worth: ${_INR.f(net)}. Keep going 💪";
    return "Awesome! Net worth is ${_INR.f(net)} 🚀";
  }

  static String spendVsIncome({required double income, required double expense}) {
    if (income == 0 && expense == 0) return "Add your first transaction to unlock insights 🌱";
    if (expense > income && income > 0) return "This month’s spending exceeds income — consider pausing non-essentials.";
    return "";
  }

  static String savingsRate({required double income, required double savings}) {
    if (income > 0 && (savings / income) > 0.30) {
      return "Great! You saved over 30% of income this month.";
    }
    return "";
  }

  static String goalPace({required String title, required double remaining, required double monthlySavings}) {
    final months = (remaining / (monthlySavings == 0 ? 1 : monthlySavings)).clamp(1, 36).toStringAsFixed(0);
    return "At this pace, you’ll reach '$title' in ~$months months.";
  }

  static String fallback() => "You’re tracking well. Keep logging and reviewing regularly.";
}
