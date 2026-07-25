/// Compact number formatter used across the app for displaying counts.
///
/// Rules:
///   < 1,000       → plain number     (e.g. 542)
///   1,000–999,999 → 1 decimal + K    (e.g. 1.2K, 99.9K)
///   ≥ 1,000,000   → 1 decimal + M    (e.g. 1.1M)
///
/// "Clean" variants drop the decimal when it is .0 (e.g. 2.0K → 2K).
String formatCount(int n) {
  if (n >= 1000000) {
    final v = n / 1000000;
    return v == v.truncateToDouble() ? '${v.toInt()}M' : '${v.toStringAsFixed(1)}M';
  }
  if (n >= 1000) {
    final v = n / 1000;
    return v == v.truncateToDouble() ? '${v.toInt()}K' : '${v.toStringAsFixed(1)}K';
  }
  return '$n';
}
