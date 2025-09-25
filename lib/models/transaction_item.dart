// lib/models/transaction_item.dart

import 'package:cloud_firestore/cloud_firestore.dart';

enum TransactionType { credit, debit }

DateTime _parseDate(dynamic v) {
  if (v == null) return DateTime.now();
  if (v is DateTime) return v;
  if (v is Timestamp) return v.toDate();
  if (v is int) return DateTime.fromMillisecondsSinceEpoch(v);
  if (v is String) return DateTime.tryParse(v) ?? DateTime.now();
  return DateTime.now();
}

double? _toDoubleOrNull(dynamic v) {
  if (v == null) return null;
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v);
  return null;
}

int? _toIntOrNull(dynamic v) {
  if (v == null) return null;
  if (v is num) return v.toInt();
  if (v is String) return int.tryParse(v);
  return null;
}

class TransactionItem {
  // Core fields (existing)
  final String? id; // Optional, for Firestore/DB usage
  final TransactionType type;
  final double amount;
  final String note;
  final DateTime date;
  final String category;
  final String? source;   // e.g. "gmail", "manual" etc
  final String? bankLogo; // path to logo asset, e.g. assets/images/banks/hdfc.png

  // --- NEW: AI suggested classification (all optional/nullable) ---
  /// e.g. "Food & Dining"
  final String? suggestedCategory;

  /// e.g. "Food Delivery"
  final String? suggestedSubcategory;

  /// e.g. "Zomato"
  final String? suggestedMerchant;

  /// 0.0 - 1.0
  final double? suggestedConfidence;

  /// model/source identifier (e.g., "oracle-groq")
  final String? suggestedBy;

  /// latency reported by the model (ms)
  final int? suggestedLatencyMs;

  /// when the suggestion was written
  final DateTime? suggestedAt;

  TransactionItem({
    this.id,
    required this.type,
    required this.amount,
    required this.note,
    required this.date,
    required this.category,
    this.source,
    this.bankLogo,

    // NEW suggested* fields
    this.suggestedCategory,
    this.suggestedSubcategory,
    this.suggestedMerchant,
    this.suggestedConfidence,
    this.suggestedBy,
    this.suggestedLatencyMs,
    this.suggestedAt,
  });

  // --- For SQLite / generic maps ---
  Map<String, dynamic> toMap() {
    final map = <String, dynamic>{
      'id': id,
      'type': type == TransactionType.credit ? 'credit' : 'debit',
      'amount': amount,
      'note': note,
      'date': date.toIso8601String(),
      'category': category,
      'source': source,
      'bankLogo': bankLogo,
      // suggested* (flat, additive)
      'suggestedCategory': suggestedCategory,
      'suggestedSubcategory': suggestedSubcategory,
      'suggestedMerchant': suggestedMerchant,
      'suggestedConfidence': suggestedConfidence,
      'suggestedBy': suggestedBy,
      'suggestedLatencyMs': suggestedLatencyMs,
      'suggestedAt': suggestedAt?.toIso8601String(),
    };

    // remove nulls to keep payload tidy
    map.removeWhere((_, v) => v == null);
    return map;
  }

  factory TransactionItem.fromMap(Map<String, dynamic> map) {
    final rawType = (map['type'] ?? '').toString().toLowerCase();
    return TransactionItem(
      id: map['id']?.toString(),
      type: rawType == 'credit' ? TransactionType.credit : TransactionType.debit,
      amount: (map['amount'] as num).toDouble(),
      note: (map['note'] ?? '').toString(),
      date: _parseDate(map['date']),
      category: (map['category'] ?? 'General').toString(),
      source: map['source']?.toString(),
      bankLogo: map['bankLogo']?.toString(),

      // suggested*
      suggestedCategory: map['suggestedCategory']?.toString(),
      suggestedSubcategory: map['suggestedSubcategory']?.toString(),
      suggestedMerchant: map['suggestedMerchant']?.toString(),
      suggestedConfidence: _toDoubleOrNull(map['suggestedConfidence']),
      suggestedBy: map['suggestedBy']?.toString(),
      suggestedLatencyMs: _toIntOrNull(map['suggestedLatencyMs']),
      suggestedAt: _parseDate(map['suggestedAt']),
    );
  }

  // --- For Firestore/JSON ---
  Map<String, dynamic> toJson() => toMap();

  factory TransactionItem.fromJson(Map<String, dynamic> json) =>
      TransactionItem.fromMap(json);

  // --- CopyWith ---
  TransactionItem copyWith({
    String? id,
    TransactionType? type,
    double? amount,
    String? note,
    DateTime? date,
    String? category,
    String? source,
    String? bankLogo,

    // suggested*
    String? suggestedCategory,
    String? suggestedSubcategory,
    String? suggestedMerchant,
    double? suggestedConfidence,
    String? suggestedBy,
    int? suggestedLatencyMs,
    DateTime? suggestedAt,
  }) {
    return TransactionItem(
      id: id ?? this.id,
      type: type ?? this.type,
      amount: amount ?? this.amount,
      note: note ?? this.note,
      date: date ?? this.date,
      category: category ?? this.category,
      source: source ?? this.source,
      bankLogo: bankLogo ?? this.bankLogo,
      suggestedCategory: suggestedCategory ?? this.suggestedCategory,
      suggestedSubcategory: suggestedSubcategory ?? this.suggestedSubcategory,
      suggestedMerchant: suggestedMerchant ?? this.suggestedMerchant,
      suggestedConfidence: suggestedConfidence ?? this.suggestedConfidence,
      suggestedBy: suggestedBy ?? this.suggestedBy,
      suggestedLatencyMs: suggestedLatencyMs ?? this.suggestedLatencyMs,
      suggestedAt: suggestedAt ?? this.suggestedAt,
    );
  }
}
