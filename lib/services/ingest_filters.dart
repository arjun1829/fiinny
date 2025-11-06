// lib/services/ingest_filters.dart

/// Helpers to decide whether an SMS/email snippet looks like a real
/// financial transaction vs. promo/OTP/spam. Backward-compatible:
/// - isLikelyPromo
/// - looksLikeOtpOnly
/// - guessBankFromSms
///
/// New helpers (optional):
/// - hasTxnVerb
/// - extractUpiVpa
/// - guessInstrument
/// - isLikelyBalanceAlert
/// - isStatementOrBillNotice
/// - isLikelyCardBillNotice
/// - isLikelyNewsletter

/// Returns true if the text contains verbs that usually indicate a transaction.
/// This is intentionally broad; downstream parsers should still validate fields.
bool hasTxnVerb(String body) {
  final t = body.toLowerCase();
  return RegExp(
    r'\b('
    r'debit(?:ed)?|credit(?:ed)?|received|rcvd|deposit(?:ed)?|'
    r'spent|purchase|paid|payment|charged|deducted|'
    r'withdrawn|withdrawal|transfer(?:red)?|'
    r'upi|imps|neft|rtgs|pos|atm|refund|reversal|cashback|interest'
    r')\b',
    caseSensitive: false,
  ).hasMatch(t);
}

/// Extract the first UPI VPA if present (e.g. name@okaxis).
String? extractUpiVpa(String body) {
  final m = RegExp(r'\b([a-zA-Z0-9._\-]{2,})@([a-zA-Z]{2,})\b').firstMatch(body);
  return m?.group(0);
}

/// Rough instrument guess from text: "UPI" | "IMPS" | "NEFT" | "RTGS" | "ATM" | "POS" | "Credit Card" | "Debit Card" | "Wallet" | "NetBanking" | null
String? guessInstrument(String body) {
  final t = body.toUpperCase();
  if (RegExp(r'\bUPI\b').hasMatch(t) || t.contains('VPA')) return 'UPI';
  if (RegExp(r'\bIMPS\b').hasMatch(t)) return 'IMPS';
  if (RegExp(r'\bNEFT\b').hasMatch(t)) return 'NEFT';
  if (RegExp(r'\bRTGS\b').hasMatch(t)) return 'RTGS';
  if (RegExp(r'\bATM\b').hasMatch(t)) return 'ATM';
  if (RegExp(r'\bPOS\b').hasMatch(t)) return 'POS';
  if (RegExp(r'\bDEBIT CARD\b|\bDC\b').hasMatch(t)) return 'Debit Card';
  if (RegExp(r'\bCREDIT CARD\b|\bCC\b').hasMatch(t)) return 'Credit Card';
  if (RegExp(r'WALLET|PAYTM WALLET|AMAZON PAY', caseSensitive: false).hasMatch(body)) return 'Wallet';
  if (RegExp(r'NETBANKING|NET BANKING', caseSensitive: false).hasMatch(body)) return 'NetBanking';
  return null;
}

/// Heuristic: generic promo/marketing/no-transaction spam.
bool isLikelyPromo(String body) {
  final lower = body.toLowerCase();

  // Clear promotional/marketing keywords (Indian context).
  const promoKeywords = [
    'sale','offer','discount','deal','subscribe','limited time','flat off','cashback up to',
    'buy now','shop now','coupon','promo code','promo','win','lottery','jackpot',
    'dream11','fantasy league',
    'bookmyshow','bms','event tickets',
    'amazon','flipkart','myntra','ajio','nykaa','meesho',
    'ola select','uber pass','swiggy one','zomato gold',
    'newsletter','utm_','webinar','workshop','apply now','loan up to','complete kyc','kyc pending',
  ];
  for (final kw in promoKeywords) {
    if (lower.contains(kw)) return true;
  }

  // Link present but no transaction verbs → likely promo.
  final hasLink = RegExp(r'https?://|www\.', caseSensitive: false).hasMatch(lower);
  if (hasLink && !hasTxnVerb(lower)) return true;

  // Common newsletter/unsubscribe markers.
  if (lower.contains('unsubscribe') || lower.contains('manage preferences')) return true;

  // Shortcode sender styles ("VK-XXXXXX") are common for both banks and promos;
  // keep this neutral here—parsers should rely on verbs/amounts, not just sender format.

  return false;
}

