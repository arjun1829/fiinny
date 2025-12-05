import 'package:googleapis/gmail/v1.dart' as gmail;
import 'package:google_sign_in/google_sign_in.dart';
import 'package:http/http.dart' as http;

import '../connector.dart';
import '../raw_transaction_event.dart';
import '../../config/region_profile.dart';
import '../../config/bank_profiles.dart';

class GmailConnector extends SourceConnector {
  GmailConnector({required super.region, required super.userId});

  final GoogleSignIn _googleSignIn = GoogleSignIn(scopes: [gmail.GmailApi.gmailReadonlyScope]);
  gmail.GmailApi? _api;

  @override
  Future<void> initialize() async {
    if (!region.allowGmailIngestion) return;
    
    // In a real app, we'd handle silentSignIn or interactive sign-in here.
    // For now, assuming the user is already signed in or we trigger it.
    final account = await _googleSignIn.signInSilently();
    if (account != null) {
      final authHeaders = await account.authHeaders;
      final client = _AuthClient(authHeaders);
      _api = gmail.GmailApi(client);
    }
  }

  @override
  Future<List<RawTransactionEvent>> backfill({int days = 90}) async {
    if (_api == null || !region.allowGmailIngestion) return [];

    final now = DateTime.now();
    final since = now.subtract(Duration(days: days));
    final query = 'after:${since.millisecondsSinceEpoch ~/ 1000}';

    // Fetch list
    final response = await _api!.users.messages.list('me', q: query, maxResults: 100);
    final messages = response.messages;
    if (messages == null || messages.isEmpty) return [];

    final events = <RawTransactionEvent>[];

    // Batch fetch details
    // Note: In production, use batch requests or parallel futures with throttling
    for (final msgRef in messages) {
      if (msgRef.id == null) continue;
      
      try {
        final msg = await _api!.users.messages.get('me', msgRef.id!);
        final event = _parseEmail(msg);
        if (event != null) {
          events.add(event);
        }
      } catch (e) {
        // Log error
      }
    }

    return events;
  }

  @override
  Future<List<RawTransactionEvent>> syncDelta({DateTime? lastSync}) async {
    final days = lastSync == null ? 30 : DateTime.now().difference(lastSync).inDays + 1;
    return backfill(days: days);
  }

  // ── Parsing Logic ──────────────────────────────────────────────────────────

  RawTransactionEvent? _parseEmail(gmail.Message msg) {
    final headers = _extractHeaders(msg);
    final subject = headers['Subject'] ?? '';
    final from = headers['From'] ?? '';
    final snippet = msg.snippet ?? '';
    final body = '$subject $snippet'; // Simplified body for now

    // 1. Detect Bank/Sender
    final bank = _detectBank(from, body);
    
    // 2. Check if financial
    if (!_isFinancialEmail(subject, from, bank)) return null;

    // 3. Extract Details (Regex / LLM fallback would go here)
    final amount = _extractAmount(body);
    if (amount == null) return null;

    final currency = _extractCurrency(body) ?? region.defaultCurrency;
    final direction = _detectDirection(body);
    final accountHint = _extractAccountHint(body);
    final merchant = _extractMerchant(body, subject);

    final ts = DateTime.fromMillisecondsSinceEpoch(int.tryParse(msg.internalDate ?? '') ?? DateTime.now().millisecondsSinceEpoch);

    return RawTransactionEvent(
      eventId: 'gmail_${msg.id}',
      userId: userId,
      sourceChannel: TransactionSourceChannel.email,
      timestamp: ts,
      amount: amount,
      currency: currency,
      direction: direction,
      rawText: body,
      accountHint: accountHint,
      merchantName: merchant,
      extraMetadata: {
        'subject': subject,
        'from': from,
        'bankCode': bank?.code,
      },
    );
  }

  Map<String, String> _extractHeaders(gmail.Message msg) {
    final map = <String, String>{};
    if (msg.payload?.headers != null) {
      for (final h in msg.payload!.headers!) {
        if (h.name != null && h.value != null) {
          map[h.name!] = h.value!;
        }
      }
    }
    return map;
  }

  BankProfile? _detectBank(String from, String body) {
    final combined = '$from $body'.toLowerCase();
    for (final b in region.majorBanks) {
      if (b.domains.any((d) => from.contains(d)) || 
          b.headerHints.any((h) => combined.contains(h.toLowerCase()))) {
        return b;
      }
    }
    return null;
  }

  bool _isFinancialEmail(String subject, String from, BankProfile? bank) {
    // If we detected a major bank, it's likely financial if subject has keywords
    final lowerSub = subject.toLowerCase();
    final keywords = ['transaction', 'alert', 'statement', 'spent', 'debited', 'credited', 'payment'];
    
    if (bank != null) {
      return keywords.any((k) => lowerSub.contains(k));
    }
    
    // If unknown sender, be stricter
    return false; 
  }

  double? _extractAmount(String body) {
     // Similar logic to SMS, but maybe looking for HTML patterns in full implementation
     // For now, reuse the regex approach
    String pattern;
    if (region.countryCode == 'IN') {
      pattern = r'(?:₹|Rs\.?|INR)\s*([0-9,]+(?:\.[0-9]{1,2})?)';
    } else {
      pattern = r'(?:' + RegExp.escape(region.currencySymbol) + r')\s*([0-9,]+(?:\.[0-9]{1,2})?)';
    }

    final match = RegExp(pattern, caseSensitive: false).firstMatch(body);
    if (match != null) {
      final raw = match.group(1)!.replaceAll(',', '');
      return double.tryParse(raw);
    }
    return null;
  }

  String? _extractCurrency(String body) {
    if (body.contains('USD') || body.contains('\$')) return 'USD';
    if (body.contains('EUR') || body.contains('€')) return 'EUR';
    if (body.contains('INR') || body.contains('₹')) return 'INR';
    return null;
  }

  TransactionDirection _detectDirection(String body) {
    final lower = body.toLowerCase();
    if (lower.contains('credited') || lower.contains('received')) return TransactionDirection.credit;
    if (lower.contains('debited') || lower.contains('spent') || lower.contains('paid')) return TransactionDirection.debit;
    return TransactionDirection.unknown;
  }

  String? _extractAccountHint(String body) {
    final match = RegExp(r'(?:ending|x|xx)\s*[ -]?x*([0-9]{4})\b', caseSensitive: false).firstMatch(body);
    return match?.group(1);
  }

  String? _extractMerchant(String body, String subject) {
    // Try to find "at MERCHANT"
    final match = RegExp(r'\b(?:at|to)\s+([A-Za-z0-9 ]{2,20})', caseSensitive: false).firstMatch(body);
    if (match != null) return match.group(1)?.trim();
    
    // Fallback: use subject if it looks like "Transaction Alert: Amazon"
    if (subject.contains(':')) {
      return subject.split(':').last.trim();
    }
    return null;
  }
}

class _AuthClient extends http.BaseClient {
  final Map<String, String> headers;
  final http.Client _inner = http.Client();
  _AuthClient(this.headers);

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) {
    request.headers.addAll(headers);
    return _inner.send(request);
  }
}
