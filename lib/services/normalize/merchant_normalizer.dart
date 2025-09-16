class MerchantNorm {
  final String id;      // stable id
  final String display; // pretty name
  final String? bankLogoAsset; // optional asset path for bank/card logo
  MerchantNorm(this.id, this.display, {this.bankLogoAsset});
}

class MerchantNormalizer {
  static final _alias = <RegExp, MerchantNorm>{
    RegExp(r'hdfc', caseSensitive: false): MerchantNorm('hdfc', 'HDFC Bank', bankLogoAsset: 'assets/images/banks/hdfc.png'),
    RegExp(r'icici', caseSensitive: false): MerchantNorm('icici', 'ICICI Bank', bankLogoAsset: 'assets/images/banks/icici.png'),
    RegExp(r'axis', caseSensitive: false): MerchantNorm('axis', 'Axis Bank', bankLogoAsset: 'assets/images/banks/axis.png'),
    RegExp(r'sbi|state bank', caseSensitive: false): MerchantNorm('sbi', 'SBI', bankLogoAsset: 'assets/images/banks/sbi.png'),
    RegExp(r'paytm', caseSensitive: false): MerchantNorm('paytm', 'Paytm', bankLogoAsset: 'assets/images/banks/paytm.png'),
    RegExp(r'amazon', caseSensitive: false): MerchantNorm('amazon', 'Amazon', bankLogoAsset: 'assets/images/banks/amazon.png'),
    // Add more as needed
  };

  static MerchantNorm normalize(String raw) {
    final cleaned = raw.trim().replaceAll(RegExp(r'[\u{1F600}-\u{1F6FF}]', unicode: true), '');
    for (final e in _alias.entries) {
      if (e.key.hasMatch(cleaned)) return e.value;
    }
    // default: normalized id = folded lowercase
    final id = cleaned.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '-');
    final display = cleaned.isEmpty ? 'Unknown' : cleaned;
    return MerchantNorm(id.isEmpty ? 'unknown' : id, display);
  }
}
