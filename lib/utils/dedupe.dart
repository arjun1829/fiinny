// lib/utils/dedupe.dart
import 'dart:convert';
import 'package:crypto/crypto.dart' as crypto;

/// Produce a stable, source-agnostic tx id for dedupe.
/// Keep input order stable; normalize text; round amount to paise.
String deterministicTxId({
  required String userId,
  required String source,        // 'gmail' | 'sms' | 'manual' | 'upi' ...
  required DateTime ts,          // event time (UTC preferred)
  required String merchant,      // normalized payee/merchant
  required num amount,           // positive number (absolute value)
  String currency = 'INR',
  String? accountId,             // optional: card or bank last4 / masked id
  String? memo,                  // optional: brief memo/category hint
}) {
  String norm(String s) => s.trim().toLowerCase().replaceAll(RegExp(r'\s+'), ' ');
  final payload = [
    userId,
    source,
    ts.toUtc().toIso8601String(),
    norm(merchant),
    (amount.toDouble()).toStringAsFixed(2), // paise precision
    currency.toUpperCase(),
    accountId?.trim() ?? '',
    memo == null ? '' : norm(memo),
  ].join('|');

  return crypto.sha256.convert(utf8.encode(payload)).toString();
}
