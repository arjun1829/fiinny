class InstrumentInfo {
  final String
      instrument; // UPI | Credit Card | Debit Card | NetBanking | Wallet | Cash | Bank Transfer | Unknown
  final String?
      channel; // P2P | P2M | POS | ECOM | AUTOPAY | ATM | NEFT | IMPS | RTGS | NACH | ECS
  final String? bank; // issuer for card; debited bank for UPI/netbanking
  final String? accountType; // Savings | Credit Card | Current
  final String? accountLast4;
  final String? cardNetwork; // VISA | Mastercard | RuPay | Amex
  final String? cardLast4;
  final String? upiVpa;
  final String? upiTxnId;
  final String? rrn;
  final bool international;

  const InstrumentInfo({
    required this.instrument,
    this.channel,
    this.bank,
    this.accountType,
    this.accountLast4,
    this.cardNetwork,
    this.cardLast4,
    this.upiVpa,
    this.upiTxnId,
    this.rrn,
    this.international = false,
  });
}

class InstrumentDetector {
  static final _reNum4 = RegExp(r'(?<!\d)(\d{4})(?!\d)');
  static final _reCardMask = RegExp(
      r'(?:Card|XX|xxxx|x{2,})\s*?(\d{3,4}|\d{4})',
      caseSensitive: false);
  static final _reCardNetwork = RegExp(
      r'\b(VISA|MASTERCARD|RUPAY|AMEX|AMERICAN\s*EXPRESS)\b',
      caseSensitive: false);
  static final _reUPI = RegExp(r'\bUPI\b', caseSensitive: false);
  static final _reVPA =
      RegExp(r'([a-z0-9.\-_]+@[a-z]{2,})(?!\S)', caseSensitive: false);
  static final _reUTR = RegExp(
      r'\b(UTR|Txn Id|Transaction Id|Ref(?:erence)? No\.?)\s*[:\-]?\s*([A-Z0-9\-]{8,})',
      caseSensitive: false);
  static final _reRRN =
      RegExp(r'\bRRN\s*[:\-]?\s*([0-9]{8,})', caseSensitive: false);
  static final _reBankAcr = RegExp(
      r'\b(HDFC|ICICI|SBI|AXIS|KOTAK|BOB|YES|IDFC|IDBI|PNB|CANARA|INDUSIND)\b',
      caseSensitive: false);
  static final _reAcct =
      RegExp(r'(?:A/c|AC|Account)[^\d]{0,5}(\d{3,4})', caseSensitive: false);
  static final _reNEFT = RegExp(r'\bNEFT\b', caseSensitive: false);
  static final _reIMPS = RegExp(r'\bIMPS\b', caseSensitive: false);
  static final _reRTGS = RegExp(r'\bRTGS\b', caseSensitive: false);
  static final _rePOS = RegExp(r'\b(POS|Swipe)\b', caseSensitive: false);
  static final _reECOM =
      RegExp(r'\b(ECOM|ecom|ONLINE)\b', caseSensitive: false);
  static final _reAutopay = RegExp(r'\b(AUTOPAY|AUTO\s*PAY|MANDATE|NACH|ECS)\b',
      caseSensitive: false);
  static final _reIntl = RegExp(
      r'\b(USD|EUR|GBP|AUD|SGD|JPY|CAD|INTERNATIONAL|FOREX|FX)\b',
      caseSensitive: false);

