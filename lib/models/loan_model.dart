class LoanModel {
  final String? id; // Optional for new loans (auto by Firestore)
  final String userId;
  final String title;
  final double amount;
  final String lenderType;
  final DateTime? startDate;
  final DateTime? dueDate;
  final double? interestRate;
  final double? emi;
  final String? note;
  final bool isClosed;
  final DateTime? createdAt;

  LoanModel({
    this.id,
    required this.userId,
    required this.title,
    required this.amount,
    required this.lenderType,
    this.startDate,
    this.dueDate,
    this.interestRate,
    this.emi,
    this.note,
    this.isClosed = false,
    this.createdAt,
  });

  factory LoanModel.fromJson(Map<String, dynamic> json, [String? id]) {
    return LoanModel(
      id: id,
      userId: json['userId'] ?? '',
      title: json['title'] ?? '',
      amount: (json['amount'] is int)
          ? (json['amount'] as int).toDouble()
          : (json['amount'] is double)
          ? json['amount']
          : double.tryParse(json['amount']?.toString() ?? '') ?? 0.0,
      lenderType: json['lenderType'] ?? '',
      startDate: json['startDate'] != null
          ? DateTime.tryParse(json['startDate'].toString())
          : null,
      dueDate: json['dueDate'] != null
          ? DateTime.tryParse(json['dueDate'].toString())
          : null,
      interestRate: json['interestRate'] != null
          ? (json['interestRate'] is int
          ? (json['interestRate'] as int).toDouble()
          : (json['interestRate'] is double
          ? json['interestRate']
          : double.tryParse(json['interestRate'].toString()) ?? 0.0))
          : null,
      emi: json['emi'] != null
          ? (json['emi'] is int
          ? (json['emi'] as int).toDouble()
          : (json['emi'] is double
          ? json['emi']
          : double.tryParse(json['emi'].toString()) ?? 0.0))
          : null,
      note: json['note'] ?? '',
      isClosed: json['isClosed'] ?? false,
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString())
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'userId': userId,
    'title': title,
    'amount': amount,
    'lenderType': lenderType,
    'startDate': startDate?.toIso8601String(),
    'dueDate': dueDate?.toIso8601String(),
    'interestRate': interestRate,
    'emi': emi,
    'note': note,
    'isClosed': isClosed,
    'createdAt': createdAt?.toIso8601String(),
  };
}
