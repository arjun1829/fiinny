class ParsedTxn {
  final String? txKey;
  final String? direction; // 'debit'/'credit'
  final double? amount;
  final String? currency;
  final DateTime? when;
  final String? instrument;
  final String? instrumentTail;
  final String? merchantName;
  final String? upiHandle;
  final String? txnId;
  final String category;
  final double? confidence;
  final List<String>? sources;
  final Map<String, dynamic>? debug;

  ParsedTxn({
    this.txKey,
    this.direction,
    this.amount,
    this.currency,
    this.when,
    this.instrument,
    this.instrumentTail,
    this.merchantName,
    this.upiHandle,
    this.txnId,
    this.category = 'Uncategorized',
    this.confidence,
    this.sources,
    this.debug,
  });
}
