import 'dart:math' as math;
import 'gmail_dtos.dart';

enum BankTier { major, other, unknown }

class DetectedBank {
  final String? code;
  final String? display;
  final BankTier tier;
  const DetectedBank({this.code, this.display, this.tier = BankTier.unknown});
}

class BankProfile {
  final String code;
  final String display;
  final List<String> domains;
  final List<String> headerHints;
  const BankProfile({
    required this.code,
    required this.display,
    this.domains = const [],
    this.headerHints = const [],
  });
}

class GmailPureParser {
  static const List<BankProfile> majorBanks = [
    // Public sector
    BankProfile(
      code: 'SBI',
      display: 'State Bank of India',
      domains: ['sbi.co.in'],
      headerHints: ['state bank of india', 'sbi'],
    ),
    BankProfile(
      code: 'PNB',
      display: 'Punjab National Bank',
      domains: ['pnb.co.in'],
      headerHints: ['punjab national bank', 'pnb'],
    ),
    BankProfile(
      code: 'BOB',
      display: 'Bank of Baroda',
      domains: ['bankofbaroda.co.in'],
      headerHints: ['bank of baroda', 'bob'],
    ),
    BankProfile(
      code: 'UNION',
      display: 'Union Bank of India',
      domains: ['unionbankofindia.co.in'],
      headerHints: ['union bank of india', 'union bank'],
    ),
    BankProfile(
      code: 'BOI',
      display: 'Bank of India',
      domains: ['bankofindia.co.in'],
      headerHints: ['bank of india'],
    ),
    BankProfile(
      code: 'CANARA',
      display: 'Canara Bank',
      domains: ['canarabank.com'],
      headerHints: ['canara bank'],
    ),
    BankProfile(
      code: 'INDIAN',
      display: 'Indian Bank',
      domains: ['indianbank.in'],
      headerHints: ['indian bank'],
    ),
    BankProfile(
      code: 'IOB',
      display: 'Indian Overseas Bank',
      domains: ['iob.in'],
      headerHints: ['indian overseas bank', 'iob'],
    ),
    BankProfile(
      code: 'UCO',
      display: 'UCO Bank',
      domains: ['ucobank.com'],
      headerHints: ['uco bank'],
    ),
    BankProfile(
      code: 'MAHARASHTRA',
      display: 'Bank of Maharashtra',
      domains: ['bankofmaharashtra.in', 'mahabank.co.in'],
      headerHints: ['bank of maharashtra'],
    ),
    BankProfile(
      code: 'CBI',
      display: 'Central Bank of India',
      domains: ['centralbankofindia.co.in'],
      headerHints: ['central bank of india'],
    ),
    BankProfile(
      code: 'PSB',
      display: 'Punjab & Sind Bank',
      domains: ['psbindia.com'],
      headerHints: ['punjab and sind bank', 'punjab & sind bank'],
    ),

    // Private sector
    BankProfile(
      code: 'HDFC',
      display: 'HDFC Bank',
      domains: ['hdfcbank.com'],
      headerHints: ['hdfc bank', 'hdfc'],
    ),
    BankProfile(
      code: 'ICICI',
      display: 'ICICI Bank',
      domains: ['icicibank.com'],
      headerHints: ['icici bank', 'icici'],
    ),
    BankProfile(
      code: 'AXIS',
      display: 'Axis Bank',
      domains: ['axisbank.com'],
      headerHints: ['axis bank', 'axis'],
    ),
    BankProfile(
      code: 'KOTAK',
      display: 'Kotak Mahindra Bank',
      domains: ['kotak.com'],
      headerHints: ['kotak mahindra bank', 'kotak'],
    ),
    BankProfile(
      code: 'INDUSIND',
      display: 'IndusInd Bank',
      domains: ['indusind.com'],
      headerHints: ['indusind bank', 'indusind'],
    ),

    BankProfile(
      code: 'YES',
      display: 'Yes Bank',
      domains: ['yesbank.in'],
      headerHints: ['yes bank'],
    ),
    BankProfile(
      code: 'FEDERAL',
      display: 'Federal Bank',
      domains: ['federalbank.co.in'],
      headerHints: ['federal bank'],
    ),
    BankProfile(
      code: 'IDFCFIRST',
      display: 'IDFC First Bank',
      domains: ['idfcfirstbank.com', 'idfcbank.com'],
      headerHints: ['idfc first bank', 'idfc'],
    ),
    BankProfile(
      code: 'IDBI',
      display: 'IDBI Bank',
      domains: ['idbibank.com'],
      headerHints: ['idbi bank', 'idbi'],
    ),
  ];

  static const Set<String> emailWhitelist = {
    'bobfinancial.com',
    'amex.com',
    'mastercard.com',
    'visacards.com',
    'rupay.co.in',
    'razorpay.com',
    'billdesk.com',
    'cashfree.com',
    'paytm.com',
    'phonepe.com',
  };

  static String? getHeader(List<MessageHeaderDto>? headers, String name) {
    if (headers == null) {
      return null;
    }
    final lower = name.toLowerCase();
    for (final h in headers) {
      if (h.name.toLowerCase() == lower) {
        return h.value;
      }
    }
    return null;
  }

  static String? fromDomain(List<MessageHeaderDto>? headers) {
    final from = getHeader(headers, 'from');
    if (from == null) {
      return null;
    }
    final match = RegExp(r'@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})').firstMatch(from);
    return match?.group(1);
  }

  static DetectedBank detectBank({
    required List<MessageHeaderDto>? headers,
    required String body,
  }) {
    final domain = fromDomain(headers);
    final normalizedDomain = domain?.toLowerCase();
    final fromHdr = getHeader(headers, 'from') ?? '';
    final subject = getHeader(headers, 'subject') ?? '';
    final all = '$fromHdr $subject $body'.toLowerCase();

    for (final b in majorBanks) {
      if (normalizedDomain != null &&
          b.domains.any((d) => normalizedDomain.endsWith(d.toLowerCase()))) {
        return DetectedBank(
            code: b.code, display: b.display, tier: BankTier.major);
      }
      if (b.headerHints
          .any((h) => fromHdr.toLowerCase().contains(h.toLowerCase()))) {
        return DetectedBank(
            code: b.code, display: b.display, tier: BankTier.major);
      }
    }

    // Fallback: Check body for strong bank cues if headers failed
    for (final b in majorBanks) {
      if (all.contains(b.display.toLowerCase()) ||
          all.contains(' ${b.code.toLowerCase()} ')) {
        return DetectedBank(
            code: b.code, display: b.display, tier: BankTier.major);
      }
    }

    return const DetectedBank(tier: BankTier.unknown);
  }

