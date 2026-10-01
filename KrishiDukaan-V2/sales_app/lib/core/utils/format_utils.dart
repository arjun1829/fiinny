import 'package:intl/intl.dart';

class FormatUtils {
  FormatUtils._();

  static final _rupees = NumberFormat.currency(
    locale: 'en_IN',
    symbol: '₹',
    decimalDigits: 0,
  );

  static String money(num amount) => _rupees.format(amount);

  /// "6h 40m" — how a rep reads a working day, rather than "400 minutes".
  static String duration(int? minutes) {
    if (minutes == null || minutes <= 0) return '—';
    final h = minutes ~/ 60;
    final m = minutes % 60;
    if (h == 0) return '${m}m';
    if (m == 0) return '${h}h';
    return '${h}h ${m}m';
  }

  static String distance(double? km) {
    if (km == null) return '—';
    if (km < 1) return '${(km * 1000).round()} m';
    return '${km.toStringAsFixed(1)} km';
  }

  static String plural(int n, String one, [String? many]) =>
      n == 1 ? '$n $one' : '$n ${many ?? '${one}s'}';
}
