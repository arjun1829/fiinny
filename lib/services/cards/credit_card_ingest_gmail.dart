import 'dart:convert';
import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:googleapis/gmail/v1.dart' as gmail;
import 'package:http/http.dart' as http;

import '../../models/credit_card_cycle.dart';
import '../../models/credit_card_model.dart';
import '../../models/credit_card_payment.dart';
import '../credit_card_service.dart';
import '../notification_service.dart';
import 'card_statement_parser.dart';
import 'card_due_notifier.dart';

class CreditCardIngestGmail {
  CreditCardIngestGmail(this._svc);

  final CreditCardService _svc;
  final _db = FirebaseFirestore.instance;

  Future<gmail.GmailApi> _client() async {
    final googleSignIn = GoogleSignIn(
      scopes: <String>[gmail.GmailApi.gmailReadonlyScope],
    );
    final acc =
        await googleSignIn.signInSilently() ?? await googleSignIn.signIn();
    final authHeaders = await acc!.authHeaders;
    final client = _GoogleAuthClient(authHeaders);
    return gmail.GmailApi(client);
  }

  DocumentReference<Map<String, dynamic>> _ingestDoc(String userId) => _db
      .collection('users')
      .doc(userId)
      .collection('keys')
      .doc('ingest_cards');

  Future<Set<String>> _loadSeen(String userId) async {
    final d = await _ingestDoc(userId).get();
    final set = <String>{};
    if (d.exists) {
      final a = (d.data()!['messageIds'] as List?)?.cast<String>() ?? [];
      set.addAll(a);
    }
    return set;
  }

  Future<void> _saveSeen(String userId, Set<String> ids) async {
    await _ingestDoc(userId)
        .set({'messageIds': ids.toList()}, SetOptions(merge: true));
  }

  static const _stmtQuery =
      'has:attachment filename:pdf subject:(statement OR e-statement) after:2024/01/01';
  static const _payQuery =
      'subject:("payment received" OR "we have received payment" OR "payment of INR") after:2024/01/01';

  Future<void> run(String userId) async {
    final gmailApi = await _client();
    final seen = await _loadSeen(userId);

    final stmtList =
        await gmailApi.users.messages.list('me', q: _stmtQuery, maxResults: 50);
    final stmtMsgs = stmtList.messages ?? [];

    for (final m in stmtMsgs) {
      final id = m.id;
      if (id == null || seen.contains(id)) continue;
      try {
        final full =
            await gmailApi.users.messages.get('me', id, format: 'full');
        final headers = full.payload?.headers ?? [];
        final from = _headerValue(headers, 'from');
        final subject = _headerValue(headers, 'subject');

        final issuerHint = _guessIssuer(from, subject);
        final last4Hint = _guessLast4(subject);

        final pdfPart = _findPdfPart(full.payload);
        if (pdfPart == null) continue;

        final attachmentId = pdfPart.body?.attachmentId;
        if (attachmentId == null) continue;

        final attach = await gmailApi.users.messages.attachments
            .get('me', id, attachmentId);
        final data = attach.data;
        if (data == null) continue;
        final bytes = base64Url.decode(data);

        final info = await CardStatementParserApi.parsePdf(
          pdfBytes: Uint8List.fromList(bytes),
          issuerHint: issuerHint,
          passFormat: 'none',
          last4Hint: last4Hint,
        );

        final cardId = _cardId(info.issuer, info.last4);
        final card = CreditCardModel(
          id: cardId,
          bankName: info.issuer,
          cardType: 'Visa',
          last4Digits: info.last4,
          cardholderName: 'You',
          statementDate: info.statementDate,
          dueDate: info.dueDate,
          totalDue: info.totalDue,
          minDue: info.minDue,
          isPaid: false,
          paidDate: null,
          creditLimit: info.creditLimit,
          availableCredit: info.availableCredit,
          rewardsInfo: info.rewards?.toString(),
        );
        await _svc.saveCard(userId, card);

        final cycId = _cycleId(info.statementDate);
        final cycle = CreditCardCycle(
          id: cycId,
          statementDate: info.statementDate,
          periodStart: info.periodStart,
          periodEnd: info.periodEnd,
          dueDate: info.dueDate,
          totalDue: info.totalDue,
          minDue: info.minDue,
          creditLimitSnapshot: info.creditLimit,
          availableCreditSnapshot: info.availableCredit,
        );
        await _svc.upsertCycle(userId, cardId, cycle);
        await _svc.recomputeCycleStatus(userId, cardId, cycId);

        seen.add(id);
      } catch (_) {
        continue;
      }
    }

    final payList =
        await gmailApi.users.messages.list('me', q: _payQuery, maxResults: 50);
    final payMsgs = payList.messages ?? [];

    for (final m in payMsgs) {
      final id = m.id;
      if (id == null || seen.contains(id)) continue;
      try {
        final full =
            await gmailApi.users.messages.get('me', id, format: 'full');
        final headers = full.payload?.headers ?? [];
        final subject = _headerValue(headers, 'subject');
        final dateHeader = _headerValue(headers, 'date');
        final date = DateTime.tryParse(dateHeader ?? '') ?? DateTime.now();

        final bodyText = _extractPlainText(full.payload);
        final amount =
            _findAmount(subject) ?? _findAmount(bodyText) ?? 0;
        final last4 =
            _guessLast4(subject) ?? _guessLast4(bodyText) ?? '';
        final issuer = _guessIssuer('', subject);
        final cardId =
            _cardId(issuer.isEmpty ? 'Card' : issuer, last4.isEmpty ? '0000' : last4);

        final payment = CreditCardPayment(
          id: 'gmail_$id',
          amount: amount,
          date: date,
          source: 'gmail',
          ref: id,
        );
        await _svc.addPayment(userId, cardId, payment);

        final latest = await _svc.getLatestCycle(userId, cardId);
        if (latest != null) {
          await _svc.recomputeCycleStatus(userId, cardId, latest.id);
        }

        seen.add(id);
      } catch (_) {
        continue;
      }
    }

    await _saveSeen(userId, seen);

    try {
      await CardDueNotifier(_svc, NotificationService()).scheduleAll(userId);
    } catch (err, stack) {
      debugPrint('[CreditCardIngestGmail] scheduleAll failed: $err\n$stack');
    }
  }