bool hasAutopayCue(String s) =>
    RegExp(r'(?i)\b(auto[-\s]?debit|autopay|nach|e[-\s]?mandate|mandate|standing\s+instruction|si\b|renew(?:al)?|subscription|plan|membership)\b')
        .hasMatch(s);

bool looksSubscriptionContext(String s) =>
    RegExp(r'(?i)\b(renew|next\s*(?:due|billing)|validity|pack|plan|subscription|membership|premium)\b')
        .hasMatch(s);

/// True if text is OTP-only (no txn verbs around).
bool looksLikeOtpOnly(String body) {
  final lower = body.toLowerCase();
  if (!lower.contains('otp')) return false;

  // If an OTP is present but we ALSO see transaction verbs, do not discard.
  if (hasTxnVerb(lower)) return false;

  // Common OTP formats with no monetary cues.
  final otpOnly = RegExp(
    r'\b(one[-\s]?time\s*password|otp)\b(?![^\.]{0,60}\b(debit|credit|txn|transaction|upi|imps|neft|rtgs|amount|rs|inr|₹)\b)',
    caseSensitive: false,
  ).hasMatch(lower);

  return otpOnly;
}

/// Basic bank guesser — uses sender address first, then body text.
String? guessBankFromSms({String? address, required String body}) {
  final s = ((address ?? '').isNotEmpty ? address! : body).toUpperCase();

  // Handle common sender ID variants (VK-HDFCBK / AX-ICICI / TM-SBICRD / etc.)
  // and body references.
  bool _has(String k) => s.contains(k);

  if (_has('HDFC') || _has('HDFCBK')) return 'HDFC';
  if (_has('ICICI')) return 'ICICI';
  if (_has('SBI') || _has('SBICRD') || _has('SBICARD')) return 'SBI';
  if (_has('AXIS')) return 'AXIS';
  if (_has('KOTAK')) return 'KOTAK';
  if (_has('YES')) return 'YES';
  if (_has('IDFC')) return 'IDFC';
  if (_has('INDUSIND')) return 'INDUSIND';
  if (_has('PNB')) return 'PNB';
  if (_has('BOB') || _has('BANK OF BARODA')) return 'BOB';
  if (_has('FEDERAL')) return 'FEDERAL';
  if (_has('UNION BANK')) return 'UNION';
  if (_has('CANARA')) return 'CANARA';

  // fallback: unknown
  return null;
}

/// Balance alerts (no real transaction just "available/closing balance" info).
bool isLikelyBalanceAlert(String body) {
  final t = body.toLowerCase();
  return RegExp(
    r'\b(passbook|available|closing|current|ledger|eod)\s*balance\b|\bavl\s*bal\b|\bbal(?:ance)?\s*(?:is|:)\b',
    caseSensitive: false,
  ).hasMatch(t) && !hasTxnVerb(t);
}

/// Bank/card "statement ready / bill generated" (generic). Useful to skip in Gmail,
/// while *credit card bill* detection is handled separately.
bool isStatementOrBillNotice(String body) {
  final t = body.toLowerCase();
  return RegExp(
    r'(statement\s*(generated|ready)|e-?statement|bill\s*(generated|ready))',
    caseSensitive: false,
  ).hasMatch(t);
}

/// Credit card bill cue (includes total/min due/due date). Use this to route to
/// card-bill creation instead of skipping as a generic statement.
bool isLikelyCardBillNotice(String body) {
  final t = body.toLowerCase();
  // Requires credit card context + at least one of: total/min due/due date/bill due
  final hasCard = t.contains('credit card') || RegExp(r'\bcc\b').hasMatch(t);
  final hasDueCue = RegExp(
    r'(total\s*(amt|amount)?\s*due|min(?:imum)?\s*(amt|amount)?\s*due|due\s*date|bill\s*due)',
    caseSensitive: false,
  ).hasMatch(t);
  return hasCard && hasDueCue;
}

/// Newsletter promos in email (when you have headers). Pass Gmail's list-id/from.
bool isLikelyNewsletter(String? listId, String? fromHdr) {
  if ((listId ?? '').trim().isNotEmpty) return true;
  final f = (fromHdr ?? '').toLowerCase();
  if (f.contains('no-reply@') || f.contains('newsletter') || f.contains('updates@')) return true;
  return false;
}
