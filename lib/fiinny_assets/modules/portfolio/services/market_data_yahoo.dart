import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:lifemap/config/app_config.dart';
import '../models/price_quote.dart';
import 'market_data_service.dart';

/// Real market data via your Cloudflare Worker proxy (Yahoo backend).
/// Worker endpoint example:
///   https://fiinny-proxy.fiinny-tools.workers.dev/quotes?symbols=TCS,RELIANCE,GOLD
class MarketDataYahoo extends MarketDataService {
  final http.Client _client;

  // lightweight in-memory cache (per instance) to avoid spamming the proxy
  final Map<String, _CacheEntry> _mem = {};
  final int _ttlSeconds;

  MarketDataYahoo({http.Client? client, int ttlSeconds = 15})
      : _client = client ?? http.Client(),
        _ttlSeconds = ttlSeconds;

  Uri _buildUri(List<String> syms) {
    final base = AppConfig.quotesBaseUrl; // e.g. https://.../quotes
    final symbols = syms.map((e) => e.trim().toUpperCase()).where((e) => e.isNotEmpty).join(',');
    return Uri.parse(base).replace(queryParameters: {'symbols': symbols});
  }

  bool _fresh(String symbol) {
    final s = symbol.toUpperCase();
    final e = _mem[s];
    if (e == null) return false;
    final now = DateTime.now().millisecondsSinceEpoch ~/ 1000;
    return (now - e.epoch) < _ttlSeconds;
  }

  Future<Map<String, dynamic>> _getJson(Uri uri) async {
    final resp = await _client
        .get(uri)
        .timeout(const Duration(milliseconds: AppConfig.receiveTimeoutMs));
    if (resp.statusCode != 200) {
      throw Exception('Quotes HTTP ${resp.statusCode}');
    }
    final body = json.decode(resp.body);
    if (body is! Map || !body.containsKey('quotes')) {
      throw Exception('Malformed response from proxy');
    }
    return (body['quotes'] as Map).cast<String, dynamic>();
  }

  PriceQuote _fromJson(String k, Map<String, dynamic> j) => PriceQuote(
    symbol: (j['symbol'] ?? k).toString().toUpperCase(),
    ltp: (j['ltp'] as num).toDouble(),
    change: (j['change'] as num).toDouble(),
    changePct: (j['changePct'] as num).toDouble(),
    asOf: j['asOf'] != null ? DateTime.tryParse(j['asOf']) : null,
  );

  @override
  Future<PriceQuote> fetchQuote(String symbol) async {
    final s = symbol.toUpperCase();
    if (_fresh(s)) return _mem[s]!.q;

    final uri = _buildUri([s]);
    final map = await _getJson(uri);
    final raw = map[s] as Map<String, dynamic>?;
    if (raw == null) throw Exception('No quote for $s');

    final q = _fromJson(s, raw);
    _mem[s] = _CacheEntry(q);
    return q;
  }

  @override
  Future<Map<String, PriceQuote>> fetchQuotes(List<String> symbols) async {
    if (symbols.isEmpty) return {};
    // de-dupe & normalize
    final list = <String>[];
    final seen = <String>{};
    for (final s in symbols) {
      final x = s.trim().toUpperCase();
      if (x.isEmpty) continue;
      if (seen.add(x)) list.add(x);
    }
    if (list.isEmpty) return {};

    // split into cached + needFetch
    final needFetch = <String>[];
    final out = <String, PriceQuote>{};

    for (final s in list) {
      if (_fresh(s)) {
        out[s] = _mem[s]!.q;
      } else {
        needFetch.add(s);
      }
    }

    if (needFetch.isNotEmpty) {
      final uri = _buildUri(needFetch);
      final map = await _getJson(uri);
      final now = DateTime.now().millisecondsSinceEpoch ~/ 1000;

      for (final s in needFetch) {
        final raw = map[s] as Map<String, dynamic>?;
        if (raw == null) {
          // skip missing symbol; don't crash the whole batch
          continue;
        }
        final q = _fromJson(s, raw);
        _mem[s] = _CacheEntry(q, epoch: now);
        out[s] = q;
      }
    }

    return out;
  }
}

class _CacheEntry {
  final PriceQuote q;
  final int epoch; // seconds
  _CacheEntry(this.q, {int? epoch})
      : epoch = epoch ?? (DateTime.now().millisecondsSinceEpoch ~/ 1000);
}
