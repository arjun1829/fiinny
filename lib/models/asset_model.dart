class AssetModel {
  final String? id;
  final String userId;

  // Core
  final String title;           // e.g., "HDFC FD", "Gold"
  final double value;           // Current market value
  final String assetType;       // Top-level category (equity, mf_etf, gold, real_estate, etc.)
  final String? subType;        // Sub-category (e.g., "Index Fund", "Corporate FD")
  final String? institution;    // Bank/Broker/Platform (HDFC, Zerodha, Groww, etc.)
  final String? currency;       // Default "INR"

  // Purchase info
  final double? purchaseValue;  // What you paid (optional)
  final DateTime? purchaseDate; // When you bought (optional)
  final double? quantity;       // For market-linked assets (e.g., 12 shares, 0.5 BTC)
  final double? avgBuyPrice;    // For stocks/crypto/MFs

  // Extra metadata
  final List<String>? tags;     // e.g., ["retirement","child-edu"]
  final String? logoHint;       // For mapping logos (e.g., hdfc_bank.png, zerodha.png)
  final String? notes;          // Free-form notes

  // System
  final DateTime? createdAt;    // For tracking
  final DateTime? valuationDate; // When was value last updated

  AssetModel({
    this.id,
    required this.userId,
    required this.title,
    required this.value,
    required this.assetType,
    this.subType,
    this.institution,
    this.currency = "INR",
    this.purchaseValue,
    this.purchaseDate,
    this.quantity,
    this.avgBuyPrice,
    this.tags,
    this.logoHint,
    this.notes,
    this.createdAt,
    this.valuationDate,
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
      subType: json['subType'],
      institution: json['institution'],
      currency: json['currency'] ?? 'INR',
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
      quantity: json['quantity'] == null
          ? null
          : (json['quantity'] is int)
          ? (json['quantity'] as int).toDouble()
          : (json['quantity'] is double)
          ? json['quantity']
          : double.tryParse(json['quantity'].toString()) ?? 0.0,
      avgBuyPrice: json['avgBuyPrice'] == null
          ? null
          : (json['avgBuyPrice'] is int)
          ? (json['avgBuyPrice'] as int).toDouble()
          : (json['avgBuyPrice'] is double)
          ? json['avgBuyPrice']
          : double.tryParse(json['avgBuyPrice'].toString()) ?? 0.0,
      tags: json['tags'] != null ? List<String>.from(json['tags']) : null,
      logoHint: json['logoHint'],
      notes: json['notes'],
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString())
          : null,
      valuationDate: json['valuationDate'] != null
          ? DateTime.tryParse(json['valuationDate'].toString())
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'userId': userId,
    'title': title,
    'value': value,
    'assetType': assetType,
    'subType': subType,
    'institution': institution,
    'currency': currency,
    'purchaseValue': purchaseValue,
    'purchaseDate': purchaseDate?.toIso8601String(),
    'quantity': quantity,
    'avgBuyPrice': avgBuyPrice,
    'tags': tags,
    'logoHint': logoHint,
    'notes': notes,
    'createdAt': createdAt?.toIso8601String(),
    'valuationDate': valuationDate?.toIso8601String(),
  };

  AssetModel copyWith({
    String? id,
    String? userId,
    String? title,
    double? value,
    String? assetType,
    String? subType,
    String? institution,
    String? currency,
    double? purchaseValue,
    DateTime? purchaseDate,
    double? quantity,
    double? avgBuyPrice,
    List<String>? tags,
    String? logoHint,
    String? notes,
    DateTime? createdAt,
    DateTime? valuationDate,
  }) {
    return AssetModel(
      id: id ?? this.id,
      userId: userId ?? this.userId,
      title: title ?? this.title,
      value: value ?? this.value,
      assetType: assetType ?? this.assetType,
      subType: subType ?? this.subType,
      institution: institution ?? this.institution,
      currency: currency ?? this.currency,
      purchaseValue: purchaseValue ?? this.purchaseValue,
      purchaseDate: purchaseDate ?? this.purchaseDate,
      quantity: quantity ?? this.quantity,
      avgBuyPrice: avgBuyPrice ?? this.avgBuyPrice,
      tags: tags ?? this.tags,
      logoHint: logoHint ?? this.logoHint,
      notes: notes ?? this.notes,
      createdAt: createdAt ?? this.createdAt,
      valuationDate: valuationDate ?? this.valuationDate,
    );
  }
}