  /// Extract the instrument and metadata from a subject/body/sms text.
  static InstrumentInfo detect(String text,
      {String? fromDomain, String? smsSender}) {
    final t = text.replaceAll('\n', ' ');
    String instrument = 'Unknown';
    String? channel;
    String? bank;
    String? accountType;
    String? accountLast4;
    String? cardNetwork;
    String? cardLast4;
    String? upiVpa;
    String? upiTxnId;
    String? rrn;
    bool international = false;

    if (_reUPI.hasMatch(t)) {
      instrument = 'UPI';
      if (t.contains('P2M') || t.contains('merchant')) {
        channel = 'P2M';
      }
      if (t.contains('P2P') || t.contains('to VPA')) {
        channel = channel ?? 'P2P';
      }
      if (_reAutopay.hasMatch(t)) {
        channel = 'AUTOPAY';
      }
      upiVpa = _reVPA.firstMatch(t)?.group(1);
      final utrM = _reUTR.firstMatch(t);
      if (utrM != null) {
        upiTxnId = utrM.group(2);
      }
      rrn = _reRRN.firstMatch(t)?.group(1);
      final acctM = _reAcct.firstMatch(t);
      if (acctM != null) {
        accountLast4 = acctM.group(1);
      }
      accountType = 'Savings';
    } else if (t.contains('credit card') ||
        _reCardNetwork.hasMatch(t) ||
        t.contains('debit card') ||
        _rePOS.hasMatch(t) ||
        _reECOM.hasMatch(t)) {
      // card flows
      if (t.contains('credit card')) {
        instrument = 'Credit Card';
        accountType = 'Credit Card';
      } else if (t.contains('debit card')) {
        instrument = 'Debit Card';
        accountType = 'Savings';
      } else {
        instrument = 'Credit Card'; // most alerts omit
      }
      channel =
          _reECOM.hasMatch(t) ? 'ECOM' : (_rePOS.hasMatch(t) ? 'POS' : channel);
      final netM = _reCardNetwork.firstMatch(t);
      if (netM != null) cardNetwork = netM.group(1)?.toUpperCase();
      final l4 = _reCardMask.firstMatch(t)?.group(1) ??
          _reNum4.firstMatch(t)?.group(1);
      if (l4 != null && l4.length >= 3) {
        cardLast4 = l4.substring(l4.length - 4);
      }
    } else if (_reNEFT.hasMatch(t) ||
        _reIMPS.hasMatch(t) ||
        _reRTGS.hasMatch(t)) {
      instrument = 'Bank Transfer';
      if (_reNEFT.hasMatch(t)) {
        channel = 'NEFT';
      }
      if (_reIMPS.hasMatch(t)) {
        channel = 'IMPS';
      }
      if (_reRTGS.hasMatch(t)) {
        channel = 'RTGS';
      }
      final acctM = _reAcct.firstMatch(t);
      if (acctM != null) {
        accountLast4 = acctM.group(1);
      }
      accountType = 'Savings';
    }

    // Bank inference from headers / domain or explicit text
    bank = _reBankAcr.firstMatch(t)?.group(1)?.toUpperCase() ?? bank;
    if (bank == null && fromDomain != null) {
      final d = fromDomain.toLowerCase();
      if (d.contains('hdfcbank')) {
        bank = 'HDFC';
      } else if (d.contains('icicibank')) {
        bank = 'ICICI';
      } else if (d.contains('axisbank')) {
        bank = 'AXIS';
      } else if (d.contains('sbi')) {
        bank = 'SBI';
      } else if (d.contains('kotak')) {
        bank = 'KOTAK';
      } else if (d.contains('yesbank')) {
        bank = 'YES';
      } else if (d.contains('idfc')) {
        bank = 'IDFC';
      } else if (d.contains('pnb')) {
        bank = 'PNB';
      } else if (d.contains('canarabank')) {
        bank = 'CANARA';
      } else if (d.contains('indusind')) {
        bank = 'INDUSIND';
      }
    }

    international = _reIntl.hasMatch(t);
    return InstrumentInfo(
      instrument: instrument,
      channel: channel,
      bank: bank,
      accountType: accountType,
      accountLast4: accountLast4,
      cardNetwork: cardNetwork,
      cardLast4: cardLast4,
      upiVpa: upiVpa,
      upiTxnId: upiTxnId,
      rrn: rrn,
      international: international,
    );
  }
}
