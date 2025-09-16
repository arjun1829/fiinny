import 'asset_model.dart';

/// A Holding represents a specific entry in the portfolio.
/// For example: 10 shares of TCS at ₹3000 avg buy
///              or 12.5g Gold at ₹6100/g
class HoldingModel {
  final AssetModel asset;
  final double latestPrice;

  HoldingModel({
    required this.asset,
    required this.latestPrice,
  });

  double get invested => asset.investedValue();
  double get current => asset.currentValue(latestPrice);
  double get pnl => asset.profitLoss(latestPrice);

  double get pnlPercent {
    final inv = invested;
    if (inv == 0) return 0;
    return (pnl / inv) * 100;
  }
}
