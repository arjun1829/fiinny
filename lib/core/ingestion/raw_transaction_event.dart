enum TransactionSourceChannel {
  sms,
  email,
  openBanking,
  manualUpload,
  other,
}

enum TransactionDirection {
  debit,
  credit,
  transfer,
  unknown,
}

class RawTransactionEvent {
  final String eventId; // Unique ID from source (e.g., SMS hash, Gmail Msg ID)
  final String userId;
  final TransactionSourceChannel sourceChannel;
  final DateTime timestamp;
  
  final double amount;
  final String currency;
  
  final TransactionDirection direction;
  
  final String rawText; // Full body/description
  
  // Extracted Metadata
  final String? accountHint; // e.g., "1234", "HDFC Bank"
  final String? merchantName; // Extracted merchant/counterparty
  final String? instrumentType; // "CC", "DC", "UPI", etc.
  
  final Map<String, dynamic> extraMetadata; // Source-specific data

  const RawTransactionEvent({
    required this.eventId,
    required this.userId,
    required this.sourceChannel,
    required this.timestamp,
    required this.amount,
    required this.currency,
    required this.direction,
    required this.rawText,
    this.accountHint,
    this.merchantName,
    this.instrumentType,
    this.extraMetadata = const {},
  });

  @override
  String toString() {
    return 'RawEvent($eventId, $amount $currency, $direction, $sourceChannel)';
  }
}
