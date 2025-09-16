import '../../models/parsed_transaction.dart';

class CommonRegex {
  static final _amount = RegExp(r'(?:INR|Rs\.?|₹|\$|USD|EUR|GBP|AED)\s?([\d,]+(?:\.\d{1,2})?)', caseSensitive: false);
  static final _last4 = RegExp(r'(?:ending|xx|XXXX|last\s?digits?|last\s?4)\s?(\d{4})', caseSensitive: false);
  static final _upi = RegExp(r'\b([\w\.\-_]+)@[\w\.\-_]+\b');
  static final _merchantAfter =
  RegExp(r"\b(?:at|to|for)\s+([A-Za-z0-9 &().@'_\-]{2,60})");
  static final _credit = RegExp(r'(credited|received|deposit|refund|cashback|interest\s+credited)', caseSensitive: false);
  static final _debit  = RegExp(r'(debited|spent|purchase|paid|payment|withdrawn|transferred|deducted|ATM)', caseSensitive: false);

  static int? extractAmountPaise(String text) {
    final m = _amount.firstMatch(text);
    if (m == null) return null;
    final n = double.tryParse((m.group(1) ?? '').replaceAll(',', ''));
    return n == null ? null : (n * 100).round();
    // NOTE: we keep paise, your models store double — we’ll convert in mapper.
  }

  static String extractInstrumentHint(String text) {
    final last4 = _last4.firstMatch(text)?.group(1);
    if (last4 != null) return 'CARD:$last4';
    final vpa = _upi.firstMatch(text)?.group(0);
    if (vpa != null) {
      final core = vpa.split('@').first;
      return 'UPI:${core.toLowerCase()}';
    }
    return '';
  }

  static TxChannel detectChannel(String text) {
    final t = text.toLowerCase();
    if (t.contains('upi')) return TxChannel.upi;
    if (t.contains('credit card') || t.contains('debit card') || t.contains('card ')) return TxChannel.card;
    if (t.contains('neft') || t.contains('imps') || t.contains('rtgs')) return TxChannel.bank;
    if (t.contains('wallet') || t.contains('paytm') || t.contains('amazon pay')) return TxChannel.wallet;
    if (t.contains('atm')) return TxChannel.atm;
    return TxChannel.unknown;
  }

  static bool isCredit(String text) => _credit.hasMatch(text);
  static bool isDebit (String text) => _debit.hasMatch(text);

  static String? extractMerchant(String text) => _merchantAfter.firstMatch(text)?.group(1);

  static DateTime? parseDateFromHeader(String hdr) {
    // Let Gmail internalDate be primary; header parse is optional
    return null;
  }

  static String categoryHint(String text) {
    final t = text.toLowerCase();
    if (t.contains('fuel') || t.contains('petrol')) return 'Fuel';
    if (t.contains('zomato') || t.contains('swiggy') || t.contains('restaurant')) return 'Food';
    if (t.contains('irctc') || t.contains('uber') || t.contains('ola') || t.contains('air')) return 'Travel';
    if (t.contains('electricity') || t.contains('bill') || t.contains('dth')) return 'Bills';
    if (t.contains('salary')) return 'Salary';
    if (isCredit(text)) return 'Income';
    return 'Other';
  }

  static double confidenceScore({required bool hasAmount, required bool hasInstrument, required bool hasMerchant, required bool channelKnown}) {
    double s = 0;
    if (hasAmount) s += 0.40;
    if (hasInstrument) s += 0.25;
    if (hasMerchant) s += 0.20;
    if (channelKnown) s += 0.15;
    return s.clamp(0, 1);
  }
}
