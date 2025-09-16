// Minimal contract the parser emits (model-agnostic)
enum TxDirection { debit, credit }
enum TxChannel { card, upi, bank, wallet, atm, unknown }
enum TxSource { sms, gmailAlert, gmailStatement, user }

class ParsedTransaction {
  final String idempotencyKey;   // stable key (prevents duplicates)
  final DateTime occurredAt;
  final int amountPaise;         // always paise
  final String currency;         // "INR"
  final TxDirection direction;
  final TxChannel channel;       // CARD/UPI/...
  final String instrumentHint;   // "CARD:1234", "UPI:vpacore"
  final String merchantId;       // normalized stable id
  final String merchantName;     // display
  final String categoryHint;     // optional category
  final double confidence;       // 0..1
  final Map<String, String> meta;// refNo, gmailId, etc.
  final Set<TxSource> sources;   // {gmailAlert,...}

  ParsedTransaction({
    required this.idempotencyKey,
    required this.occurredAt,
    required this.amountPaise,
    required this.currency,
    required this.direction,
    required this.channel,
    required this.instrumentHint,
    required this.merchantId,
    required this.merchantName,
    required this.categoryHint,
    required this.confidence,
    required this.meta,
    required this.sources,
  });

  ParsedTransaction merge(ParsedTransaction other) => ParsedTransaction(
    idempotencyKey: idempotencyKey,
    occurredAt: occurredAt.isBefore(other.occurredAt) ? occurredAt : other.occurredAt,
    amountPaise: amountPaise,
    currency: currency,
    direction: direction,
    channel: other.channel == TxChannel.unknown ? channel : other.channel,
    instrumentHint: instrumentHint.isNotEmpty ? instrumentHint : other.instrumentHint,
    merchantId: merchantId.isNotEmpty ? merchantId : other.merchantId,
    merchantName: merchantName.length >= other.merchantName.length ? merchantName : other.merchantName,
    categoryHint: categoryHint.isNotEmpty ? categoryHint : other.categoryHint,
    confidence: (confidence + other.confidence) / 2.0,
    meta: {...meta, ...other.meta},
    sources: {...sources, ...other.sources},
  );
}