  static bool hasCurrencyAmount(String s) => RegExp(
        r'(?:₹|inr|rs\.?)\s*[0-9][\d,]*(?:\s*\.\s*\d{1,2})?',
        caseSensitive: false,
      ).hasMatch(s);

  static bool hasDebitVerb(String s) => RegExp(
        r'\b(debited|amount\s*debited|spent|paid|payment|purchase|charged|withdrawn|withdrawal|pos|upi|imps|neft|rtgs|txn|transaction|autopay|mandate|emi)\b',
        caseSensitive: false,
      ).hasMatch(s);

  static bool hasCreditVerb(String s) => RegExp(
        r'\b(credited|amount\s*credited|received|rcvd|deposit(?:ed)?|salary|refund|reversal|cashback|interest)\b',
        caseSensitive: false,
      ).hasMatch(s);

  static bool hasRefToken(String s) => RegExp(
        r'\b(utr|ref(?:erence)?|order|invoice|a/?c|acct|account|card|vpa|pos|txn)\b',
        caseSensitive: false,
      ).hasMatch(s);

  static bool looksFutureCredit(String s) => RegExp(
        r'\b(can|will|may)\s+be\s+credited\b',
        caseSensitive: false,
      ).hasMatch(s);

  static bool isLikelyPromo(String s) => RegExp(
        r'\b(loan\s+up\s+to|pre[-\s]?approved|apply\s+now|kyc|complete\s+kyc|offer|subscribe|webinar|workshop|newsletter|utm_|unsubscribe|http[s]?://)\b',
        caseSensitive: false,
      ).hasMatch(s);

  static bool passesTxnGate(String text, {String? domain, DetectedBank? bank}) {
    final t = text;
    final hasCurrency = hasCurrencyAmount(t);
    final hasDebitOrCreditVerb = hasDebitVerb(t) || hasCreditVerb(t);
    final hasRefOrCue = hasRefToken(t) ||
        RegExp(
          r'(account\s*(no|number)|txn\s*id|transaction\s*info)',
          caseSensitive: false,
        ).hasMatch(t);

    // obvious promo/future cues
    final promo = isLikelyPromo(t);
    final futureish = looksFutureCredit(t);

    final isGatewayDomain = domain != null &&
        emailWhitelist.any((d) => domain.toLowerCase().endsWith(d));
    final isMajorBank = bank?.tier == BankTier.major;

    if (!hasCurrency || !hasDebitOrCreditVerb) {
      return false;
    }
    if (futureish) {
      return false;
    }

    // For major banks and known gateways:
    // - allow slightly looser conditions, but still block pure promos.
    if (isMajorBank || isGatewayDomain) {
      if (promo && !hasRefOrCue) return false;
      // Currency + verb is enough, ref is a nice-to-have
      return true;
    }

    // For all other/unknown senders:
    // - require ref/txn/account cue and non-promo.
    if (!hasRefOrCue) {
      return false;
    }
    if (promo && !hasRefOrCue) {
      return false;
    }

    return true;
  }

  static String maskSensitive(String s) {
    var t = s;
    // 1. Mask long digit runs (cards/accounts 8-20 length), keep last4
    t = t.replaceAllMapped(
      RegExp(r'\b(?<![₹\.])(\d{4})\d{4,12}(\d{4})\b'),
      (m) => '****${m.group(2)}',
    );

    // 2. Strict OTP/password redaction
    t = t.replaceAll(
        RegExp(r'\b(OTP|ONE[-\s]?TIME\s*PASSWORD)\b.*', caseSensitive: false),
        '[REDACTED OTP]');

    // 3. Email redaction
    t = t.replaceAll(
      RegExp(r'\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b'),
      '[EMAIL]',
    );

    // 4. Phone number redaction
    t = t.replaceAll(
      RegExp(r'(?<!\d)(?:(?:\+91)|(?:91)|0)?\s?[6-9]\d{4}\s?\d{5}(?!\d)'),
      '[PHONE]',
    );

    return t;
  }

