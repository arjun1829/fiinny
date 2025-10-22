// lib/core/formatters/inr.dart
import 'package:intl/intl.dart';

class INR {
  static final full = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);
  static final compact = NumberFormat.compactCurrency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

  static String f(num v) => full.format(v);
  static String c(num v) => compact.format(v);
}
