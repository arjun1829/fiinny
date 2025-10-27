// lib/services/ai/tx_extractor.dart
import 'ai_client.dart';

class TxRaw {
  final double amount;
  final String merchant;
  final String desc;
  final String date; // ISO 8601

  TxRaw({
    required this.amount,
    required this.merchant,
    required this.desc,
    required this.date,
  });

  Map<String, dynamic> toJson() => {
        'amount': amount,
        'merchant': merchant,
        'desc': desc,
        'date': date,
      };
}

class TxLabel {
  final String category;
  final String subcategory; // NEW
  final double confidence;
  final String merchantNorm;
  final List<String> labels; // NEW (tags like ["fuel","pos"])
  final String reason; // NEW (LLM short rationale)

  TxLabel({
    required this.category,
    this.subcategory = '',
    required this.confidence,
    required this.merchantNorm,
    this.labels = const [],
    this.reason = '',
  });

  factory TxLabel.fromJson(Map<String, dynamic> j) => TxLabel(
        category: (j['category'] ?? '').toString(),
        subcategory: (j['subcategory'] ?? '').toString(),
        confidence: ((j['confidence'] ?? 0) as num).toDouble(),
        merchantNorm: (j['merchantNorm'] ?? '').toString(),
        labels: (j['labels'] is List)
            ? List<String>.from(j['labels'])
            : const [],
        reason: (j['reason'] ?? '').toString(),
      );
}

class TxExtractor {
  /// Calls backend /extract with minimal unknown tx list.
  static Future<List<TxLabel>> labelUnknown(List<TxRaw> items) async {
    final json = await AiClient.postJson('/extract', {
      'transactions': items.map((e) => e.toJson()).toList(),
      'response_schema': {
        'category': 'string',
        'subcategory': 'string',
        'merchantNorm': 'string',
        'labels': ['string'],
        'confidence': 'number',
        'reason': 'string'
      }
    });
    final list = (json['items'] as List?) ?? const [];
    return list
        .whereType<Map>()
        .map((e) => TxLabel.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }
}
