import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/price_quote.dart';

class QuoteCache {
  static const _kKey = 'fiinny_quote_cache_v1';
  static const _ttlSeconds = 20; // cache for 20s

  Map<String, _Entry> _mem = {};

  Future<void> _load() async {
    if (_mem.isNotEmpty) return;
    final sp = await SharedPreferences.getInstance();
    final raw = sp.getString(_kKey);
    if (raw == null) return;
    try {
      final map = (json.decode(raw) as Map<String, dynamic>);
      _mem = map.map((k, v) => MapEntry(k, _Entry.fromJson(v)));
    } catch (_) {}
  }

  Future<void> _save() async {
    final sp = await SharedPreferences.getInstance();
    final map = _mem.map((k, v) => MapEntry(k, v.toJson()));
    await sp.setString(_kKey, json.encode(map));
  }

  Future<PriceQuote?> get(String symbol) async {
    await _load();
    final e = _mem[symbol.toUpperCase()];
    if (e == null) return null;
    final now = DateTime.now().millisecondsSinceEpoch ~/ 1000;
    if (now - e.epoch > _ttlSeconds) return null;
    return e.q;
  }

  Future<void> putAll(Map<String, PriceQuote> quotes) async {
    await _load();
    final now = DateTime.now().millisecondsSinceEpoch ~/ 1000;
    for (final e in quotes.entries) {
      _mem[e.key.toUpperCase()] = _Entry(q: e.value, epoch: now);
    }
    await _save();
  }
}

class _Entry {
  final PriceQuote q;
  final int epoch;
  _Entry({required this.q, required this.epoch});

  Map<String, dynamic> toJson() => {
    'q': q.toJson(),
    'epoch': epoch,
  };
  factory _Entry.fromJson(Map<String, dynamic> j) => _Entry(
    q: PriceQuote.fromJson(j['q'] as Map<String, dynamic>),
    epoch: (j['epoch'] as num).toInt(),
  );
}
