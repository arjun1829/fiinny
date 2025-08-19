import 'package:cloud_firestore/cloud_firestore.dart';

class IncomeItem {
  final String id;
  final String type;
  final double amount;
  final String note;
  final DateTime date;
  final String source;
  final String? imageUrl; // <-- Existing field
  final String? label;
  final String? bankLogo; // ✅ New field for bank logo

  IncomeItem({
    required this.id,
    required this.type,
    required this.amount,
    required this.note,
    required this.date,
    required this.source,
    this.imageUrl,
    this.label,
    this.bankLogo, // ✅ New field
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
      bankLogo: json['bankLogo'], // ✅ New
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
    'bankLogo': bankLogo, // ✅ New
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
    String? bankLogo, // ✅ New
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
      bankLogo: bankLogo ?? this.bankLogo, // ✅ New
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
      bankLogo: data['bankLogo'], // ✅ New
    );
  }
}