  String _headerValue(List<gmail.MessagePartHeader> headers, String name) {
    for (final h in headers) {
      if ((h.name ?? '').toLowerCase() == name.toLowerCase()) {
        return h.value ?? '';
      }
    }
    return '';
  }

  String _cardId(String issuer, String last4) =>
      '${issuer.replaceAll(' ', '').toLowerCase()}-$last4';

  String _cycleId(DateTime statementDate) =>
      '${statementDate.year.toString().padLeft(4, '0')}${statementDate.month.toString().padLeft(2, '0')}';

  gmail.MessagePart? _findPdfPart(gmail.MessagePart? payload) {
    if (payload == null) return null;
    final stack = <gmail.MessagePart>[payload];
    while (stack.isNotEmpty) {
      final part = stack.removeLast();
      final mime = part.mimeType?.toLowerCase() ?? '';
      if (mime.contains('pdf')) {
        return part;
      }
      final children = part.parts ?? <gmail.MessagePart>[];
      stack.addAll(children);
    }
    return null;
  }

  String _guessIssuer(String from, String subject) {
    final s = ('${from} ${subject}').toLowerCase();
    if (s.contains('hdfc')) return 'HDFC Bank';
    if (s.contains('icici')) return 'ICICI Bank';
    if (s.contains('axis')) return 'Axis Bank';
    if (s.contains('sbi')) return 'SBI Card';
    if (s.contains('kotak')) return 'Kotak';
    if (s.contains('idfc')) return 'IDFC FIRST Bank';
    if (s.contains('indusind')) return 'IndusInd Bank';
    if (s.contains('onecard')) return 'OneCard';
    return '';
  }

  String? _guessLast4(String? text) {
    if (text == null || text.isEmpty) return null;
    final r = RegExp(r'(?:ending|last\s*digits?\s*|xx+|xxxx)\s*(\d{4})',
        caseSensitive: false);
    final m = r.firstMatch(text);
    return m?.group(1);
  }

  double? _findAmount(String? text) {
    if (text == null) return null;
    final r1 = RegExp(r'₹\s*([\d,]+(?:\.\d{1,2})?)');
    final r2 = RegExp(r'INR\s*([\d,]+(?:\.\d{1,2})?)', caseSensitive: false);
    final m = r1.firstMatch(text) ?? r2.firstMatch(text);
    if (m == null) return null;
    return double.tryParse(m.group(1)!.replaceAll(',', ''));
  }

  String _extractPlainText(gmail.MessagePart? part) {
    if (part == null) return '';
    final mime = part.mimeType?.toLowerCase() ?? '';
    if (mime.startsWith('text/plain')) {
      final data = part.body?.data;
      if (data == null) return '';
      return utf8.decode(base64Url.decode(data));
    }
    for (final child in part.parts ?? <gmail.MessagePart>[]) {
      final text = _extractPlainText(child);
      if (text.isNotEmpty) return text;
    }
    return '';
  }
}

class _GoogleAuthClient extends http.BaseClient {
  _GoogleAuthClient(this._headers);

  final Map<String, String> _headers;
  final http.Client _client = http.Client();

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) {
    request.headers.addAll(_headers);
    return _client.send(request);
  }
}
