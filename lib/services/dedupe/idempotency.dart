import 'dart:convert';
import 'package:crypto/crypto.dart';

class Idempotency {
  static String buildKey({
    required String merchantId,
    required int amountPaise,
    required String instrumentHint,
    required DateTime occurredAt,
  }) {
    final bucket = occurredAt.millisecondsSinceEpoch ~/ (10 * 60 * 1000); // 10-min
    final s = '${merchantId.toLowerCase()}|$amountPaise|$instrumentHint|$bucket';
    return sha1.convert(utf8.encode(s)).toString();
  }
}
