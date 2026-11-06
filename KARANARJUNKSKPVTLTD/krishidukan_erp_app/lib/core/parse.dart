import 'package:intl/intl.dart';

/// Firestore docs in this ERP were written by imports, the web forms and
/// manual console edits, so the same field can arrive as a String, an int or
/// a double. Every read in the billing screens goes through these so one odd
/// document can never throw a cast error and blank out a whole list.
String str(dynamic v) {
  if (v == null) return '';
  if (v is String) return v;
  if (v is num) {
    // 9876543210.0 from a spreadsheet import should read as a phone number,
    // not "9876543210.0".
    return v == v.roundToDouble() ? v.toInt().toString() : v.toString();
  }
  return v.toString();
}

double dbl(dynamic v) {
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v.trim()) ?? 0;
  return 0;
}

/// Digits-only phone key — mirrors `phoneKey` in POSPage.tsx /
/// B2BInvoicePage.tsx. Numbers are stored as numbers, with +91, spaces or
/// dashes depending on where the record came from.
String phoneKey(dynamic v) => str(v).replaceAll(RegExp(r'\D'), '');

/// True when two stored phone numbers are the same subscriber (last 10
/// digits), the comparison every web lookup uses.
bool samePhone(dynamic a, dynamic b) {
  final ka = phoneKey(a);
  final kb = phoneKey(b);
  if (ka.isEmpty || kb.isEmpty) return false;
  if (ka == kb) return true;
  String last10(String s) => s.length > 10 ? s.substring(s.length - 10) : s;
  return last10(ka) == last10(kb);
}

/// Mirrors phoneValidator.ts — one or more 10-digit Indian mobiles (6-9
/// lead), separated by comma, space or semicolon.
String? contactNumberError(String raw) {
  final v = raw.trim();
  if (v.isEmpty) return 'Contact number is required';
  final parts = v.split(RegExp(r'[\s,;]+')).where((p) => p.isNotEmpty);
  final re = RegExp(r'^[6-9]\d{9}$');
  String normalize(String p) => p
      .trim()
      .replaceFirst(RegExp(r'^\+?91'), '')
      .replaceFirst(RegExp(r'^0'), '')
      .replaceAll(RegExp(r'\D'), '');
  final bad = parts.where((p) => !re.hasMatch(normalize(p))).toList();
  if (bad.isEmpty) return null;
  return parts.length > 1
      ? 'Enter valid 10-digit mobile numbers (each starting with 6-9)'
      : 'Enter a valid 10-digit mobile number';
}

/// GSTIN shape check — same regex as gstinValidator.ts. Empty is allowed by
/// callers (GSTIN is optional on a buyer).
final _gstinRe =
    RegExp(r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$');
String? gstinError(String raw) {
  final g = raw.trim().toUpperCase();
  if (g.isEmpty) return null;
  if (g.length != 15) return 'GSTIN must be exactly 15 characters';
  if (!_gstinRe.hasMatch(g)) return 'Invalid GSTIN format (e.g. 27AAPFU0939F1ZV)';
  return null;
}

/// YYYY-MM-DD in local time — the `invoiceDate` / `paymentDate` shape the web
/// stores. (The web uses toISOString(), which is UTC; local is what a shop
/// owner means by "today" and is what the date picker shows.)
String isoDay(DateTime d) => DateFormat('yyyy-MM-dd').format(d);

/// Round to paise. Firestore stores doubles; rounding before writing keeps
/// 0.1+0.2 noise out of balances that later get summed thousands of times.
double round2(double v) => (v * 100).roundToDouble() / 100;
