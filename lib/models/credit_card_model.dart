import 'package:flutter/foundation.dart';

/// Optional: PDF password formats (do NOT store the actual password)
enum PdfPassFormat {
  none,
  first4name_ddmm, // e.g., ARJU + 2901
  first4name_ddmmyyyy, // e.g., ARJU + 29011999
  dob_ddmm, // 2901
  dob_ddmmyyyy, // 29011999
  issuer_last4, // bank + last4 or just last4 depending on issuer
  custom, // user enters a custom hint; backend derives
}

String pdfPassFormatToString(PdfPassFormat f) => f.toString().split('.').last;
PdfPassFormat pdfPassFormatFromString(String? v) {
  switch (v) {
    case 'first4name_ddmm':
      return PdfPassFormat.first4name_ddmm;
    case 'first4name_ddmmyyyy':
      return PdfPassFormat.first4name_ddmmyyyy;
    case 'dob_ddmm':
      return PdfPassFormat.dob_ddmm;
    case 'dob_ddmmyyyy':
      return PdfPassFormat.dob_ddmmyyyy;
    case 'issuer_last4':
      return PdfPassFormat.issuer_last4;
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
  final double? creditLimit; // latest seen
  final double? availableCredit; // latest seen
  final bool? autopayEnabled;
  final List<String>? issuerEmails; // whitelisted senders for this card

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
    this.autopayEnabled,
    this.issuerEmails,
    this.pdfPassFormat,
    this.pdfPassHintCustom,
  });

  factory CreditCardModel.fromJson(Map<String, dynamic> json) {
    DateTime? _parseDate(dynamic value) {
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
      statementDate: _parseDate(json['statementDate']),
      dueDate:
          _parseDate(json['dueDate']) ?? _parseDate(json['nextDueDate']) ?? DateTime.now(),
      totalDue: (json['totalDue'] ?? 0).toDouble(),
      minDue: (json['minDue'] ?? 0).toDouble(),
      isPaid: json['isPaid'] ?? false,
      paidDate: _parseDate(json['paidDate']),
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
      autopayEnabled: json['autopayEnabled'],
      issuerEmails: (json['issuerEmails'] is List)
          ? (json['issuerEmails'] as List).map((e) => e.toString()).toList()
          : null,
      pdfPassFormat: pdfPassFormatFromString(json['pdfPassFormat'] as String?),
      pdfPassHintCustom: json['pdfPassHintCustom'],
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
        'autopayEnabled': autopayEnabled,
        'issuerEmails': issuerEmails,
        'pdfPassFormat': pdfPassFormatToString(pdfPassFormat ?? PdfPassFormat.none),
        'pdfPassHintCustom': pdfPassHintCustom,
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
    bool? autopayEnabled,
    List<String>? issuerEmails,
    PdfPassFormat? pdfPassFormat,
    String? pdfPassHintCustom,
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
      autopayEnabled: autopayEnabled ?? this.autopayEnabled,
      issuerEmails: issuerEmails ?? this.issuerEmails,
      pdfPassFormat: pdfPassFormat ?? this.pdfPassFormat,
      pdfPassHintCustom: pdfPassHintCustom ?? this.pdfPassHintCustom,
    );
  }
}
