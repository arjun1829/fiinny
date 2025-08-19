import 'package:flutter/material.dart';

class TransactionModel {
  int? id;
  double amount;
  String type; // 'income' or 'expense'
  String category;
  DateTime date;
  String? note;
  String? source;   // 'manual', 'email', 'sms', etc.
  String? bankLogo; // ✅ New: Path to bank logo asset or URL

  TransactionModel({
    this.id,
    required this.amount,
    required this.type,
    required this.category,
    required this.date,
    this.note,
    this.source,
    this.bankLogo, // ✅ New
  });

  Map<String, dynamic> toMap() => {
    'id': id,
    'amount': amount,
    'type': type,
    'category': category,
    'date': date.toIso8601String(),
    'note': note,
    'source': source,
    'bankLogo': bankLogo, // ✅ New
  };

  static TransactionModel fromMap(Map<String, dynamic> map) => TransactionModel(
    id: map['id'],
    amount: (map['amount'] is int)
        ? (map['amount'] as int).toDouble()
        : (map['amount'] as num).toDouble(),
    type: map['type'],
    category: map['category'],
    date: DateTime.parse(map['date']),
    note: map['note'],
    source: map['source'],
    bankLogo: map['bankLogo'], // ✅ New
  );

  TransactionModel copyWith({
    int? id,
    double? amount,
    String? type,
    String? category,
    DateTime? date,
    String? note,
    String? source,
    String? bankLogo, // ✅ New
  }) {
    return TransactionModel(
      id: id ?? this.id,
      amount: amount ?? this.amount,
      type: type ?? this.type,
      category: category ?? this.category,
      date: date ?? this.date,
      note: note ?? this.note,
      source: source ?? this.source,
      bankLogo: bankLogo ?? this.bankLogo, // ✅ New
    );
  }
}
