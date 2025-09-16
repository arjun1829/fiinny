import '../../models/parsed_transaction.dart';
import '../parse_engine/common_regex.dart';
import '../normalize/merchant_normalizer.dart';
import '../dedupe/idempotency.dart';

class SmsAlertParser {
  // Quick issuer/banking hints to reduce false positives
  static final _bankish = RegExp(
    r'(bank|upi|imps|rtgs|neft|atm|debit|credit|card|txn|transaction|purchase|spent|paid|payment|credited|debited)',
    caseSensitive: false,
  );

  static bool looksFinancial(String body) => _bankish.hasMatch(body);

  static ParsedTransaction? parse(String body, DateTime receivedAt) {
    if (!looksFinancial(body)) return null;

    final amountPaise = CommonRegex.extractAmountPaise(body);
    if (amountPaise == null) return null;

    final direction = CommonRegex.isCredit(body) ? TxDirection.credit : TxDirection.debit;
    final instrument = CommonRegex.extractInstrumentHint(body);
    final channel = CommonRegex.detectChannel(body);

    final rawMerchant = CommonRegex.extractMerchant(body) ?? '';
    final norm = MerchantNormalizer.normalize(rawMerchant.isEmpty ? body : rawMerchant);

    final conf = CommonRegex.confidenceScore(
      hasAmount: true,
      hasInstrument: instrument.isNotEmpty,
      hasMerchant: norm.id != 'unknown',
      channelKnown: channel != TxChannel.unknown,
    );

    final key = Idempotency.buildKey(
      merchantId: norm.id,
      amountPaise: amountPaise,
      instrumentHint: instrument,
      occurredAt: receivedAt,
    );

    return ParsedTransaction(
      idempotencyKey: key,
      occurredAt: receivedAt,
      amountPaise: amountPaise,
      currency: 'INR',
      direction: direction,
      channel: channel,
      instrumentHint: instrument,
      merchantId: norm.id,
      merchantName: norm.display,
      categoryHint: CommonRegex.categoryHint(body),
      confidence: conf,
      meta: {
        'source': 'sms',
        if (norm.bankLogoAsset != null) 'bankLogo': norm.bankLogoAsset!,
      },
      sources: {TxSource.sms},
    );
  }
}
