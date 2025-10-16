import '../models/price_quote.dart';

class QuoteCache {
  static const _ttlSeconds = 20; // cache for 20s

  static final Map<String, _Entry> _mem = {};

  Future<PriceQuote?> get(String symbol) async {
    final e = _mem[symbol.toUpperCase()];
    if (e == null) return null;
    final now = DateTime.now().millisecondsSinceEpoch ~/ 1000;
    if (now - e.epoch > _ttlSeconds) return null;
    return e.q;
  }

  Future<void> putAll(Map<String, PriceQuote> quotes) async {
    final now = DateTime.now().millisecondsSinceEpoch ~/ 1000;
    for (final e in quotes.entries) {
      _mem[e.key.toUpperCase()] = _Entry(q: e.value, epoch: now);
    }
  }
}

class _Entry {
  final PriceQuote q;
  final int epoch;
  _Entry({required this.q, required this.epoch});
}
