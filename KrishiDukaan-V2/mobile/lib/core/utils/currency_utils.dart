import 'package:intl/intl.dart';

class CurrencyUtils {
  CurrencyUtils._();

  static final _fmt = NumberFormat.currency(
    locale: 'en_IN',
    symbol: '₹',
    decimalDigits: 0,
  );

  static String format(double amount) => _fmt.format(amount);

  static String formatCompact(double amount) {
    if (amount >= 100000) return '₹${(amount / 100000).toStringAsFixed(1)}L';
    if (amount >= 1000) return '₹${(amount / 1000).toStringAsFixed(1)}K';
    return format(amount);
  }

  /// Returns paise (integer) from rupee amount — for Razorpay.
  static int toPaise(double rupees) => (rupees * 100).round();
}
