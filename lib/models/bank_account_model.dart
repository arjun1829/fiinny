import 'package:flutter/foundation.dart';

@immutable
class BankAccountModel {
  final String id; // usually "BANKNAME-LAST4"
  final String bankName;
  final String last4Digits;
  final double? currentBalance;
  final DateTime? balanceUpdatedAt;
  final String? accountType; // Savings, Current, OD

  const BankAccountModel({
    required this.id,
    required this.bankName,
    required this.last4Digits,
    this.currentBalance,
    this.balanceUpdatedAt,
    this.accountType,
  });

  factory BankAccountModel.fromJson(Map<String, dynamic> json) {
    return BankAccountModel(
      id: json['id'] ?? '',
      bankName: json['bankName'] ?? '',
      last4Digits: json['last4Digits'] ?? '',
      currentBalance: json['currentBalance'] is num
          ? (json['currentBalance'] as num).toDouble()
          : null,
      balanceUpdatedAt: json['balanceUpdatedAt'] != null
          ? DateTime.tryParse(json['balanceUpdatedAt'])
          : null,
      accountType: json['accountType'],
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'bankName': bankName,
        'last4Digits': last4Digits,
        'currentBalance': currentBalance,
        'balanceUpdatedAt': balanceUpdatedAt?.toIso8601String(),
        'accountType': accountType,
      };

  BankAccountModel copyWith({
    String? id,
    String? bankName,
    String? last4Digits,
    double? currentBalance,
    DateTime? balanceUpdatedAt,
    String? accountType,
  }) {
    return BankAccountModel(
      id: id ?? this.id,
      bankName: bankName ?? this.bankName,
      last4Digits: last4Digits ?? this.last4Digits,
      currentBalance: currentBalance ?? this.currentBalance,
      balanceUpdatedAt: balanceUpdatedAt ?? this.balanceUpdatedAt,
      accountType: accountType ?? this.accountType,
    );
  }
}
