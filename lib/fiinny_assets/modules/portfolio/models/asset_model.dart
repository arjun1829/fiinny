import 'package:uuid/uuid.dart';

/// Base Asset model – covers common fields across all asset types
class AssetModel {
  final String id;
  final String type; // e.g., "stock", "gold"
  final String name; // display name (TCS, Gold 24k, etc.)
  final double quantity; // shares/grams
  final double avgBuyPrice; // average buy per unit
  final DateTime createdAt;

  AssetModel({
    String? id,
    required this.type,
    required this.name,
    required this.quantity,
    required this.avgBuyPrice,
    DateTime? createdAt,
  })  : id = id ?? const Uuid().v4(),
        createdAt = createdAt ?? DateTime.now();

  /// Current value given latest price
  double currentValue(double latestPrice) => quantity * latestPrice;

  /// Total invested amount
  double investedValue() => quantity * avgBuyPrice;

  /// Profit/Loss
  double profitLoss(double latestPrice) =>
      currentValue(latestPrice) - investedValue();

  // JSON serialization
  Map<String, dynamic> toJson() => {
    'id': id,
    'type': type,
    'name': name,
    'quantity': quantity,
    'avgBuyPrice': avgBuyPrice,
    'createdAt': createdAt.toIso8601String(),
  };

  factory AssetModel.fromJson(Map<String, dynamic> json) {
    return AssetModel(
      id: json['id'],
      type: json['type'],
      name: json['name'],
      quantity: (json['quantity'] ?? 0).toDouble(),
      avgBuyPrice: (json['avgBuyPrice'] ?? 0).toDouble(),
      createdAt: DateTime.tryParse(json['createdAt'] ?? '') ?? DateTime.now(),
    );
  }
}
