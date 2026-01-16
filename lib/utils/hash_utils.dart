import 'dart:convert';
import 'package:crypto/crypto.dart';

class HashUtils {
  static String sha1Of(String s) {
    return sha1.convert(utf8.encode(s)).toString();
  }

  static String hashParts(List<String?> parts) {
    final s = parts.where((e) => e != null && e.isNotEmpty).join('|');
    return sha1Of(s);
  }
}
