import 'dart:async';
import 'dart:math' as math;

import '../models/price_quote.dart';
import 'market_data_service.dart';

/// Demo market data: local random-walk quotes (no API keys).
/// Replace with a real implementation later without changing screens/widgets.
class MarketDataDemo extends MarketDataService {
  final _rng = math.Random();

  // base prices for a few common symbols
  final Map<String, double> _base = {
    'TCS': 3950.0,
    'INFY': 1600.0,
    'RELIANCE': 2900.0,
    'HDFCBANK': 1550.0,
    'GOLD': 6150.0, // per gram (₹)
  };

  double _nextLtp(double current) {
    // small random % move ±0.3%
    final double pct = (_rng.nextDouble() - 0.5) * 0.006;
    final double next = (current * (1 + pct)).clamp(0.01, double.infinity);
    return double.parse(next.toStringAsFixed(2));
    // toStringAsFixed ensures nice decimals for UI
  }

  PriceQuote _toQuote(String symbol, double oldLtp, double newLtp) {
    final double change = double.parse((newLtp - oldLtp).toStringAsFixed(2));
    final double changePct =
    oldLtp == 0 ? 0.0 : double.parse(((change / oldLtp) * 100).toStringAsFixed(2));
    return PriceQuote(symbol: symbol, ltp: newLtp, change: change, changePct: changePct);
  }

  @override
  Future<PriceQuote> fetchQuote(String symbol) async {
    final String key = symbol.toUpperCase();
    final double last = _base[key] ?? 100.0;
    final double next = _nextLtp(last);
    _base[key] = next;
    return _toQuote(key, last, next);
  }

  @override
  Future<Map<String, PriceQuote>> fetchQuotes(List<String> symbols) async {
    final Map<String, PriceQuote> out = {};
    for (final s in symbols) {
      final k = s.toUpperCase();
      out[k] = await fetchQuote(k);
    }
    return out;
  }

  @override
  Stream<PriceQuote> watchQuote(
      String symbol, {
        Duration interval = const Duration(seconds: 10),
      }) {
    // Slightly faster demo updates
    final Duration d = interval.inMilliseconds < 1500
        ? interval
        : const Duration(seconds: 3);
    return Stream.periodic(d).asyncMap((_) => fetchQuote(symbol));
  }
}
