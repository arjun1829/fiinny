import 'package:flutter/foundation.dart';

/// Optional: PDF password formats (do NOT store the actual password)
enum PdfPassFormat {
  none,
  first4NameDdmm, // e.g., ARJU + 2901
  first4NameDdmmyyyy, // e.g., ARJU + 29011999
  dobDdmm, // 2901
  dobDdmmyyyy, // 29011999
  issuerLast4, // bank + last4 or just last4 depending on issuer
  custom, // user enters a custom hint; backend derives
}

String pdfPassFormatToString(PdfPassFormat f) {
  switch (f) {
    case PdfPassFormat.first4NameDdmm:
      return 'first4name_ddmm';
    case PdfPassFormat.first4NameDdmmyyyy:
      return 'first4name_ddmmyyyy';
    case PdfPassFormat.dobDdmm:
      return 'dob_ddmm';
    case PdfPassFormat.dobDdmmyyyy:
      return 'dob_ddmmyyyy';
    case PdfPassFormat.issuerLast4:
      return 'issuer_last4';
    case PdfPassFormat.custom:
      return 'custom';
    case PdfPassFormat.none:
      return 'none';
  }
}

PdfPassFormat pdfPassFormatFromString(String? v) {
  switch (v) {
    case 'first4name_ddmm':
      return PdfPassFormat.first4NameDdmm;
    case 'first4name_ddmmyyyy':
      return PdfPassFormat.first4NameDdmmyyyy;
    case 'dob_ddmm':
      return PdfPassFormat.dobDdmm;
    case 'dob_ddmmyyyy':
      return PdfPassFormat.dobDdmmyyyy;
    case 'issuer_last4':
      return PdfPassFormat.issuerLast4;
    case 'custom':
      return PdfPassFormat.custom;
    case 'none':
    default:
      return PdfPassFormat.none;
  }
}

@immutable
class CreditCardModel {
  final String id; // Unique ID for card (issuer-last4 or random)
  final String bankName; // Issuer (HDFC, ICICI, Axis, SBI Card, etc.)
  final String cardType; // Visa/Mastercard/Rupay/Amex
  final String last4Digits;
  final String cardholderName;

  // Billing snapshot
  final DateTime? statementDate;
  final DateTime dueDate;
  final double totalDue;
  final double minDue;

  final bool isPaid; // True if bill paid for current cycle
  final DateTime? paidDate;

  // Optional
  final String? cardAlias; // "My HDFC Card"
  final String? rewardsInfo; // aggregated text or points summary

  // v2 additions (all optional/back-compat)
  final double? creditLimit; // latest seen (Total Limit)
  final double? availableCredit; // latest seen (Available Limit)
  final double? rewardPoints; // latest reward balance
  final double?
      lastStatementBalance; // balance from last statement (for repayment logic)
  final List<dynamic>? loanOffers; // raw list of loan offers/promos
  final bool? autopayEnabled;
  final List<String>? issuerEmails; // whitelisted senders for this card

  // State Tracking
  final double?
      currentBalance; // Outstanding State (from "Avl Bal" or "Spent" logic)
  final DateTime? balanceUpdatedAt;
  final DateTime? limitUpdatedAt;

