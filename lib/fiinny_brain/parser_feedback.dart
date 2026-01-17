import 'package:cloud_firestore/cloud_firestore.dart';

/// Represents a user correction to a merchant/transaction classification.
class MerchantCorrection {
  final String? name; // Corrected merchant name
  final String? category; // Corrected category
  final String? subcategory; // Corrected subcategory
  final bool isJunk; // If true, this source string is junk/spam

  const MerchantCorrection({
    this.name,
    this.category,
    this.subcategory,
    this.isJunk = false,
  });

  Map<String, dynamic> toMap() => {
        if (name != null) 'name': name,
        if (category != null) 'category': category,
        if (subcategory != null) 'subcategory': subcategory,
        'isJunk': isJunk,
      };

  factory MerchantCorrection.fromMap(Map<String, dynamic> map) {
    return MerchantCorrection(
      name: map['name'] as String?,
      category: map['category'] as String?,
      subcategory: map['subcategory'] as String?,
      isJunk: map['isJunk'] as bool? ?? false,
    );
  }
}

/// A feedback record keyed by a hash of the raw merchant string.
class ParserFeedback {
  final String id; // Hash of rawKey
  final String rawKey; // The raw merchant string/guess
  final MerchantCorrection correction;
  final DateTime updatedAt;

  const ParserFeedback({
    required this.id,
    required this.rawKey,
    required this.correction,
    required this.updatedAt,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'rawKey': rawKey,
        'correction': correction.toMap(),
        'updatedAt': Timestamp.fromDate(updatedAt),
      };

  factory ParserFeedback.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return ParserFeedback(
      id: doc.id,
      rawKey: data['rawKey'] ?? '',
      correction: MerchantCorrection.fromMap(
          data['correction'] as Map<String, dynamic>? ?? {}),
      updatedAt: (data['updatedAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
    );
  }
}
