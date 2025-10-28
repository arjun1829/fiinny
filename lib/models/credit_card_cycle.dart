class CreditCardCycle {
  final String id; // YYYYMM
  final DateTime statementDate;
  final DateTime periodStart;
  final DateTime periodEnd;
  final DateTime dueDate;

  final double totalDue;
  final double minDue;

  // Snapshots from statement
  final double? creditLimitSnapshot;
  final double? availableCreditSnapshot;

  // Reconcile
  final double paidAmount;
  final bool isPredicted;
  final String status; // 'open'|'paid'|'partial'|'overdue'
  final DateTime? lastPaymentAt;

  CreditCardCycle({
    required this.id,
    required this.statementDate,
    required this.periodStart,
    required this.periodEnd,
    required this.dueDate,
    required this.totalDue,
    required this.minDue,
    this.creditLimitSnapshot,
    this.availableCreditSnapshot,
    this.paidAmount = 0,
    this.isPredicted = false,
    this.status = 'open',
    this.lastPaymentAt,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'statementDate': statementDate.toIso8601String(),
        'periodStart': periodStart.toIso8601String(),
        'periodEnd': periodEnd.toIso8601String(),
        'dueDate': dueDate.toIso8601String(),
        'totalDue': totalDue,
        'minDue': minDue,
        'creditLimitSnapshot': creditLimitSnapshot,
        'availableCreditSnapshot': availableCreditSnapshot,
        'paidAmount': paidAmount,
        'isPredicted': isPredicted,
        'status': status,
        'lastPaymentAt': lastPaymentAt?.toIso8601String(),
      };

  static CreditCardCycle fromJson(Map<String, dynamic> m) {
    DateTime _parseDate(dynamic value) {
      if (value is DateTime) return value;
      final type = value.runtimeType.toString();
      if (type == 'Timestamp') {
        final dynamic ts = value;
        return ts.toDate() as DateTime;
      }
      if (value is String) {
        final parsed = DateTime.tryParse(value);
        if (parsed != null) return parsed;
      }
      return DateTime.now();
    }

    return CreditCardCycle(
      id: m['id'] ?? '',
      statementDate: _parseDate(m['statementDate']),
      periodStart: _parseDate(m['periodStart']),
      periodEnd: _parseDate(m['periodEnd']),
      dueDate: _parseDate(m['dueDate']),
      totalDue: (m['totalDue'] ?? 0).toDouble(),
      minDue: (m['minDue'] ?? 0).toDouble(),
      creditLimitSnapshot: (m['creditLimitSnapshot'] is int)
          ? (m['creditLimitSnapshot'] as int).toDouble()
          : (m['creditLimitSnapshot'] is double)
              ? m['creditLimitSnapshot']
              : null,
      availableCreditSnapshot: (m['availableCreditSnapshot'] is int)
          ? (m['availableCreditSnapshot'] as int).toDouble()
          : (m['availableCreditSnapshot'] is double)
              ? m['availableCreditSnapshot']
              : null,
      paidAmount: (m['paidAmount'] ?? 0).toDouble(),
      isPredicted: (m['isPredicted'] ?? false) as bool,
      status: m['status'] ?? 'open',
      lastPaymentAt: m['lastPaymentAt'] != null
          ? DateTime.tryParse(m['lastPaymentAt'])
          : null,
    );
  }
}