  static String? cleanMerchantName(String? raw) {
    if (raw == null) {
      return null;
    }
    var cleaned = raw
        .replaceAll(RegExp(r"""["'`]+"""), ' ')
        .replaceAll(RegExp(r'[^A-Za-z0-9 .&/@-]'), ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();

    // aggressive noise cleaning
    cleaned = cleaned.replaceAll(
        RegExp(
            r'\b(Value Date|Txn Date|Ref No|Reference|Bal|Avl Bal|Ledger|Balance|NEFT|IMPS|RTGS|UPI|MMT/IMPS|Rev|Msg)\b.*',
            caseSensitive: false),
        '');
    cleaned =
        cleaned.replaceAll(RegExp(r'\d{2}/\d{2}/\d{2,4}'), ''); // Remove dates
    cleaned =
        cleaned.replaceAll(RegExp(r'\d{2}:\d{2}:\d{2}'), ''); // Remove times
    cleaned = cleaned.trim();

    if (cleaned.length < 3) {
      return null;
    }
    final upper = cleaned.toUpperCase();
    const skipPhrases = [
      'INFORM YOU THAT',
      'INFORM YOU',
      'INFORM THAT',
      'DEAR',
      'THANK YOU',
      'THANKS',
      'THIS IS TO INFORM',
      'WE INFORM YOU',
      'WE WOULD LIKE TO INFORM',
      'TRANSACTION ALERT',
      'ALERT:',
      'TOTAL CREDIT LIMIT',
      'AVAILABLE LIMIT',
      'CREDIT LIMIT',
      'TOTAL DUE',
      'MINIMUM DUE',
      'TAL CREDIT LIMIT',
      'BLOCK UPI',
      'SMS BLOCK',
      'CALL US',
      'CLICK HERE',
      'UNSUBSCRIBE',
      'TO BLOCK',
      'TO CANCEL',
      'HELP YOU',
      'ALWAYS OPEN TO HELP YOU',
    ];
    for (final phrase in skipPhrases) {
      if (upper.contains(phrase)) {
        return null;
      }
    }

    const stopwords = {
      'INFORM',
      'YOU',
      'YOUR',
      'THAT',
      'ACCOUNT',
      'ACC',
      'A',
      'THE',
      'WE',
      'ARE',
      'IS',
      'TO',
      'FROM',
      'PAYMENT',
      'PAID',
      'THANK',
      'CUSTOMER',
      'CARD',
      'CREDIT',
      'DEBIT',
      'BANK',
      'REF',
      'REFERENCE',
      'TRANSACTION',
      'DETAILS',
      'INFO',
      'NOTICE',
      'BALANCE',
      'AMOUNT',
      'THIS',
      'MESSAGE',
      'SPENT',
      'PURCHASE',
      'AT',
      'FOR',
      'WITH',
      'ERRORS',
      'OMISSIONS',
      'LIABILITY',
      'STRICT',
      'SECURITY',
      'STANDARDS',
      'MAINTAIN'
    };
    final tokens =
        upper.split(RegExp(r'[^A-Z0-9]+')).where((e) => e.isNotEmpty).toList();
    if (tokens.isEmpty) {
      return null;
    }
    final nonStop = tokens.where((w) => !stopwords.contains(w)).length;
    if (nonStop == 0) return null;

    if (upper.contains('ACCOUNT') || upper.contains('ACC.')) return null;
    return upper.trim();
  }

  static String? extractPaidToName(String text) {
    if (text.isEmpty) {
      return null;
    }
    final candidates = <String>[];

    // TYPE A: POS / Swipe / Explicit Purchase
    final posPatterns = [
      RegExp(
          r'\b(?:spent|purchase|transact(?:ion|ed)?|swiped)\s+(?:at|on|with)\s+([A-Za-z0-9][A-Za-z0-9 .&/@-]{2,40})',
          caseSensitive: false),
      RegExp(
          r'\b(?:payment|txn)\s+(?:at|to)\s+([A-Za-z0-9][A-Za-z0-9 .&/@-]{2,40})',
          caseSensitive: false),
    ];
    for (final p in posPatterns) {
      for (final m in p.allMatches(text)) {
        final cleaned = cleanMerchantName(m.group(1));
        if (cleaned != null) candidates.add(cleaned);
      }
    }

    // TYPE B: Online / Digital / P2P
    final onlinePatterns = [
      RegExp(
          r'\b(?:paid|sent|transfer(?:red)?)\s+(?:to|for)\s+(?!ANY\s+ERRORS)([A-Za-z0-9][A-Za-z0-9 .&/@-]{2,40})',
          caseSensitive: false),
      RegExp(r'\b(?:towards|for)\s+([A-Za-z0-9][A-Za-z0-9 .&/@-]{2,40})',
          caseSensitive: false),
    ];
    for (final p in onlinePatterns) {
      for (final m in p.allMatches(text)) {
        final raw = m.group(1) ?? '';
        if (raw.toLowerCase().contains('loan') ||
            raw.toLowerCase().contains('emi')) {
          continue;
        }
        if (raw.trim().toUpperCase().startsWith('ANY ERRORS')) continue;
        final cleaned = cleanMerchantName(raw);
        if (cleaned != null) candidates.add(cleaned);
      }
    }

    // TYPE C: Bills / Utilities / Recharges
    final billPatterns = [
      RegExp(r'\b(?:bill|payment)\s+for\s+([A-Za-z0-9][A-Za-z0-9 .&/@-]{2,40})',
          caseSensitive: false),
      RegExp(
          r'\b(?:recharge|topup)\s+(?:of|for)\s+([A-Za-z0-9][A-Za-z0-9 .&/@-]{2,40})',
          caseSensitive: false),
    ];
    for (final p in billPatterns) {
      for (final m in p.allMatches(text)) {
        final cleaned = cleanMerchantName(m.group(1));
        if (cleaned != null) candidates.add(cleaned);
      }
    }

    // TYPE D: Credits / Income (Strict)
    final creditPatterns = [
      RegExp(
          r'\b(?:received|credited)\s+(?:from|by)\s+([A-Za-z0-9][A-Za-z0-9 .&/@-]{2,40})',
          caseSensitive: false),
      RegExp(r'\bby\s+([A-Za-z0-9][A-Za-z0-9 .&/@-]{2,40})',
          caseSensitive: false),
    ];
    for (final p in creditPatterns) {
      for (final m in p.allMatches(text)) {
        final cleaned = cleanMerchantName(m.group(1));
        if (cleaned != null) candidates.add(cleaned);
      }
    }

    // TYPE E: Special Formats (UPI, Info tags, KV Pairs)
    final metaPatterns = [
      RegExp(r'Merchant\s*Name\s*[:\-]\s*([A-Za-z0-9][A-Za-z0-9 .&/@-]{2,40})',
          caseSensitive: false),
      RegExp(r'credited\s+to\s+(?:your\s+)?(Loan\s+account)',
          caseSensitive: false),
      RegExp(r'\bInfo:\s*([A-Za-z0-9][A-Za-z0-9 .&/@-]{2,40})',
          caseSensitive: false),
      RegExp(r'\bUPI\/P2[AM]\/[^\/\s]+\/([^\/\n\r]+)', caseSensitive: false),
    ];
    for (final p in metaPatterns) {
      for (final m in p.allMatches(text)) {
        final cleaned = cleanMerchantName(m.group(1));
        if (cleaned != null) candidates.insert(0, cleaned);
      }
    }

    // FALLBACK: Safe "At" check
    if (candidates.isEmpty) {
      final fallback = RegExp(r'\bat\s+([A-Za-z0-9][A-Za-z0-9 .&/@-]{2,40})',
          caseSensitive: false);
      for (final m in fallback.allMatches(text)) {
        final raw = m.group(1) ?? '';
        if (RegExp(
                r'^(the|my|your|ends|ending|ac|account|txn|ref|rs|inr|usd|home|office)',
                caseSensitive: false)
            .hasMatch(raw)) {
          continue;
        }
        final cleaned = cleanMerchantName(raw);
        if (cleaned != null) candidates.add(cleaned);
      }
    }

    return candidates.isNotEmpty ? candidates.first : null;
  }

  static Map<String, dynamic>? extractCardBillInfo(String text) {
    // simplified return type for purity
    final t = text.toUpperCase();
    if (!(t.contains('CREDIT CARD') || t.contains('CC'))) {
      return null;
    }

    final hasCue = RegExp(
            r'(TOTAL\s*(AMT|AMOUNT)?\s*DUE|MIN(IM)?UM\s*(AMT|AMOUNT)?\s*DUE|DUE\s*DATE|BILL\s*DUE|STATEMENT)',
            caseSensitive: false)
        .hasMatch(text);
    if (!hasCue) {
      return null;
    }

    double? amtAfter(List<RegExp> rxs) {
      for (final rx in rxs) {
        final a = RegExp(
                rx.pattern +
                    r''':?\s*(?:₹|\bINR\b|(?<![A-Z])Rs\.?|\bRs\b)?\s*([0-9][\d,]*(?:\s*\.\s*\d{1,2})?)''',
                caseSensitive: false)
            .firstMatch(text);
        if (a != null) {
          final numStr = (a.group(1) ?? '')
              .replaceAll(',', '')
              .replaceAll(RegExp(r'\s+'), '');
          return double.tryParse(numStr);
        }
      }
      return null;
    }

    // We cannot use DateTime.parse helpers if they depend on other files, so implementing basic date parse here or skipping date for now?
    // Wait, the original code used `_parseLooseDate`. I probably need to copy that helper too or simplify.
    // To keep it simple and pure, I'll return raw strings for dates if needed or reimplement a simple parser.
    // For now, let's omit the date parsing complexity if not strictly needed or copy the loose parser.

    // NOTE: This function is complex. For immediate optimization, I will focus on the heaviest parts: RegEx matching.

    final totalDue = amtAfter([
      RegExp(r'(?:TOTAL|BILL)\s*(?:AMT|AMOUNT)?\s*DUE'),
      RegExp(r'AMOUNT\s*PAYABLE'),
    ]);

    final minDue = amtAfter([
      RegExp(r'MIN(?:IMUM)?\s*(?:AMT|AMOUNT)?\s*DUE'),
    ]);

    DateTime? dueDate =
        amtAfter([RegExp(r'DUE\s*DATE'), RegExp(r'PAY\s*BY')]) != null
            ? null
            : null; // Logic below needs to return DateTime not double

    DateTime? parseDateAfter(List<RegExp> rxs) {
      for (final rx in rxs) {
        final m = RegExp(
                rx.pattern +
                    r'''[:\s-]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{1,2}\s*[A-Za-z]{3}\s*\d{2,4})''',
                caseSensitive: false)
            .firstMatch(text);
        if (m != null) {
          return parseLooseDate(m.group(1) ?? '');
        }
      }
      return null;
    }

    dueDate = parseDateAfter([RegExp(r'DUE\s*DATE'), RegExp(r'PAY\s*BY')]);

    // Statement Period Extraction
    DateTime? stmtStart;
    DateTime? stmtEnd;

    // Pattern: "Statement Period: 12/01/2023 to 11/02/2023" or "Billing Cycle: ..."
    final periodRx = RegExp(
        r'(?:Statement\s*Period|Billing\s*Cycle)\s*[:\-]?\s*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{1,2}\s*[A-Za-z]{3}\s*\d{2,4})\s*(?:to|-)\s*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{1,2}\s*[A-Za-z]{3}\s*\d{2,4})',
        caseSensitive: false);
    final pMatch = periodRx.firstMatch(text);
    if (pMatch != null) {
      stmtStart = parseLooseDate(pMatch.group(1) ?? '');
      stmtEnd = parseLooseDate(pMatch.group(2) ?? '');
    }

    if (totalDue == null && minDue == null) {
      return null;
    }

    return {
      'totalDue': totalDue,
      'minDue': minDue,
      'dueDate': dueDate?.toIso8601String(),
      'statementStart': stmtStart?.toIso8601String(),
      'statementEnd': stmtEnd?.toIso8601String(),
    };
  }

  static DateTime? parseLooseDate(String s) {
    try {
      final a = s.trim();
      final bySlash = RegExp(r'^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$').hasMatch(a);
      if (bySlash) {
        final parts = a.contains('/') ? a.split('/') : a.split('-');
        final d = int.parse(parts[0]);
        final m = int.parse(parts[1]);
        final y = (parts[2].length == 2)
            ? (2000 + int.parse(parts[2]))
            : int.parse(parts[2]);
        return DateTime(y, m, d);
      }
      final byText = RegExp(r'^\d{1,2}\s*[A-Za-z]{3}\s*\d{2,4}$').hasMatch(a);
      if (byText) {
        final m = RegExp(r'[A-Za-z]{3}').firstMatch(a)!.group(0)!.toLowerCase();
        const months = {
          'jan': 1,
          'feb': 2,
          'mar': 3,
          'apr': 4,
          'may': 5,
          'jun': 6,
          'jul': 7,
          'aug': 8,
          'sep': 9,
          'oct': 10,
          'nov': 11,
          'dec': 12
        };
        final d = int.parse(RegExp(r'^\d{1,2}').firstMatch(a)!.group(0)!);
        final yMatch = RegExp(r'\d{2,4}$').firstMatch(a);
        final y = (yMatch != null && yMatch.group(0)!.length == 2)
            ? 2000 + int.parse(yMatch.group(0)!)
            : int.parse(yMatch?.group(0) ?? DateTime.now().year.toString());
        return DateTime(y, months[m]!, d);
      }
      return DateTime.tryParse(a);
    } catch (_) {
      return null;
    }
  }

  // ─── ADDED EXTRACTION METHODS (Ported from GmailService) ───

  static String? extractAccountLast4(String text) {
    final patterns = <RegExp>[
      RegExp(
          r'(?:A\s*/?C(?:COUNT)?|ACCOUNT|ACC(?:OUNT)?)\s*(?:NO\.?|NUMBER|NUM|#|:)?\s*([Xx*\d\s]{4,})',
          caseSensitive: false),
      RegExp(
          r'\bAccount\s*(?:ending|ending\s*in|ending\s*with)?\s*[:=]?\s*([Xx*\d\s]{4,})',
          caseSensitive: false),
    ];
    for (final pattern in patterns) {
      for (final match in pattern.allMatches(text)) {
        final raw = match.group(1);
        if (raw == null) {
          continue;
        }
        final digits = raw.replaceAll(RegExp(r'[^0-9]'), '');
        if (digits.length >= 4) {
          return digits.substring(digits.length - 4);
        }
      }
    }
    return null;
  }

  static bool hasStrongCardCue(String text) {
    final t = text.toUpperCase();
    return RegExp(
            r'(CREDIT\s+CARD|DEBIT\s+CARD|CARD\s*ENDING|CARD\s*NUMBER|CARD\s*NO\b|CARD\s*PAYMENT|CARD\s*PURCHASE|CARD\s*SWIPE|VISA|MASTERCARD|RUPAY|AMEX|DINERS|ATM|POS)',
            caseSensitive: false)
        .hasMatch(t);
  }

  static String? extractCardLast4(String text) {
    if (!hasStrongCardCue(text)) {
      return null;
    }
    final re = RegExp(
        r'(?:ending(?:\s*in)?|xx+|x{2,}|XXXX|XX|last\s*digits|last\s*4|card\s*no\.?)\s*[-:]?\s*([0-9]{4})',
        caseSensitive: false);
    return re.firstMatch(text)?.group(1);
  }

  static double? extractTxnAmount(String text, {String? direction}) {
    if (text.isEmpty) {
      return null;
    }

    final strongPatterns = <RegExp>[
      RegExp(
          r'(?:Grand\s*Total|Total\s*Paid|Amount\s*Paid|Total\s*Amount|Net\s*Amount|Final\s*Amount)[^0-9\n]{0,30}(?:₹|INR|Rs\.?)\s*([0-9][\d,]*(?:\s*\.\s*\d{1,2})?)',
          caseSensitive: false),
    ];

    for (final rx in strongPatterns) {
      final m = rx.firstMatch(text);
      if (m != null) {
        final numStr = (m.group(1) ?? '')
            .replaceAll(',', '')
            .replaceAll(RegExp(r'\s+'), '');
        final val = double.tryParse(numStr);
        if (val != null && val > 0) return val;
      }
    }

    final amountPatterns = <RegExp>[
      RegExp(
          r'(?:₹|\bINR\b|(?<![A-Z])Rs\.?|\bRs\b)\s*([0-9][\d,]*(?:\s*\.\s*\d{1,2})?)',
          caseSensitive: false),
      RegExp(r'\bamount\s+of\s+([0-9][\d,]*(?:\s*\.\s*\d{1,2})?)',
          caseSensitive: false),
    ];
    final balanceCue = RegExp(
        r'(A/?c\.?\s*Bal|Ac\s*Bal|AVL\s*Bal|Avail(?:able)?\s*Bal(?:ance)?|Closing\s*Balance|Current\s*Balance|Ledger\s*Balance|Passbook\s*Balance|\bBal(?:ance)?\b)',
        caseSensitive: false);
    final creditCues = RegExp(
        r'(has\s*been\s*credited|credited\s*(?:by|with)?|received|rcvd|deposit(?:ed)?|salary|refund|reversal)',
        caseSensitive: false);
    final debitCues = RegExp(
        r'(has\s*been\s*debited|debited|spent|paid|payment|withdrawn|withdrawal|pos|upi|imps|neft|rtgs|purchase|txn|transaction)',
        caseSensitive: false);

    Iterable<RegExpMatch> cueMatches;
    final dir = direction?.toLowerCase();
    if (dir == 'credit') {
      cueMatches = creditCues.allMatches(text);
    } else if (dir == 'debit') {
      cueMatches = debitCues.allMatches(text);
    } else {
      final merged = <RegExpMatch>[
        ...creditCues.allMatches(text),
        ...debitCues.allMatches(text)
      ]..sort((a, b) => a.start.compareTo(b.start));
      cueMatches = merged;
    }

    double? firstNonBalanceAfter(int start, int window) {
      final end = math.min(text.length, start + window);
      if (start >= end) return null;
      final windowText = text.substring(start, end);
      double? best;
      var bestIndex = 1 << 30;
      for (final rx in amountPatterns) {
        for (final m in rx.allMatches(windowText)) {
          final absoluteStart = start + m.start;
          final lookbackStart = math.max(0, absoluteStart - 40);
          final lookback = text.substring(lookbackStart, absoluteStart);
          if (balanceCue.hasMatch(lookback)) continue;
          final numStr = (m.group(1) ?? '')
              .replaceAll(',', '')
              .replaceAll(RegExp(r'\s+'), '');
          final value = double.tryParse(numStr);
          if (value != null && value > 0 && absoluteStart < bestIndex) {
            bestIndex = absoluteStart;
            best = value;
          }
        }
      }
      return best;
    }

    for (final cue in cueMatches) {
      final v = firstNonBalanceAfter(cue.end, 80);
      if (v != null) return v;
    }

    double? fallback;
    var fallbackIdx = 1 << 30;
    for (final rx in amountPatterns) {
      for (final m in rx.allMatches(text)) {
        final absoluteStart = m.start;
        final lookbackStart = math.max(0, absoluteStart - 40);
        final lookback = text.substring(lookbackStart, absoluteStart);
        if (balanceCue.hasMatch(lookback)) continue;
        final numStr = (m.group(1) ?? '')
            .replaceAll(',', '')
            .replaceAll(RegExp(r'\s+'), '');
        final value = double.tryParse(numStr);
        if (value != null && value > 0 && absoluteStart < fallbackIdx) {
          fallbackIdx = absoluteStart;
          fallback = value;
        }
      }
    }
    return fallback;
  }

  static double? extractPostTxnBalance(String text) {
    if (text.isEmpty) {
      return null;
    }
    final patterns = <RegExp>[
      RegExp(
          r'(?:A/?c\.?\s*Bal(?:\.|\s*is)?|Ac\s*Bal|AVL\s*Bal|Avail(?:able)?\s*Bal(?:ance)?|Closing\s*Balance)\s*(?:is\s*)?(?:₹|\bINR\b|(?<![A-Z])Rs\.?|\bRs\b)?\s*([0-9][\d,]*(?:\s*\.\s*\d{1,2})?)',
          caseSensitive: false),
      RegExp(
          r'\b(?:balance|bal)\s*(?:is|:)?\s*(?:₹|\bINR\b|(?<![A-Z])Rs\.?|\bRs\b)?\s*([0-9][\d,]*(?:\s*\.\s*\d{1,2})?)',
          caseSensitive: false),
    ];
    for (final rx in patterns) {
      final match = rx.firstMatch(text);
      if (match != null) {
        final numStr = (match.group(1) ?? '')
            .replaceAll(',', '')
            .replaceAll(RegExp(r'\s+'), '');
        final value = double.tryParse(numStr);
        if (value != null && value > 0) {
          return value;
        }
      }
    }
    return null;
  }

  static double? extractAnyInr(String text) {
    final rxs = <RegExp>[
      RegExp(
          r'(?:₹|\bINR\b|(?<![A-Z])Rs\.?|\bRs\b)\s*([0-9][\d,]*(?:\s*\.\s*\d{1,2})?)',
          caseSensitive: false),
      RegExp(r'\bamount\s+of\s+([0-9][\d,]*(?:\s*\.\s*\d{1,2})?)',
          caseSensitive: false),
    ];
    for (final rx in rxs) {
      final m = rx.firstMatch(text);
      if (m != null) {
        final numStr = (m.group(1) ?? '')
            .replaceAll(',', '')
            .replaceAll(RegExp(r'\s+'), '');
        final v = double.tryParse(numStr);
        if (v != null && v > 0) {
          return v;
        }
      }
    }
    return null;
  }

  static Map<String, dynamic>? extractFx(String text) {
    final pats = <RegExp>[
      RegExp(
          r'(spent|purchase|txn|transaction|charged)\s+(usd|eur|gbp|aed|sgd|jpy|aud|cad)\s*([0-9]+(?:\.[0-9]+)?)',
          caseSensitive: false),
      RegExp(
          r'\b(usd|eur|gbp|aed|sgd|jpy|aud|cad)\s*([0-9]+(?:\.[0-9]+)?)\b\s*(spent|purchase|txn|transaction|charged)',
          caseSensitive: false),
      RegExp(
          r'(txn|transaction)\s*of\s*(usd|eur|gbp|aed|sgd|jpy|aud|cad)\s*([0-9]+(?:\.[0-9]+)?)',
          caseSensitive: false),
    ];
    for (final re in pats) {
      final m = re.firstMatch(text);
      if (m != null) {
        final g = m.groups([1, 2, 3]);
        String cur;
        String amtStr;
        if (re.pattern.startsWith('(spent')) {
          cur = g[1]!.toUpperCase();
          amtStr = g[2]!;
        } else if (re.pattern.startsWith(r'\b(usd')) {
          cur = g[0]!.toUpperCase();
          amtStr = g[1]!;
        } else {
          cur = g[1]!.toUpperCase();
          amtStr = g[2]!;
        }
        final amt = double.tryParse(amtStr);
        if (amt != null && amt > 0) {
          return {'currency': cur, 'amount': amt};
        }
      }
    }
    return null;
  }

  static String? inferDirection(String body) {
    final lower = body.toLowerCase();
    if (lower.contains('credited to your loan') ||
        lower.contains('credited to loan') ||
        lower.contains('payment of') && lower.contains('loan account')) {
      return 'debit';
    }
    final cleaned = lower
        .replaceAll(RegExp(r'\bcredit\s+card\b'), '')
        .replaceAll(RegExp(r'\bdebit\s+card\b'), '');
    final strongCredit = RegExp(
            r'(has\s*been\s*credited|credited\s*(?:by|with)|amount\s*credited)',
            caseSensitive: false)
        .hasMatch(lower);
    final strongDebit = RegExp(
            r'(has\s*been\s*debited|debited|amount\s*debited)',
            caseSensitive: false)
        .hasMatch(lower);
    if (strongCredit && !strongDebit) {
      return 'credit';
    }
    if (strongDebit && !strongCredit) {
      return 'debit';
    }
    final isDR = RegExp(r'\bdr\b').hasMatch(cleaned);
    final isCR = RegExp(r'\bcr\b').hasMatch(cleaned);
    final hasAutopay =
        RegExp(r'\b(auto[-\s]?debit|autopay|nach|e-?mandate|mandate)\b')
            .hasMatch(cleaned);
    final debit =
        RegExp(r'\b(debit(?:ed)?|spent|purchase|paid|payment|pos|upi(?:\s*payment)?|imps|neft|rtgs|withdrawn|withdrawal|atm|charge[ds]?|recharge(?:d)?|bill\s*paid|transaction|txn)\b',
                    caseSensitive: false)
                .hasMatch(cleaned) ||
            hasAutopay;
    final credit = RegExp(
            r'\b(credit(?:ed)?|received|rcvd|deposit(?:ed)?|salary|refund|reversal|cashback|interest)\b',
            caseSensitive: false)
        .hasMatch(cleaned);
    if ((debit || isDR) && !(credit || isCR)) {
      return 'debit';
    }
    if ((credit || isCR) && !(debit || isDR)) {
      return 'credit';
    }
    final dIdx =
        RegExp(r'debit|spent|purchase|paid|payment|dr|auto[-\s]?debit|autopay|nach|mandate|transaction|txn',
                    caseSensitive: false)
                .firstMatch(cleaned)
                ?.start ??
            -1;
    final cIdx = RegExp(
                r'credit(?!\s*card)|received|rcvd|deposit|salary|refund|cr',
                caseSensitive: false)
            .firstMatch(cleaned)
            ?.start ??
        -1;
    if (dIdx >= 0 && cIdx >= 0) {
      return dIdx < cIdx ? 'debit' : 'credit';
    }
    return null;
  }

  static String? guessMerchantSmart(String text) {
    final t = text.toUpperCase();

    // 1) explicit "Merchant Name:"
    final m1 = RegExp(r'MERCHANT\s*NAME\s*[:\-]\s*([A-Z0-9&\.\-\* ]{3,40})')
            .firstMatch(t) ??
        RegExp(r'MERCHANT\s*NAME[\s\r\n]*[:\-]?[\s\r\n]*([A-Z0-9&\.\-\* ]{3,40})')
            .firstMatch(t);
    if (m1 != null) {
      final v = m1.group(1)!.trim();
      if (v.isNotEmpty) {
        return v;
      }
    }

    // 2) “for <merchant>” after autopay/purchase/txn cues
    final m2 = RegExp(
            r'\b(AUTOPAY|AUTO[-\s]?DEBIT|TXN|TRANSACTION|PURCHASE|PAYMENT)\b[^A-Z0-9]{0,40}\bFOR\b\s*([A-Z0-9&\.\-\* ]{3,40})')
        .firstMatch(t);
    if (m2 != null) {
      final v = m2.group(2)!.trim();
      if (v.isNotEmpty) {
        return v;
      }
    }

    // 3) known brands (quick path)
    final known = <String>[
      'OPENAI',
      'NETFLIX',
      'AMAZON PRIME',
      'PRIME VIDEO',
      'SPOTIFY',
      'YOUTUBE',
      'GOOGLE *YOUTUBE',
      'APPLE.COM/BILL',
      'APPLE',
      'MICROSOFT',
      'ADOBE',
      'SWIGGY',
      'ZOMATO',
      'HOTSTAR',
      'DISNEY+ HOTSTAR',
      'SONYLIV',
      'AIRTEL',
      'JIO',
      'VI',
      'HATHWAY',
      'ACT FIBERNET',
      'BOOKMYSHOW',
      'BIGTREE',
      'OLA',
      'UBER',
      'IRCTC',
      'REDBUS',
      'AMAZON',
      'FLIPKART',
      'MEESHO',
      'BLINKIT',
      'ZEPTO'
    ];
    for (final k in known) {
      final idx = t.indexOf(k);
      if (idx >= 0) {
        final windowStart = idx - 60 < 0 ? 0 : idx - 60;
        final windowEnd = idx + 60 > t.length ? t.length : idx + 60;
        final w = t.substring(windowStart, windowEnd);
        final nearVerb =
            hasDebitVerb(w) || hasCreditVerb(w); // Removed _ prefix
        final nearAmt = hasCurrencyAmount(w); // Removed _ prefix
        if (nearVerb || nearAmt) {
          return k;
        }
      }
    }

    // 4) “at|to <merchant>”
    final m3 = RegExp(r'\b(AT|TO)\b\s*([A-Z0-9&\.\-\* ]{3,40})').firstMatch(t);
    if (m3 != null) {
      final v = m3.group(2)!.trim();
      if (v.isNotEmpty) {
        return v;
      }
    }

    return null;
  }

  static bool isCard(String? instrument) =>
      instrument != null &&
      {'CREDIT CARD', 'DEBIT CARD', 'CARD', 'ATM', 'POS'}
          .contains(instrument.toUpperCase());

  static String? inferInstrument(String text) {
    final t = text.toUpperCase();
    final hasEmiCue =
        RegExp(r'\b(EMI|AUTOPAY|AUTO[- ]?DEBIT|NACH|E-?MANDATE|MANDATE)\b')
            .hasMatch(t);
    final accountLast4 = extractAccountLast4(text); // Removed _ prefix
    final hasCardCue = hasStrongCardCue(text); // Removed _ prefix

    if (hasEmiCue && accountLast4 != null) return 'Bank Account';

    if (RegExp(r'\bUPI\b').hasMatch(t) || t.contains('VPA')) return 'UPI';
    if (RegExp(r'\bIMPS\b').hasMatch(t)) return 'IMPS';
    if (RegExp(r'\bNEFT\b').hasMatch(t)) return 'NEFT';
    if (RegExp(r'\bRTGS\b').hasMatch(t)) return 'RTGS';
    if (RegExp(r'\bATM\b').hasMatch(t)) return 'ATM';
    if (RegExp(r'\bPOS\b').hasMatch(t)) return 'POS';
    if (RegExp(r'WALLET|PAYTM WALLET|AMAZON PAY', caseSensitive: false)
        .hasMatch(text)) {
      return 'Wallet';
    }
    if (RegExp(r'NETBANKING|NET BANKING', caseSensitive: false)
        .hasMatch(text)) {
      return 'NetBanking';
    }

    if (hasCardCue) {
      if (RegExp(r'\bDEBIT CARD\b').hasMatch(t) ||
          RegExp(r'\bDC\b').hasMatch(t) ||
          RegExp(r'\bATM\b|\bPOS\b').hasMatch(t)) {
        return 'Debit Card';
      }
      if (RegExp(r'\bCREDIT CARD\b').hasMatch(t) ||
          RegExp(r'\bCC\b').hasMatch(t) ||
          RegExp(r'VISA|MASTERCARD|RUPAY|AMEX|DINERS').hasMatch(t)) {
        return 'Credit Card';
      }
      return 'Card';
    }

    if (accountLast4 != null) return 'Bank Account';

    return null;
  }

  static String? inferCardNetwork(String text) {
    final t = text.toUpperCase();
    if (t.contains('VISA')) return 'VISA';
    if (t.contains('MASTERCARD') || t.contains('MASTER CARD')) {
      return 'MASTERCARD';
    }
    if (t.contains('RUPAY') || t.contains('RU-PAY')) return 'RUPAY';
    if (t.contains('AMEX') || t.contains('AMERICAN EXPRESS')) return 'AMEX';
    if (t.contains('DINERS')) return 'DINERS';
    return null;
  }

  static String? guessIssuerBankFromBody(String body) {
    final t = body.toUpperCase();
    if (t.contains('HDFC')) {
      return 'HDFC';
    }
    if (t.contains('ICICI')) {
      return 'ICICI';
    }
    if (t.contains('SBI')) {
      return 'SBI';
    }
    if (t.contains('AXIS')) {
      return 'AXIS';
    }
    if (t.contains('KOTAK')) {
      return 'KOTAK';
    }
    if (t.contains('YES')) {
      return 'YES';
    }
    if (t.contains('IDFC')) {
      return 'IDFC';
    }
    if (t.contains('BANK OF BARODA') || t.contains('BOB')) {
      return 'BOB';
    }
    return null;
  }

  static Map<String, double> extractCreditCardMetadata(String text) {
    final Map<String, double> meta = {};

    double? parseAmt(String raw) {
      final numStr = raw.replaceAll(RegExp(r'[^0-9.]'), '');
      return double.tryParse(numStr);
    }

    final avlRx = RegExp(
      r'(?:Avl|Available)\s*(?:Cr|Credit)?\s*(?:Lmt|Limit|Bal|Balance)[\s:-]*(?:Rs\.?|INR)?\s*([0-9,]+(?:\.\d{1,2})?)',
      caseSensitive: false,
    );
    final avlMatch = avlRx.firstMatch(text);
    if (avlMatch != null) {
      final v = parseAmt(avlMatch.group(1)!);
      if (v != null) meta['availableLimit'] = v;
    }

    final totRx = RegExp(
      r'(?:Total|Max)\s*(?:Cr|Credit)?\s*(?:Lmt|Limit)[\s:-]*(?:Rs\.?|INR)?\s*([0-9,]+(?:\.\d{1,2})?)',
      caseSensitive: false,
    );
    final totMatch = totRx.firstMatch(text);
    if (totMatch != null) {
      final v = parseAmt(totMatch.group(1)!);
      if (v != null) meta['totalLimit'] = v;
    }

    final ptsRx = RegExp(
      r'(?:Reward|Loyalty)\s*Points(?:\s*Balance)?(?:[\s:-]+|(?:\s+is\s+))([0-9,]+)',
      caseSensitive: false,
    );
    final ptsMatch = ptsRx.firstMatch(text);
    if (ptsMatch != null) {
      final v = parseAmt(ptsMatch.group(1)!);
      if (v != null) meta['rewardPoints'] = v;
    }

    return meta;
  }

  static String? extractUpiVpa(String text) {
    const handles = [
      'ybl',
      'okaxis',
      'oksbi',
      'okhdfcbank',
      'okicici',
      'ibl',
      'upi',
      'paytm',
      'apl',
      'axisbank',
      'hdfcbank',
      'icici',
      'sbi',
      'idfcbank',
      'kotak',
    ];
    final re = RegExp(
      '\\b([a-zA-Z0-9.\\-_]{2,})@(${handles.join('|')})\\b',
      caseSensitive: false,
    );
    return re.firstMatch(text)?.group(0);
  }

  static String? extractUpiSenderName(String text) {
    final rx = RegExp(
      r'\bUPI\/P2[AM]\/[^\/\s]+\/([^\/\n\r]+)',
      caseSensitive: false,
    );
    final m = rx.firstMatch(text); // Case insensitive matching on original text
    if (m != null) {
      final raw = (m.group(1) ?? '').trim();
      // Filter out bank names if they appear in the name slot
      if (raw.isNotEmpty &&
          !RegExp(r'(HDFC|ICICI|SBI|AXIS|KOTAK|YES|IDFC|BANK|UPI)',
                  caseSensitive: false)
              .hasMatch(raw)) {
        return raw;
      }
      return raw;
    }
    return null;
  }

  static Map<String, double> extractFees(String text) {
    final Map<String, double> out = {};
    double? firstAmountAfter(RegExp pat) {
      final m = pat.firstMatch(text);
      if (m == null) {
        return null;
      }
      final after = text.substring(m.end);
      final a = RegExp(
              r'(?:₹|\bINR\b|(?<![A-Z])Rs\.?|\bRs\b)\s*([0-9][\d,]*(?:\.\d{1,2})?)',
              caseSensitive: false)
          .firstMatch(after);
      if (a != null) {
        final v = double.tryParse((a.group(1) ?? '').replaceAll(',', ''));
        return v;
      }
      return null;
    }

    final pairs = <String, RegExp>{
      'convenience': RegExp(
          r'\b(convenience\s*fee|conv\.?\s*fee|gateway\s*charge)\b',
          caseSensitive: false),
      'gst': RegExp(r'\b(GST|IGST|CGST|SGST)\b', caseSensitive: false),
      'markup': RegExp(r'\b(markup|forex\s*markup|intl\.?\s*markup)\b',
          caseSensitive: false),
      'surcharge':
          RegExp(r'\b(surcharge|fuel\s*surcharge)\b', caseSensitive: false),
      'late_fee': RegExp(r'\b(late\s*fee|late\s*payment\s*fee|penalty)\b',
          caseSensitive: false),
      'processing': RegExp(r'\b(processing\s*fee)\b', caseSensitive: false),
    };

    pairs.forEach((k, rx) {
      final v = firstAmountAfter(rx);
      if (v != null && v > 0) out[k] = v;
    });
    return out;
  }

  static String cleanNoteSimple(String raw) {
    var t = raw.trim();
    // remove obvious OTP lines
    t = t.replaceAll(
        RegExp(r'(^|\s)(OTP|One[-\s]?Time\s*Password)\b[^\n]*',
            caseSensitive: false),
        '');
    // collapse whitespace
    t = t.replaceAll(RegExp(r'\s+'), ' ').trim();
    // keep it short
    if (t.length > 220) t = '${t.substring(0, 220)}…';
    return t;
  }

  static String preview(String raw) {
    var p = raw.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (p.length > 80) p = '${p.substring(0, 80)}…';
    return p;
  }
}
