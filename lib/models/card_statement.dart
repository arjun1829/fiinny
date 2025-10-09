//lib/models/card_statement.dart
import 'package:cloud_firestore/cloud_firestore.dart';

class CardStatement {
  final String id;           // stmt_<issuer>_<last4>_<yyyymm>
  final String issuer;       // AXIS, HDFC, ICICI...
  final String last4;
  final DateTime statementDate;
  final DateTime? periodStart;
  final DateTime? periodEnd;
  final DateTime? dueDate;
  final double? totalDue;
  final double? minDue;
  final double? creditLimit;
  final double? availableCredit;
  final Map<String, double>? components; // {newSpends, payments, interest, fees, tax, adjustments}

  CardStatement({
    required this.id, required this.issuer, required this.last4, required this.statementDate,
    this.periodStart, this.periodEnd, this.dueDate, this.totalDue, this.minDue,
    this.creditLimit, this.availableCredit, this.components,
  });

  Map<String, dynamic> toJson() => {
    'id': id,
    'issuer': issuer,
    'last4': last4,
    'statementDate': Timestamp.fromDate(statementDate),
    'periodStart': periodStart != null ? Timestamp.fromDate(periodStart!) : null,
    'periodEnd': periodEnd != null ? Timestamp.fromDate(periodEnd!) : null,
    'dueDate': dueDate != null ? Timestamp.fromDate(dueDate!) : null,
    'totalDue': totalDue,
    'minDue': minDue,
    'creditLimit': creditLimit,
    'availableCredit': availableCredit,
    'components': components,
  };

  static CardStatement fromJson(Map<String, dynamic> j) => CardStatement(
    id: j['id'],
    issuer: j['issuer'],
    last4: j['last4'],
    statementDate: (j['statementDate'] as Timestamp).toDate(),
    periodStart: j['periodStart'] != null ? (j['periodStart'] as Timestamp).toDate() : null,
    periodEnd: j['periodEnd'] != null ? (j['periodEnd'] as Timestamp).toDate() : null,
    dueDate: j['dueDate'] != null ? (j['dueDate'] as Timestamp).toDate() : null,
    totalDue: (j['totalDue'] as num?)?.toDouble(),
    minDue: (j['minDue'] as num?)?.toDouble(),
    creditLimit: (j['creditLimit'] as num?)?.toDouble(),
    availableCredit: (j['availableCredit'] as num?)?.toDouble(),
    components: (j['components'] as Map?)?.map((k, v) => MapEntry(k.toString(), (v as num).toDouble())),
  );
}
