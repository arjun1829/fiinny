import 'package:cloud_firestore/cloud_firestore.dart';

class IncomeItem {
  final String id;
  final String type;
  final double amount;
  final String note;
  final DateTime date;
  final String source;

  // Existing UI/meta
  final String? imageUrl;
  final String? label;
  final String? bankLogo;

  // 🔗 Optional parity with expenses (nice to have for grouping)
  final String? category; // e.g., "Income", "Salary", "Refund"

  // 🧠 Fiinnny Brain (all optional; written after parsing)
  final Map<String, dynamic>? brainMeta;   // employer, recurringKey, etc.
  final double? confidence;                // 0..1
  final List<String>? tags;                // ["fixed_income","refund","cashback",...]

  IncomeItem({
    required this.id,
    required this.type,
    required this.amount,
    required this.note,
    required this.date,
    required this.source,
    this.imageUrl,
    this.label,
    this.bankLogo,
    this.category,
    this.brainMeta,
    this.confidence,
    this.tags,
  });

  factory IncomeItem.fromJson(Map<String, dynamic> json) {
    return IncomeItem(
      id: json['id'] ?? '',
      type: json['type'] ?? '',
      amount: (json['amount'] as num?)?.toDouble() ?? 0.0,
      note: json['note'] ?? '',
      date: (json['date'] is Timestamp)
          ? (json['date'] as Timestamp).toDate()
          : DateTime.tryParse(json['date']?.toString() ?? '') ?? DateTime.now(),
      source: json['source'] ?? '',
      imageUrl: json['imageUrl'],
      label: json['label'],
      bankLogo: json['bankLogo'],
      category: json['category'],
      brainMeta: (json['brainMeta'] as Map?)?.cast<String, dynamic>(),
      confidence: (json['confidence'] as num?)?.toDouble(),
      tags: (json['tags'] is List) ? List<String>.from(json['tags']) : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'type': type,
    'amount': amount,
    'note': note,
    'date': Timestamp.fromDate(date),
    'source': source,
    if (imageUrl != null) 'imageUrl': imageUrl,
    if (label != null) 'label': label,
    'bankLogo': bankLogo,
    if (category != null) 'category': category,
    if (brainMeta != null) 'brainMeta': brainMeta,
    if (confidence != null) 'confidence': confidence,
    if (tags != null) 'tags': tags,
  };

  IncomeItem copyWith({
    String? id,
    String? type,
    double? amount,
    String? note,
    DateTime? date,
    String? source,
    String? imageUrl,
    String? label,
    String? bankLogo,
    String? category,
    Map<String, dynamic>? brainMeta,
    double? confidence,
    List<String>? tags,
  }) {
    return IncomeItem(
      id: id ?? this.id,
      type: type ?? this.type,
      amount: amount ?? this.amount,
      note: note ?? this.note,
      date: date ?? this.date,
      source: source ?? this.source,
      imageUrl: imageUrl ?? this.imageUrl,
      label: label ?? this.label,
      bankLogo: bankLogo ?? this.bankLogo,
      category: category ?? this.category,
      brainMeta: brainMeta ?? this.brainMeta,
      confidence: confidence ?? this.confidence,
      tags: tags ?? this.tags,
    );
  }

  factory IncomeItem.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return IncomeItem(
      id: doc.id,
      type: data['type'] ?? '',
      amount: (data['amount'] as num?)?.toDouble() ?? 0.0,
      note: data['note'] ?? '',
      date: (data['date'] is Timestamp)
          ? (data['date'] as Timestamp).toDate()
          : DateTime.tryParse(data['date']?.toString() ?? '') ?? DateTime.now(),
      source: data['source'] ?? '',
      imageUrl: data['imageUrl'],
      label: data['label'],
      bankLogo: data['bankLogo'],
      category: data['category'],
      brainMeta: (data['brainMeta'] as Map?)?.cast<String, dynamic>(),
      confidence: (data['confidence'] as num?)?.toDouble(),
      tags: (data['tags'] is List) ? List<String>.from(data['tags']) : null,
    );
  }
}
