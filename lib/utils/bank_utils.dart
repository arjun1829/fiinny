class BankUtils {
  static String? detectBankCode(String fromHeader, String bodyLower) {
    if (fromHeader.contains('hdfcbank') || bodyLower.contains('hdfc')) return 'HDFC';
    if (fromHeader.contains('icicibank') || bodyLower.contains('icici')) return 'ICICI';
    if (fromHeader.contains('axisbank') || bodyLower.contains('axis')) return 'AXIS';
    if (fromHeader.contains('sbi') || bodyLower.contains('state bank')) return 'SBI';
    if (fromHeader.contains('kotak') || bodyLower.contains('kotak')) return 'KOTAK';
    if (fromHeader.contains('americanexpress') || bodyLower.contains('amex')) return 'AMEX';
    return null;
  }

  static String? schemeFromText(String lower) {
    if (lower.contains('visa')) return 'VISA';
    if (lower.contains('mastercard') || lower.contains('mc ')) return 'MASTERCARD';
    if (lower.contains('rupay')) return 'RUPAY';
    if (lower.contains('amex') || lower.contains('american express')) return 'AMEX';
    return null;
  }

  static String bankLogoAsset(String bankCode) => 'assets/images/banks/${bankCode.toLowerCase()}.png';
  static String schemeLogoAsset(String scheme) => 'assets/images/banks/${scheme.toLowerCase()}.png';
}
