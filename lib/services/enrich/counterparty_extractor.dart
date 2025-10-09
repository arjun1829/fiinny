class Counterparty {
  final String name;
  final String type; // merchant | person | bank | wallet | unknown
  final String? vpa;

  Counterparty(this.name, {this.type = 'unknown', this.vpa});
}

class CounterpartyExtractor {
  static final _reTo = RegExp(r'\b(?:to|at|towards|paid to)\b\s*([A-Za-z0-9&.\'\-\s]+)', caseSensitive: false);
  static final _reFrom = RegExp(r'\b(?:from|by)\b\s*([A-Za-z0-9&.\'\-\s]+)', caseSensitive: false);
  static final _reBenef = RegExp(r'(?:Beneficiary|Payee)\s*[:\-]\s*([A-Za-z0-9&.\'\-\s]+)', caseSensitive: false);
  static final _reVpa = RegExp(r'([a-z0-9.\-_]+@[a-z]{2,})', caseSensitive: false);
  static final _reBank = RegExp(r'\b(HDFC|ICICI|SBI|AXIS|KOTAK|YES|IDFC|IDBI|PNB|CANARA|INDUSIND)\b', caseSensitive: false);

  static Counterparty? extractForDebit(String text) {
    final vpa = _reVpa.firstMatch(text)?.group(1);
    final to = _reTo.firstMatch(text)?.group(1)?.trim();
    final bene = _reBenef.firstMatch(text)?.group(1)?.trim();
    final name = _clean(to ?? bene ?? vpa ?? '');
    if (name.isEmpty) return null;
    final type = vpa != null ? 'person' : (_reBank.hasMatch(name) ? 'bank' : 'merchant');
    return Counterparty(name, type: type, vpa: vpa);
  }

  static Counterparty? extractForCredit(String text) {
    final vpa = _reVpa.firstMatch(text)?.group(1);
    final from = _reFrom.firstMatch(text)?.group(1)?.trim();
    final name = _clean(from ?? vpa ?? '');
    if (name.isEmpty) return null;
    final type = vpa != null ? 'person' : (_reBank.hasMatch(name) ? 'bank' : 'employer');
    return Counterparty(name, type: type, vpa: vpa);
  }

  static String _clean(String s) {
    var t = s.replaceAll(RegExp(r'\s+'), ' ').trim();
    t = t.replaceAll(RegExp(r'^(for|the|a|an)\s+', caseSensitive: false), '');
    return t;
  }
}
