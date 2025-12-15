import 'package:googleapis/gmail/v1.dart' as gmail;
import '../../models/parsed_transaction.dart';
import '../normalize/merchant_normalizer.dart';
import '../dedupe/idempotency.dart';
import '../parse_engine/common_regex.dart';

class GmailAlertParser {
  static final allowedFrom = RegExp(
    r'(alert@hdfcbank\.net|icicialerts@icicibank\.com|alerts@axisbank\.com|noreply\.sbi@sbi\.co\.in|alerts@kotak\.com|no-reply@amazon\.in|noreply@paytm\.com)',
    caseSensitive: false,
  );

  static Map<String, String> _headers(gmail.Message m) {
    final map = <String, String>{};
    for (final h in m.payload?.headers ?? const []) {
      if (h.name != null && h.value != null) map[h.name!] = h.value!;
    }
    return map;
  }

  static bool isFinancialAlert(gmail.Message msg) {
    final headers = _headers(msg);
    final from = headers['From'] ?? '';
    final subject = headers['Subject'] ?? '';
    if (!allowedFrom.hasMatch(from)) return false;
    final s = subject.toLowerCase();
    if (!(s.contains('debited') || s.contains('credited') || s.contains('spent') || s.contains('payment') || s.contains('upi'))) return false;
    return true;
  }

  static ParsedTransaction? parse(gmail.Message msg) {
    if (!isFinancialAlert(msg)) return null;

    final headers = _headers(msg);
    final subject = headers['Subject'] ?? '';
    final internalDateMs = int.tryParse(msg.internalDate ?? '');
    final snippet = (msg.snippet ?? '').replaceAll('\n', ' ');
    final text = '$subject  $snippet';

    final amountPaise = CommonRegex.extractAmountPaise(text);
    if (amountPaise == null) return null;

    final direction = CommonRegex.isCredit(text) ? TxDirection.credit : TxDirection.debit;
    final instrument = CommonRegex.extractInstrumentHint(text);
    final channel = CommonRegex.detectChannel(text);

    final rawMerchant = CommonRegex.extractMerchant(text) ?? '';
    final norm = MerchantNormalizer.normalize(rawMerchant.isEmpty ? subject : rawMerchant);

    final dt = internalDateMs != null ? DateTime.fromMillisecondsSinceEpoch(internalDateMs) : DateTime.now();

    final conf = CommonRegex.confidenceScore(
      hasAmount: true,
      hasInstrument: instrument.isNotEmpty,
      hasMerchant: norm.id != 'unknown',
      channelKnown: channel != TxChannel.unknown,
    );

    // Check for P2P indicators (e.g. UPI/P2A patterns or explicit 'P2P' strings)
    final isP2P = text.toUpperCase().contains('UPI/P2A') || 
                  (channel == TxChannel.upi && (text.contains('sent to') || text.contains('paid to')) && !text.toUpperCase().contains('PVT LTD'));

    // Check for Card
    final isCard = channel == TxChannel.card || (instrument.startsWith('CARD'));

    final key = Idempotency.buildKey(
      merchantId: norm.id,
      amountPaise: amountPaise,
      instrumentHint: instrument,
      occurredAt: dt,
    );

    final catResult = CommonRegex.categoryHint(text, merchantName: norm.display, isP2P: isP2P, isCard: isCard);

    return ParsedTransaction(
      idempotencyKey: key,
      occurredAt: dt,
      amountPaise: amountPaise,
      currency: 'INR',
      direction: direction,
      channel: channel,
      instrumentHint: instrument,
      merchantId: norm.id,
      merchantName: norm.display,
      categoryHint: catResult.category,
      subcategoryHint: catResult.subcategory,
      confidence: conf,
      meta: {
        'gmailId': msg.id ?? '',
        'subject': subject,
        if (norm.bankLogoAsset != null) 'bankLogo': norm.bankLogoAsset!,
      },
      sources: {TxSource.gmailAlert},
    );
  }
}