  // PDF unlock config (do not store secrets; this is a format hint only)
  final PdfPassFormat? pdfPassFormat;
  final String? pdfPassHintCustom; // if PdfPassFormat.custom

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
    this.creditLimit,
    this.availableCredit,
    this.rewardPoints,
    this.lastStatementBalance,
    this.loanOffers,
    this.autopayEnabled,
    this.issuerEmails,
    this.pdfPassFormat,
    this.pdfPassHintCustom,
    this.currentBalance,
    this.balanceUpdatedAt,
    this.limitUpdatedAt,
  });

  factory CreditCardModel.fromJson(Map<String, dynamic> json) {
    DateTime? parseDate(dynamic value) {
      if (value == null) return null;
      if (value is DateTime) return value;
      final timestampType = value.runtimeType.toString();
      if (timestampType == 'Timestamp') {
        final toDate = value as dynamic;
        return toDate.toDate() as DateTime;
      }
      if (value is String) return DateTime.tryParse(value);
      return null;
    }

    return CreditCardModel(
      id: json['id'] ?? '',
      bankName: json['bankName'] ?? '',
      cardType: json['cardType'] ?? '',
      last4Digits: json['last4Digits'] ?? '',
      cardholderName: json['cardholderName'] ?? '',
      statementDate: parseDate(json['statementDate']),
      dueDate: parseDate(json['dueDate']) ??
          parseDate(json['nextDueDate']) ??
          DateTime.now(),
      totalDue: (json['totalDue'] ?? 0).toDouble(),
      minDue: (json['minDue'] ?? 0).toDouble(),
      isPaid: json['isPaid'] ?? false,
      paidDate: parseDate(json['paidDate']),
      cardAlias: json['cardAlias'],
      rewardsInfo: json['rewardsInfo'],
      creditLimit: (json['creditLimit'] is int)
          ? (json['creditLimit'] as int).toDouble()
          : (json['creditLimit'] is double)
              ? json['creditLimit']
              : null,
      availableCredit: (json['availableCredit'] is int)
          ? (json['availableCredit'] as int).toDouble()
          : (json['availableCredit'] is double)
              ? json['availableCredit']
              : null,
      rewardPoints: (json['rewardPoints'] is int)
          ? (json['rewardPoints'] as int).toDouble()
          : (json['rewardPoints'] is double)
              ? json['rewardPoints']
              : null,
      lastStatementBalance: (json['lastStatementBalance'] is int)
          ? (json['lastStatementBalance'] as int).toDouble()
          : (json['lastStatementBalance'] is double)
              ? json['lastStatementBalance']
              : null,
      loanOffers: json['loanOffers'] as List<dynamic>?,
      autopayEnabled: json['autopayEnabled'],
      issuerEmails: (json['issuerEmails'] is List)
          ? (json['issuerEmails'] as List).map((e) => e.toString()).toList()
          : null,
      pdfPassFormat: pdfPassFormatFromString(json['pdfPassFormat'] as String?),
      pdfPassHintCustom: json['pdfPassHintCustom'],
      currentBalance: (json['currentBalance'] is int)
          ? (json['currentBalance'] as int).toDouble()
          : (json['currentBalance'] is double)
              ? json['currentBalance']
              : null,
      balanceUpdatedAt: parseDate(json['balanceUpdatedAt']),
      limitUpdatedAt: parseDate(json['limitUpdatedAt']),
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
        'creditLimit': creditLimit,
        'availableCredit': availableCredit,
        'rewardPoints': rewardPoints,
        'lastStatementBalance': lastStatementBalance,
        'loanOffers': loanOffers,
        'autopayEnabled': autopayEnabled,
        'issuerEmails': issuerEmails,
        'pdfPassFormat':
            pdfPassFormatToString(pdfPassFormat ?? PdfPassFormat.none),
        'pdfPassHintCustom': pdfPassHintCustom,
        'currentBalance': currentBalance,
        'balanceUpdatedAt': balanceUpdatedAt?.toIso8601String(),
        'limitUpdatedAt': limitUpdatedAt?.toIso8601String(),
      };

  int daysToDue() => dueDate.difference(DateTime.now()).inDays;
  bool get isOverdue => !isPaid && DateTime.now().isAfter(dueDate);

  CreditCardModel copyWith({
    String? id,
    String? bankName,
    String? cardType,
    String? last4Digits,
    String? cardholderName,
    DateTime? statementDate,
    DateTime? dueDate,
    double? totalDue,
    double? minDue,
    bool? isPaid,
    DateTime? paidDate,
    String? cardAlias,
    String? rewardsInfo,
    double? creditLimit,
    double? availableCredit,
    double? rewardPoints,
    double? lastStatementBalance,
    List<dynamic>? loanOffers,
    bool? autopayEnabled,
    List<String>? issuerEmails,
    PdfPassFormat? pdfPassFormat,
    String? pdfPassHintCustom,
    double? currentBalance,
    DateTime? balanceUpdatedAt,
    DateTime? limitUpdatedAt,
  }) {
    return CreditCardModel(
      id: id ?? this.id,
      bankName: bankName ?? this.bankName,
      cardType: cardType ?? this.cardType,
      last4Digits: last4Digits ?? this.last4Digits,
      cardholderName: cardholderName ?? this.cardholderName,
      statementDate: statementDate ?? this.statementDate,
      dueDate: dueDate ?? this.dueDate,
      totalDue: totalDue ?? this.totalDue,
      minDue: minDue ?? this.minDue,
      isPaid: isPaid ?? this.isPaid,
      paidDate: paidDate ?? this.paidDate,
      cardAlias: cardAlias ?? this.cardAlias,
      rewardsInfo: rewardsInfo ?? this.rewardsInfo,
      creditLimit: creditLimit ?? this.creditLimit,
      availableCredit: availableCredit ?? this.availableCredit,
      rewardPoints: rewardPoints ?? this.rewardPoints,
      lastStatementBalance: lastStatementBalance ?? this.lastStatementBalance,
      loanOffers: loanOffers ?? this.loanOffers,
      autopayEnabled: autopayEnabled ?? this.autopayEnabled,
      issuerEmails: issuerEmails ?? this.issuerEmails,
      pdfPassFormat: pdfPassFormat ?? this.pdfPassFormat,
      pdfPassHintCustom: pdfPassHintCustom ?? this.pdfPassHintCustom,
      currentBalance: currentBalance ?? this.currentBalance,
      balanceUpdatedAt: balanceUpdatedAt ?? this.balanceUpdatedAt,
      limitUpdatedAt: limitUpdatedAt ?? this.limitUpdatedAt,
    );
  }
}
