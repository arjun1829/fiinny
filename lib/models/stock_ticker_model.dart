class StockTickerModel {
  final String symbol;      // e.g. "RELIANCE"
  final String name;        // e.g. "Reliance Industries Ltd"
  final String exchange;    // e.g. "NSE"
  final double price;       // Mock current price
  final String sector;      // e.g. "Energy"
  final String? logoUrl;    // Optional remote logo

  const StockTickerModel({
    required this.symbol,
    required this.name,
    required this.exchange,
    required this.price,
    required this.sector,
    this.logoUrl,
  });
}
