//lib/services/cards/card_statement_parser.dart
import 'package:intl/intl.dart';
import '../enrich/instrument_detector.dart';
import '../../models/card_statement.dart';

class CardStatementParser {
  static final _reDue = RegExp(r'(?:Total\s+Amount\s+Due|Amount\s+Due)\s*[:\-]?\s*(?:INR|₹)?\s*([0-9,]+(?:\.[0-9]{1,2})?)', caseSensitive: false);
  static final _reMin = RegExp(r'(?:Minimum\s+Due|min\.?\s*due)\s*[:\-]?\s*(?:INR|₹)?\s*([0-9,]+(?:\.[0-9]{1,2})?)', caseSensitive: false);
  static final _reDueDate = RegExp(r'(?:Due\s*Date|Payment\s*Due\s*Date)\s*[:\-]?\s*([0-9]{1,2}\s*[A-Za-z]{3,9}\s*[0-9]{2,4})', caseSensitive: false);
  static final _reStmtDate = RegExp(r'(?:Statement\s*Date|Billing\s*Date)\s*[:\-]?\s*([0-9]{1,2}\s*[A-Za-z]{3,9}\s*[0-9]{2,4})', caseSensitive: false);
  static final _rePeriod = RegExp(r'(?:Statement\s*Period|Billing\s*Period)\s*[:\-]?\s*([0-9]{1,2}\s*[A-Za-z]{3,9}\s*[0-9]{2,4})\s*-\s*([0-9]{1,2}\s*[A-Za-z]{3,9}\s*[0-9]{2,4})', caseSensitive: false);
  static final _reLimit = RegExp(r'(?:Credit\s*Limit)\s*[:\-]?\s*(?:INR|₹)?\s*([0-9,]+(?:\.[0-9]{1,2})?)', caseSensitive: false);
  static final _reAvail = RegExp(r'(?:Available\s*Credit)\s*[:\-]?\s*(?:INR|₹)?\s*([0-9,]+(?:\.[0-9]{1,2})?)', caseSensitive: false);
  static final _reIssuer = RegExp(r'\b(HDFC|ICICI|AXIS|SBI|KOTAK|YES|IDFC|AMERICAN\s*EXPRESS|AMEX|BOB|INDUSIND)\b', caseSensitive: false);
  static final _reLast4 = RegExp(r'(?:\*{2,}|\bx{2,}|\bXX)\s*?(\d{3,4})|\b(?:xx|XX)?(\d{4})\b');

  /// Returns a CardStatement if this email is a statement/dues mail; otherwise null.
  static CardStatement? parseIfStatement({
    required String subject,
    required String plainBody,
    String? fromDomain,
  }) {
    final hay = (subject + '\n' + plainBody).replaceAll('\u00a0', ' ');

    final looksStmt = RegExp(r'(statement\s+generated|your\s+credit\s+card\s+statement|bill\s+is\s+ready|payment\s+due)', caseSensitive: false).hasMatch(hay);
    if (!looksStmt) return null;

    final issuer = _reIssuer.firstMatch(hay)?.group(1)?.toUpperCase() ??
        InstrumentDetector.detect(hay, fromDomain: fromDomain).bank ??
        'UNKNOWN';
    final l4 = _reLast4.firstMatch(hay)?.group(1) ?? _reLast4.firstMatch(hay)?.group(2) ?? '9999';

    DateTime? dueDate, stmtDate, pStart, pEnd;
    double? totalDue, minDue, limit, avail;

    String? _firstNum(RegExp r) {
      final m = r.firstMatch(hay);
      if (m == null) return null;
      return m.group(1)?.replaceAll(',', '');
    }

    String? _firstDate(RegExp r) => r.firstMatch(hay)?.group(1);
    String? _two1(RegExp r) => r.firstMatch(hay)?.group(1);
    String? _two2(RegExp r) => r.firstMatch(hay)?.group(2);

    final nf = NumberFormat('###,##0.##');
    final df = (String s) => DateFormat('d MMM yyyy').tryParse(s) ?? DateFormat('dd MMM yyyy').tryParse(s) ?? DateFormat('d MMM yy').tryParse(s);

    final td = _firstNum(_reDue);
    if (td != null) totalDue = double.tryParse(td);
    final md = _firstNum(_reMin);
    if (md != null) minDue = double.tryParse(md);
    final dd = _firstDate(_reDueDate);
    if (dd != null) dueDate = df(dd);
    final sd = _firstDate(_reStmtDate);
    if (sd != null) stmtDate = df(sd);
    final ps = _two1(_rePeriod), pe = _two2(_rePeriod);
    if (ps != null && pe != null) {
      pStart = df(ps);
      pEnd = df(pe);
    }
    final lim = _firstNum(_reLimit);
    if (lim != null) limit = double.tryParse(lim);
    final av = _firstNum(_reAvail);
    if (av != null) avail = double.tryParse(av);

    final when = stmtDate ?? pEnd ?? DateTime.now();
    final id = 'stmt_${issuer}_${l4}_${when.year}${when.month.toString().padLeft(2, '0')}';
    return CardStatement(
      id: id,
      issuer: issuer,
      last4: l4.substring(l4.length - 4),
      statementDate: when,
      periodStart: pStart,
      periodEnd: pEnd,
      dueDate: dueDate,
      totalDue: totalDue,
      minDue: minDue,
      creditLimit: limit,
      availableCredit: avail,
      components: null,
    );
  }
}
