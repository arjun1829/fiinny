// lib/services/ai/tx_extractor.dart
import 'dart:async';

import 'ai_client.dart';

class TxRaw {
  final double amount;
  final String currency; // NEW
  final String regionCode; // NEW
  final String merchant;
  final String desc;
  final String date; // ISO 8601

  TxRaw({
    required this.amount,
    required this.currency,
    required this.regionCode,
    required this.merchant,
    required this.desc,
    required this.date,
  });

  Map<String, dynamic> toJson() => {
        'amount': amount,
        'currency': currency,
        'regionCode': regionCode,
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
    try {
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
      }).timeout(const Duration(seconds: 6));
      final list = (json['items'] as List?) ?? const [];
      return list
          .whereType<Map>()
          .map((e) => TxLabel.fromJson(Map<String, dynamic>.from(e)))
          .toList();
    } catch (_) {
      return const <TxLabel>[];
    }
  }
}

class TxReview {
  final bool keep;
  final double confidence;
  final String reason;

  TxReview({required this.keep, required this.confidence, required this.reason});

  factory TxReview.fromJson(Map<String, dynamic> j) => TxReview(
        keep: (j['keep'] ?? false) == true,
        confidence: ((j['confidence'] ?? 0) as num).toDouble(),
        reason: (j['reason'] ?? '').toString(),
      );
}

class TxReviewer {
  /// Ask LLM to judge whether a finding is valid enough to show.
  /// [type] ∈ {'hidden_fee','intl_spend','subscription','loan'}
  static Future<TxReview> reviewFinding({
    required String type,
    required String text,
    double? amount,
    String? currency,
    String? merchant,
    Map<String, dynamic>? extra,
  }) async {
    try {
      final payload = {
        'type': type,
        'text': text,
        if (amount != null) 'amount': amount,
        if (currency != null) 'currency': currency,
        if (merchant != null && merchant.isNotEmpty) 'merchant': merchant,
        'extra': extra ?? {},
      };
      final json = await AiClient.postJson('/diagnosis/review', payload)
          .timeout(const Duration(seconds: 7));
      return TxReview.fromJson(Map<String, dynamic>.from(json));
    } catch (_) {
      return TxReview(keep: false, confidence: 0, reason: 'llm_error');
    }
  }
}
