class PriceQuote {
  final String symbol;
  final double ltp;
  final double change;
  final double changePct;
  final DateTime? asOf; // NEW

  PriceQuote({
    required this.symbol,
    required this.ltp,
    required this.change,
    required this.changePct,
    this.asOf,
  });

  factory PriceQuote.fromJson(Map<String, dynamic> j) => PriceQuote(
    symbol: (j['symbol'] ?? '').toString().toUpperCase(),
    ltp: (j['ltp'] as num).toDouble(),
    change: (j['change'] as num).toDouble(),
    changePct: (j['changePct'] as num).toDouble(),
    asOf: j['asOf'] != null ? DateTime.tryParse(j['asOf']) : null,
  );

  Map<String, dynamic> toJson() => {
    'symbol': symbol,
    'ltp': ltp,
    'change': change,
    'changePct': changePct,
    'asOf': asOf?.toIso8601String(),
  };
}
