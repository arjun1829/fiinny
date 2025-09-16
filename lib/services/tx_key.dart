// lib/services/tx_key.dart

/// Builds a stable, cross-source transaction key so the same event
/// (seen via SMS and/or Gmail) is only stored once.
///
/// We "bucket" the timestamp to a short window so tiny clock/skew
/// differences don’t generate different keys for the same tx.
/// Default bucket = 5 minutes.
///
/// Example key:
///   HDFC|debit|6079|51.00|34871234
String buildTxKey({
  required String? bank,         // e.g. "HDFC" (nullable -> "UNK")
  required double amount,        // parsed amount
  required DateTime time,        // event time (SMS date / Gmail internalDate)
  required String type,          // "debit" | "credit"
  String? last4,                 // optional card/account last4
  int bucketMinutes = 5,
}) {
  final bankCode = (bank ?? 'UNK').toUpperCase();
  final t = _timeBucketId(time, bucketMinutes);
  final l4 = (last4 ?? '').trim();
  final amtNorm = _normalizeAmount(amount);

  return [
    bankCode,
    type.toLowerCase(),
    l4,          // may be empty
    amtNorm,
    t.toString()
  ].join('|');
}

/// Converts a timestamp into a coarse bucket id (e.g., every 5 minutes).
/// Using minutes since epoch keeps the key numeric and compact.
int _timeBucketId(DateTime dt, int bucketMinutes) {
  final ms = dt.millisecondsSinceEpoch;
  final bucketMs = bucketMinutes * 60 * 1000;
  return (ms ~/ bucketMs);
}

/// Normalizes double → fixed 2-decimals string to avoid 51 vs 51.0 churn.
String _normalizeAmount(double v) => v.toStringAsFixed(2);
