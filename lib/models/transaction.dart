import '../core/ingestion/raw_transaction_event.dart';

class Transaction {
  final String id;
  final DateTime date;
  final String merchant;
  final double amount; // In base currency
  final String description;
  
  // ── Global Fields ──────────────────────────────────────────────────────────
  final String regionCode; // e.g., 'IN', 'US'
  final String baseCurrency; // e.g., 'INR', 'USD'
  final String originalCurrency; // e.g., 'USD' (if spent abroad)
  final double amountOriginal;
  final double fxRate; // amount = amountOriginal * fxRate
  
  final List<TransactionSourceChannel> sourceChannels;
  final String? instrumentType; // 'CC', 'DC', 'UPI'
  final String? instrumentId; // Internal ID of the account/card
  
  final String category;
  final String subcategory;
  final List<String> tags;
  
  final Map<String, dynamic> metadata;

  const Transaction({
    required this.id,
    required this.date,
    required this.merchant,
    required this.amount,
    this.description = '',
    
    // Defaults for backward compatibility
    this.regionCode = 'IN',
    this.baseCurrency = 'INR',
    this.originalCurrency = 'INR',
    double? amountOriginal,
    this.fxRate = 1.0,
    this.sourceChannels = const [],
    this.instrumentType,
    this.instrumentId,
    this.category = 'Uncategorized',
    this.subcategory = '',
    this.tags = const [],
    this.metadata = const {},
  }) : amountOriginal = amountOriginal ?? amount;

  // ── Helpers ────────────────────────────────────────────────────────────────

  bool get isForeignTransaction => baseCurrency != originalCurrency;

  Transaction copyWith({
    String? id,
    DateTime? date,
    String? merchant,
    double? amount,
    String? description,
    String? regionCode,
    String? baseCurrency,
    String? originalCurrency,
    double? amountOriginal,
    double? fxRate,
    List<TransactionSourceChannel>? sourceChannels,
    String? instrumentType,
    String? instrumentId,
    String? category,
    String? subcategory,
    List<String>? tags,
    Map<String, dynamic>? metadata,
  }) {
    return Transaction(
      id: id ?? this.id,
      date: date ?? this.date,
      merchant: merchant ?? this.merchant,
      amount: amount ?? this.amount,
      description: description ?? this.description,
      regionCode: regionCode ?? this.regionCode,
      baseCurrency: baseCurrency ?? this.baseCurrency,
      originalCurrency: originalCurrency ?? this.originalCurrency,
      amountOriginal: amountOriginal ?? this.amountOriginal,
      fxRate: fxRate ?? this.fxRate,
      sourceChannels: sourceChannels ?? this.sourceChannels,
      instrumentType: instrumentType ?? this.instrumentType,
      instrumentId: instrumentId ?? this.instrumentId,
      category: category ?? this.category,
      subcategory: subcategory ?? this.subcategory,
      tags: tags ?? this.tags,
      metadata: metadata ?? this.metadata,
    );
  }
}
