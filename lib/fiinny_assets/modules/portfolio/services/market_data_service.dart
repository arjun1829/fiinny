// lib/fiinny_assets/modules/portfolio/services/market_data_service.dart
import 'dart:async';
import '../models/price_quote.dart';

/// Abstract market data interface.
/// Plug any provider behind this (Yahoo via proxy, NSE/BSE, Alpha Vantage, etc.)
abstract class MarketDataService {
  /// Fetch a single symbol (e.g., "TCS", "RELIANCE", "GOLD")
  Future<PriceQuote> fetchQuote(String symbol);

  /// Fetch multiple symbols at once.
  ///
  /// Implementations SHOULD override to use the provider's batch endpoint.
  /// The default fallback just issues parallel single requests.
  Future<Map<String, PriceQuote>> fetchQuotes(List<String> symbols) async {
    final unique = _dedupe(symbols.map(_norm).toList());
    if (unique.isEmpty) return {};

    final results = await Future.wait(
      unique.map((s) async {
        try {
          final q = await fetchQuote(s);
          return MapEntry(s, q);
        } catch (_) {
          return null; // swallow per-symbol failures in fallback
        }
      }),
      eagerError: false,
    );

    final out = <String, PriceQuote>{};
    for (final r in results) {
      if (r != null) out[r.key] = r.value;
    }
    return out;
  }

  /// Poll a single symbol on an interval.
  /// Implementations may override for sockets/streaming.
  Stream<PriceQuote> watchQuote(
      String symbol, {
        Duration interval = const Duration(seconds: 10),
      }) async* {
    final sym = _norm(symbol);
    while (true) {
      try {
        final q = await fetchQuote(sym);
        yield q;
      } catch (_) {
        // ignore errors between ticks
      }
      await Future.delayed(interval);
    }
  }

  /// Poll a set of symbols on an interval (batch-friendly).
  /// Emits a full snapshot map each tick.
  Stream<Map<String, PriceQuote>> watchQuotes(
      List<String> symbols, {
        Duration interval = const Duration(seconds: 10),
      }) async* {
    final list = _dedupe(symbols.map(_norm).toList());
    if (list.isEmpty) {
      // end immediately with an empty stream
      return;
    }
    while (true) {
      try {
        final map = await fetchQuotes(list);
        yield map;
      } catch (_) {
        // ignore errors between ticks
      }
      await Future.delayed(interval);
    }
  }

  /// ---------- Helpers (kept protected-ish) ----------

  /// Normalize key we use in app (uppercased, trimmed).
  static String _norm(String s) => s.trim().toUpperCase();

  /// Remove duplicates while preserving order.
  static List<String> _dedupe(List<String> xs) {
    final seen = <String>{};
    final out = <String>[];
    for (final x in xs) {
      if (seen.add(x)) out.add(x);
    }
    return out;
  }
}
