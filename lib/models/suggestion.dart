class Suggestion {
  final String id;
  final String merchant;
  final String type; // 'subscription' | 'recurring'
  final String frequency; // 'monthly' | 'quarterly' | 'yearly' | 'unknown'
  final double? amount;
  final DateTime? anchorDate;
  final double confidence; // 0..1
  final List<String> sampleTxnIds;

  const Suggestion({
    required this.id,
    required this.merchant,
    required this.type,
    required this.frequency,
    this.amount,
    this.anchorDate,
    required this.confidence,
    this.sampleTxnIds = const [],
  });
}
