import 'package:intl/intl.dart';

final _inr = NumberFormat.decimalPattern('en_IN');

/// Compact Indian-currency form used on KPI tiles — mirrors the web's fmtINR.
String fmtInrCompact(num n) {
  final v = n.abs();
  final sign = n < 0 ? '-' : '';
  if (v >= 10000000) return '$sign₹${_trim(v / 10000000)}Cr';
  if (v >= 100000) return '$sign₹${_trim(v / 100000, 2)}L';
  if (v >= 1000) return '$sign₹${_trim(v / 1000)}K';
  return '$sign₹${_inr.format(v.round())}';
}

String fmtInr(num n) {
  final sign = n < 0 ? '-' : '';
  return '$sign₹${_inr.format(n.abs().round())}';
}

String _trim(num v, [int digits = 1]) =>
    v.toStringAsFixed(digits).replaceAll(RegExp(r'\.?0+$'), '');

String fmtDayMonth(DateTime d) => DateFormat('dd MMM').format(d);

String fmtFullDate(DateTime d) => DateFormat('dd MMM yyyy').format(d);

/// Time-of-day greeting for the Overview header — takes the current hour
/// explicitly so it's trivially testable rather than reaching for
/// DateTime.now() internally.
String greetingFor(int hour) {
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Good night';
}
