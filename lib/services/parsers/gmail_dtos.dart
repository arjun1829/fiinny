/// Raw message data to pass to the Isolate
class RawGmailMessage {
  final String id;
  final String threadId;
  final String internalDate;
  final String plainTextBody; // Pre-extracted on main thread
  final List<MessageHeaderDto> headers;

  RawGmailMessage({
    required this.id,
    required this.threadId,
    required this.internalDate,
    required this.plainTextBody,
    required this.headers,
  });
}

class MessageHeaderDto {
  final String name;
  final String value;
  MessageHeaderDto(this.name, this.value);
}

/// Result from the Isolate parser
class ParsedGmailTxn {
  final String msgId;
  final String threadId;
  final String internalDate;
  final DateTime msgDate;
  final String combinedBody;
  final String emailDomain;
  final String? direction;
  final double? amount;
  final double? amountFx; // needed?
  final String? accountLast4;
  final String? cardLast4;
  final String? bankName;
  final String? upiVpa;
  final String? network;
  final String? instrument;
  final double? postBalance;
  final String? merchantName; // from regex
  final bool isEmiAutopay;
  final bool passesIncomeGate;
  final Map<String, dynamic>? billInfo;

  ParsedGmailTxn({
    required this.msgId,
    required this.threadId,
    required this.internalDate,
    required this.msgDate,
    required this.combinedBody,
    required this.emailDomain,
    this.direction,
    this.amount,
    this.amountFx,
    this.accountLast4,
    this.cardLast4,
    this.bankName,
    this.upiVpa,
    this.network,
    this.instrument,
    this.postBalance,
    this.merchantName,
    required this.isEmiAutopay,
    required this.passesIncomeGate,
    this.billInfo,
    this.guessedMerchant,
    this.creditCardMetadata,
    this.fees,
  });

  final String? guessedMerchant;
  final Map<String, double>? creditCardMetadata;
  final Map<String, double>? fees;
}
