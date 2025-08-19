// models/bill_model.dart

class BillModel {
  final String id; // Unique per bill (billType+name+date or Firestore ID)
  final String billType; // "EMI", "Rent", "Utility", etc.
  final String name;     // "ICICI EMI", "Electricity", etc.

  DateTime dueDate;
  double amount;
  bool isPaid;
  DateTime? paidDate;

  String? notes;
  String? recurrence; // "monthly", "yearly", etc.

  BillModel({
    required this.id,
    required this.billType,
    required this.name,
    required this.dueDate,
    required this.amount,
    this.isPaid = false,
    this.paidDate,
    this.notes,
    this.recurrence,
  });

  factory BillModel.fromJson(Map<String, dynamic> json) {
    return BillModel(
      id: json['id'],
      billType: json['billType'],
      name: json['name'],
      dueDate: DateTime.parse(json['dueDate']),
      amount: (json['amount'] as num).toDouble(),
      isPaid: json['isPaid'] ?? false,
      paidDate: json['paidDate'] != null ? DateTime.parse(json['paidDate']) : null,
      notes: json['notes'],
      recurrence: json['recurrence'],
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'billType': billType,
    'name': name,
    'dueDate': dueDate.toIso8601String(),
    'amount': amount,
    'isPaid': isPaid,
    'paidDate': paidDate?.toIso8601String(),
    'notes': notes,
    'recurrence': recurrence,
  };

  int daysToDue() => dueDate.difference(DateTime.now()).inDays;

  bool get isOverdue => !isPaid && DateTime.now().isAfter(dueDate);
}
