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
  final double confidence;
  final String merchantNorm;

  TxLabel({
    required this.category,
    required this.confidence,
    required this.merchantNorm,
  });
}

class TxExtractor {
  /// Call the backend /extract with a minimal list of unknown transactions.
  static Future<List<TxLabel>> labelUnknown(List<TxRaw> items) async {
    final json =
        await AiClient.postJson('/extract', {'transactions': items.map((e) => e.toJson()).toList()});
    final list = (json['items'] as List? ?? []);
    return list
        .map((e) => TxLabel(
              category: (e['category'] ?? 'Other').toString(),
              confidence: (e['confidence'] ?? 0.0).toDouble(),
              merchantNorm: (e['merchant_norm'] ?? '').toString(),
            ))
        .toList();
  }
}
