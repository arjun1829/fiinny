class AssetModel {
  final String? id;
  final String userId;
  final String title;          // e.g., "FD", "Gold"
  final double value;          // Current value
  final String assetType;      // Investment/Property/Gold/Other
  final double? purchaseValue; // What you paid (optional)
  final DateTime? purchaseDate; // When you bought (optional)
  final String? notes;         // Free-form notes
  final DateTime? createdAt;   // For tracking

  AssetModel({
    this.id,
    required this.userId,
    required this.title,
    required this.value,
    required this.assetType,
    this.purchaseValue,
    this.purchaseDate,
    this.notes,
    this.createdAt,
  });

  factory AssetModel.fromJson(Map<String, dynamic> json, [String? id]) {
    return AssetModel(
      id: id,
      userId: json['userId'] ?? '',
      title: json['title'] ?? '',
      value: (json['value'] is int)
          ? (json['value'] as int).toDouble()
          : (json['value'] is double)
          ? json['value']
          : double.tryParse(json['value']?.toString() ?? '') ?? 0.0,
      assetType: json['assetType'] ?? '',
      purchaseValue: json['purchaseValue'] == null
          ? null
          : (json['purchaseValue'] is int)
          ? (json['purchaseValue'] as int).toDouble()
          : (json['purchaseValue'] is double)
          ? json['purchaseValue']
          : double.tryParse(json['purchaseValue'].toString()) ?? 0.0,
      purchaseDate: json['purchaseDate'] != null
          ? DateTime.tryParse(json['purchaseDate'].toString())
          : null,
      notes: json['notes'],
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString())
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'userId': userId,
    'title': title,
    'value': value,
    'assetType': assetType,
    'purchaseValue': purchaseValue,
    'purchaseDate': purchaseDate?.toIso8601String(),
    'notes': notes,
    'createdAt': createdAt?.toIso8601String(),
  };
}
