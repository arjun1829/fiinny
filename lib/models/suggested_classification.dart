// lib/models/suggested_classification.dart
import 'package:cloud_firestore/cloud_firestore.dart';

class SuggestedClassification {
  final String? category;
  final String? subcategory;
  final String? merchant;
  final double? confidence;      // 0..1
  final String? by;              // model name / source
  final int? latencyMs;          // optional
  final DateTime? at;            // when suggestion was written

  const SuggestedClassification({
    this.category,
    this.subcategory,
    this.merchant,
    this.confidence,
    this.by,
    this.latencyMs,
    this.at,
  });

  Map<String, dynamic> toMap() => {
    'suggestedCategory': category,
    'suggestedSubcategory': subcategory,
    'suggestedMerchant': merchant,
    'suggestedConfidence': confidence,
    'suggestedBy': by,
    'suggestedLatencyMs': latencyMs,
    'suggestedAt': at != null ? Timestamp.fromDate(at!) : null,
  }..removeWhere((k, v) => v == null);

  factory SuggestedClassification.fromMap(Map<String, dynamic>? map) {
    if (map == null) return const SuggestedClassification();
    // Allow both flat tx docs and nested maps:
    final hasFlat = map.containsKey('suggestedCategory') ||
        map.containsKey('suggestedSubcategory') ||
        map.containsKey('suggestedMerchant');

    if (hasFlat) {
      return SuggestedClassification(
        category: map['suggestedCategory'] as String?,
        subcategory: map['suggestedSubcategory'] as String?,
        merchant: map['suggestedMerchant'] as String?,
        confidence: (map['suggestedConfidence'] as num?)?.toDouble(),
        by: map['suggestedBy'] as String?,
        latencyMs: (map['suggestedLatencyMs'] as num?)?.toInt(),
        at: (map['suggestedAt'] is Timestamp)
            ? (map['suggestedAt'] as Timestamp).toDate()
            : (map['suggestedAt'] is DateTime ? map['suggestedAt'] as DateTime : null),
      );
    }

    // If you later choose to nest under "aiSuggestion": { ... }
    final nested = map['aiSuggestion'] as Map<String, dynamic>?;
    if (nested != null) {
      return SuggestedClassification.fromMap(nested);
    }

    return const SuggestedClassification();
  }

  SuggestedClassification copyWith({
    String? category,
    String? subcategory,
    String? merchant,
    double? confidence,
    String? by,
    int? latencyMs,
    DateTime? at,
  }) {
    return SuggestedClassification(
      category: category ?? this.category,
      subcategory: subcategory ?? this.subcategory,
      merchant: merchant ?? this.merchant,
      confidence: confidence ?? this.confidence,
      by: by ?? this.by,
      latencyMs: latencyMs ?? this.latencyMs,
      at: at ?? this.at,
    );
  }
}
