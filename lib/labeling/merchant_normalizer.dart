class MerchantNormalizer {
  static String normalize(String? raw) {
    if (raw == null) return '';
    var s = raw.trim().toUpperCase();

    // Strip common noise
    s = s
        .replaceAll(RegExp(r'\s+PVT\.?\s*LTD\.?'), '')
        .replaceAll(RegExp(r'\s+LTD\.?'), '')
        .replaceAll(RegExp(r'\s+INC\.?'), '')
        .replaceAll(RegExp(r'[^A-Z0-9 &._\-]'), ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();

    // Canonical mappings
    if (RegExp(r'AMZN|AMAZON').hasMatch(s)) s = 'AMAZON';
    if (RegExp(r'FLIPKART|FKRT').hasMatch(s)) s = 'FLIPKART';
    if (RegExp(r'ZOMATO').hasMatch(s)) s = 'ZOMATO';
    if (RegExp(r'SWIGGY').hasMatch(s)) s = 'SWIGGY';
    if (RegExp(r'UBER').hasMatch(s)) s = 'UBER';
    if (RegExp(r'OLA').hasMatch(s)) s = 'OLA';

    return s;
  }
}
