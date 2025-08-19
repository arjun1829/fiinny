// models/credit_card_model.dart

import 'package:flutter/foundation.dart';

@immutable
class CreditCardModel {
  final String id; // Unique ID for card
  final String bankName;
  final String cardType; // "Visa", "Mastercard", "Rupay", etc.
  final String last4Digits;
  final String cardholderName;

  final DateTime? statementDate;
  final DateTime dueDate;
  final double totalDue;
  final double minDue;

  final bool isPaid; // True if bill paid for this cycle
  final DateTime? paidDate;

  // Optional fields
  final String? cardAlias; // e.g. "My HDFC Card"
  final String? rewardsInfo;

  const CreditCardModel({
    required this.id,
    required this.bankName,
    required this.cardType,
    required this.last4Digits,
    required this.cardholderName,
    this.statementDate,
    required this.dueDate,
    required this.totalDue,
    required this.minDue,
    this.isPaid = false,
    this.paidDate,
    this.cardAlias,
    this.rewardsInfo,
  });

  // JSON Serialization/Deserialization
  factory CreditCardModel.fromJson(Map<String, dynamic> json) {
    return CreditCardModel(
      id: json['id'] ?? '',
      bankName: json['bankName'] ?? '',
      cardType: json['cardType'] ?? '',
      last4Digits: json['last4Digits'] ?? '',
      cardholderName: json['cardholderName'] ?? '',
      statementDate: json['statementDate'] != null
          ? DateTime.tryParse(json['statementDate'])
          : null,
      dueDate: json['dueDate'] != null
          ? DateTime.tryParse(json['dueDate']) ?? DateTime.now()
          : DateTime.now(),
      totalDue: (json['totalDue'] ?? 0).toDouble(),
      minDue: (json['minDue'] ?? 0).toDouble(),
      isPaid: json['isPaid'] ?? false,
      paidDate: json['paidDate'] != null
          ? DateTime.tryParse(json['paidDate'])
          : null,
      cardAlias: json['cardAlias'],
      rewardsInfo: json['rewardsInfo'],
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'bankName': bankName,
    'cardType': cardType,
    'last4Digits': last4Digits,
    'cardholderName': cardholderName,
    'statementDate': statementDate?.toIso8601String(),
    'dueDate': dueDate.toIso8601String(),
    'totalDue': totalDue,
    'minDue': minDue,
    'isPaid': isPaid,
    'paidDate': paidDate?.toIso8601String(),
    'cardAlias': cardAlias,
    'rewardsInfo': rewardsInfo,
  };

  // Helper: Days left to due
  int daysToDue() {
    return dueDate.difference(DateTime.now()).inDays;
  }

  // Helper: Check if overdue
  bool get isOverdue => !isPaid && DateTime.now().isAfter(dueDate);
}
