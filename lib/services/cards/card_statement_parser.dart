import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

import '../../config/app_config.dart';

class CardStatementInfo {
  final String issuer;
  final String last4;
  final DateTime statementDate;
  final DateTime periodStart;
  final DateTime periodEnd;
  final DateTime dueDate;
  final double totalDue;
  final double minDue;
  final double? creditLimit;
  final double? availableCredit;
  final Map<String, num>? rewards; // opening/earned/redeemed/closing

  CardStatementInfo({
    required this.issuer,
    required this.last4,
    required this.statementDate,
    required this.periodStart,
    required this.periodEnd,
    required this.dueDate,
    required this.totalDue,
    required this.minDue,
    this.creditLimit,
    this.availableCredit,
    this.rewards,
  });
}

class CardStatementParserApi {
  static Future<CardStatementInfo> parsePdf({
    required Uint8List pdfBytes,
    String? issuerHint,
    String? passFormat,
    String? userName,
    String? userDob,
    String? last4Hint,
  }) async {
    final uri = Uri.parse('${AiConfig.baseUrl}/card/parseStatement');
    final req = http.MultipartRequest('POST', uri)
      ..headers['X-API-Key'] = AiConfig.apiKey
      ..fields['issuerHint'] = issuerHint ?? ''
      ..fields['passFormat'] = passFormat ?? 'none'
      ..fields['userName'] = userName ?? ''
      ..fields['userDob'] = userDob ?? ''
      ..fields['last4Hint'] = last4Hint ?? ''
      ..files.add(http.MultipartFile.fromBytes(
        'file',
        pdfBytes,
        filename: 'statement.pdf',
        contentType: MediaType('application', 'pdf'),
      ));

    final resp = await req.send();
    final body = await resp.stream.bytesToString();
    if (resp.statusCode != 200) {
      throw Exception('Parser HTTP ${resp.statusCode}: $body');
    }
    final m = jsonDecode(body) as Map<String, dynamic>;

    DateTime parseDate(String k) => DateTime.parse(m[k] as String);
    double? parseNum(String k) {
      final v = m[k];
      if (v == null) return null;
      if (v is int) return v.toDouble();
      if (v is double) return v;
      return double.tryParse(v.toString().replaceAll(',', ''));
    }

    return CardStatementInfo(
      issuer: m['issuer'] as String,
      last4: m['card_last4'] as String,
      statementDate: parseDate('statement_date'),
      periodStart: parseDate('bill_period_start'),
      periodEnd: parseDate('bill_period_end'),
      dueDate: parseDate('due_date'),
      totalDue: parseNum('total_due') ?? 0,
      minDue: parseNum('min_due') ?? 0,
      creditLimit: parseNum('credit_limit'),
      availableCredit: parseNum('available_credit'),
      rewards: (m['rewards'] is Map<String, dynamic>)
          ? (m['rewards'] as Map<String, dynamic>)
              .map((k, v) => MapEntry(k, (v as num)))
          : null,
    );
  }
}
