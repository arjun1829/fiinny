class CreditCardPayment {
  final String id;
  final double amount;
  final DateTime date;
  final String source; // 'gmail'|'sms'|'manual'
  final String? ref; // messageId, UPI txn id, etc.

  CreditCardPayment({
    required this.id,
    required this.amount,
    required this.date,
    required this.source,
    this.ref,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'amount': amount,
        'date': date.toIso8601String(),
        'source': source,
        'ref': ref,
      };

  static CreditCardPayment fromJson(Map<String, dynamic> m) => CreditCardPayment(
        id: m['id'] ?? '',
        amount: (m['amount'] ?? 0).toDouble(),
        date: _parseDate(m['date']),
        source: m['source'] ?? 'manual',
        ref: m['ref'],
      );
}

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
