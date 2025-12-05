import 'dart:collection';
import 'package:telephony/telephony.dart';
import 'package:flutter/foundation.dart';

import '../connector.dart';
import '../raw_transaction_event.dart';
import '../../config/region_profile.dart';
import '../../config/bank_profiles.dart';

class AndroidSmsConnector extends SourceConnector {
  AndroidSmsConnector({required super.region, required super.userId});

  Telephony? _telephony;
  
  // Cache for recent message keys to avoid duplicates in realtime listener
  static const int _recentCap = 400;
  final ListQueue<String> _recent = ListQueue<String>(_recentCap);

  bool get _isAndroid => !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  @override
  Future<void> initialize() async {
    if (!_isAndroid) return;
    if (!region.allowSmsIngestion) return;
    
    _telephony = Telephony.instance;
    // Check permissions? Usually handled by UI before calling this.
  }

  @override
  Future<List<RawTransactionEvent>> backfill({int days = 90}) async {
    if (!_isAndroid || !region.allowSmsIngestion || _telephony == null) return [];

    final now = DateTime.now();
    final since = now.subtract(Duration(days: days));

    // Fetch inbox
    final msgs = await _telephony!.getInboxSms(
      columns: [SmsColumn.ADDRESS, SmsColumn.BODY, SmsColumn.DATE],
      sortOrder: [OrderBy(SmsColumn.DATE, sort: Sort.DESC)],
    );

    final events = <RawTransactionEvent>[];

    for (final m in msgs) {
      final ts = DateTime.fromMillisecondsSinceEpoch(m.date ?? now.millisecondsSinceEpoch);
      if (ts.isBefore(since)) break;

      final body = m.body ?? '';
      final address = m.address ?? '';

      if (_shouldIgnore(body, address)) continue;

      final event = _parseSms(m, ts);
      if (event != null) {
        events.add(event);
      }
    }

    return events;
  }

  @override
  Future<List<RawTransactionEvent>> syncDelta({DateTime? lastSync}) async {
    // For SMS, delta is just a shorter backfill usually, or relying on background listener.
    // Here we implement it as a fetch since lastSync.
    final days = lastSync == null ? 30 : DateTime.now().difference(lastSync).inDays + 1;
    return backfill(days: days);
  }

  // ── Parsing Logic ──────────────────────────────────────────────────────────

  bool _shouldIgnore(String body, String address) {
    // 1. OTP Check
    if (_looksLikeOtpOnly(body)) return true;
    
    // 2. Spam/Promo Check (Basic)
    // TODO: Use more advanced filters from ingest_filters.dart
    return false;
  }

  RawTransactionEvent? _parseSms(SmsMessage m, DateTime ts) {
    final body = m.body ?? '';
    final address = m.address ?? '';

    // 1. Detect Bank/Sender
    final bank = _detectBank(address, body);

    // 2. Check if it's a transaction
    if (!_isTransaction(body, sender: address, bank: bank)) return null;

    // 3. Extract Details
    final amount = _extractAmount(body);
    if (amount == null) return null;

    final currency = _extractCurrency(body) ?? region.defaultCurrency;
    final direction = _detectDirection(body);
    final accountHint = _extractAccountHint(body);
    final merchant = _extractMerchant(body);

    // 4. Construct Event
    // Unique ID: hash of (ts + address + body)
    final eventId = 'sms_${ts.millisecondsSinceEpoch}_${body.hashCode}';

    return RawTransactionEvent(
      eventId: eventId,
      userId: userId,
      sourceChannel: TransactionSourceChannel.sms,
      timestamp: ts,
      amount: amount,
      currency: currency,
      direction: direction,
      rawText: body,
      accountHint: accountHint,
      merchantName: merchant,
      extraMetadata: {
        'sender': address,
        'bankCode': bank?.code,
      },
    );
  }

  // ── Helpers (Region Aware) ─────────────────────────────────────────────────

  BankProfile? _detectBank(String address, String body) {
    final combined = '$address $body'.toLowerCase();
    
    // Iterate over major banks for the region
    for (final b in region.majorBanks) {
      // Check header hints
      if (b.headerHints.any((h) => combined.contains(h.toLowerCase()))) {
        return b;
      }
    }
    return null;
  }

  bool _isTransaction(String body, {String? sender, BankProfile? bank}) {
    // Basic gate: must have amount and some verb
    if (_extractAmount(body) == null) return false;
    
    final lower = body.toLowerCase();
    
    // Region specific keywords
    // For India: debited, credited, upi, etc.
    if (region.countryCode == 'IN') {
       final hasVerb = RegExp(r'\b(debited|credited|spent|paid|received|txn|transaction)\b').hasMatch(lower);
       if (!hasVerb) return false;
       
       // Block pure OTPs
       if (lower.contains('otp') && !lower.contains('debited') && !lower.contains('credited')) return false;
       
       return true;
    }
    
    // Default/Global fallback
    return RegExp(r'\b(paid|spent|received|debited|credited)\b').hasMatch(lower);
  }

  double? _extractAmount(String body) {
    // Region specific currency regex
    // India: ₹, Rs, INR
    String pattern;
    if (region.countryCode == 'IN') {
      pattern = r'(?:₹|Rs\.?|INR)\s*([0-9,]+(?:\.[0-9]{1,2})?)';
    } else if (region.countryCode == 'US') {
      pattern = r'(?:\$|USD)\s*([0-9,]+(?:\.[0-9]{1,2})?)';
    } else {
      // Generic
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
    // Simple extraction based on symbol presence
    if (body.contains('USD') || body.contains('\$')) return 'USD';
    if (body.contains('EUR') || body.contains('€')) return 'EUR';
    if (body.contains('INR') || body.contains('₹') || body.toLowerCase().contains('rs.')) return 'INR';
    return null;
  }

  TransactionDirection _detectDirection(String body) {
    final lower = body.toLowerCase();
    if (lower.contains('credited') || lower.contains('received') || lower.contains('deposit')) {
      return TransactionDirection.credit;
    }
    if (lower.contains('debited') || lower.contains('spent') || lower.contains('paid') || lower.contains('sent')) {
      return TransactionDirection.debit;
    }
    return TransactionDirection.unknown;
  }

  String? _extractAccountHint(String body) {
    // Look for "X1234" or "ending 1234"
    final match = RegExp(r'(?:ending|x|xx|no\.|acct|account)\s*[ -]?x*([0-9]{4})\b', caseSensitive: false).firstMatch(body);
    return match?.group(1);
  }

  String? _extractMerchant(String body) {
    // Very basic extraction: "at MERCHANT" or "to MERCHANT"
    final match = RegExp(r'\b(?:at|to)\s+([A-Za-z0-9 ]{2,20})', caseSensitive: false).firstMatch(body);
    return match?.group(1)?.trim();
  }

  bool _looksLikeOtpOnly(String body) {
    final lower = body.toLowerCase();
    if (!lower.contains('otp') && !lower.contains('one time password')) return false;
    // If it has OTP but also "debited", it might be a transactional OTP (rare but possible)
    // usually OTP messages don't have "debited" past tense, they say "to authorise payment"
    if (lower.contains('debited') || lower.contains('credited')) return false;
    return true;
  }
}
