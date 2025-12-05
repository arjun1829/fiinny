class AnalyticsCardGroup {
  final String bank;
  final String instrument;
  final String? last4;
  final String? network;
  final double debitTotal;
  final double creditTotal;
  final int txCount;

  AnalyticsCardGroup({
    required this.bank,
    required this.instrument,
    required this.last4,
    required this.network,
    this.debitTotal = 0,
    this.creditTotal = 0,
    this.txCount = 0,
  });

  double get netOutflow => debitTotal - creditTotal;
}
