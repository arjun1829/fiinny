//lib/services/ingest/tx_key.dart
/// Create a robust dedupe key across SMS/Gmail/Bank CSV.
/// Includes date (day), amount, instrument + bank + last4/upiTxnId.
String txKey({
  required DateTime date,
  required double amount,
  String? instrument,
  String? bank,
  String? cardLast4,
  String? upiTxnId,
  String? rrn,
  String? counterparty,
}) {
  final d = '${date.year}${date.month.toString().padLeft(2,'0')}${date.day.toString().padLeft(2,'0')}';
  final parts = [
    d,
    amount.toStringAsFixed(2),
    instrument ?? '',
    bank ?? '',
    cardLast4 ?? '',
    upiTxnId ?? rrn ?? '',
    (counterparty ?? '').toUpperCase(),
  ];
  return parts.join('|');
}
