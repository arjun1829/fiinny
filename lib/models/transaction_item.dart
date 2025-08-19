enum TransactionType { credit, debit }

class TransactionItem {
  final String? id; // Optional, for Firestore/DB usage
  final TransactionType type;
  final double amount;
  final String note;
  final DateTime date;
  final String category;
  final String? source;   // e.g. "gmail", "manual" etc
  final String? bankLogo; // ✅ New: path to logo asset, e.g. assets/images/banks/hdfc.png

  TransactionItem({
    this.id,
    required this.type,
    required this.amount,
    required this.note,
    required this.date,
    required this.category,
    this.source,
    this.bankLogo, // ✅ New
  });

  // --- For SQLite / generic maps ---
  Map<String, dynamic> toMap() => {
    'id': id,
    'type': type == TransactionType.credit ? 'credit' : 'debit',
    'amount': amount,
    'note': note,
    'date': date.toIso8601String(),
    'category': category,
    'source': source,
    'bankLogo': bankLogo, // ✅ New
  };

  factory TransactionItem.fromMap(Map<String, dynamic> map) => TransactionItem(
    id: map['id']?.toString(),
    type: (map['type'] ?? '') == 'credit'
        ? TransactionType.credit
        : TransactionType.debit,
    amount: (map['amount'] as num).toDouble(),
    note: map['note'] ?? '',
    date: DateTime.parse(map['date']),
    category: map['category'] ?? 'General',
    source: map['source'],
    bankLogo: map['bankLogo'], // ✅ New
  );

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
    String? bankLogo, // ✅ New
  }) {
    return TransactionItem(
      id: id ?? this.id,
      type: type ?? this.type,
      amount: amount ?? this.amount,
      note: note ?? this.note,
      date: date ?? this.date,
      category: category ?? this.category,
      source: source ?? this.source,
      bankLogo: bankLogo ?? this.bankLogo, // ✅ New
    );
  }
}
